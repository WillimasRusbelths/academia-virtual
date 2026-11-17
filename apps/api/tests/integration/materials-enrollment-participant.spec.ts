import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { materialsTemporalFixture } from '../support/materials-temporal.js';
import type { MaterialsTemporalFixture } from '../support/materials-temporal.js';
import { foundation } from '../support/materials-foundation.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { instrumentMaterialsPool } from '../support/materials-testing.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';

type Decision = { readonly at: bigint };
type Scope = { assertDecision(token: Decision): void; use<T>(operation: () => Promise<T>): Promise<T> };
type Participant = { hasAccess(studentId: string, groupId: string, decision: Decision): Promise<boolean>;
  groups(studentId: string, decision: Decision): Promise<readonly { groupId: string; courseId: string }[]> };
async function participant(client: PoolClient, scope: Scope): Promise<Participant> {
  const location = new URL('../../src/modules/enrollment/infrastructure/materials-participant.ts', import.meta.url);
  if (!existsSync(fileURLToPath(location))) throw new Error('T038 pending: enrollment materials participant not implemented');
  const factory: unknown = Reflect.get(await import(location.href), 'createMaterialsEnrollmentParticipant');
  if (typeof factory !== 'function') throw new Error('T038 pending: enrollment materials factory unavailable');
  return factory(client, scope) as Participant;
}
let f: MaterialsTemporalFixture, admin: SessionActor, before: string;
beforeAll(async () => { f = await materialsTemporalFixture(); admin = (await new PostgresSessionStore(f.pool).lookup(f.admin.secret))!; }, 120000);
beforeEach(async () => { await f.set(f.base); before = await financialFingerprint(f.pool); });
afterEach(async () => { expect(await financialFingerprint(f.pool)).toBe(before); await f.set(f.base); });
afterAll(async () => { await f?.cleanup(); });
async function run<T>(apply: (value: Participant, decision: Decision, client: PoolClient) => Promise<T>) {
  return foundation(f.environment, f.pool).run(admin, { kind: 'GROUP', id: f.groupId }, 'READ', async context =>
    apply(await participant(context.client, context as typeof context & Scope), context.decision, context.client));
}
for (const [boundary, delta, allowed] of [
  ['confirmedAt', -1n, false], ['confirmedAt', 0n, true], ['confirmedAt', 1n, true],
  ['validUntil', -1n, true], ['validUntil', 0n, false], ['validUntil', 1n, false],
] as const) test(`MP01 ${boundary} ${delta}us yields ${allowed} on the shared exact decision`, async () => {
  await f.set(f[boundary] + delta);
  await run(async (value, decision) => {
    expect(decision.at).toBe(f[boundary] + delta);
    expect(await value.hasAccess(f.temporalStudent.userId, f.groupId, decision)).toBe(allowed);
    expect(await value.groups(f.temporalStudent.userId, decision)).toEqual(allowed ? [{ groupId: f.groupId, courseId: f.courseId }] : []);
  });
});
test('MP02 only actual own enrollment grants access; reservations, pending payment, incident and history do not', async () => {
  await run(async (value, decision) => {
    for (const key of ['unEnrolledStudent', 'reservationStudent', 'pendingStudent', 'incidentStudent', 'historicalStudent'] as const) {
      expect(await value.hasAccess(f[key].userId, f.groupId, decision)).toBe(false); expect(await value.groups(f[key].userId, decision)).toEqual([]);
    }
    expect(await value.hasAccess(f.student.userId, f.otherGroupId, decision)).toBe(false);
    expect(await value.hasAccess(f.otherStudent.userId, f.groupId, decision)).toBe(false);
    expect(await value.groups(f.otherStudent.userId, decision)).toEqual([{ groupId: f.otherGroupId, courseId: f.courseId }]);
    expect(await value.groups(randomUUID(), decision)).toEqual([]);
  });
});
test('MP03 minimal references use the original enrollment regardless of offering/teacher visibility or current period', async () => {
  await f.pool.query(`UPDATE "AcademicGroup" SET "periodEnd"='2091-03-31',revision=revision+1 WHERE id=$1`, [f.groupId]);
  await f.pool.query(`UPDATE "AcademicCourse" SET state='PUBLISHED',revision=revision+1 WHERE id=$1`, [f.courseId]);
  await f.pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId",
    "publishedTeacherEligibilityVersion"=(SELECT "teacherEligibilityVersion" FROM "User" WHERE id=$2),revision=revision+1 WHERE id=$1`, [f.groupId, f.teacher.userId]);
  await f.pool.query(`UPDATE "AcademicGroup" SET state='WITHDRAWN',revision=revision+1 WHERE id=$1`, [f.groupId]);
  await f.pool.query(`UPDATE "AcademicCourse" SET state='WITHDRAWN',revision=revision+1 WHERE id=$1`, [f.courseId]);
  await f.pool.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [f.teacher.userId]);
  await f.set(f.validUntil - 1n);
  await run(async (value, decision) => {
    expect(await value.hasAccess(f.student.userId, f.groupId, decision)).toBe(true);
    expect(await value.groups(f.student.userId, decision)).toEqual([{ groupId: f.groupId, courseId: f.courseId }]);
  });
  await f.set(f.validUntil); await run(async (value, decision) => { expect(await value.hasAccess(f.student.userId, f.groupId, decision)).toBe(false); });
});
test('MP04 forged token and expired scope are rejected before issuing SQL', async () => {
  let leaked: Participant | undefined, token: Decision | undefined;
  await run(async (value, decision) => { leaked = value; token = decision;
    await expect(value.hasAccess(f.student.userId, f.groupId, { at: decision.at })).rejects.toThrow();
    await expect(value.groups(f.student.userId, { at: decision.at })).rejects.toThrow();
  });
  let statements = 0; const restore = instrumentMaterialsPool(f.pool, async (sql, execute) => { statements++; return execute(); });
  try { await expect(leaked!.hasAccess(f.student.userId, f.groupId, token!)).rejects.toThrow();
    await expect(leaked!.groups(f.student.userId, token!)).rejects.toThrow(); expect(statements).toBe(0);
  } finally { restore(); }
});
test('MP05 participant only reads Enrollment on the supplied connection, without transactions or financial locks', async () => {
  await run(async (value, decision, client) => {
    const queries: string[] = [], original = client.query.bind(client), connect = vi.spyOn(f.pool, 'connect');
    const query = vi.spyOn(client, 'query').mockImplementation(((...args: unknown[]) => {
      queries.push(typeof args[0] === 'string' ? args[0] : ''); return Reflect.apply(original, client, args);
    }) as typeof client.query);
    try {
      expect(await value.hasAccess(f.student.userId, f.groupId, decision)).toBe(true);
      expect(await value.groups(f.student.userId, decision)).toEqual([{ groupId: f.groupId, courseId: f.courseId }]);
      // The coordinator already holds this connection, so no new pool.connect is needed.
      expect(connect).not.toHaveBeenCalled(); expect(queries).toHaveLength(2);
      for (const sql of queries) { expect(sql).toMatch(/FROM "Enrollment"/); expect(sql).not.toMatch(/BEGIN|COMMIT|FOR UPDATE|FOR SHARE|JOIN|EnrollmentOrder|Payment|Academic|\bUPDATE\b|\bINSERT\b/); }
    } finally { query.mockRestore(); connect.mockRestore(); }
  });
});
