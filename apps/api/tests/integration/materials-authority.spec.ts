import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { materialsFixture } from '../support/materials.js';
import type { MaterialsFixture } from '../support/materials.js';
import { foundation } from '../support/materials-foundation.js';
import type { FoundationContext } from '../support/materials-foundation.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';

let f: MaterialsFixture;
let admin: SessionActor, teacher: SessionActor, other: SessionActor, student: SessionActor;
beforeAll(async () => {
  f = await materialsFixture(); const sessions = new PostgresSessionStore(f.pool);
  admin = (await sessions.lookup(f.admin.secret))!; teacher = (await sessions.lookup(f.teacher.secret))!;
  other = (await sessions.lookup(f.otherTeacher.secret))!; student = (await sessions.lookup(f.student.secret))!;
}, 120000);
afterAll(async () => { await f?.cleanup(); });

test('manager access is current assignment, never original authorship, catalog visibility or financial state', async () => {
  const target = foundation(f.environment, f.pool), before = await financialFingerprint(f.pool);
  expect((await target.queries.group(teacher, f.groupId)).id).toBe(f.groupId);
  await expect(target.queries.group(other, f.groupId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  // T039: enrolled student reads a minimal context; manager mutations remain forbidden.
  expect(Object.keys(await target.queries.group(student, f.groupId)).sort()).toEqual(['id', 'name', 'courseName'].sort());
  await expect(Promise.resolve().then(() => target.run(student, { kind: 'GROUP', id: f.groupId }, 'PREPARE', async () => {}))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(target.queries.group({ ...admin, role: 'UNKNOWN' as SessionActor['role'] }, f.groupId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [other.userId, f.groupId]);
  try {
    await expect(target.queries.item(teacher, f.prepared.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await target.queries.item(other, f.prepared.id)).createdBy).toBe(teacher.userId);
  } finally { await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [teacher.userId, f.groupId]); }
  expect(await financialFingerprint(f.pool)).toBe(before);
});

test('cancelled group permits only admin historical reads and withdrawal', async () => {
  const target = foundation(f.environment, f.pool), ref = { kind: 'GROUP' as const, id: f.cancelledGroupId };
  expect((await target.queries.group(admin, f.cancelledGroupId)).actions).toEqual({ prepare: false, edit: false, publish: false, withdraw: true });
  await expect(target.queries.group(teacher, f.cancelledGroupId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await target.run(admin, ref, 'WITHDRAW', async () => {});
  for (const action of ['PREPARE', 'EDIT', 'PUBLISH'] as const) await expect(target.run(admin, ref, action, async () => {})).rejects.toMatchObject({ code: 'MATERIAL_STATE_CONFLICT' });
});

test('revocation and role change are revalidated before resource/ledger work', async () => {
  const target = foundation(f.environment, f.pool); let called = false;
  const run = () => target.run(teacher, { kind: 'MATERIAL', id: f.prepared.id }, 'EDIT', async () => { called = true; });
  await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [teacher.sessionId]);
  await expect(run()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); expect(called).toBe(false);
  await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [teacher.sessionId]);
  // A forged/stale role must not authorize even though its permission exists.
  await expect(target.run({ ...teacher, role: 'ADMIN' }, { kind: 'GROUP', id: f.groupId }, 'READ', async () => {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('account UUIDs precede session, course, group and material; no financial locks and no leaked capability', async () => {
  const target = foundation(f.environment, f.pool), client = await f.pool.connect();
  const connect = vi.spyOn(f.pool, 'connect').mockImplementation((async () => client) as typeof f.pool.connect);
  const queries: { text: string; values?: unknown }[] = [];
  const original = client.query.bind(client);
  const spy = vi.spyOn(client, 'query').mockImplementation(((...args: unknown[]) => {
    const [sql, values] = args;
    if (typeof sql === 'string') queries.push({ text: sql, values });
    return Reflect.apply(original, client, args);
  }) as typeof client.query);
  let leaked: FoundationContext | undefined;
  try {
    await target.run(admin, { kind: 'MATERIAL', id: f.prepared.id }, 'READ', async context => {
      leaked = context; expect(typeof context.decision.at).toBe('bigint');
      await context.use(async () => {});
    });
  } finally { spy.mockRestore(); connect.mockRestore(); }
  expect(() => leaked!.assertActive()).toThrow();
  const locks = queries.filter(q => /FOR (UPDATE|SHARE)/.test(q.text));
  const index = (table: string) => locks.findIndex(q => q.text.includes(`FROM "${table}"`));
  expect(index('User')).toBe(0); expect(index('Session')).toBeGreaterThan(index('User'));
  expect(index('AcademicCourse')).toBeGreaterThan(index('Session'));
  expect(index('AcademicGroup')).toBeGreaterThan(index('AcademicCourse'));
  expect(index('Material')).toBeGreaterThan(index('AcademicGroup'));
  expect(locks.filter(q => /FROM "(AcademicCourse|AcademicGroup|Material)"/.test(q.text)).every(q => q.text.includes('FOR SHARE'))).toBe(true);
  expect(locks.some(q => /Enrollment|Payment|Reservation|Dispatch/.test(q.text))).toBe(false);
  const accountIds = locks[0].values as [string[]];
  expect(accountIds[0]).toEqual([...new Set([admin.userId, teacher.userId])].sort());
});

test('unknown references are indistinguishable and foreign upload intentions stay private even for admin', async () => {
  const target = foundation(f.environment, f.pool);
  await expect(target.queries.item(teacher, randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(target.queries.item(teacher, f.otherPublished.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(target.run(admin, { kind: 'UPLOAD', id: f.prepared.uploadId }, 'READ', async () => {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test.each(['assignment', 'revocation', 'cancellation'] as const)('%s committed after discovery is observed before the callback/ledger', async kind => {
  const group = randomUUID();
  await f.pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,"teacherUserId")
    VALUES ($1,$2,'Grupo de carrera ficticio',$3)`, [group, f.courseId, teacher.userId]);
  const target = foundation(f.environment, f.pool), writer = await f.pool.connect(), client = await f.pool.connect();
  const connect = vi.spyOn(f.pool, 'connect').mockImplementation((async () => client) as typeof f.pool.connect);
  // Keep this real client reserved across coordinator rollback/retry attempts.
  const release = vi.spyOn(client, 'release').mockImplementation(() => {});
  const original = client.query.bind(client); let changed = false, applied = false;
  const query = vi.spyOn(client, 'query').mockImplementation((async (...args: unknown[]) => {
    if (!changed && typeof args[0] === 'string' && args[0].includes('FROM "User"') && args[0].includes('FOR UPDATE')) {
      changed = true;
      if (kind === 'assignment') await writer.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [other.userId, group]);
      if (kind === 'revocation') await writer.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [teacher.sessionId]);
      if (kind === 'cancellation') await writer.query(`UPDATE "AcademicGroup" SET state='CANCELLED',
        "cancellationReason"='Carrera ficticia',"cancelledAt"=clock_timestamp() WHERE id=$1`, [group]);
    }
    return Reflect.apply(original, client, args);
  }) as typeof client.query);
  try {
    await expect(target.run(teacher, { kind: 'GROUP', id: group }, 'PREPARE', async () => { applied = true; }))
      .rejects.toMatchObject({ code: kind === 'revocation' ? 'AUTH_REQUIRED' : 'NOT_FOUND' });
    expect(changed).toBe(true); expect(applied).toBe(false);
  } finally {
    query.mockRestore(); connect.mockRestore(); release.mockRestore(); client.release(); writer.release();
    if (kind === 'revocation') await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [teacher.sessionId]);
  }
});

test('a backwards decision clock compared with known material facts is unavailable, never authorized', async () => {
  const target = foundation(f.environment, f.pool), material = await f.seedMaterial('PREPARED');
  await f.pool.query('UPDATE "Material" SET "updatedAt"=clock_timestamp()+interval \'1 day\' WHERE id=$1', [material.id]);
  await expect(target.queries.item(admin, material.id)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
});
