import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { classesFixture, type ClassesFixture } from '../support/classes.js';
import { createClassesFoundation } from '../../src/app.module.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { classCommandDigest, createClassCommandStore } from '../../src/modules/classes/infrastructure/command-store.js';
import type { ClassCommandAppend } from '../../src/modules/classes/infrastructure/command-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';

let f: ClassesFixture, admin: SessionActor, teacher: SessionActor;
beforeAll(async () => {
  f = await classesFixture(); const sessions = new PostgresSessionStore(f.pool);
  admin = (await sessions.lookup(f.admin.secret))!; teacher = (await sessions.lookup(f.teacher.secret))!;
}, 120000);
afterAll(async () => { await f?.cleanup(); });
const foundation = () => createClassesFoundation(f.environment, f.pool);
test('foundation composes authorized unconfigured video and keeps future handlers closed', async () => {
  await foundation().run(admin, 'classes:manage-all', { kind: 'CLASS', id: f.live.id }, 'READ', async capability => {
    expect(await capability.video.access(f.live.id)).toEqual({ status: 'NOT_CONFIGURED' });
    await expect(capability.video.access(f.otherLive.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(capability.queries.session(f.live.id)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  });
});
function input(commandId = randomUUID()): ClassCommandAppend {
  return { commandId, operation: 'EDIT', payloadDigest: classCommandDigest({ operation: 'EDIT', groupId: f.groupId,
    classId: f.finished.id, expectedRevision: '3', title: 'Clase ficticia', description: null }),
  appliedRevision: '3', appliedEventSeq: null, result: 'NO_CHANGE' };
}
test('digest has explicit canonical semantics: payload order/extra fields do not affect it, operation/target/revision/text do', () => {
  const intent = { operation: 'EDIT' as const, groupId: f.groupId, classId: f.finished.id, expectedRevision: '3', title: 'Clase ficticia' };
  const digest = classCommandDigest(intent);
  expect(digest).toHaveLength(32);
  expect(classCommandDigest({ title: intent.title, expectedRevision: intent.expectedRevision, classId: intent.classId,
    operation: intent.operation, groupId: intent.groupId, privateIgnoredField: 'never-stored' } as typeof intent)).toEqual(digest);
  for (const change of [{ title: 'Otro' }, { classId: f.live.id }, { expectedRevision: '4' }, { operation: 'START' as const }])
    expect(classCommandDigest({ ...intent, ...change })).not.toEqual(digest);
});
test('NO_CHANGE persists only references/digest/receipt and audit atomically, without new event or revision', async () => {
  const value = input(), before = await financialFingerprint(f.pool);
  const sequence = (await f.pool.query('SELECT revision::text,"lastEventSeq"::text FROM "ClassSession" WHERE id=$1', [f.finished.id])).rows[0];
  const applied = await foundation().transaction(admin, 'classes:manage-all', { kind: 'CLASS', id: f.finished.id }, 'WRITE', c => createClassCommandStore(c).append(value));
  expect(applied).toEqual({ id: value.commandId, replayed: false, result: 'NO_CHANGE', appliedRevision: '3', appliedEventSeq: null });
  const replay = await foundation().transaction(admin, 'classes:manage-all', { kind: 'CLASS', id: f.finished.id }, 'READ', c =>
    createClassCommandStore(c).lookup(value.commandId, value));
  expect(replay?.command).toEqual({ ...applied, replayed: true });
  expect(Object.keys(replay!.record).sort()).toEqual(['commandId','classId','groupId','operation','messageId','targetStudentId','appliedRevision','appliedEventSeq','result'].sort());
  expect(JSON.stringify(replay)).not.toMatch(/text|title|description|payloadDigest|password|email/);
  expect((await f.pool.query('SELECT revision::text,"lastEventSeq"::text FROM "ClassSession" WHERE id=$1', [f.finished.id])).rows[0]).toEqual(sequence);
  expect((await f.pool.query('SELECT id FROM "ClassAuditEvent" WHERE "commandId"=$1', [value.commandId])).rowCount).toBe(1);
  expect(await financialFingerprint(f.pool)).toBe(before);
});
test('same key with another digest/operation or target conflicts, and other actor cannot read the receipt', async () => {
  const value = input(); await foundation().transaction(admin, 'classes:manage-all', { kind: 'CLASS', id: f.finished.id }, 'WRITE', c => createClassCommandStore(c).append(value));
  for (const expected of [{ operation: 'START' as const, payloadDigest: value.payloadDigest }, { operation: value.operation, payloadDigest: Buffer.alloc(32) }])
    await expect(foundation().transaction(admin, 'classes:manage-all', { kind: 'CLASS', id: f.finished.id }, 'READ', c => createClassCommandStore(c).lookup(value.commandId, expected)))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(foundation().transaction(admin, 'classes:manage-all', { kind: 'CLASS', id: f.live.id }, 'READ', c => createClassCommandStore(c).lookup(value.commandId)))
    .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  expect(await foundation().transaction(teacher, 'classes:manage-own', { kind: 'CLASS', id: f.finished.id }, 'READ', c => createClassCommandStore(c).lookup(value.commandId))).toBeNull();
});
test('authority precedes receipts: revoked actor never reaches ledger even with a known command', async () => {
  const value = input(); await foundation().transaction(admin, 'classes:manage-all', { kind: 'CLASS', id: f.finished.id }, 'WRITE', c => createClassCommandStore(c).append(value));
  await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [admin.sessionId]);
  let entered = false;
  try {
    await expect(foundation().transaction(admin, 'classes:manage-all', { kind: 'CLASS', id: f.finished.id }, 'READ', async c => {
      entered = true; return createClassCommandStore(c).lookup(value.commandId);
    })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); expect(entered).toBe(false);
  } finally { await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [admin.sessionId]); }
});
test('audit failure rolls back receipt, read-only scope cannot append and expired capability cannot read', async () => {
  const value = input();
  await expect(foundation().transaction(admin, 'classes:manage-all', { kind: 'CLASS', id: f.finished.id }, 'WRITE', async c => {
    const original = c.client.query.bind(c.client);
    const failing = vi.spyOn(c.client, 'query').mockImplementation((async (...args: unknown[]) => {
      if (String(args[0]).includes('INSERT INTO "ClassAuditEvent"')) throw Object.assign(new Error('synthetic audit write failed'), { code: 'XX000' });
      return Reflect.apply(original, c.client, args);
    }) as typeof c.client.query);
    try { return await createClassCommandStore(c).append(value); } finally { failing.mockRestore(); }
  })).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect((await f.pool.query('SELECT "commandId" FROM "ClassCommand" WHERE "commandId"=$1', [value.commandId])).rowCount).toBe(0);
  let leaked: ReturnType<typeof createClassCommandStore> | undefined;
  await foundation().transaction(admin, 'classes:manage-all', { kind: 'CLASS', id: f.finished.id }, 'READ', async c => {
    leaked = createClassCommandStore(c); await expect(leaked.append(input())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  await expect(leaked!.lookup(value.commandId)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
});
test('NO_CHANGE unmute of absent restriction stores null revision/event without creating a restriction', async () => {
  const value = { ...input(), operation: 'UNMUTE' as const, targetStudentId: f.secondStudent.userId, appliedRevision: null,
    payloadDigest: classCommandDigest({ operation: 'UNMUTE', groupId: f.groupId, classId: f.live.id, targetStudentId: f.secondStudent.userId, expectedRevision: '0' }) };
  await foundation().transaction(admin, 'classes:manage-all', { kind: 'STUDENT', classId: f.live.id, studentId: f.secondStudent.userId }, 'WRITE', c => createClassCommandStore(c).append(value));
  expect((await f.pool.query('SELECT "studentId" FROM "ClassStudentRestriction" WHERE "classId"=$1 AND "studentId"=$2', [f.live.id, f.secondStudent.userId])).rowCount).toBe(0);
});
test('lost COMMIT acknowledgement is not retried; actual committed receipt can be looked up', async () => {
  const value = input(), client = await f.pool.connect(), original = client.query.bind(client);
  let callbacks = 0, commits = 0;
  const connect = vi.spyOn(f.pool, 'connect').mockImplementation((async () => client) as typeof f.pool.connect);
  const release = vi.spyOn(client, 'release').mockImplementation(() => {});
  const query = vi.spyOn(client, 'query').mockImplementation((async (...args: unknown[]) => {
    const result = await Reflect.apply(original, client, args);
    if (args[0] === 'COMMIT') { commits++; throw Object.assign(new Error('synthetic lost COMMIT acknowledgement'), { code: 'ECONNRESET' }); }
    return result;
  }) as typeof client.query);
  try {
    await expect(foundation().transaction(admin, 'classes:manage-all', { kind: 'CLASS', id: f.finished.id }, 'WRITE', c => {
      callbacks++; return createClassCommandStore(c).append(value);
    })).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
    expect(callbacks).toBe(1); expect(commits).toBe(1);
  } finally { query.mockRestore(); connect.mockRestore(); release.mockRestore(); client.release(); }
  expect(await foundation().transaction(admin, 'classes:manage-all', { kind: 'CLASS', id: f.finished.id }, 'READ', c => createClassCommandStore(c).lookup(value.commandId)))
    .toMatchObject({ command: { replayed: true, id: value.commandId } });
});
