/// <reference types="vite/client" />
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import type { Pool } from 'pg';
import * as persistence from '../../src/modules/academic-offering/infrastructure/offering-store.js';
import { PreparationCommands } from '../../src/modules/academic-offering/application/commands.js';
import type { PreparationStore, PreparationCommand } from '../../src/modules/academic-offering/application/commands.js';
import type { OfferingStore } from '../../src/modules/academic-offering/application/offering-store.js';
import type { AdminGroup, Slot } from '../../src/modules/academic-offering/public/offer.js';
import type { AcademicTransactionDependencies } from '../../src/infrastructure/database/academic-transaction.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { academicFingerprint, preparationSeed } from '../support/academic-preparation.js';
import { waitForBlockedBy } from '../support/locks.js';
import { createGroupCommitmentPolicy } from '../../src/modules/enrollment/infrastructure/commitments.js';
import { resetAcademicFixture } from '../support/academic-maintenance-fixture.js';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../dist/src/app.module.js';
import { ACADEMIC_PREPARATION_COMMANDS, ACADEMIC_ADMINISTRATIVE_QUERIES } from '../../dist/src/modules/academic-offering/academic-offering.module.js';

type Reads = Pick<OfferingStore, 'adminCourses' | 'adminCourse' | 'adminGroups' | 'adminGroup' | 'teacherCandidates'>;
type Factory = (pool: Pool, authorization: AcademicTransactionDependencies, writer: persistence.AcademicCommandWriter) => PreparationStore;
type QueryFactory = (pool: Pool, sessions: PostgresSessionStore) => Reads;
const queryModules = import.meta.glob('../../src/modules/academic-offering/infrastructure/offering-queries.ts');
let data: AcademicOfferingDataset; let sessions: PostgresSessionStore; let actor: SessionActor;
let seed: Awaited<ReturnType<typeof preparationSeed>>;
const pool = () => data.context.database.pool;
const authorization = () => ({ revalidateInTransaction: sessions.revalidateInTransaction.bind(sessions) });
function commands() {
  const factory = (persistence as unknown as { createPreparationStore?: Factory }).createPreparationStore;
  expect(factory, 'T024: adaptador real aún ausente').toBeTypeOf('function');
  const auth = authorization();
  return new PreparationCommands(factory!(pool(), auth, persistence.createAcademicCommandWriter(pool(), auth, { commitments: createGroupCommitmentPolicy })));
}
async function queries(connection = pool()) {
  const load = Object.values(queryModules)[0];
  expect(load, 'T025: módulo real aún ausente').toBeTypeOf('function');
  const module = await load() as { createAdministrativeQueries: QueryFactory };
  return module.createAdministrativeQueries(connection, sessions);
}
const execute = (command: PreparationCommand, who = actor) => commands().execute(who, command, { requestId: randomUUID() });
const edit = (changes: Record<string, unknown>, expectedRevision = '1') => execute({ operation: 'GROUP_EDIT',
  groupId: seed.groupId, commandId: randomUUID(), expectedRevision, changes } as PreparationCommand);
const schedule = (slots: readonly Slot[], expectedRevision = '1') => execute({ operation: 'GROUP_SCHEDULE',
  groupId: seed.groupId, commandId: randomUUID(), expectedRevision, schedule: slots });
const monday = { dayOfWeek: 1, startTime: '18:00', endTime: '19:00' } as const;
async function unchanged(work: () => Promise<unknown>, code = 'VALIDATION_ERROR') {
  const before = await academicFingerprint(data.observerPool);
  await expect(work()).rejects.toMatchObject({ code });
  expect(await academicFingerprint(data.observerPool)).toBe(before);
}
beforeAll(async () => {
  data = await academicOfferingDataset('academic_preparation_layers'); sessions = new PostgresSessionStore(pool());
  actor = (await sessions.lookup(data.account('ADMIN').sessions[0].secret))!;
}, 120000);
beforeEach(async () => {
  await resetAcademicFixture(data);
  seed = await preparationSeed(pool());
});
afterAll(async () => { await data?.cleanup(); });

