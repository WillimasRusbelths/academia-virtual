import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import * as persistence from '../../src/modules/academic-offering/infrastructure/offering-store.js';
import type { OfferingStore } from '../../src/modules/academic-offering/application/offering-store.js';
import type { AcademicTransactionDependencies } from '../../src/infrastructure/database/academic-transaction.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { academicFingerprint } from '../support/academic-preparation.js';
import { instrumentPool, latch } from '../support/academic-foundation-contract.js';
import { waitForBlockedBy } from '../support/locks.js';

type Publisher = Pick<OfferingStore, 'execute'>;
type Factory = (pool: Pool, authorization: AcademicTransactionDependencies) => Publisher;
let data: AcademicOfferingDataset, sessions: PostgresSessionStore, adminA: SessionActor, adminB: SessionActor;
let courses: string[], groups: string[];
const db = () => data.context.database.pool;
/** Enlace SOLO de conformidad para T036. Adaptable a su fábrica real; nunca implementa publicación. */
function publisher(connection = db()): Publisher {
  const factory = (persistence as unknown as { createPublicationStore?: Factory }).createPublicationStore;
  expect(factory, 'T036 pendiente: adaptador real de publicación ausente; caso ejecutado antes de adquirir locks').toBeTypeOf('function');
  return factory!(connection, { revalidateInTransaction: sessions.revalidateInTransaction.bind(sessions) });
}
const command = (index: number, commandId = randomUUID()) => ({ operation: 'GROUP_PUBLISH' as const, groupId: groups[index], commandId, expectedRevision: '1' });
const execute = (store: Publisher, index: number, actor = adminA, id = randomUUID()) => store.execute(actor, command(index, id), { requestId: randomUUID() });
const isUserLock = (sql: string) => sql.includes('"User"') && /FOR UPDATE/i.test(sql);
beforeAll(async () => {
  data = await academicOfferingDataset('academic_publication_races'); sessions = new PostgresSessionStore(db());
  adminA = (await sessions.lookup(data.account('ADMIN').sessions[0].secret))!;
  adminB = (await sessions.lookup(data.secondAdmin.secret))!;
}, 120000);
beforeEach(async () => {
  await data.context.isolated.ownerQuery('TRUNCATE "AcademicAuditEvent","AcademicCommand","AcademicSlot","AcademicGroup","AcademicCourse"');
  await db().query(`UPDATE "User" SET role='TEACHER',status='ACTIVE',"disabledAt"=NULL WHERE id=$1`, [data.account('TEACHER').id]);
  courses = [randomUUID(), randomUUID()]; groups = [randomUUID(), randomUUID()];
  for (let i = 0; i < 2; i++) {
    await db().query(`INSERT INTO "AcademicCourse" (id,name,description,state) VALUES ($1,$2,'Descripción ficticia','PUBLISHED')`, [courses[i], `Curso ${i}`]);
    await db().query(`INSERT INTO "AcademicGroup" (id,"courseId",name,capacity,"periodStart","periodEnd","teacherUserId")
      VALUES ($1,$2,$3,45,'2026-10-19','2026-10-25',$4)`, [groups[i], courses[i], `Grupo ${i}`, data.account('TEACHER').id]);
    await db().query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1080,1140)', [groups[i]]);
  }
});
afterAll(async () => { await data?.cleanup(); });
async function publishedFixture(index = 0) {
  await db().query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId",
    "publishedTeacherEligibilityVersion"=(SELECT "eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"="teacherUserId") WHERE id=$1`, [groups[index]]);
}
async function finalCounts(successes: number) {
  expect((await data.observerPool.query(`SELECT count(*)::int AS n FROM "AcademicGroup" WHERE state='PUBLISHED'`)).rows[0].n).toBe(successes);
  expect((await data.observerPool.query('SELECT count(*)::int AS n FROM "AcademicCommand"')).rows[0].n).toBe(successes);
  expect((await data.observerPool.query('SELECT count(*)::int AS n FROM "AcademicAuditEvent"')).rows[0].n).toBe(successes);
}
describe('T034 controles de barreras PostgreSQL; NO protocolo de publicación aprobado', () => {
  test('I01 dos clientes y observador independiente identifican espera real por User', async () => {
    const operations = (await data.observerPool.query(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
      JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='AcademicOperation' AND n.nspname=current_schema()`)).rows.map(r => r.enumlabel);
    expect(operations).toEqual(expect.arrayContaining(['COURSE_PUBLISH','GROUP_PUBLISH']));
    expect(operations).not.toContain('PUBLISH_COURSE'); expect(operations).not.toContain('PUBLISH_GROUP');
    const holder = await db().connect(), waiter = await db().connect(); let pending: Promise<unknown> | undefined;
    try {
      await holder.query('BEGIN'); const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const otherPid = (await waiter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid; expect(pid).not.toBe(otherPid);
      await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [data.account('TEACHER').id]);
      await waiter.query('BEGIN'); pending = waiter.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [data.account('TEACHER').id]);
      const settled = pending.then(() => true, () => false); await waitForBlockedBy(data.observerPool, pid);
      await holder.query('COMMIT'); expect(await settled).toBe(true); await waiter.query('ROLLBACK');
    } finally { await holder.query('ROLLBACK'); await pending?.catch(() => undefined); await waiter.query('ROLLBACK'); holder.release(); waiter.release(); }
  });
  test('I02 READ COMMITTED: sentencia nueva después del lock observa commit ajeno', async () => {
    const holder = await db().connect(), waiter = await db().connect(); let pending: Promise<unknown> | undefined;
    try {
      await holder.query('BEGIN'); await waiter.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [data.account('TEACHER').id]);
      expect((await waiter.query('SELECT revision::text FROM "AcademicCourse" WHERE id=$1', [courses[0]])).rows[0].revision).toBe('1');
      pending = waiter.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [data.account('TEACHER').id]);
      const settled = pending.then(() => true, () => false); await waitForBlockedBy(data.observerPool, pid);
      await holder.query('UPDATE "AcademicCourse" SET revision=2 WHERE id=$1', [courses[0]]); await holder.query('COMMIT'); expect(await settled).toBe(true);
      expect((await waiter.query('SELECT revision::text FROM "AcademicCourse" WHERE id=$1', [courses[0]])).rows[0].revision).toBe('2');
    } finally { await holder.query('ROLLBACK'); await pending?.catch(() => undefined); await waiter.query('ROLLBACK'); holder.release(); waiter.release(); }
  });
});

