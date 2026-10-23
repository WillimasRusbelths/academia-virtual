import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { preparationSeed, academicFingerprint } from '../support/academic-preparation.js';
import { instrumentPool } from '../support/academic-foundation-contract.js';
import { waitForBlockedBy } from '../support/locks.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { PublicationCommands } from '../../src/modules/academic-offering/application/commands.js';
import type { PublicationCommand } from '../../src/modules/academic-offering/application/commands.js';
import { createPublicationStore } from '../../src/modules/academic-offering/infrastructure/offering-store.js';

let data: AcademicOfferingDataset, sessions: PostgresSessionStore, actor: SessionActor;
let seed: Awaited<ReturnType<typeof preparationSeed>>;
const db = () => data.context.database.pool;
const auth = () => ({ revalidateInTransaction: sessions.revalidateInTransaction.bind(sessions) });
const commands = () => new PublicationCommands(createPublicationStore(db(), auth()));
type Kind = 'COURSE_PUBLISH'|'GROUP_PUBLISH';
function command(kind: Kind, id = kind === 'COURSE_PUBLISH' ? seed.courseId : seed.groupId): PublicationCommand {
  return kind === 'COURSE_PUBLISH' ? { operation: kind, courseId: id, commandId: randomUUID(), expectedRevision: '1' }
    : { operation: kind, groupId: id, commandId: randomUUID(), expectedRevision: '1' };
}
const run = (value: PublicationCommand, who = actor) => commands().execute(who, value, { requestId: randomUUID() });
async function unchanged(work: () => Promise<unknown>, code: string, fields?: string[], ids?: string[]) {
  const before = await academicFingerprint(data.observerPool);
  await expect(work()).rejects.toMatchObject({ code, ...(fields ? { failure: { fields: expect.arrayContaining(fields) } } : {}),
    ...(ids ? { failure: { conflictingGroupIds: expect.arrayContaining(ids) } } : {}) });
  expect(await academicFingerprint(data.observerPool)).toBe(before);
}
async function parent(state: 'PUBLISHED'|'WITHDRAWN' = 'PUBLISHED') {
  await db().query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`, [seed.courseId]);
  if (state === 'WITHDRAWN') await db().query(`UPDATE "AcademicCourse" SET state='WITHDRAWN' WHERE id=$1`, [seed.courseId]);
}
async function published(id = seed.groupId, connection: Pick<ReturnType<typeof db>, 'query'> = db()) {
  await connection.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId",
    "publishedTeacherEligibilityVersion"=(SELECT "eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"="teacherUserId") WHERE id=$1`, [id]);
}
async function children() { return (await data.observerPool.query('SELECT to_jsonb(g) AS value FROM "AcademicGroup" g ORDER BY id')).rows; }
beforeAll(async () => {
  data = await academicOfferingDataset('academic_publication_layers'); sessions = new PostgresSessionStore(db());
  actor = (await sessions.lookup(data.account('ADMIN').sessions[0].secret))!;
}, 120000);
beforeEach(async () => {
  await data.context.isolated.ownerQuery('TRUNCATE "AcademicAuditEvent","AcademicCommand","AcademicSlot","AcademicGroup","AcademicCourse"');
  await db().query(`UPDATE "User" SET role='TEACHER',status='ACTIVE',"disabledAt"=NULL,"emailVerifiedAt"=clock_timestamp() WHERE id=ANY($1::uuid[])`,
    [[data.account('TEACHER').id, data.otherTeacher.userId]]);
  seed = await preparationSeed(db());
  await db().query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1', [seed.groupId, data.account('TEACHER').id]);
  await db().query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1', [seed.otherGroupId, data.otherTeacher.userId]);
  await db().query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1140,1200)', [seed.otherGroupId]);
});
afterAll(async () => { await data?.cleanup(); });

