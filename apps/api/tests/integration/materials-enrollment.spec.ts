import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { materialsTemporalFixture } from '../support/materials-temporal.js';
import type { MaterialsTemporalFixture } from '../support/materials-temporal.js';
import { foundation } from '../support/materials-foundation.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';

let f: MaterialsTemporalFixture, before: string;
beforeAll(async () => { f = await materialsTemporalFixture(); }, 120000);
beforeEach(async () => { await f.set(f.base); before = await financialFingerprint(f.pool); });
afterEach(async () => { expect(await financialFingerprint(f.pool)).toBe(before); await f.set(f.base); });
afterAll(async () => { await f?.cleanup(); });
async function actor(secret: string): Promise<SessionActor> {
  const value = await new PostgresSessionStore(f.pool).lookup(secret); expect(value).not.toBeNull(); return value!;
}
const queries = () => foundation(f.environment, f.pool).queries;

test('ME00 SQL fixture preserves exact microseconds and separates enrollment from reservation/payment/incident facts', async () => {
  for (const at of [f.confirmedAt - 1n, f.confirmedAt, f.confirmedAt + 1n, f.validUntil - 1n, f.validUntil, f.validUntil + 1n]) {
    await f.set(at);
    expect((await f.pool.query(`SELECT (extract(epoch FROM clock_timestamp())*1000000)::numeric(30,0)::text AS at`)).rows[0].at).toBe(at.toString());
  }
  expect(f.validUntil > f.confirmedAt).toBe(true);
  for (const key of ['reservationStudent', 'pendingStudent', 'incidentStudent'] as const)
    expect((await f.pool.query('SELECT count(*)::int AS n FROM "Enrollment" WHERE "studentId"=$1', [f[key].userId])).rows[0].n).toBe(0);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "Enrollment" WHERE "studentId"=$1', [f.temporalStudent.userId])).rows[0].n).toBe(1);
});

for (const [boundary, delta, allowed] of [
  ['confirmedAt', -1n, false], ['confirmedAt', 0n, true], ['confirmedAt', 1n, true],
  ['validUntil', -1n, true], ['validUntil', 0n, false], ['validUntil', 1n, false],
] as const) test(`ME01 ${boundary} ${delta}us: entitlement ${allowed}`, async () => {
  const at = f[boundary] + delta; await f.set(at); const student = await actor(f.temporalStudent.secret);
  if (allowed) {
    expect((await queries().group(student, f.groupId)).id).toBe(f.groupId);
    await foundation(f.environment, f.pool).run(student, { kind: 'GROUP', id: f.groupId }, 'READ', async context => {
      expect(typeof context.decision.at).toBe('bigint'); expect(context.decision.at).toBe(at);
    });
  } else await expect(queries().group(student, f.groupId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('ME02 own current group appears before pagination; another group of the same course grants no right', async () => {
  const student = await actor(f.student.secret), page = await queries().groups(student, { page: 1, pageSize: 1 });
  expect(page).toMatchObject({ total: 1, page: 1, pageSize: 1 }); expect(page.items.map(g => g.id)).toEqual([f.groupId]);
  await expect(queries().group(student, f.otherGroupId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(await queries().groups(student, { page: 2, pageSize: 1 })).toMatchObject({ total: 1, items: [] });
});
for (const key of ['unEnrolledStudent', 'reservationStudent', 'pendingStudent', 'incidentStudent', 'historicalStudent', 'otherStudent'] as const)
  test(`ME03 ${key}: no current enrollment in this group, safe concealment and no financial mutation`, async () => {
    const student = await actor(f[key].secret);
    await expect(queries().group(student, f.groupId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    if (key !== 'otherStudent') expect(await queries().groups(student)).toMatchObject({ items: [], total: 0 });
  });

test('ME04 original enrollment end survives later offering period changes; history is never reactivated', async () => {
  await f.pool.query(`UPDATE "AcademicGroup" SET "periodEnd"='2091-03-31',revision=revision+1 WHERE id=$1`, [f.groupId]);
  try {
    await f.set(f.validUntil - 1n); expect((await queries().group(await actor(f.student.secret), f.groupId)).id).toBe(f.groupId);
    await f.set(f.validUntil); await expect(queries().group(await actor(f.student.secret), f.groupId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(queries().group(await actor(f.historicalStudent.secret), f.groupId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  } finally { await f.pool.query(`UPDATE "AcademicGroup" SET "periodEnd"='2090-03-31',revision=revision+1 WHERE id=$1`, [f.groupId]); }
});

test('ME05 withdrawn offering and ineligible teacher do not revoke a current original enrollment', async () => {
  try {
    // Exercise real editorial guards: DRAFT -> PUBLISHED -> WITHDRAWN, never bypass them.
    await f.pool.query(`UPDATE "AcademicCourse" SET state='PUBLISHED',revision=revision+1 WHERE id=$1`, [f.courseId]);
    await f.pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId",
      "publishedTeacherEligibilityVersion"=(SELECT "teacherEligibilityVersion" FROM "User" WHERE id=$2),revision=revision+1 WHERE id=$1`, [f.groupId, f.teacher.userId]);
    await f.pool.query(`UPDATE "AcademicGroup" SET state='WITHDRAWN',revision=revision+1 WHERE id=$1`, [f.groupId]);
    await f.pool.query(`UPDATE "AcademicCourse" SET state='WITHDRAWN',revision=revision+1 WHERE id=$1`, [f.courseId]);
    await f.pool.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [f.teacher.userId]);
    const student = await actor(f.student.secret);
    expect((await queries().group(student, f.groupId)).id).toBe(f.groupId);
    expect((await queries().items(student, f.groupId)).items.map(item => item.id)).toEqual([f.published.id]);
  } finally {
    await f.pool.query('UPDATE "User" SET "emailVerifiedAt"=clock_timestamp() WHERE id=$1', [f.teacher.userId]);
  }
});

test('ME06 expired decision capability cannot be reused after its transaction', async () => {
  const student = await actor(f.student.secret); let check: (() => void) | undefined;
  await foundation(f.environment, f.pool).run(student, { kind: 'GROUP', id: f.groupId }, 'READ', async context => {
    check = context.assertActive; expect(context.decision.at).toBe(f.base);
  });
  expect(check).toBeTypeOf('function'); expect(() => check!()).toThrow();
});
