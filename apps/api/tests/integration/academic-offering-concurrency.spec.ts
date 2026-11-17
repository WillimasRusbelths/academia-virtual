import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { change, existingCommands, lifecycleStore, maintenanceSeed, resetAcademicFixture, savedGroup } from '../support/academic-maintenance.js';
import { academicFingerprint } from '../support/academic-preparation.js';
import { instrumentPool, latch } from '../support/academic-foundation-contract.js';
import { waitForBlockedBy } from '../support/locks.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import type { OfferingCommand } from '../../src/modules/academic-offering/application/offering-store.js';

let data: AcademicOfferingDataset, sessions: PostgresSessionStore, a: SessionActor, b: SessionActor;
let seed: Awaited<ReturnType<typeof maintenanceSeed>>;
const db = () => data.context.database.pool;
const userLock = (sql: string) => sql.includes('"User"') && /FOR UPDATE/i.test(sql);
const parentLock = (sql: string) => sql.includes('"AcademicCourse"') && /FOR UPDATE/i.test(sql);
beforeAll(async () => {
  data = await academicOfferingDataset('academic_concurrency'); sessions = new PostgresSessionStore(db());
  a = (await sessions.lookup(data.account('ADMIN').sessions[0].secret))!; b = (await sessions.lookup(data.secondAdmin.secret))!;
}, 120000);
beforeEach(async () => { await resetAcademicFixture(data); seed = await maintenanceSeed(data); });
afterAll(async () => { await data?.cleanup(); });
const publish = (id: string, kind: 'GROUP'|'COURSE' = 'GROUP'): OfferingCommand => kind === 'GROUP'
  ? { operation: 'GROUP_PUBLISH', commandId: randomUUID(), groupId: id, expectedRevision: '1' }
  : { operation: 'COURSE_PUBLISH', commandId: randomUUID(), courseId: id, expectedRevision: '1' };
async function counts(n: number) {
  expect((await db().query('SELECT count(*)::int AS n FROM "AcademicCommand"')).rows[0].n).toBe(n);
  expect((await db().query('SELECT count(*)::int AS n FROM "AcademicAuditEvent"')).rows[0].n).toBe(n);
}
/** Barrera posterior a un lock SQL real; el observador confirma que la otra
 * conexión espera al PID retenido. No se usan sleeps ni resultados simulados. */
