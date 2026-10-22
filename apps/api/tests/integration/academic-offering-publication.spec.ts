import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { academicFingerprint, preparationSeed } from '../support/academic-preparation.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import type { AdminCourse, AdminGroup, CommandResult } from '../../src/modules/academic-offering/public/offer.js';

let data: AcademicOfferingDataset; let http: Us1Http;
let seed: Awaited<ReturnType<typeof preparationSeed>>;
const pool = () => data.observerPool;
const admin = () => data.account('ADMIN').sessions[0].secret;
type Kind = 'courses' | 'groups';
const idFor = (kind: Kind) => kind === 'courses' ? seed.courseId : seed.groupId;
async function generation(id = data.account('TEACHER').id): Promise<string> {
  return (await pool().query<{ version: string }>('SELECT "eligibilityVersion"::text AS version FROM "AcademicTeacherDirectory" WHERE "userId"=$1', [id])).rows[0].version;
}
async function post(kind: Kind, id = idFor(kind), body: object = { commandId: randomUUID(), expectedRevision: '1' }, secret = admin()) {
  return http.post(`/admin/academic/${kind}/${id}/publish`, body, secret);
}
function status(response: Response, expected: number) {
  expect(response.status, `T036/T038 pendientes: publicación HTTP real debe responder ${expected}; un 404 de ruta ausente NO aprueba el caso`).toBe(expected);
}
async function applied<T extends AdminCourse | AdminGroup>(response: Response): Promise<CommandResult<T>> {
  status(response, 200); const body = await response.json(); expect(Object.keys(body)).toEqual(['data']);
  expect(body.data.command).toMatchObject({ replayed: false, result: 'APPLIED' }); return body.data;
}
async function rejected(kind: Kind, expected: number, code: string, body?: object, fields: string[] = [], ids: string[] = []) {
  const before = await academicFingerprint(pool()); const response = await post(kind, idFor(kind), body);
  status(response, expected); const value = await response.json();
  expect(value).not.toHaveProperty('data'); expect(value.error).toMatchObject({ code, message: expect.any(String), requestId: expect.any(String) });
  expect(Object.keys(value.error).every(key => ['code','message','requestId','fields','conflictingGroupIds'].includes(key))).toBe(true);
  for (const field of fields) expect(value.error.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
  if (ids.length) expect(value.error.conflictingGroupIds).toEqual(expect.arrayContaining(ids));
  if (code !== 'COURSE_PUBLICATION_BLOCKED' && code !== 'TEACHER_SCHEDULE_CONFLICT') expect(value.error).not.toHaveProperty('conflictingGroupIds');
  expect(await academicFingerprint(pool())).toBe(before); return value;
}
async function rows(table: 'AcademicCourse' | 'AcademicGroup') {
  return (await pool().query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY id`)).rows;
}
/** SQL exclusivamente de fixture t_. Nunca sustituye el comando de publicación bajo prueba. */
async function parentPublished() { await pool().query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`, [seed.courseId]); }
async function parentWithdrawn() { await parentPublished(); await pool().query(`UPDATE "AcademicCourse" SET state='WITHDRAWN' WHERE id=$1`, [seed.courseId]); }
async function childPublished(id = seed.groupId) {
  const teacher = id === seed.groupId ? data.account('TEACHER').id : data.otherTeacher.userId;
  await pool().query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId",
    "publishedTeacherEligibilityVersion"=$2 WHERE id=$1`, [id, await generation(teacher)]);
}
async function childWithdrawn(id = seed.groupId) { await childPublished(id); await pool().query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`, [id]); }
async function loseAndRecover(kind: 'role' | 'status' | 'verification') {
  const id = data.account('TEACHER').id;
  if (kind === 'role') {
    await pool().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [id]);
    await pool().query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`, [id]);
  } else if (kind === 'status') {
    await pool().query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [id]);
    await pool().query(`UPDATE "User" SET status='ACTIVE',"disabledAt"=NULL WHERE id=$1`, [id]);
  } else {
    await pool().query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [id]);
    await pool().query('UPDATE "User" SET "emailVerifiedAt"=clock_timestamp() WHERE id=$1', [id]);
  }
}
beforeAll(async () => { data = await academicOfferingDataset('academic_publication'); http = await us1Http(data); }, 120000);
beforeEach(async () => {
  // Solo las cinco tablas académicas del esquema de esta suite. No identidad ni base manual.
  await data.context.isolated.ownerQuery('TRUNCATE "AcademicAuditEvent","AcademicCommand","AcademicSlot","AcademicGroup","AcademicCourse"');
  await pool().query(`UPDATE "User" SET role='TEACHER',status='ACTIVE',"disabledAt"=NULL,"emailVerifiedAt"=clock_timestamp() WHERE id=$1`, [data.account('TEACHER').id]);
  seed = await preparationSeed(pool());
  await pool().query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1', [seed.groupId, data.account('TEACHER').id]);
  await pool().query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1', [seed.otherGroupId, data.otherTeacher.userId]);
  await pool().query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1140,1200)', [seed.otherGroupId]);
});
afterAll(async () => { try { await http?.close(); } finally { await data?.cleanup(); } });

describe('T032 controles reales y proyecciones existentes; NO publicación aprobada', () => {
  test('I01 AppModule real, conexión observadora distinta, cinco migraciones y sesión administrativa', async () => {
    const a = (await http.database.pool.query('SELECT current_schema() AS schema,pg_backend_pid() AS pid')).rows[0];
    const b = (await pool().query('SELECT current_schema() AS schema,pg_backend_pid() AS pid')).rows[0];
    expect(a.schema).toBe(data.context.isolated.schema); expect(b.schema).toBe(a.schema); expect(b.pid).not.toBe(a.pid);
    expect((await pool().query('SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rowCount).toBe(5);
    expect((await http.get('/me', admin())).status).toBe(200);
  });
  test('I02 SQL de fixture preparado no fabrica comandos ni auditoría; directorio mínimo', async () => {
    expect((await pool().query('SELECT 1 FROM "AcademicCommand"')).rowCount).toBe(0);
    expect((await pool().query('SELECT 1 FROM "AcademicAuditEvent"')).rowCount).toBe(0);
    const directory = (await pool().query('SELECT * FROM "AcademicTeacherDirectory" WHERE "userId"=$1', [data.account('TEACHER').id])).rows[0];
    expect(Object.keys(directory).sort()).toEqual(['userId','name','eligible','eligibilityVersion'].sort()); expect(directory.eligible).toBe(true);
  });
  test('I03 lectura administrativa existente distingue curso vacío editorialmente publicado de visible', async () => {
    await pool().query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`, [seed.otherCourseId]);
    const before = await academicFingerprint(pool()); const response = await http.get(`/admin/academic/courses/${seed.otherCourseId}`, admin());
    expect(response.status).toBe(200); expect((await response.json()).data).toMatchObject({ state: 'PUBLISHED', studentVisible: false });
    expect(await academicFingerprint(pool())).toBe(before);
  });
  test('I04 pérdida/recuperación real sin consultas intermedias mantiene snapshot inválido; GET no escribe', async () => {
    await parentPublished(); await childPublished(); const previous = await generation();
    await loseAndRecover('status'); expect(await generation()).toBe((BigInt(previous) + 1n).toString());
    const before = await academicFingerprint(pool()); const response = await http.get(`/admin/academic/groups/${seed.groupId}`, admin());
    expect(response.status).toBe(200); expect((await response.json()).data).toMatchObject({ state: 'PUBLISHED', studentVisible: false, teacherReviewRequired: true });
    expect((await pool().query('SELECT "publishedTeacherEligibilityVersion"::text AS version FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0].version).toBe(previous);
    expect(await academicFingerprint(pool())).toBe(before);
  });
  test('I05 proyección HTTP existente de fixture visible no inventa ocupación y excluye generación', async () => {
    await parentPublished(); await childPublished(); const response = await http.get(`/admin/academic/groups/${seed.groupId}`, admin());
    expect(response.status).toBe(200); const value = (await response.json()).data;
    expect(value).toMatchObject({ studentVisible: true, teacherReviewRequired: false, capacity: 1, occupancy: null, availability: null, capacityStatus: 'NOT_CALCULATED' });
    expect(value).not.toHaveProperty('publishedTeacherEligibilityVersion'); expect(value.teacher).not.toHaveProperty('email');
  });
});

describe('T032 publicación HTTP/PG — FR-004/007/008/012; SC-004', () => {
  test('P01 curso sin grupos se publica pero no se ofrece; commit, revisión, ledger y auditoría', async () => {
    const commandId = randomUUID(); const result = await applied<AdminCourse>(await post('courses', seed.otherCourseId, { commandId, expectedRevision: '1' }));
    expect(result.resource).toMatchObject({ id: seed.otherCourseId, state: 'PUBLISHED', revision: '2', studentVisible: false });
    expect(result.command).toEqual({ id: commandId, replayed: false, appliedRevision: '2', result: 'APPLIED' });
    expect((await pool().query('SELECT state,revision::text FROM "AcademicCourse" WHERE id=$1', [seed.otherCourseId])).rows[0]).toEqual({ state: 'PUBLISHED', revision: '2' });
    expect((await pool().query('SELECT operation,"resultingRevision"::text AS revision FROM "AcademicCommand" WHERE "commandId"=$1', [commandId])).rows)
      .toEqual([{ operation: 'PUBLISH_COURSE', revision: '2' }]);
    expect((await pool().query('SELECT action,"afterState","afterRevision"::text AS revision FROM "AcademicAuditEvent" WHERE "commandId"=$1', [commandId])).rows)
      .toEqual([{ action: 'PUBLISH_COURSE', afterState: 'PUBLISHED', revision: '2' }]);
  });
  test('P02 publicar curso no publica borradores ni captura generaciones de sus hijos', async () => {
    const children = await rows('AcademicGroup'); const result = await applied<AdminCourse>(await post('courses'));
    expect(result.resource).toMatchObject({ state: 'PUBLISHED', studentVisible: false }); expect(await rows('AcademicGroup')).toEqual(children);
  });
  test('P03 curso incompleto enumera descripción faltante y no aplica nada', async () => {
    await pool().query('UPDATE "AcademicCourse" SET description=NULL WHERE id=$1', [seed.courseId]);
    await rejected('courses', 400, 'VALIDATION_ERROR', undefined, ['description']);
  });
  test('P04 curso ya publicado rechaza nueva publicación, no NO_CHANGE', async () => {
    await parentPublished(); await rejected('courses', 409, 'OFFERING_STATE_CONFLICT');
  });
  test('P05 republicar curso retirado es explícito y no renueva capturas ni estados hijos', async () => {
    await parentWithdrawn(); const children = await rows('AcademicGroup');
    expect((await applied<AdminCourse>(await post('courses'))).resource.state).toBe('PUBLISHED'); expect(await rows('AcademicGroup')).toEqual(children);
  });
  test.each(['DRAFT', 'WITHDRAWN'] as const)('P06 grupo no se publica bajo padre %s', async state => {
    if (state === 'WITHDRAWN') await parentWithdrawn(); await rejected('groups', 409, 'OFFERING_STATE_CONFLICT');
  });
  test.each([1, 50])('P07 grupo completo con capacidad %i captura docente/generación y conserva padre/hermano', async capacity => {
    await parentPublished(); await pool().query('UPDATE "AcademicGroup" SET capacity=$2 WHERE id=$1', [seed.groupId, capacity]);
    const parent = await rows('AcademicCourse'); const sibling = (await pool().query('SELECT to_jsonb(g) AS value FROM "AcademicGroup" g WHERE id=$1', [seed.otherGroupId])).rows;
    const version = await generation(); const result = await applied<AdminGroup>(await post('groups'));
    expect(result.resource).toMatchObject({ id: seed.groupId, state: 'PUBLISHED', revision: '2', capacity, studentVisible: true, teacherReviewRequired: false,
      occupancy: null, availability: null, capacityStatus: 'NOT_CALCULATED' });
    expect((await pool().query('SELECT "teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion"::text AS version,revision::text FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0])
      .toEqual({ teacherUserId: data.account('TEACHER').id, publishedTeacherUserId: data.account('TEACHER').id, version, revision: '2' });
    expect(await rows('AcademicCourse')).toEqual(parent);
    expect((await pool().query('SELECT to_jsonb(g) AS value FROM "AcademicGroup" g WHERE id=$1', [seed.otherGroupId])).rows).toEqual(sibling);
    expect((await pool().query('SELECT operation FROM "AcademicCommand" WHERE "targetId"=$1', [seed.groupId])).rows).toEqual([{ operation: 'PUBLISH_GROUP' }]);
    expect((await pool().query('SELECT action FROM "AcademicAuditEvent" WHERE "resourceId"=$1', [seed.groupId])).rows).toEqual([{ action: 'PUBLISH_GROUP' }]);
  });
  test.each(['capacity','periodStart','periodEnd','teacherUserId','schedule'] as const)('P08 dato faltante %s impide publicar sin cambios parciales', async field => {
    await parentPublished();
    if (field === 'schedule') await pool().query('DELETE FROM "AcademicSlot" WHERE "groupId"=$1', [seed.groupId]);
    else await pool().query(`UPDATE "AcademicGroup" SET "${field}"=NULL WHERE id=$1`, [seed.groupId]);
    await rejected('groups', 400, 'VALIDATION_ERROR', undefined, [field]);
  });
  test.each(['role','status','verification'] as const)('P09 docente que pierde %s rechaza publicación con error seguro por campo', async kind => {
    await parentPublished(); const teacher = data.account('TEACHER').id;
    if (kind === 'role') await pool().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [teacher]);
    if (kind === 'status') await pool().query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [teacher]);
    if (kind === 'verification') await pool().query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [teacher]);
    await rejected('groups', 409, 'TEACHER_NOT_ELIGIBLE', undefined, ['teacherUserId']);
  });
  test.each(['sin ocurrencia','solapamiento interno'] as const)('P10 publicación revalida %s aunque fixture SQL permita filas', async kind => {
    await parentPublished();
    if (kind === 'sin ocurrencia') await pool().query(`UPDATE "AcademicGroup" SET "periodStart"='2026-10-20' WHERE id=$1`, [seed.groupId]);
    else await pool().query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1110,1170)', [seed.groupId]);
    await rejected('groups', 400, 'VALIDATION_ERROR', undefined, ['schedule']);
  });
  test.each(['PUBLISHED', 'CANCELLED'] as const)('P11 grupo %s rechaza publicar; cancelación terminal', async state => {
    await parentPublished(); if (state === 'PUBLISHED') await childPublished();
    else await pool().query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Fixture terminal',"cancelledAt"=clock_timestamp() WHERE id=$1`, [seed.groupId]);
    await rejected('groups', 409, 'OFFERING_STATE_CONFLICT');
  });
  test('P12 curso retirado revalida hijo publicado válido sin tocar ninguna fila de grupo', async () => {
    await parentWithdrawn(); await childPublished(); const children = await rows('AcademicGroup');
    const result = await applied<AdminCourse>(await post('courses'));
    expect(result.resource).toMatchObject({ state: 'PUBLISHED', studentVisible: true }); expect(await rows('AcademicGroup')).toEqual(children);
  });
  test.each(['role','status','verification'] as const)('P13 curso no limpia revisión tras pérdida/recuperación %s sin lecturas', async kind => {
    await parentWithdrawn(); await childPublished(); await childPublished(seed.otherGroupId);
    const previous = await generation(); await loseAndRecover(kind);
    expect(await generation()).toBe((BigInt(previous) + 1n).toString());
    const value = await rejected('courses', 409, 'COURSE_PUBLICATION_BLOCKED', undefined, [], [seed.groupId]);
    expect(value.error.conflictingGroupIds).not.toContain(seed.otherGroupId);
  });
  test('P14 si un hijo publicado carece de franjas se revierte curso y se conservan todos los hijos', async () => {
    await parentWithdrawn(); await childPublished(); await childPublished(seed.otherGroupId);
    await pool().query('DELETE FROM "AcademicSlot" WHERE "groupId"=$1', [seed.groupId]);
    await rejected('courses', 409, 'COURSE_PUBLICATION_BLOCKED', undefined, [], [seed.groupId]);
  });
  test('P15 hijos no publicados no bloquean ni se publican al recuperar curso', async () => {
    await parentWithdrawn(); await childWithdrawn();
    await pool().query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Fixture',"cancelledAt"=clock_timestamp() WHERE id=$1`, [seed.otherGroupId]);
    await loseAndRecover('status'); const children = await rows('AcademicGroup');
    expect((await applied<AdminCourse>(await post('courses'))).resource).toMatchObject({ state: 'PUBLISHED', studentVisible: false });
    expect(await rows('AcademicGroup')).toEqual(children);
  });
  test('P16 solo republicar explícitamente grupo retirado captura nueva generación; padre intacto', async () => {
    await parentPublished(); await childWithdrawn(); const previous = await generation(); await loseAndRecover('role');
    const parent = await rows('AcademicCourse');
    const before = (await pool().query('SELECT "publishedTeacherEligibilityVersion"::text AS version FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0];
    expect(before.version).toBe(previous);
    expect((await applied<AdminGroup>(await post('groups'))).resource).toMatchObject({ state: 'PUBLISHED', teacherReviewRequired: false, studentVisible: true });
    expect((await pool().query('SELECT "publishedTeacherEligibilityVersion"::text AS version FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0].version).toBe((BigInt(previous) + 1n).toString());
    expect(await rows('AcademicCourse')).toEqual(parent);
  });
  test.each(['role','status','verification'] as const)('P22 curso revalida docente actualmente inhabilitado por %s y revierte todo', async kind => {
    await parentWithdrawn(); await childPublished(); await childPublished(seed.otherGroupId);
    const teacher = data.account('TEACHER').id;
    if (kind === 'role') await pool().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [teacher]);
    if (kind === 'status') await pool().query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [teacher]);
    if (kind === 'verification') await pool().query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [teacher]);
    await rejected('courses', 409, 'COURSE_PUBLICATION_BLOCKED', undefined, [], [seed.groupId]);
  });
  test.each(['sin ocurrencia','solapamiento interno'] as const)('P23 curso revalida integridad del hijo publicado: %s', async kind => {
    await parentWithdrawn();
    if (kind === 'sin ocurrencia') await pool().query(`UPDATE "AcademicGroup" SET "periodStart"='2026-10-20' WHERE id=$1`, [seed.groupId]);
    else await pool().query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1110,1170)', [seed.groupId]);
    await childPublished(); await childPublished(seed.otherGroupId);
    await rejected('courses', 409, 'COURSE_PUBLICATION_BLOCKED', undefined, [], [seed.groupId]);
  });
  test('P24 republicación de grupo sustituye captura del docente anterior, no al editar la asignación', async () => {
    await parentPublished(); await childWithdrawn();
    await pool().query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1', [seed.groupId, data.otherTeacher.userId]);
    expect((await pool().query('SELECT "publishedTeacherUserId" FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0].publishedTeacherUserId).toBe(data.account('TEACHER').id);
    const version = await generation(data.otherTeacher.userId);
    expect((await applied<AdminGroup>(await post('groups'))).resource).toMatchObject({ state: 'PUBLISHED', teacherReviewRequired: false, studentVisible: true });
    expect((await pool().query('SELECT "publishedTeacherUserId","publishedTeacherEligibilityVersion"::text AS version FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0])
      .toEqual({ publishedTeacherUserId: data.otherTeacher.userId, version });
  });
  test('P25 grupo incompleto enumera todos los datos faltantes, sin aplicar parte de la publicación', async () => {
    await parentPublished();
    await pool().query('UPDATE "AcademicGroup" SET capacity=NULL,"periodStart"=NULL,"periodEnd"=NULL,"teacherUserId"=NULL WHERE id=$1', [seed.groupId]);
    await pool().query('DELETE FROM "AcademicSlot" WHERE "groupId"=$1', [seed.groupId]);
    await rejected('groups', 400, 'VALIDATION_ERROR', undefined, ['capacity','periodStart','periodEnd','teacherUserId','schedule']);
  });
  for (const kind of ['courses','groups'] as const) {
    test(`P17 ${kind}: revisión obsoleta no deja efectos`, async () => {
      if (kind === 'groups') await parentPublished(); await rejected(kind, 409, 'OFFERING_VERSION_CONFLICT', { commandId: randomUUID(), expectedRevision: '2' });
    });
    test(`P18 ${kind}: replay idéntico conserva revisión y no duplica ledger/auditoría`, async () => {
      if (kind === 'groups') await parentPublished(); const body = { commandId: randomUUID(), expectedRevision: '1' };
      const first = await applied(await post(kind, idFor(kind), body)); const before = await academicFingerprint(pool());
      const replay = await post(kind, idFor(kind), body); status(replay, 200); const value = (await replay.json()).data;
      expect(value.resource).toEqual(first.resource); expect(value.command).toEqual({ ...first.command, replayed: true });
      expect(await academicFingerprint(pool())).toBe(before);
    });
    test(`P19 ${kind}: fallo real de auditoría revierte negocio y ledger juntos`, async () => {
      if (kind === 'groups') await parentPublished();
      await data.context.isolated.ownerQuery(`CREATE FUNCTION academic_publication_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture audit failure'; END $$;
        CREATE TRIGGER academic_publication_test_failure BEFORE INSERT ON "AcademicAuditEvent" FOR EACH ROW EXECUTE FUNCTION academic_publication_test_failure()`);
      try { await rejected(kind, 503, 'TEMPORARILY_UNAVAILABLE'); }
      finally { await data.context.isolated.ownerQuery('DROP TRIGGER academic_publication_test_failure ON "AcademicAuditEvent"; DROP FUNCTION academic_publication_test_failure()'); }
    });
    for (const actor of ['VISITOR','STUDENT','TEACHER'] as const) test(`P20 ${kind}: ${actor} denegado sin efectos ni datos`, async () => {
      const before = await academicFingerprint(pool()); const response = await post(kind, idFor(kind), undefined, actor === 'VISITOR' ? '' : data.account(actor).sessions[0].secret);
      status(response, actor === 'VISITOR' ? 401 : 403); const value = await response.json();
      expect(value.error.code).toBe(actor === 'VISITOR' ? 'AUTH_REQUIRED' : 'FORBIDDEN');
      expect(Object.keys(value.error).sort()).toEqual(['code','message','requestId']); expect(value).not.toHaveProperty('data');
      expect(await academicFingerprint(pool())).toBe(before);
    });
  }
  test.each([
    { name: 'commandId omitido', body: { expectedRevision: '1' } },
    { name: 'expectedRevision omitida', body: { commandId: randomUUID() } },
    { name: 'revisión numérica', body: { commandId: randomUUID(), expectedRevision: 1 } },
    { name: 'dos docentes inyectados', body: { commandId: randomUUID(), expectedRevision: '1', teacherUserIds: [randomUUID(), randomUUID()] } },
    { name: 'snapshot del cliente', body: { commandId: randomUUID(), expectedRevision: '1', publishedTeacherEligibilityVersion: '99' } },
    { name: 'estado del cliente', body: { commandId: randomUUID(), expectedRevision: '1', state: 'PUBLISHED' } },
  ])('P21 DTO estricto: $name', async ({ body }) => {
    await parentPublished(); await rejected('groups', 400, 'VALIDATION_ERROR', body);
  });
});