/** Dos publicaciones reales; pausa solo tras ejecutar SQL real, sin falsear filas/respuestas. */
async function competing(first: 0|1, conflict: boolean) {
  const ready = latch(), release = latch(); let holderPid = 0, held = false;
  const firstTrace = instrumentPool(db(), { after: async (sql, pid) => {
    if (!held && isUserLock(sql)) { held = true; holderPid = pid; ready.release(); await release.promise; }
  } });
  const secondTrace = instrumentPool(db());
  const a = publisher(firstTrace.pool), b = publisher(secondTrace.pool); const second = first === 0 ? 1 : 0;
  let runA: ReturnType<Publisher['execute']> | undefined, runB: ReturnType<Publisher['execute']> | undefined;
  try {
    runA = execute(a, first, first === 0 ? adminA : adminB); const resultA = runA.then(value => ({ value }), error => ({ error }));
    await expect.poll(() => held, { timeout: 2000 }).toBe(true); await ready.promise;
    runB = execute(b, second, second === 0 ? adminA : adminB); const resultB = runB.then(value => ({ value }), error => ({ error }));
    await waitForBlockedBy(data.observerPool, holderPid); release.release();
    expect(await resultA).toMatchObject({ value: { command: { replayed: false, result: 'APPLIED' }, resource: { state: 'PUBLISHED' } } });
    if (conflict) expect(await resultB).toMatchObject({ error: { code: 'TEACHER_SCHEDULE_CONFLICT', failure: { conflictingGroupIds: [groups[first]] } } });
    else expect(await resultB).toMatchObject({ value: { resource: { state: 'PUBLISHED' } } });
    expect(firstTrace.pids[0]).not.toBe(secondTrace.pids[0]);
    const lockIndex = secondTrace.statements.findIndex(s => isUserLock(s.sql)); expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(secondTrace.statements.slice(lockIndex + 1).some(s => /SELECT/i.test(s.sql) && s.sql.includes('AcademicGroup') && s.sql.includes('PUBLISHED'))).toBe(true);
    expect(secondTrace.statements.filter(s => isUserLock(s.sql)).every(s => !s.sql.includes('AcademicGroup'))).toBe(true);
    await finalCounts(conflict ? 1 : 2);
    if (conflict) expect((await data.observerPool.query('SELECT state,revision::text FROM "AcademicGroup" WHERE id=$1', [groups[second]])).rows[0]).toEqual({ state: 'DRAFT', revision: '1' });
  } finally { release.release(); await Promise.allSettled([runA, runB].filter((v): v is NonNullable<typeof v> => v !== undefined)); }
}
describe('T034 publicaciones reales concurrentes — FR-004/007/015; SC-004/006', () => {
  test.each([0,1] as const)('R01 primer administrador %i: un éxito y un conflicto, snapshot posterior al lock', async first => {
    publisher(); await competing(first, true);
  });
  test('R02 docentes/cursos/actores distintos no esperan un mutex global', async () => {
    publisher(); await db().query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1', [groups[1], data.otherTeacher.userId]);
    const release = latch(); let held = false; const trace = instrumentPool(db(), { after: async sql => {
      if (!held && isUserLock(sql)) { held = true; await release.promise; }
    } });
    const storeA = publisher(trace.pool), storeB = publisher();
    let pending: ReturnType<Publisher['execute']> | undefined, pendingSecond: ReturnType<Publisher['execute']> | undefined;
    try {
      pending = execute(storeA, 0, adminA); const first = pending.then(value => ({ value }), error => ({ error }));
      await expect.poll(() => held, { timeout: 2000 }).toBe(true);
      let done = false; pendingSecond = execute(storeB, 1, adminB);
      const second = pendingSecond.then(value => { done = true; return { value }; }, error => { done = true; return { error }; });
      await expect.poll(() => done, { timeout: 2000 }).toBe(true); expect(await second).toMatchObject({ value: { resource: { state: 'PUBLISHED' } } });
      release.release(); expect(await first).toMatchObject({ value: { resource: { state: 'PUBLISHED' } } }); await finalCounts(2);
    } finally { release.release(); await Promise.allSettled([pending, pendingSecond].filter((v): v is NonNullable<typeof v> => v !== undefined)); }
  });
  test.each([
    { name: 'franjas contiguas', start: '2026-10-19', end: '2026-10-25', day: 1, minute: 1140, conflict: false },
    { name: 'día semanal distinto', start: '2026-10-19', end: '2026-10-25', day: 2, minute: 1080, conflict: false },
    { name: 'fechas disjuntas', start: '2026-10-26', end: '2026-11-01', day: 1, minute: 1080, conflict: false },
    { name: 'periodos se cruzan sin lunes común', start: '2026-10-20', end: '2026-10-26', day: 1, minute: 1080, conflict: false },
    { name: 'lunes efectivo solo en extremo incluido', start: '2026-10-12', end: '2026-10-19', day: 1, minute: 1080, conflict: true },
  ])('R03 frontera $name', async ({ start, end, day, minute, conflict }) => {
    publisher(); await db().query('UPDATE "AcademicGroup" SET "periodStart"=$2,"periodEnd"=$3 WHERE id=$1', [groups[1], start, end]);
    await db().query('UPDATE "AcademicSlot" SET "dayOfWeek"=$2,"startMinute"=$3,"endMinute"=$4 WHERE "groupId"=$1', [groups[1], day, minute, minute + 60]);
    await competing(0, conflict);
  });
  test.each(['padre retirado','revisión requerida'])('R04 otro PUBLISHED bloquea aunque %s', async kind => {
    const store = publisher(); await publishedFixture();
    if (kind === 'padre retirado') await db().query(`UPDATE "AcademicCourse" SET state='WITHDRAWN' WHERE id=$1`, [courses[0]]);
    else { await db().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [data.account('TEACHER').id]); await db().query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`, [data.account('TEACHER').id]); }
    const before = await academicFingerprint(data.observerPool);
    await expect(execute(store, 1, adminB)).rejects.toMatchObject({ code: 'TEACHER_SCHEDULE_CONFLICT', failure: { conflictingGroupIds: [groups[0]] } });
    expect(await academicFingerprint(data.observerPool)).toBe(before);
  });
  test.each(['WITHDRAWN','CANCELLED'] as const)('R05 grupo %s no bloquea agenda', async state => {
    const store = publisher(); await publishedFixture();
    await db().query(`UPDATE "AcademicGroup" SET state=$2::text::"AcademicGroupState","cancellationReason"=$3,"cancelledAt"=CASE WHEN $2::text='CANCELLED' THEN clock_timestamp() ELSE NULL END WHERE id=$1`,
      [groups[0], state, state === 'CANCELLED' ? 'Fixture terminal' : null]);
    expect((await execute(store, 1, adminB)).resource.state).toBe('PUBLISHED'); await finalCounts(1);
  });
  test('R06 dos solicitudes simultáneas del mismo comando confirman un solo efecto', async () => {
    const store = publisher(); const id = randomUUID(); const results = await Promise.all([execute(store, 0, adminA, id), execute(store, 0, adminA, id)]);
    expect(results.map(r => r.command.replayed).sort()).toEqual([false,true]); expect(results.every(r => r.command.appliedRevision === '2')).toBe(true);
    await finalCounts(1); expect(results[0].resource.id).toBe(results[1].resource.id);
  });
  test('R07 desactivación confirma mientras publicación espera: revalidar tras bloqueo y cero efectos', async () => {
    const store = publisher(); const holder = await db().connect(); let pending: ReturnType<Publisher['execute']> | undefined;
    const before = await academicFingerprint(data.observerPool);
    try {
      await holder.query('BEGIN'); const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [data.account('TEACHER').id]);
      pending = execute(store, 0); const settled = pending.then(value => ({ value }), error => ({ error }));
      await waitForBlockedBy(data.observerPool, pid);
      await holder.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [data.account('TEACHER').id]);
      await holder.query('COMMIT'); expect(await settled).toMatchObject({ error: { code: 'TEACHER_NOT_ELIGIBLE' } });
    } finally { await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined); }
    expect(await academicFingerprint(data.observerPool)).toBe(before);
  });
});
