import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { classesFixture, type ClassesFixture } from '../support/classes.js';
import { createClassesFoundation } from '../../src/app.module.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { createClassSessionStore } from '../../src/modules/classes/infrastructure/class-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';

let f: ClassesFixture, admin: SessionActor, secondAdmin: SessionActor, teacher: SessionActor;
beforeAll(async () => {
  f = await classesFixture(); const sessions = new PostgresSessionStore(f.pool);
  admin = (await sessions.lookup(f.admin.secret))!; secondAdmin = (await sessions.lookup(f.secondAdmin.secret))!;
  teacher = (await sessions.lookup(f.teacher.secret))!;
}, 120000);
afterAll(async () => { await f?.cleanup(); });
const foundation = () => createClassesFoundation(f.environment, f.pool);
const input = () => ({ commandId: randomUUID(), title: 'Clase transaccional ficticia', description: null });
async function counts() {
  const result: string[] = [];
  for (const table of ['ClassSession', 'ClassChange', 'ClassCommand', 'ClassAuditEvent'])
    result.push((await f.pool.query(`SELECT count(*)::text AS n FROM "${table}"`)).rows[0].n);
  return result;
}
test('creation commits one class, event, receipt and audit at the same exact decision instant', async () => {
  const before = await financialFingerprint(f.pool), value = input();
  const created = await foundation().management.create(teacher, f.groupId, value);
  const rows = (await f.pool.query(`SELECT s.revision::text,s."lastEventSeq"::text,
    s."createdAt"=s."updatedAt" AND s."createdAt"=c."occurredAt" AND c."occurredAt"=r."appliedAt"
      AND r."appliedAt"=a."occurredAt" AS exact,
    r."appliedEventSeq"=c."eventSeq" AND a."eventSeq"=c."eventSeq" AS same_event
    FROM "ClassSession" s JOIN "ClassChange" c ON c."classId"=s.id
    JOIN "ClassCommand" r ON r."classId"=s.id JOIN "ClassAuditEvent" a ON a."classId"=s.id
    WHERE s.id=$1 AND r."commandId"=$2 AND a."commandId"=$2`, [created.resource.id, value.commandId])).rows;
  expect(rows).toEqual([{ revision: '1', lastEventSeq: '1', exact: true, same_event: true }]);
  expect(await financialFingerprint(f.pool)).toBe(before);
});
test('two administrators starting distinct sessions concurrently commit exactly one LIVE and one START event', async () => {
  const g = await f.seedGroup(), api = foundation().management;
  const first = await api.create(admin, g, input()), second = await api.create(secondAdmin, g, input());
  const results = await Promise.allSettled([
    api.start(admin, first.resource.id, { commandId: randomUUID(), expectedRevision: '1' }),
    api.start(secondAdmin, second.resource.id, { commandId: randomUUID(), expectedRevision: '1' }),
  ]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(r => r.status === 'rejected')).toMatchObject([{ reason: { code: 'CLASS_ALREADY_LIVE' } }]);
  const rows = (await f.pool.query('SELECT state,revision::text,"lastEventSeq"::text FROM "ClassSession" WHERE "groupId"=$1 ORDER BY state', [g])).rows;
  expect(rows).toEqual(expect.arrayContaining([{ state: 'LIVE', revision: '2', lastEventSeq: '2' }, { state: 'PREPARED', revision: '1', lastEventSeq: '1' }]));
  expect((await f.pool.query(`SELECT c."classId" FROM "ClassChange" c JOIN "ClassSession" s ON s.id=c."classId" WHERE s."groupId"=$1 AND c.type='STARTED'`, [g])).rowCount).toBe(1);
});
test.each(['ClassChange', 'ClassCommand', 'ClassAuditEvent'])('failure after inserting %s rolls back every creation effect', async table => {
  const before = await counts(), value = input();
  await expect(foundation().transaction(admin, 'classes:manage-all', { kind: 'GROUP', id: f.groupId }, 'WRITE', async c => {
    const original = c.client.query.bind(c.client);
    const query = vi.spyOn(c.client, 'query').mockImplementation((async (...args: unknown[]) => {
      const result = await Reflect.apply(original, c.client, args);
      if (String(args[0]).includes(`INSERT INTO "${table}"`)) throw Object.assign(new Error('synthetic post-insert failure'), { code: 'XX000' });
      return result;
    }) as typeof c.client.query);
    try { return await createClassSessionStore(c).commands.create(f.groupId, value); } finally { query.mockRestore(); }
  })).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect(await counts()).toEqual(before);
  expect(await foundation().management.command(admin, value.commandId)).toEqual({ result: 'NOT_CONFIRMED' });
});
test('lost acknowledgement after actual CREATE COMMIT is not retried and same intent recovers the one class', async () => {
  const value = input(), client = await f.pool.connect(), original = client.query.bind(client);
  let commits = 0, inserts = 0;
  const connect = vi.spyOn(f.pool, 'connect').mockImplementation((async () => client) as typeof f.pool.connect);
  const release = vi.spyOn(client, 'release').mockImplementation(() => {});
  const query = vi.spyOn(client, 'query').mockImplementation((async (...args: unknown[]) => {
    if (String(args[0]).includes('INSERT INTO "ClassSession"')) inserts++;
    const result = await Reflect.apply(original, client, args);
    if (args[0] === 'COMMIT') { commits++; throw Object.assign(new Error('synthetic lost commit acknowledgement'), { code: 'ECONNRESET' }); }
    return result;
  }) as typeof client.query);
  try {
    await expect(foundation().management.create(admin, f.groupId, value)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
    expect(inserts).toBe(1); expect(commits).toBe(1);
  } finally { query.mockRestore(); connect.mockRestore(); release.mockRestore(); client.release(); }
  const found = await foundation().management.command(admin, value.commandId);
  expect(found).toMatchObject({ result: 'APPLIED', response: { command: { id: value.commandId, replayed: true } } });
  const before = await counts(), replay = await foundation().management.create(admin, f.groupId, value);
  if (found.result !== 'APPLIED' || !('id' in found.response.resource)) throw new Error('Committed class command not recovered');
  expect(replay.resource.id).toBe(found.response.resource.id); expect(await counts()).toEqual(before);
});
test('unknown-command lookup still revalidates the session and does not grant escaped scopes', async () => {
  await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [admin.sessionId]);
  try { await expect(foundation().management.command(admin, randomUUID())).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); }
  finally { await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [admin.sessionId]); }
  let escaped: ReturnType<typeof createClassSessionStore> | undefined;
  await foundation().transaction(admin, 'classes:manage-all', { kind: 'COMMAND', id: randomUUID() }, 'READ', async c => {
    escaped = createClassSessionStore(c); expect(await escaped.command(c.commandId!)).toEqual({ result: 'NOT_CONFIRMED' });
  });
  await expect(escaped!.command(randomUUID())).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
});
test('read-only scopes reject management writes and session scope cannot target another session', async () => {
  await foundation().transaction(admin, 'classes:manage-all', { kind: 'CLASS', id: f.prepared.id }, 'READ', async c => {
    await expect(createClassSessionStore(c).commands.start(f.prepared.id, { commandId: randomUUID(), expectedRevision: '1' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  await foundation().transaction(admin, 'classes:manage-all', { kind: 'CLASS', id: f.prepared.id }, 'WRITE', async c => {
    await expect(createClassSessionStore(c).commands.cancel(f.otherLive.id, { commandId: randomUUID(), expectedRevision: '2' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