test('L01 curso vacío publicable/invisible; ledger y auditoría atómicos observables', async () => {
  const c = command('COURSE_PUBLISH', seed.otherCourseId); const value = await run(c);
  expect(value.resource).toMatchObject({ state: 'PUBLISHED', revision: '2', studentVisible: false });
  expect(value.command).toEqual({ id: c.commandId, replayed: false, appliedRevision: '2', result: 'APPLIED' });
  expect((await data.observerPool.query('SELECT operation,"resultingRevision"::text AS revision FROM "AcademicCommand"')).rows)
    .toEqual([{ operation: 'COURSE_PUBLISH', revision: '2' }]);
  expect((await data.observerPool.query('SELECT action,"beforeState","afterState" FROM "AcademicAuditEvent"')).rows)
    .toEqual([{ action: 'COURSE_PUBLISH', beforeState: 'DRAFT', afterState: 'PUBLISHED' }]);
});
test('L02 publicar curso no publica ni cambia capturas/revisiones de borradores', async () => {
  const before = await children(); const result = await run(command('COURSE_PUBLISH'));
  expect(result.resource).toMatchObject({ state: 'PUBLISHED', studentVisible: false }); expect(await children()).toEqual(before);
});
test('L03 descripción faltante rechaza con campo y cero efectos', async () => {
  await db().query('UPDATE "AcademicCourse" SET description=NULL WHERE id=$1', [seed.courseId]);
  await unchanged(() => run(command('COURSE_PUBLISH')), 'VALIDATION_ERROR', ['description']);
});
test.each([1,50])('L04 grupo capacidad %i captura generación exacta, conserva padre/hermano y publica una vez', async capacity => {
  await parent(); await db().query('UPDATE "AcademicGroup" SET capacity=$2 WHERE id=$1', [seed.groupId, capacity]);
  const parentBefore = (await data.observerPool.query('SELECT to_jsonb(c) AS value FROM "AcademicCourse" c ORDER BY id')).rows;
  const sibling = (await children()).filter(r => r.value.id === seed.otherGroupId);
  const version = (await db().query('SELECT "eligibilityVersion"::text AS v FROM "AcademicTeacherDirectory" WHERE "userId"=$1', [data.account('TEACHER').id])).rows[0].v;
  const value = await run(command('GROUP_PUBLISH'));
  expect(value.resource).toMatchObject({ state: 'PUBLISHED', revision: '2', studentVisible: true, teacherReviewRequired: false, capacity,
    occupancy: null, availability: null, capacityStatus: 'NOT_CALCULATED' });
  expect((await data.observerPool.query('SELECT "publishedTeacherUserId","publishedTeacherEligibilityVersion"::text AS v FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0])
    .toEqual({ publishedTeacherUserId: data.account('TEACHER').id, v: version });
  expect((await children()).filter(r => r.value.id === seed.otherGroupId)).toEqual(sibling);
  expect((await data.observerPool.query('SELECT to_jsonb(c) AS value FROM "AcademicCourse" c ORDER BY id')).rows).toEqual(parentBefore);
  expect((await data.observerPool.query('SELECT operation FROM "AcademicCommand"')).rows).toEqual([{ operation: 'GROUP_PUBLISH' }]);
  expect((await data.observerPool.query('SELECT action FROM "AcademicAuditEvent"')).rows).toEqual([{ action: 'GROUP_PUBLISH' }]);
});
test.each(['capacity','periodStart','periodEnd','teacherUserId','schedule'] as const)('L05 falta %s: campo y rollback', async field => {
  await parent();
  if (field === 'schedule') await db().query('DELETE FROM "AcademicSlot" WHERE "groupId"=$1', [seed.groupId]);
  else await db().query(`UPDATE "AcademicGroup" SET "${field}"=NULL WHERE id=$1`, [seed.groupId]);
  await unchanged(() => run(command('GROUP_PUBLISH')), 'VALIDATION_ERROR', [field]);
});
test('L06 enumera todos los datos faltantes sin publicar parcialmente', async () => {
  await parent(); await db().query('UPDATE "AcademicGroup" SET capacity=NULL,"periodStart"=NULL,"periodEnd"=NULL,"teacherUserId"=NULL WHERE id=$1', [seed.groupId]);
  await db().query('DELETE FROM "AcademicSlot" WHERE "groupId"=$1', [seed.groupId]);
  await unchanged(() => run(command('GROUP_PUBLISH')), 'VALIDATION_ERROR', ['capacity','periodStart','periodEnd','teacherUserId','schedule']);
});
test.each(['role','status','verification'] as const)('L07 pérdida actual %s bloquea grupo y curso con estado conservado', async kind => {
  await parent('WITHDRAWN'); await published();
  if (kind === 'role') await db().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [data.account('TEACHER').id]);
  if (kind === 'status') await db().query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [data.account('TEACHER').id]);
  if (kind === 'verification') await db().query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [data.account('TEACHER').id]);
  await unchanged(() => run(command('COURSE_PUBLISH')), 'COURSE_PUBLICATION_BLOCKED', undefined, [seed.groupId]);
  await db().query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`, [seed.groupId]); await parent();
  await unchanged(() => run(command('GROUP_PUBLISH')), 'TEACHER_NOT_ELIGIBLE', ['teacherUserId']);
});
test('L08 recuperar docente no autoriza curso ni captura; solo republicar grupo retirado renueva', async () => {
  await parent('WITHDRAWN'); await published(); const before = await children();
  await db().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [data.account('TEACHER').id]);
  await db().query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`, [data.account('TEACHER').id]);
  await unchanged(() => run(command('COURSE_PUBLISH')), 'COURSE_PUBLICATION_BLOCKED', undefined, [seed.groupId]);
  expect(await children()).toEqual(before);
  await db().query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`, [seed.groupId]);
  const withdrawn = await children(); await run(command('COURSE_PUBLISH')); expect(await children()).toEqual(withdrawn);
  expect((await run(command('GROUP_PUBLISH'))).resource).toMatchObject({ studentVisible: true, teacherReviewRequired: false });
});
test('L09 curso revalida hijos válidos sin renovar capturas', async () => {
  await parent('WITHDRAWN'); await published(); await published(seed.otherGroupId); const before = await children();
  expect((await run(command('COURSE_PUBLISH'))).resource).toMatchObject({ studentVisible: true, state: 'PUBLISHED' }); expect(await children()).toEqual(before);
});
test.each(['sin franjas','solapamiento interno','sin ocurrencia'] as const)('L10 curso bloqueado por hijo %s revierte todo', async problem => {
  await parent('WITHDRAWN');
  if (problem === 'sin ocurrencia') await db().query(`UPDATE "AcademicGroup" SET "periodStart"='2026-10-20' WHERE id=$1`, [seed.groupId]);
  await published(); await published(seed.otherGroupId);
  if (problem === 'sin franjas') await db().query('DELETE FROM "AcademicSlot" WHERE "groupId"=$1', [seed.groupId]);
  if (problem === 'solapamiento interno') await db().query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1110,1170)', [seed.groupId]);
  await unchanged(() => run(command('COURSE_PUBLISH')), 'COURSE_PUBLICATION_BLOCKED', undefined, [seed.groupId]);
});
for (const kind of ['COURSE_PUBLISH','GROUP_PUBLISH'] as const) {
  test(`L11 ${kind} revisión obsoleta no aplica`, async () => {
    if (kind === 'GROUP_PUBLISH') await parent(); await unchanged(() => run({ ...command(kind), expectedRevision: '2' }), 'OFFERING_VERSION_CONFLICT');
  });
  test(`L12 ${kind} replay idéntico sin efecto/evento duplicado y payload distinto rechazado`, async () => {
    if (kind === 'GROUP_PUBLISH') await parent(); const value = command(kind); const first = await run(value); const before = await academicFingerprint(data.observerPool);
    const repeated = await run(value); expect(repeated.command).toEqual({ ...first.command, replayed: true }); expect(repeated.resource).toEqual(first.resource);
    expect(await academicFingerprint(data.observerPool)).toBe(before);
    await unchanged(() => run({ ...value, expectedRevision: '2' }), 'IDEMPOTENCY_CONFLICT');
  });
  test(`L13 ${kind} fallo SQL real de auditoría revierte recurso, ledger y evento`, async () => {
    if (kind === 'GROUP_PUBLISH') await parent();
    await data.context.isolated.ownerQuery(`CREATE FUNCTION fail_publication_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture audit failure'; END $$;
      CREATE TRIGGER fail_publication_audit BEFORE INSERT ON "AcademicAuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_publication_audit()`);
    try { await unchanged(() => run(command(kind)), 'TEMPORARILY_UNAVAILABLE'); }
    finally { await data.context.isolated.ownerQuery('DROP TRIGGER fail_publication_audit ON "AcademicAuditEvent"; DROP FUNCTION fail_publication_audit()'); }
  });
  for (const role of ['STUDENT','TEACHER'] as const) test(`L14 ${kind} denegado a ${role} en aplicación y persistencia`, async () => {
    const who = (await sessions.lookup(data.account(role).sessions[0].secret))!;
    await unchanged(() => run(command(kind), who), 'FORBIDDEN');
    await unchanged(() => createPublicationStore(db(), auth()).execute(who, command(kind), { requestId: randomUUID() }), 'FORBIDDEN');
  });
}
test('L15 cancelado terminal y publicado rechazan publicación, sin NO_CHANGE', async () => {
  await parent(); await unchanged(() => run(command('COURSE_PUBLISH')), 'OFFERING_STATE_CONFLICT');
  await published(); await unchanged(() => run(command('GROUP_PUBLISH')), 'OFFERING_STATE_CONFLICT');
  await db().query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Fixture',"cancelledAt"=clock_timestamp() WHERE id=$1`, [seed.groupId]);
  await unchanged(() => run(command('GROUP_PUBLISH')), 'OFFERING_STATE_CONFLICT');
});
test('L16 padre no publicado impide grupo; inexistente rechaza sin efectos', async () => {
  await unchanged(() => run(command('GROUP_PUBLISH')), 'OFFERING_STATE_CONFLICT');
  await unchanged(() => run(command('GROUP_PUBLISH', randomUUID())), 'NOT_FOUND');
});
test('L17 curso redescubre hijo/docente incorporado durante espera al padre; mismo presupuesto, sin captura nueva', async () => {
  await parent('WITHDRAWN'); await published();
  const holder = await db().connect(); const trace = instrumentPool(db()); let pending: ReturnType<typeof run> | undefined;
  try {
    await holder.query('BEGIN'); const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM "AcademicCourse" WHERE id=$1 FOR UPDATE', [seed.courseId]);
    const store = createPublicationStore(trace.pool, auth()); pending = store.execute(actor, command('COURSE_PUBLISH'), { requestId: randomUUID() });
    const settled = pending.then(value => ({ value }), error => ({ error })); await waitForBlockedBy(data.observerPool, pid);
    await published(seed.otherGroupId, holder); await holder.query('COMMIT'); const before = await children();
    expect(await settled).toMatchObject({ value: { resource: { state: 'PUBLISHED' } } }); expect(await children()).toEqual(before);
    expect(trace.statements.filter(s => s.sql === 'BEGIN')).toHaveLength(2);
    const firstParent = trace.statements.findIndex(s => s.sql.includes('AcademicCourse') && /FOR UPDATE/.test(s.sql));
    const rollback = trace.statements.findIndex(s => s.sql === 'ROLLBACK'); expect(firstParent).toBeGreaterThanOrEqual(0); expect(rollback).toBeGreaterThan(firstParent);
    expect(trace.statements.slice(firstParent + 1, rollback).some(s => s.sql.includes('"User"') && /FOR UPDATE/.test(s.sql))).toBe(false);
    expect((await data.observerPool.query('SELECT count(*)::int AS n FROM "AcademicCommand"')).rows[0].n).toBe(1);
  } finally { await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined); }
});
test('L18 curso bloquea también al docente del segundo hijo y rechaza su desactivación confirmada', async () => {
  await parent('WITHDRAWN'); await published(); await published(seed.otherGroupId); const before = await academicFingerprint(data.observerPool);
  const holder = await db().connect(); let pending: ReturnType<typeof run> | undefined;
  try {
    await holder.query('BEGIN'); const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [data.otherTeacher.userId]);
    pending = run(command('COURSE_PUBLISH')); const settled = pending.then(value => ({ value }), error => ({ error }));
    await waitForBlockedBy(data.observerPool, pid);
    await holder.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [data.otherTeacher.userId]);
    await holder.query('COMMIT'); expect(await settled).toMatchObject({ error: { code: 'COURSE_PUBLICATION_BLOCKED', failure: { conflictingGroupIds: [seed.otherGroupId] } } });
  } finally { await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined); }
  expect(await academicFingerprint(data.observerPool)).toBe(before);
});
test('L19 sustituir asignación conserva captura anterior hasta publicar explícitamente al nuevo docente', async () => {
  await parent(); await published(); await db().query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`, [seed.groupId]);
  await db().query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1', [seed.groupId, data.otherTeacher.userId]);
  expect((await data.observerPool.query('SELECT "publishedTeacherUserId" FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0].publishedTeacherUserId).toBe(data.account('TEACHER').id);
  const version = (await db().query('SELECT "eligibilityVersion"::text AS v FROM "AcademicTeacherDirectory" WHERE "userId"=$1', [data.otherTeacher.userId])).rows[0].v;
  expect((await run(command('GROUP_PUBLISH'))).resource).toMatchObject({ studentVisible: true, teacherReviewRequired: false });
  expect((await data.observerPool.query('SELECT "publishedTeacherUserId","publishedTeacherEligibilityVersion"::text AS v FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0])
    .toEqual({ publishedTeacherUserId: data.otherTeacher.userId, v: version });
});
test('L20 republicar curso revalida conflicto externo del hijo publicado y conserva capturas/estado', async () => {
  await parent('WITHDRAWN'); await published();
  await db().query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`, [seed.otherCourseId]);
  const id = randomUUID();
  await db().query(`INSERT INTO "AcademicGroup" (id,"courseId",name,capacity,"periodStart","periodEnd","teacherUserId")
    VALUES ($1,$2,'Otro publicado',45,'2026-10-19','2026-10-25',$3)`, [id, seed.otherCourseId, data.account('TEACHER').id]);
  await db().query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1080,1140)', [id]);
  await published(id);
  await unchanged(() => run(command('COURSE_PUBLISH')), 'COURSE_PUBLICATION_BLOCKED', undefined, [seed.groupId]);
});
