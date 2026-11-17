import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { academicFingerprint } from '../support/academic-preparation.js';
import { commandCounts, maintenanceSeed, resetAcademicFixture, savedGroup } from '../support/academic-maintenance.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';

let data: AcademicOfferingDataset, http: Us1Http, seed: Awaited<ReturnType<typeof maintenanceSeed>>;
const db = () => data.context.database.pool;
const admin = () => data.account('ADMIN').sessions[0].secret;
const student = () => data.account('STUDENT').sessions[0].secret;
beforeAll(async () => { data = await academicOfferingDataset('academic_state'); http = await us1Http(data); }, 120000);
beforeEach(async () => { await resetAcademicFixture(data); seed = await maintenanceSeed(data); });
afterAll(async () => { try { await http?.close(); } finally { await data?.cleanup(); } });
const route = (kind: 'courses'|'groups', id: string, action: string) => `/admin/academic/${kind}/${id}/${action}`;
async function action(kind: 'courses'|'groups', id: string, verb: 'withdraw'|'cancel'|'publish', revision = '1', extras = {}, secret = admin()) {
  const commandId = randomUUID(); const response = await http.post(route(kind, id, verb), { commandId, expectedRevision: revision, ...extras }, secret);
  return { response, commandId };
}
async function applied(response: Response) {
  expect(response.status, 'T048/T049 pendientes: ruta de transición real debe confirmar 200, no 404 de ruta ausente').toBe(200);
  const body = await response.json(); expect(body.data.command).toMatchObject({ replayed: false, result: 'APPLIED' }); return body.data;
}
async function reject(response: Response, status: number, code: string, before: string) {
  expect(response.status, 'El 404 de una ruta ausente no aprueba validación/estado/permisos').toBe(status);
  const body = await response.json(); expect(body).not.toHaveProperty('data'); expect(body.error.code).toBe(code);
  expect(await academicFingerprint(data.observerPool)).toBe(before); return body.error;
}
test('I01 control auxiliar: composición HTTP real, dos grupos visibles y fixture sin ledger fabricado', async () => {
  expect((await http.get('/me', admin())).status).toBe(200);
  const response = await http.get(`/academic/courses/${seed.courseId}/groups`, student()); expect(response.status).toBe(200);
  const body = await response.json(); expect(body.data.total).toBe(2); expect(body.data.items.map((g: { id: string }) => g.id).sort()).toEqual([seed.groupId, seed.otherGroupId].sort());
  expect((await db().query('SELECT count(*)::int AS n FROM "AcademicCommand"')).rows[0].n).toBe(0);
  expect((await db().query('SELECT count(*)::int AS n FROM "AcademicAuditEvent"')).rows[0].n).toBe(0);
});
test('S01 retirar curso oculta catálogo, conserva hijos/capturas y no libera su agenda PUBLISHED', async () => {
  const children = await Promise.all([savedGroup(data, seed.groupId), savedGroup(data, seed.otherGroupId)]);
  const { response, commandId } = await action('courses', seed.courseId, 'withdraw');
  expect((await applied(response)).resource).toMatchObject({ state: 'WITHDRAWN', revision: '2', studentVisible: false });
  expect(await Promise.all([savedGroup(data, seed.groupId), savedGroup(data, seed.otherGroupId)])).toEqual(children);
  expect((await http.get(`/academic/courses/${seed.courseId}`, student())).status).toBe(404);
  const before = await academicFingerprint(data.observerPool);
  await reject((await action('groups', seed.competitorId, 'publish')).response, 409, 'TEACHER_SCHEDULE_CONFLICT', before);
  expect(await commandCounts(data, commandId)).toEqual({ ledger: 1, audit: 1 });
});
test('S02 hijo publicado de padre retirado sigue no editable; guardar no retira implícitamente', async () => {
  await applied((await action('courses', seed.courseId, 'withdraw')).response);
  const before = await academicFingerprint(data.observerPool);
  const response = await fetch(`${http.url}/api/v1/admin/academic/groups/${seed.groupId}`, { method: 'PATCH', headers: http.headers(admin()),
    body: JSON.stringify({ commandId: randomUUID(), expectedRevision: '1', capacity: 40 }) });
  await reject(response, 409, 'OFFERING_STATE_CONFLICT', before);
});
test('S03 retirar/editar/guardar no republica; publicación explícita conserva captura hasta confirmación', async () => {
  const original = await savedGroup(data, seed.groupId);
  await applied((await action('groups', seed.groupId, 'withdraw')).response);
  const response = await fetch(`${http.url}/api/v1/admin/academic/groups/${seed.groupId}`, { method: 'PATCH', headers: http.headers(admin()),
    body: JSON.stringify({ commandId: randomUUID(), expectedRevision: '2', name: 'Grupo corregido', capacity: 50 }) });
  const edit = await applied(response); expect(edit.resource).toMatchObject({ state: 'WITHDRAWN', revision: '3', studentVisible: false, capacity: 50 });
  expect((await savedGroup(data, seed.groupId)).publishedTeacherEligibilityVersion).toBe(original.publishedTeacherEligibilityVersion);
  expect((await http.get(`/academic/courses/${seed.courseId}/groups/${seed.groupId}`, student())).status).toBe(404);
  expect((await applied((await action('groups', seed.groupId, 'publish', '3')).response)).resource).toMatchObject({ state: 'PUBLISHED', revision: '4', studentVisible: true });
  expect((await http.get(`/academic/courses/${seed.courseId}/groups/${seed.groupId}`, student())).status).toBe(200);
});
for (const state of ['DRAFT','PUBLISHED','WITHDRAWN'] as const) test(`S04 cancelar ${state}: motivo/instante servidor, snapshot/franjas y hermano conservados`, async () => {
  if (state === 'DRAFT') { await resetAcademicFixture(data); seed = await maintenanceSeed(data, { firstGroupDraft: true }); }
  await db().query('UPDATE "AcademicGroup" SET state=$2::text::"AcademicGroupState" WHERE id=$1', [seed.groupId, state]);
  const before = await savedGroup(data, seed.groupId), sibling = await savedGroup(data, seed.otherGroupId);
  const slots = (await data.observerPool.query('SELECT * FROM "AcademicSlot" WHERE "groupId"=$1 ORDER BY id', [seed.groupId])).rows;
  const start = (await db().query('SELECT clock_timestamp() AS at')).rows[0].at as Date;
  const { response, commandId } = await action('groups', seed.groupId, 'cancel', '1', { cancellationReason: '  Motivo ficticio privado  ' });
  expect((await applied(response)).resource).toMatchObject({ state: 'CANCELLED', revision: '2', cancellationReason: 'Motivo ficticio privado', studentVisible: false });
  const row = await savedGroup(data, seed.groupId); const end = (await db().query('SELECT clock_timestamp() AS at')).rows[0].at as Date;
  expect(Date.parse(row.cancelledAt)).toBeGreaterThanOrEqual(start.getTime()); expect(Date.parse(row.cancelledAt)).toBeLessThanOrEqual(end.getTime());
  expect(row).toMatchObject({ id: before.id, courseId: before.courseId, name: before.name, capacity: before.capacity,
    publishedTeacherUserId: before.publishedTeacherUserId, publishedTeacherEligibilityVersion: before.publishedTeacherEligibilityVersion });
  expect((await data.observerPool.query('SELECT * FROM "AcademicSlot" WHERE "groupId"=$1 ORDER BY id', [seed.groupId])).rows).toEqual(slots);
  expect(await savedGroup(data, seed.otherGroupId)).toEqual(sibling); expect(await commandCounts(data, commandId)).toEqual({ ledger: 1, audit: 1 });
  expect((await action('groups', seed.competitorId, 'publish')).response.status).toBe(200);
});
for (const verb of ['withdraw','cancel','publish'] as const) test(`S05 cancelado rechaza ${verb}, sin NO_CHANGE o revisión nueva`, async () => {
  await db().query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Anterior',"cancelledAt"=clock_timestamp() WHERE id=$1`, [seed.groupId]);
  const before = await academicFingerprint(data.observerPool);
  await reject((await action('groups', seed.groupId, verb, '1', { ...(verb === 'cancel' ? { cancellationReason: 'Otro' } : {}) })).response, 409, 'OFFERING_STATE_CONFLICT', before);
});
for (const kind of ['courses','groups'] as const) for (const state of ['DRAFT','WITHDRAWN'] as const) test(`S06 retirar ${kind}/${state} inválido no es éxito sin cambios`, async () => {
  if (state === 'DRAFT') { await resetAcademicFixture(data); seed = await maintenanceSeed(data, { firstCourseDraft: kind === 'courses', firstGroupDraft: kind === 'groups' }); }
  const id = kind === 'courses' ? seed.courseId : seed.groupId; const table = kind === 'courses' ? 'AcademicCourse' : 'AcademicGroup';
  await db().query(`UPDATE "${table}" SET state=$2::text::"${table}State" WHERE id=$1`, [id, state]);
  const before = await academicFingerprint(data.observerPool); await reject((await action(kind, id, 'withdraw')).response, 409, 'OFFERING_STATE_CONFLICT', before);
});
test('S07 recuperación del curso bloqueado exige retirar hijos afectados y republicarlos explícitamente', async () => {
  await db().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [seed.teacherId]); await db().query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`, [seed.teacherId]);
  await applied((await action('courses', seed.courseId, 'withdraw')).response); const before = await academicFingerprint(data.observerPool);
  const error = await reject((await action('courses', seed.courseId, 'publish', '2')).response, 409, 'COURSE_PUBLICATION_BLOCKED', before);
  expect(error.conflictingGroupIds.sort()).toEqual([seed.groupId, seed.otherGroupId].sort());
  for (const id of [seed.groupId, seed.otherGroupId]) await applied((await action('groups', id, 'withdraw')).response);
  expect((await applied((await action('courses', seed.courseId, 'publish', '2')).response)).resource.studentVisible).toBe(false);
  for (const id of [seed.groupId, seed.otherGroupId]) {
    const response = await action('groups', id, 'publish', '2'); expect((await applied(response.response)).resource.teacherReviewRequired).toBe(false);
  }
  expect((await http.get(`/academic/courses/${seed.courseId}`, student())).status).toBe(200);
});
for (const reason of ['', '  ', null, 1]) test(`S08 motivo inválido ${JSON.stringify(reason)}: 400 seguro y cero efectos`, async () => {
  const before = await academicFingerprint(data.observerPool);
  const error = await reject((await action('groups', seed.groupId, 'cancel', '1', { cancellationReason: reason })).response, 400, 'VALIDATION_ERROR', before);
  expect(error.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'cancellationReason' })]));
});
for (const verb of ['withdraw','cancel'] as const) for (const role of ['STUDENT','TEACHER','VISITOR'] as const) test(`S09 ${verb} denegado a ${role} antes de entregar datos`, async () => {
  const secret = role === 'VISITOR' ? '' : data.account(role).sessions[0].secret; const before = await academicFingerprint(data.observerPool);
  await reject((await action('groups', seed.groupId, verb, '1', { ...(verb === 'cancel' ? { cancellationReason: 'Privado' } : {}) }, secret)).response,
    role === 'VISITOR' ? 401 : 403, role === 'VISITOR' ? 'AUTH_REQUIRED' : 'FORBIDDEN', before);
});
test('S10 motivo de cancelación solo admin, alumno recibe 404 uniforme', async () => {
  await applied((await action('groups', seed.groupId, 'cancel', '1', { cancellationReason: 'Motivo ficticio privado' })).response);
  const privateValue = await (await http.get(`/admin/academic/groups/${seed.groupId}`, admin())).json();
  expect(privateValue.data.cancellationReason).toBe('Motivo ficticio privado');
  const hidden = await http.get(`/academic/courses/${seed.courseId}/groups/${seed.groupId}`, student()); expect(hidden.status).toBe(404);
  expect(await hidden.text()).not.toMatch(/Motivo ficticio|cancelad|teacher|revision/i);
});
for (const path of ['course-delete','group-delete','course-cancel'] as const) test(`S11 operación no ofrecida ${path}: 404 sin borrar datos`, async () => {
  const before = await academicFingerprint(data.observerPool); const endpoint = path === 'course-cancel' ? route('courses', seed.courseId, 'cancel')
    : `/admin/academic/${path === 'course-delete' ? 'courses/'+seed.courseId : 'groups/'+seed.groupId}`;
  const response = await fetch(`${http.url}/api/v1${endpoint}`, { method: path === 'course-cancel' ? 'POST' : 'DELETE', headers: http.headers(admin()), body: JSON.stringify({ commandId: randomUUID(), expectedRevision: '1' }) });
  expect(response.status).toBe(404); expect(await academicFingerprint(data.observerPool)).toBe(before);
});
for (const role of ['STUDENT','TEACHER','VISITOR'] as const) test(`S12 motivo administrativo denegado a ${role}, incluso por URL directa`, async () => {
  await db().query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Motivo ficticio privado',"cancelledAt"=clock_timestamp() WHERE id=$1`, [seed.groupId]);
  const response = await http.get(`/admin/academic/groups/${seed.groupId}`, role === 'VISITOR' ? '' : data.account(role).sessions[0].secret);
  expect(response.status).toBe(role === 'VISITOR' ? 401 : 403); expect(await response.text()).not.toContain('Motivo ficticio privado');
});
for (const method of ['PATCH','PUT'] as const) test(`S13 cancelado rechaza ${method} de datos/franjas aunque sean iguales`, async () => {
  await db().query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Terminal',"cancelledAt"=clock_timestamp() WHERE id=$1`, [seed.groupId]);
  const before = await academicFingerprint(data.observerPool);
  const response = await fetch(`${http.url}/api/v1/admin/academic/groups/${seed.groupId}${method === 'PUT' ? '/schedule' : ''}`, {
    method, headers: http.headers(admin()), body: JSON.stringify({ commandId: randomUUID(), expectedRevision: '1',
      ...(method === 'PUT' ? { schedule: [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }] } : { name: 'Turno A' }) }) });
  await reject(response, 409, 'OFFERING_STATE_CONFLICT', before);
});
for (const kind of ['course-withdraw','group-withdraw','group-cancel'] as const) for (const defect of ['commandId','expectedRevision','state','stale'] as const) {
  test(`S14 ${kind}: body ${defect} no permite bypass del contrato`, async () => {
    const body: Record<string, unknown> = { commandId: randomUUID(), expectedRevision: defect === 'stale' ? '2' : '1',
      ...(kind === 'group-cancel' ? { cancellationReason: 'Motivo ficticio' } : {}) };
    if (defect === 'commandId' || defect === 'expectedRevision') delete body[defect];
    if (defect === 'state') body.state = 'CANCELLED';
    const before = await academicFingerprint(data.observerPool);
    const response = await http.post(route(kind === 'course-withdraw' ? 'courses' : 'groups', kind === 'course-withdraw' ? seed.courseId : seed.groupId,
      kind === 'group-cancel' ? 'cancel' : 'withdraw'), body, admin());
    await reject(response, defect === 'stale' ? 409 : 400, defect === 'stale' ? 'OFFERING_VERSION_CONFLICT' : 'VALIDATION_ERROR', before);
  });
}
test('S15 cancelación no acepta instante enviado por cliente', async () => {
  const before = await academicFingerprint(data.observerPool);
  await reject((await action('groups', seed.groupId, 'cancel', '1', { cancellationReason: 'Motivo', cancelledAt: '2000-01-01T00:00:00.000Z' })).response,
    400, 'VALIDATION_ERROR', before);
});