test('C01/H02 alta normalizada, UUID servidor, persistencia observador, ledger y auditoría', async () => {
  const id = randomUUID(); const result = await execute({ operation: 'COURSE_CREATE', commandId: id,
    attributes: { name: '  Álgebra  ', description: '  Contenido  ' } });
  expect(result.resource).toMatchObject({ name: 'Álgebra', description: 'Contenido', state: 'DRAFT', revision: '1', studentVisible: false });
  expect(result.resource.id).not.toBe(id);
  expect((await data.observerPool.query('SELECT name FROM "AcademicCourse" WHERE id=$1', [result.resource.id])).rows).toEqual([{ name: 'Álgebra' }]);
  for (const table of ['AcademicCommand', 'AcademicAuditEvent']) {
    expect((await data.observerPool.query(`SELECT "commandId" FROM "${table}" WHERE "commandId"=$1`, [id])).rowCount).toBe(1);
  }
});
test.each([undefined, 1, 50])('C02/H03 grupo incompleto/capacidad %s, hermano y padre intactos', async capacity => {
  const result = await execute({ operation: 'GROUP_CREATE', courseId: seed.courseId, commandId: randomUUID(),
    attributes: { name: 'Turno A', ...(capacity === undefined ? {} : { capacity }) } });
  expect(result.resource).toMatchObject({ courseId: seed.courseId, state: 'DRAFT', revision: '1', capacity: capacity ?? null,
    periodStart: null, periodEnd: null, teacher: null, schedule: [], timeZone: 'America/Lima', occupancy: null,
    availability: null, capacityStatus: 'NOT_CALCULATED' });
  expect((await pool().query('SELECT revision::text FROM "AcademicCourse" WHERE id=$1', [seed.courseId])).rows[0].revision).toBe('1');
  expect((await pool().query('SELECT revision::text FROM "AcademicGroup" WHERE id=$1', [seed.otherGroupId])).rows[0].revision).toBe('1');
});
test('C03/H07 ediciones independientes y metadatos', async () => {
  await execute({ operation: 'COURSE_EDIT', courseId: seed.courseId, expectedRevision: '1', commandId: randomUUID(), changes: { name: 'Otro nombre' } });
  const group = await edit({ name: ' Turno nuevo ', capacity: 25 });
  expect(group.resource).toMatchObject({ name: 'Turno nuevo', capacity: 25, revision: '2', courseId: seed.courseId, schedule: [monday] });
  expect((await pool().query('SELECT name,revision::text FROM "AcademicGroup" WHERE id=$1', [seed.otherGroupId])).rows[0]).toEqual({ name: 'Turno B', revision: '1' });
});
test('C04/H08 reemplazo completo contiguo y vacío; revisión solo del grupo', async () => {
  const result = await schedule([monday, { ...monday, startTime: '19:00', endTime: '20:00' }]);
  expect((result.resource as AdminGroup).schedule).toHaveLength(2); expect(result.resource.revision).toBe('2');
  const empty = await schedule([], '2'); expect((empty.resource as AdminGroup).schedule).toEqual([]);
  expect(empty.resource.revision).toBe('3');
  expect((await data.observerPool.query('SELECT id FROM "AcademicSlot" WHERE "groupId"=$1', [seed.groupId])).rowCount).toBe(0);
});
test('C05/H11 revisión bigint sin pérdida de precisión', async () => {
  await pool().query('UPDATE "AcademicGroup" SET revision=9007199254740993 WHERE id=$1', [seed.groupId]);
  expect((await edit({ capacity: 26 }, '9007199254740993')).resource.revision).toBe('9007199254740994');
});
test.each(['COURSE_EDIT', 'GROUP_EDIT', 'GROUP_SCHEDULE'] as const)('C06/H13 revisión obsoleta %s sin efectos', async operation => {
  await unchanged(() => execute({ operation, courseId: seed.courseId, groupId: seed.groupId, commandId: randomUUID(), expectedRevision: '2',
    changes: { name: 'Cambio' }, schedule: [] } as PreparationCommand), 'OFFERING_VERSION_CONFLICT');
});
test.each([0, -1, 1.5, 51, '', null, '20'])('C07/H16 capacidad inválida %s sin efectos', async capacity => {
  await unchanged(() => edit({ capacity }));
});
test.each([
  { name: 'medianoche', slots: [{ ...monday, startTime: '23:00', endTime: '01:00' }] },
  { name: 'duplicado', slots: [monday, monday] },
  { name: 'solapamiento', slots: [monday, { ...monday, startTime: '18:30', endTime: '20:00' }] },
  { name: 'día cero', slots: [{ ...monday, dayOfWeek: 0 }] },
])('C08/H17 horario inválido $name sin efectos', async ({ slots }) => {
  await unchanged(() => schedule(slots as Slot[]));
});
test('C09/H18 cambiar periodo revalida franja persistida, no solo atributos enviados', async () => {
  await unchanged(() => edit({ periodStart: '2026-10-20' }));
});
test('C10/H19 replay canónico y conflicto de intención; no duplica auditoría', async () => {
  const command = { operation: 'COURSE_CREATE', commandId: randomUUID(), attributes: { name: ' Curso ' } } as const;
  const first = await execute(command); const again = await execute({ ...command, attributes: { name: 'Curso' } });
  expect(again.resource).toEqual(first.resource); expect(again.command).toMatchObject({ replayed: true, appliedRevision: '1' });
  await unchanged(() => execute({ ...command, attributes: { name: 'Distinto' } }), 'IDEMPOTENCY_CONFLICT');
  expect((await pool().query('SELECT id FROM "AcademicAuditEvent" WHERE "commandId"=$1', [command.commandId])).rowCount).toBe(1);
});
test('C11 no-op validado y replay devuelve proyección actual, revisión aplicada original', async () => {
  const command = { operation: 'GROUP_EDIT', groupId: seed.groupId, expectedRevision: '1', commandId: randomUUID(), changes: { name: 'Turno A' } } as const;
  const first = await execute(command); expect(first.command).toMatchObject({ result: 'NO_CHANGE', appliedRevision: '1' });
  await edit({ capacity: 30 });
  const replay = await execute(command); expect(replay.resource).toMatchObject({ capacity: 30, revision: '2' });
  expect(replay.command).toMatchObject({ replayed: true, result: 'NO_CHANGE', appliedRevision: '1' });
});
test.each(['STUDENT', 'TEACHER'] as const)('C12 %s denegado antes de efectos', async role => {
  const who = (await sessions.lookup(data.account(role).sessions[0].secret))!;
  await unchanged(() => execute({ operation: 'COURSE_CREATE', commandId: randomUUID(), attributes: { name: 'No' } }, who), 'FORBIDDEN');
});
test('C13 replay también reautoriza sesión revocada', async () => {
  const who = (await sessions.lookup(data.secondAdmin.secret))!;
  const command = { operation: 'COURSE_CREATE', commandId: randomUUID(), attributes: { name: 'Autorizado' } } as const;
  await execute(command, who);
  await pool().query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [who.sessionId]);
  try { await unchanged(() => execute(command, who), 'AUTH_REQUIRED'); }
  finally { await pool().query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [who.sessionId]); }
});
test('C14 asignación elegible e inelegible, no expone generación', async () => {
  const teacher = data.account('TEACHER');
  expect((await edit({ teacherUserId: teacher.id })).resource).toMatchObject({ teacher: { id: teacher.id, name: teacher.name, eligible: true } });
  await unchanged(() => edit({ teacherUserId: data.account('STUDENT').id }, '2'), 'TEACHER_NOT_ELIGIBLE');
});
test('C15 conservar captura al editar grupo retirado, reactivación no elimina revisión', async () => {
  const teacher = data.account('TEACHER');
  await pool().query(`UPDATE "AcademicGroup" SET "teacherUserId"=$2,"publishedTeacherUserId"=$2,
    "publishedTeacherEligibilityVersion"=0,state='PUBLISHED' WHERE id=$1`, [seed.groupId, teacher.id]);
  await pool().query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`, [seed.groupId]);
  await pool().query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [teacher.id]);
  await pool().query(`UPDATE "User" SET status='ACTIVE',"disabledAt"=NULL WHERE id=$1`, [teacher.id]);
  const result = await edit({ teacherUserId: data.otherTeacher.userId });
  expect(result.resource).toMatchObject({ state: 'WITHDRAWN', lastPublishedTeacherId: teacher.id, teacherReviewRequired: true, studentVisible: false });
  expect((await pool().query('SELECT "publishedTeacherUserId","publishedTeacherEligibilityVersion"::text FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0])
    .toEqual({ publishedTeacherUserId: teacher.id, publishedTeacherEligibilityVersion: '0' });
});
test.each(['COURSE_CREATE','COURSE_EDIT','GROUP_CREATE','GROUP_EDIT','GROUP_SCHEDULE'] as const)(
  'C16 fallo real de auditoría revierte agregado, franjas y ledger: %s', async operation => {
  // Trigger SOLO del esquema ficticio: fallar después de escrituras reales, no simular adaptadores.
  await data.context.isolated.ownerQuery(`CREATE FUNCTION reject_academic_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Fallo inyectado de prueba'; END $$;
    CREATE TRIGGER reject_audit BEFORE INSERT ON "AcademicAuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_academic_audit();`);
  const work = () => {
    if (operation === 'COURSE_CREATE') return execute({ operation, commandId: randomUUID(), attributes: { name: 'Revertido' } });
    if (operation === 'COURSE_EDIT') return execute({ operation, courseId: seed.courseId, commandId: randomUUID(), expectedRevision: '1', changes: { name: 'Revertido' } });
    if (operation === 'GROUP_CREATE') return execute({ operation, courseId: seed.courseId, commandId: randomUUID(), attributes: { name: 'Revertido' } });
    if (operation === 'GROUP_EDIT') return edit({ name: 'Revertido', capacity: 33 });
    return schedule([monday, { ...monday, startTime: '19:00', endTime: '20:00' }]);
  };
  try { await unchanged(work, 'TEMPORARILY_UNAVAILABLE'); }
  finally { await data.context.isolated.ownerQuery('DROP TRIGGER reject_audit ON "AcademicAuditEvent"; DROP FUNCTION reject_academic_audit()'); }
});
test('C19 lock real del padre antes de modificar franjas, observado desde tercera conexión', async () => {
  const holder = await pool().connect(); let pending: Promise<unknown> | undefined;
  try {
    await holder.query('BEGIN'); const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM "AcademicCourse" WHERE id=$1 FOR UPDATE', [seed.courseId]);
    pending = schedule([]); const settled = pending.then(value => ({ value }), error => ({ error }));
    await waitForBlockedBy(data.observerPool, pid);
    expect((await data.observerPool.query('SELECT id FROM "AcademicSlot" WHERE "groupId"=$1', [seed.groupId])).rowCount).toBe(1);
    await holder.query('COMMIT'); expect(await settled).toMatchObject({ value: { resource: { revision: '2', schedule: [] } } });
  } finally { await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined); }
});
test('C20 pérdida de habilitación confirmada durante espera impide asignación; barrera PostgreSQL', async () => {
  const teacher = data.account('TEACHER'); const holder = await pool().connect(); let pending: Promise<unknown> | undefined;
  const before = await academicFingerprint(data.observerPool);
  try {
    await holder.query('BEGIN'); const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [teacher.id]);
    pending = edit({ teacherUserId: teacher.id }); const settled = pending.then(value => ({ value }), error => ({ error }));
    await waitForBlockedBy(data.observerPool, pid);
    await holder.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [teacher.id]);
    await holder.query('COMMIT'); expect(await settled).toMatchObject({ error: { code: 'TEACHER_NOT_ELIGIBLE' } });
    expect(await academicFingerprint(data.observerPool)).toBe(before);
  } finally {
    await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined);
    await pool().query(`UPDATE "User" SET status='ACTIVE',"disabledAt"=NULL WHERE id=$1`, [teacher.id]);
  }
});
test.each(['PUBLISHED','CANCELLED'] as const)('C21 no edita ni reemplaza franjas de grupo %s', async state => {
  if (state === 'PUBLISHED') await pool().query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"teacherUserId"=$2,
    "publishedTeacherUserId"=$2,"publishedTeacherEligibilityVersion"=0 WHERE id=$1`, [seed.groupId, data.account('TEACHER').id]);
  else await pool().query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Cancelado ficticio',"cancelledAt"=clock_timestamp() WHERE id=$1`, [seed.groupId]);
  await unchanged(() => edit({ capacity: 30 }), 'OFFERING_STATE_CONFLICT');
  await unchanged(() => schedule([]), 'OFFERING_STATE_CONFLICT');
});
test('C22 curso publicado no editable, retirado editable sin cambiar estado', async () => {
  await pool().query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`, [seed.courseId]);
  const command = { operation: 'COURSE_EDIT', courseId: seed.courseId, commandId: randomUUID(), expectedRevision: '1', changes: { name: 'Corregido' } } as const;
  await unchanged(() => execute(command), 'OFFERING_STATE_CONFLICT');
  await pool().query(`UPDATE "AcademicCourse" SET state='WITHDRAWN' WHERE id=$1`, [seed.courseId]);
  expect((await execute(command)).resource).toMatchObject({ name: 'Corregido', state: 'WITHDRAWN', revision: '2' });
});
test('C23 pertenencia desconocida y PATCH vacío rechazados sin efectos', async () => {
  await unchanged(() => edit({ courseId: seed.otherCourseId }));
  await unchanged(() => edit({}));
  await unchanged(() => execute({ operation: 'GROUP_CREATE', courseId: randomUUID(), commandId: randomUUID(), attributes: { name: 'Sin padre' } }), 'NOT_FOUND');
});
test('C24 composición real expone comandos y consultas US1 con el mismo pool, sin rutas nuevas', async () => {
  const module = await Test.createTestingModule({ imports: [AppModule.forRoot(data.context.environment,
    { pool: pool(), close: async () => undefined })] }).compile();
  try {
    const commands = module.get<PreparationCommands>(ACADEMIC_PREPARATION_COMMANDS);
    const reads = module.get<Reads>(ACADEMIC_ADMINISTRATIVE_QUERIES);
    const created = await commands.execute(actor, { operation: 'COURSE_CREATE', commandId: randomUUID(), attributes: { name: 'Composición' } }, { requestId: randomUUID() });
    expect(await reads.adminCourse(actor, created.resource.id)).toEqual(created.resource);
  } finally { await module.close(); }
});
test('C17 dos revisiones simultáneas: un commit y un conflicto', async () => {
  const second = (await sessions.lookup(data.secondAdmin.secret))!;
  const outcomes = await Promise.allSettled([edit({ capacity: 20 }), execute({ operation: 'GROUP_EDIT', groupId: seed.groupId,
    expectedRevision: '1', commandId: randomUUID(), changes: { capacity: 21 } }, second)]);
  expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.find(value => value.status === 'rejected')).toMatchObject({ reason: { code: 'OFFERING_VERSION_CONFLICT' } });
  expect((await pool().query('SELECT revision::text FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0].revision).toBe('2');
});
test('C18 dos repeticiones simultáneas de alta: un recurso y una auditoría', async () => {
  const command = { operation: 'COURSE_CREATE', commandId: randomUUID(), attributes: { name: 'Concurrente' } } as const;
  const results = await Promise.all([execute(command), execute(command)]);
  expect(results[0].resource.id).toBe(results[1].resource.id);
  expect(results.filter(value => value.command.replayed)).toHaveLength(1);
  expect((await pool().query('SELECT id FROM "AcademicAuditEvent" WHERE "commandId"=$1', [command.commandId])).rowCount).toBe(1);
});
test('Q01/H01 vacío y página fuera de rango conservan total', async () => {
  const reads = await queries(); const page = { page: 100, pageSize: 20 };
  expect(await reads.adminCourses(actor, page)).toMatchObject({ ...page, items: [], total: 2 });
  expect(await reads.adminGroups(actor, seed.otherCourseId, { page: 1, pageSize: 20 })).toMatchObject({ items: [], total: 0 });
});
test('Q02/H04 búsqueda literal, estado, orden name/id y conteo', async () => {
  const reads = await queries();
  const result = await reads.adminCourses(actor, { q: ' curso ', state: 'DRAFT', page: 1, pageSize: 1 });
  expect(result.total).toBe(2); expect(result.items).toHaveLength(1);
  const other = await reads.adminCourses(actor, { q: 'curso', page: 2, pageSize: 1 });
  expect(result.items[0].name.localeCompare(other.items[0].name)).toBeLessThan(0);
  expect((await reads.adminCourses(actor, { q: '%', page: 1, pageSize: 20 })).total).toBe(0);
  expect((await reads.adminCourses(actor, { state: 'WITHDRAWN', page: 1, pageSize: 20 })).total).toBe(0);
});
test('Q03/H05 DTO cerrado, franjas y capacidad configurada sin disponibilidad', async () => {
  const reads = await queries(); const group = (await reads.adminGroup(actor, seed.groupId))!;
  expect(Object.keys(group).sort()).toEqual(['id','courseId','name','description','state','revision','periodStart','periodEnd','timeZone','capacity',
    'occupancy','availability','capacityStatus','schedule','teacher','teacherReviewRequired','studentVisible',
    'cancellationReason','cancelledAt','lastPublishedTeacherId','createdAt','updatedAt'].sort());
  expect(group).toMatchObject({ schedule: [monday], capacity: 1, availability: null, occupancy: null, capacityStatus: 'NOT_CALCULATED',
    periodStart: '2026-10-19', periodEnd: '2026-10-25' });
  const course = (await reads.adminCourse(actor, seed.courseId))!;
  expect(Object.keys(course).sort()).toEqual(['id','name','description','state','revision','studentVisible','createdAt','updatedAt'].sort());
  expect((await reads.adminGroups(actor, seed.courseId, { page: 1, pageSize: 20 }))!.items).toHaveLength(2);
});
test('Q04/H06 selector mínimo solo docentes elegibles, sin información privada', async () => {
  const reads = await queries(); const result = await reads.teacherCandidates(actor, { page: 1, pageSize: 50 });
  expect(result.total).toBe(2);
  for (const teacher of result.items) expect(Object.keys(teacher).sort()).toEqual(['id', 'name']);
  expect(result.items.map(value => value.id).sort()).toEqual([data.account('TEACHER').id, data.otherTeacher.userId].sort());
});
test('Q05/H20 inexistente se distingue de vacío, sin inventar error de infraestructura', async () => {
  const reads = await queries(); const id = randomUUID();
  expect(await reads.adminCourse(actor, id)).toBeNull(); expect(await reads.adminGroup(actor, id)).toBeNull();
  expect(await reads.adminGroups(actor, id, { page: 1, pageSize: 20 })).toBeNull();
});
test.each(['STUDENT', 'TEACHER'] as const)('Q06 %s no consulta administración', async role => {
  const reads = await queries(); const who = (await sessions.lookup(data.account(role).sessions[0].secret))!;
  for (const work of [() => reads.adminCourses(who, { page: 1, pageSize: 20 }), () => reads.adminCourse(who, seed.courseId),
    () => reads.adminGroups(who, seed.courseId, { page: 1, pageSize: 20 }), () => reads.adminGroup(who, seed.groupId),
    () => reads.teacherCandidates(who, { page: 1, pageSize: 20 })]) await expect(work()).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
test('Q07 fallo SQL real no se convierte en página vacía ni filtra SQL', async () => {
  const reads = await queries();
  await data.context.isolated.ownerQuery('REVOKE SELECT ON "AcademicCourse" FROM academia_v00_runtime');
  try {
    await expect(reads.adminCourses(actor, { page: 1, pageSize: 20 })).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  } finally { await data.context.isolated.ownerQuery('GRANT SELECT ON "AcademicCourse" TO academia_v00_runtime'); }
});
test('Q08 una sentencia por proyección/listado/conteo, independiente de número de grupos', async () => {
  let count = 0;
  const traced = new Proxy(pool(), { get(target, key) {
    if (key === 'query') return (...args: unknown[]) => { count++; return Reflect.apply(target.query, target, args); };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const reads = await queries(traced);
  const works = [() => reads.adminCourses(actor, { page: 1, pageSize: 20 }), () => reads.adminCourse(actor, seed.courseId),
    () => reads.adminGroups(actor, seed.courseId, { page: 1, pageSize: 20 }), () => reads.adminGroup(actor, seed.groupId),
    () => reads.teacherCandidates(actor, { page: 1, pageSize: 20 })];
  for (const work of works) { count = 0; await work(); expect(count).toBe(1); }
});
test('Q09 sesión revocada no recibe proyección aunque conserve actor anterior', async () => {
  const reads = await queries(); const who = (await sessions.lookup(data.secondAdmin.secret))!;
  await pool().query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [who.sessionId]);
  try { await expect(reads.adminCourse(who, seed.courseId)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); }
  finally { await pool().query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [who.sessionId]); }
});
test.each([
  { page: 0, pageSize: 20 }, { page: 1, pageSize: 51 }, { page: 1.5, pageSize: 20 },
  { page: 1, pageSize: 20, state: 'CANCELLED' },
])('Q10 parámetros administrativos inválidos %j', async input => {
  const reads = await queries();
  await expect(reads.adminCourses(actor, input as Parameters<Reads['adminCourses']>[1])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
test('Q11 visibilidad/revisión derivadas en una sentencia; recuperar habilitación no republica', async () => {
  const teacher = data.account('TEACHER');
  await pool().query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`, [seed.courseId]);
  const version = (await pool().query('SELECT "eligibilityVersion"::text AS version FROM "AcademicTeacherDirectory" WHERE "userId"=$1', [teacher.id])).rows[0].version;
  await pool().query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"teacherUserId"=$2,"publishedTeacherUserId"=$2,
    "publishedTeacherEligibilityVersion"=$3 WHERE id=$1`, [seed.groupId, teacher.id, version]);
  const reads = await queries(); expect(await reads.adminGroup(actor, seed.groupId)).toMatchObject({ studentVisible: true, teacherReviewRequired: false });
  expect(await reads.adminCourse(actor, seed.courseId)).toMatchObject({ studentVisible: true });
  await pool().query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [teacher.id]);
  await pool().query(`UPDATE "User" SET status='ACTIVE',"disabledAt"=NULL WHERE id=$1`, [teacher.id]);
  expect(await reads.adminGroup(actor, seed.groupId)).toMatchObject({ state: 'PUBLISHED', studentVisible: false, teacherReviewRequired: true });
  expect(await reads.adminCourse(actor, seed.courseId)).toMatchObject({ studentVisible: false });
});