async function interleave(first: OfferingCommand, second: OfferingCommand, lock: (sql: string) => boolean,
  verify: (first: PromiseSettledResult<unknown>, second: PromiseSettledResult<unknown>) => Promise<void>) {
  const release = latch(); let held = false, pid = 0;
  const traced = instrumentPool(db(), { after: async (sql, owner) => { if (!held && lock(sql)) { held = true; pid = owner; await release.promise; } } });
  const other = instrumentPool(db()); let x: Promise<unknown> | undefined, y: Promise<unknown> | undefined;
  try {
    x = existingCommands(traced.pool, sessions).execute(a, first, { requestId: randomUUID() });
    const left = x.then(value => ({ status: 'fulfilled' as const, value }), reason => ({ status: 'rejected' as const, reason }));
    await expect.poll(() => held, { timeout: 2000 }).toBe(true);
    y = existingCommands(other.pool, sessions).execute(b, second, { requestId: randomUUID() });
    const right = y.then(value => ({ status: 'fulfilled' as const, value }), reason => ({ status: 'rejected' as const, reason }));
    await waitForBlockedBy(data.observerPool, pid); release.release(); await verify(await left, await right);
    expect(traced.pids[0]).not.toBe(other.pids[0]);
  } finally { release.release(); await Promise.allSettled([x, y].filter((p): p is Promise<unknown> => p !== undefined)); }
}
for (const op of ['GROUP_WITHDRAW','GROUP_CANCEL'] as const) for (const order of ['transition-first','publication-first'] as const) {
  test(`R01 ${op}/${order}: estado confirmado decide agenda, nunca timeout como falso conflicto`, async () => {
    lifecycleStore(db(), sessions); // Gate independiente ANTES de iniciar transacciones/barreras.
    const state = change(op, seed.groupId), publication = publish(seed.competitorId);
    await interleave(order === 'transition-first' ? state : publication, order === 'transition-first' ? publication : state, userLock, async (first, second) => {
      if (order === 'transition-first') {
        expect(first).toMatchObject({ status: 'fulfilled', value: { command: { result: 'APPLIED' } } });
        expect(second).toMatchObject({ status: 'fulfilled', value: { resource: { state: 'PUBLISHED' } } }); await counts(2);
      } else {
        expect(first).toMatchObject({ status: 'rejected', reason: { code: 'TEACHER_SCHEDULE_CONFLICT' } });
        expect(second).toMatchObject({ status: 'fulfilled', value: { command: { result: 'APPLIED' } } }); await counts(1);
      }
      expect((await savedGroup(data, seed.groupId)).state).toBe(op === 'GROUP_WITHDRAW' ? 'WITHDRAWN' : 'CANCELLED');
      expect((await savedGroup(data, seed.competitorId)).state).toBe(order === 'transition-first' ? 'PUBLISHED' : 'DRAFT');
    });
  });
}
for (const order of ['course-first','group-first'] as const) test(`R02 retirar padre/publicar grupo ${order}: mismo parent lock, sin ocultar revisión`, async () => {
  lifecycleStore(db(), sessions);
  await resetAcademicFixture(data); seed = await maintenanceSeed(data, { firstGroupDraft: true });
  const withdrawal = change('COURSE_WITHDRAW', seed.courseId), publication = publish(seed.groupId);
  await interleave(order === 'course-first' ? withdrawal : publication, order === 'course-first' ? publication : withdrawal, parentLock, async (first, second) => {
    expect(first).toMatchObject({ status: 'fulfilled' });
    if (order === 'course-first') { expect(second).toMatchObject({ status: 'rejected', reason: { code: 'OFFERING_STATE_CONFLICT' } }); await counts(1); }
    else { expect(second).toMatchObject({ status: 'fulfilled' }); await counts(2); }
    expect((await db().query('SELECT state FROM "AcademicCourse" WHERE id=$1', [seed.courseId])).rows[0].state).toBe('WITHDRAWN');
    expect((await savedGroup(data, seed.groupId)).state).toBe(order === 'group-first' ? 'PUBLISHED' : 'DRAFT');
  });
});
test('R03 cursos con docentes cruzados: locks de cuentas ordenados, serialización sin deadlock', async () => {
  const teacherB = data.otherTeacher.userId;
  await resetAcademicFixture(data); seed = await maintenanceSeed(data, { otherTeacherId: teacherB });
  await db().query(`UPDATE "AcademicCourse" SET state='WITHDRAWN'`);
  await db().query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId",
    "publishedTeacherEligibilityVersion"=(SELECT "eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"="teacherUserId") WHERE id=$1`, [seed.competitorId]);
  await db().query('UPDATE "AcademicSlot" SET "dayOfWeek"=3 WHERE "groupId"=$1', [seed.competitorId]);
  const extra = randomUUID();
  await db().query(`INSERT INTO "AcademicGroup" (id,"courseId",name,state,capacity,"periodStart","periodEnd","teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion")
    SELECT $1,$2,'Cruzado ficticio','PUBLISHED',45,'2026-10-19','2026-10-25',$3,$3,"eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"=$3`, [extra, seed.otherCourseId, teacherB]);
  await db().query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,4,1080,1140)', [extra]);
  await interleave(publish(seed.courseId, 'COURSE'), publish(seed.otherCourseId, 'COURSE'), userLock, async (first, second) => {
    expect(first).toMatchObject({ status: 'fulfilled' }); expect(second).toMatchObject({ status: 'fulfilled' }); await counts(2);
    expect((await db().query(`SELECT count(*)::int AS n FROM "AcademicCourse" WHERE state='PUBLISHED'`)).rows[0].n).toBe(2);
    expect((await db().query(`SELECT count(*)::int AS n FROM "AcademicGroup" WHERE state='PUBLISHED'`)).rows[0].n).toBe(4);
  });
});
/** Reutiliza la frontera de topología ya prevista en T036: un commit de fixture
 * incorpora un hijo publicado entre descubrimiento y parent lock. No acredita una
 * ruta de edición/publicación implícita ni reemplaza el publicador bajo prueba. */
async function topologyRace(mode: 'success'|'retry'|'exhaust') {
  await db().query(`UPDATE "AcademicCourse" SET state='WITHDRAWN' WHERE id=$1`, [seed.courseId]);
  const runtime = new URL(data.context.environment.databaseUrl).username;
  if (!/^[a-z][a-z0-9_]+$/.test(runtime)) throw new Error('Rol de fixture no permitido.');
  if (mode !== 'success') await data.context.isolated.ownerQuery(`CREATE SEQUENCE maintenance_abort_seq;
    CREATE FUNCTION maintenance_abort_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF nextval('maintenance_abort_seq') <= ${mode === 'retry' ? 1 : 2} THEN RAISE EXCEPTION 'Aborto de fixture' USING ERRCODE='40001'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER maintenance_abort_update BEFORE UPDATE ON "AcademicCourse" FOR EACH ROW EXECUTE FUNCTION maintenance_abort_update();
    GRANT USAGE,SELECT ON SEQUENCE maintenance_abort_seq TO "${runtime}";`);
  const holder = await db().connect(); const trace = instrumentPool(db()); let pending: Promise<unknown> | undefined;
  try {
    await holder.query('BEGIN'); const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM "AcademicCourse" WHERE id=$1 FOR UPDATE', [seed.courseId]);
    pending = existingCommands(trace.pool, sessions).execute(a, publish(seed.courseId, 'COURSE'), { requestId: randomUUID() });
    const result = pending.then(value => ({ value }), error => ({ error })); await waitForBlockedBy(data.observerPool, pid);
    const newcomer = randomUUID(), teacherB = data.otherTeacher.userId;
    await holder.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,state,capacity,"periodStart","periodEnd","teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion")
      SELECT $1,$2,'Nuevo hijo ficticio','PUBLISHED',45,'2026-10-19','2026-10-25',$3,$3,"eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"=$3`, [newcomer, seed.courseId, teacherB]);
    await holder.query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,3,1080,1140)', [newcomer]);
    await holder.query('COMMIT');
    const outcome = await result;
    expect(outcome).toMatchObject(mode === 'exhaust' ? { error: { code: 'TEMPORARILY_UNAVAILABLE' } } : { value: { resource: { state: 'PUBLISHED' } } });
    expect(trace.statements.filter(s => /^BEGIN\b/.test(s.sql))).toHaveLength(mode === 'success' ? 2 : 3);
    expect(trace.statements.filter(s => /^COMMIT\b/.test(s.sql))).toHaveLength(mode === 'exhaust' ? 0 : 1);
    const firstParent = trace.statements.findIndex(s => parentLock(s.sql)); const firstRollback = trace.statements.findIndex(s => /^ROLLBACK\b/.test(s.sql));
    expect(firstParent).toBeGreaterThanOrEqual(0); expect(firstRollback).toBeGreaterThan(firstParent);
    expect(trace.statements.slice(firstParent + 1, firstRollback).some(s => userLock(s.sql))).toBe(false);
    await counts(mode === 'exhaust' ? 0 : 1);
    expect((await db().query('SELECT state FROM "AcademicCourse" WHERE id=$1', [seed.courseId])).rows[0].state).toBe(mode === 'exhaust' ? 'WITHDRAWN' : 'PUBLISHED');
    expect((await savedGroup(data, newcomer)).state).toBe('PUBLISHED');
  } finally {
    await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined);
    if (mode !== 'success') await data.context.isolated.ownerQuery('DROP TRIGGER maintenance_abort_update ON "AcademicCourse"; DROP FUNCTION maintenance_abort_update(); DROP SEQUENCE maintenance_abort_seq');
  }
}
test('R04 conjunto cambia tras descubrimiento: rollback antes de tomar docente nuevo y redescubrimiento real', async () => { await topologyRace('success'); });
test('R05 cambio de conjunto + 40001 consumen un presupuesto único de tres intentos, luego commit', async () => { await topologyRace('retry'); });
test('R06 agotamiento por topología + dos abortos SQL reales: tres intentos, 503 y cero efectos', async () => { await topologyRace('exhaust'); });
test('R07 asignación cambia mientras se espera User: redescubrir, rechazar revisión obsoleta y preservar commit ajeno', async () => {
  await resetAcademicFixture(data); seed = await maintenanceSeed(data, { firstGroupDraft: true });
  const holder = await db().connect(), trace = instrumentPool(db()); let pending: Promise<unknown> | undefined;
  try {
    await holder.query('BEGIN'); const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM "User" WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[seed.teacherId, data.otherTeacher.userId, b.userId]]);
    await holder.query('SELECT id FROM "AcademicCourse" WHERE id=$1 FOR UPDATE', [seed.courseId]);
    pending = existingCommands(trace.pool, sessions).execute(a, { operation: 'GROUP_EDIT', commandId: randomUUID(), groupId: seed.groupId,
      expectedRevision: '1', changes: { name: 'No debe sobrescribir' } }, { requestId: randomUUID() });
    const settled = pending.then(value => ({ value }), error => ({ error })); await waitForBlockedBy(data.observerPool, pid);
    await holder.query('UPDATE "AcademicGroup" SET "teacherUserId"=$2,revision=revision+1 WHERE id=$1', [seed.groupId, data.otherTeacher.userId]); await holder.query('COMMIT');
    expect(await settled).toMatchObject({ error: { code: 'OFFERING_VERSION_CONFLICT' } });
    expect(trace.statements.filter(s => /^BEGIN\b/.test(s.sql))).toHaveLength(2); await counts(0);
    expect(await savedGroup(data, seed.groupId)).toMatchObject({ teacherUserId: data.otherTeacher.userId, revision: 2, name: 'Turno A' });
  } finally { await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined); }
});
test('R08 controles auxiliares no se confunden con aceptación de mantenimiento: SQL independiente no muta en lectura', async () => {
  const before = await academicFingerprint(data.observerPool); const pid = (await db().query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  expect((await data.observerPool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid).not.toBe(pid);
  expect(await academicFingerprint(data.observerPool)).toBe(before);
});
