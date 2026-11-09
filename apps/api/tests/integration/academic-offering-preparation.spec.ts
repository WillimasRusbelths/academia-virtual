import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { academicFingerprint, preparationSeed } from '../support/academic-preparation.js';
import type { AdminCourse, AdminGroup, CommandResult, DataResponse, Page } from '../../src/modules/academic-offering/public/offer.js';
import { resetAcademicFixture } from '../support/academic-maintenance-fixture.js';

let data: AcademicOfferingDataset; let http: Us1Http;
let seed: Awaited<ReturnType<typeof preparationSeed>>;
const pool = () => data.observerPool;
const admin = () => data.account('ADMIN').sessions[0].secret;
const routes = () => [
  { method: 'GET', path: '/admin/academic/courses' },
  { method: 'GET', path: `/admin/academic/courses/${seed.courseId}` },
  { method: 'GET', path: `/admin/academic/courses/${seed.courseId}/groups` },
  { method: 'GET', path: `/admin/academic/groups/${seed.groupId}` },
  { method: 'GET', path: '/admin/academic/teachers' },
  { method: 'POST', path: '/admin/academic/courses', body: { commandId: randomUUID(), name: 'Nuevo' } },
  { method: 'PATCH', path: `/admin/academic/courses/${seed.courseId}`, body: { commandId: randomUUID(), expectedRevision: '1', name: 'Nuevo' } },
  { method: 'POST', path: `/admin/academic/courses/${seed.courseId}/groups`, body: { commandId: randomUUID(), name: 'Nuevo' } },
  { method: 'PATCH', path: `/admin/academic/groups/${seed.groupId}`, body: { commandId: randomUUID(), expectedRevision: '1', capacity: 25 } },
  { method: 'PUT', path: `/admin/academic/groups/${seed.groupId}/schedule`, body: { commandId: randomUUID(), expectedRevision: '1', schedule: [] } },
];
async function request(route: { method: string; path: string; body?: unknown }, secret: string | undefined = admin(), extra: Record<string, string> = {}) {
  return fetch(`${http.url}/api/v1${route.path}`, { method: route.method,
    headers: { ...http.headers(secret), ...extra }, ...(route.body === undefined ? {} : { body: JSON.stringify(route.body) }) });
}
function status(response: Response, expected: number) {
  expect(response.status, `T024/T025/T026 pendientes si la ruta académica real devuelve 404 (${expected} requerido)`).toBe(expected);
}
async function command<T extends AdminCourse | AdminGroup>(response: Response, expected = 200): Promise<CommandResult<T>> {
  status(response, expected); return ((await response.json()) as DataResponse<CommandResult<T>>).data;
}
async function unchangedFailure(route: Parameters<typeof request>[0], expected = 400, code = 'VALIDATION_ERROR') {
  const before = await academicFingerprint(pool()); const response = await request(route);
  status(response, expected); const body = await response.json();
  expect(body.error).toMatchObject({ code, requestId: expect.any(String) });
  expect(body).not.toHaveProperty('data'); expect(body.error).not.toHaveProperty('conflictingGroupIds');
  expect(await academicFingerprint(pool())).toBe(before);
}
beforeAll(async () => { data = await academicOfferingDataset('academic_preparation'); http = await us1Http(data); }, 120000);
beforeEach(async () => {
  // Propietario SOLO del esquema t_ actual. No CASCADE, identidad ni base manual.
  await resetAcademicFixture(data);
  seed = await preparationSeed(data.context.database.pool);
});
afterAll(async () => { try { await http?.close(); } finally { await data?.cleanup(); } });

describe('T021 controles de infraestructura, NO aceptación académica', () => {
  test('I01 PostgreSQL real, migraciones y observador separado; identidad HTTP de los tres roles', async () => {
    const appDb = await http.database.pool.query<{ schema: string; pid: number }>('SELECT current_schema() AS schema,pg_backend_pid() AS pid');
    const observer = await pool().query<{ schema: string; pid: number }>('SELECT current_schema() AS schema,pg_backend_pid() AS pid');
    expect(observer.rows[0].schema).toBe(data.context.isolated.schema);
    expect(observer.rows[0].schema).toBe(appDb.rows[0].schema); expect(observer.rows[0].pid).not.toBe(appDb.rows[0].pid);
    expect((await pool().query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rowCount).toBe(7);
    expect((await fetch(`${http.url}/health/ready`)).status).toBe(200);
    for (const role of ['ADMIN','STUDENT','TEACHER'] as const) {
      const account = data.account(role); const response = await http.get('/me', account.sessions[0].secret);
      expect(response.status).toBe(200); expect((await response.json()).data).toMatchObject({ id: account.id, role });
    }
  });
  test.each<{ name: string; headers: Record<string, string>; size?: boolean; expected: number; code: string }>([
    { name: 'I02 cuerpo superior a 16 KiB', headers: {}, size: true, expected: 413, code: 'VALIDATION_ERROR' },
    { name: 'I03 tipo de contenido', headers: { 'content-type': 'text/plain' }, expected: 415, code: 'UNSUPPORTED_MEDIA_TYPE' },
    { name: 'I04 Origin externo', headers: { origin: 'https://outside.example.test' }, expected: 403, code: 'REQUEST_NOT_ALLOWED' },
    { name: 'I05 CSRF ausente', headers: { 'x-csrf-protection': '' }, expected: 403, code: 'REQUEST_NOT_ALLOWED' },
  ])('$name: middleware real conserva las cinco tablas académicas', async ({ headers, size, expected, code }) => {
    const before = await academicFingerprint(pool());
    const response = await request({ method: 'POST', path: '/admin/academic/courses',
      body: { commandId: randomUUID(), name: 'Curso', description: size ? 'a'.repeat(16384) : 'Preparación' } }, admin(), headers);
    expect(response.status).toBe(expected); expect((await response.json()).error.code).toBe(code);
    expect(await academicFingerprint(pool())).toBe(before);
  });
  test('I06 fallo SQL dirigido al esquema propio y recuperación del permiso, sin afectar identidad', async () => {
    const role = new URL(data.context.environment.databaseUrl).username;
    if (!/^[a-z][a-z0-9_]+$/.test(role)) throw new Error('Rol de ensayo inválido.');
    await data.context.isolated.ownerQuery(`REVOKE SELECT ON "AcademicCourse" FROM "${role}"`);
    try {
      await expect(pool().query('SELECT id FROM "AcademicCourse"')).rejects.toMatchObject({ code: '42501' });
      expect((await http.get('/me', admin())).status).toBe(200);
    } finally { await data.context.isolated.ownerQuery(`GRANT SELECT ON "AcademicCourse" TO "${role}"`); }
    expect((await pool().query('SELECT id FROM "AcademicCourse"')).rowCount).toBe(2);
  });
});

describe('T021 comportamiento académico HTTP/PG real — FR-001/002/003/005/010/015', () => {
  test('H01 listado vacío es 200 y no error; página/conteo coherentes', async () => {
    await resetAcademicFixture(data);
    const response = await request(routes()[0]); status(response, 200);
    expect((await response.json()).data).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });
  test('H02 POST curso incompleto, UUID servidor, recorte y commit visibles desde observador', async () => {
    const commandId = randomUUID(); const result = await command<AdminCourse>(await request({ method: 'POST', path: '/admin/academic/courses',
      body: { commandId, name: '  Nuevo curso  ' } }), 201);
    expect(result.resource).toMatchObject({ name: 'Nuevo curso', description: null, state: 'DRAFT', revision: '1' });
    expect(result.resource.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(result.resource.id).not.toBe(commandId);
    expect(result.command).toEqual({ id: commandId, replayed: false, appliedRevision: '1', result: 'APPLIED' });
    expect((await pool().query('SELECT name,description,state,revision::text FROM "AcademicCourse" WHERE id=$1', [result.resource.id])).rows)
      .toEqual([{ name: 'Nuevo curso', description: null, state: 'DRAFT', revision: '1' }]);
    expect((await pool().query('SELECT 1 FROM "AcademicCommand" WHERE "commandId"=$1', [commandId])).rowCount).toBe(1);
    expect((await pool().query('SELECT 1 FROM "AcademicAuditEvent" WHERE "commandId"=$1', [commandId])).rowCount).toBe(1);
  });
  test('H03 POST dos grupos del mismo curso, capacidad 1/50 y omisión inicial diferenciada', async () => {
    const values = [undefined, 1, 50]; const ids: string[] = [];
    for (const capacity of values) {
      const result = await command<AdminGroup>(await request({ method: 'POST', path: `/admin/academic/courses/${seed.courseId}/groups`,
        body: { commandId: randomUUID(), name: 'Turno homónimo', ...(capacity === undefined ? {} : { capacity }) } }), 201);
      expect(result.resource).toMatchObject({ courseId: seed.courseId, state: 'DRAFT', revision: '1', capacity: capacity ?? null,
        occupancy: null, availability: null, capacityStatus: 'NOT_CALCULATED', timeZone: 'America/Lima', schedule: [] });
      ids.push(result.resource.id);
    }
    expect(new Set(ids).size).toBe(3);
    expect((await pool().query('SELECT revision::text FROM "AcademicCourse" WHERE id=$1', [seed.courseId])).rows[0].revision).toBe('1');
  });
  test('H04 GET curso y grupos conservan pertenencia y DTO cerrado sin datos privados', async () => {
    const response = await request(routes()[1]); status(response, 200); const course = (await response.json()).data as AdminCourse;
    expect(course).toMatchObject({ id: seed.courseId, name: 'Curso preparado', revision: '1', state: 'DRAFT' });
    expect(Object.keys(course).sort()).toEqual(['id','name','description','state','revision','studentVisible','createdAt','updatedAt'].sort());
    const groups = await request(routes()[2]); status(groups, 200);
    const page = (await groups.json()).data as Page<AdminGroup>;
    expect(page.total).toBe(2); expect(page.items.map(g => g.id).sort()).toEqual([seed.groupId, seed.otherGroupId].sort());
    expect(page.items.every(g => g.courseId === course.id)).toBe(true);
  });
  test('H05 GET grupo usa fechas civiles, horario y capacidad sin disponibilidad ficticia', async () => {
    const response = await request(routes()[3]); status(response, 200); const group = (await response.json()).data as AdminGroup;
    expect(group).toMatchObject({ id: seed.groupId, courseId: seed.courseId, revision: '1', capacity: 1,
      periodStart: '2026-10-19', periodEnd: '2026-10-25', timeZone: 'America/Lima',
      schedule: [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }],
      occupancy: null, availability: null, capacityStatus: 'NOT_CALCULATED' });
    expect(Object.keys(group).sort()).toEqual(['id','courseId','name','description','state','revision','periodStart','periodEnd','timeZone','capacity',
      'occupancy','availability','capacityStatus','schedule','teacher','teacherReviewRequired','studentVisible',
      'cancellationReason','cancelledAt','lastPublishedTeacherId','createdAt','updatedAt'].sort());
  });
  test('H06 selector docente entrega solo candidatos habilitados y claves id/name', async () => {
    const response = await request(routes()[4]); status(response, 200); const page = (await response.json()).data;
    expect(page.items.map((t: { id: string }) => t.id).sort()).toEqual([data.account('TEACHER').id, data.otherTeacher.userId].sort());
    for (const teacher of page.items) expect(Object.keys(teacher).sort()).toEqual(['id','name']);
  });
  test('H07 PATCH curso conserva grupos; PATCH grupo conserva hermano y curso', async () => {
    const beforeGroups = (await pool().query('SELECT to_jsonb(g) AS value FROM "AcademicGroup" g ORDER BY id')).rows;
    const editedCourse = await command<AdminCourse>(await request({ ...routes()[6], body: { commandId: randomUUID(), expectedRevision: '1', name: '  Actualizado  ' } }));
    expect(editedCourse.resource).toMatchObject({ id: seed.courseId, name: 'Actualizado', revision: '2' });
    expect((await pool().query('SELECT to_jsonb(g) AS value FROM "AcademicGroup" g ORDER BY id')).rows).toEqual(beforeGroups);
    const courseBefore = (await pool().query('SELECT to_jsonb(c) AS value FROM "AcademicCourse" c ORDER BY id')).rows;
    const otherBefore = (await pool().query('SELECT to_jsonb(g) AS value FROM "AcademicGroup" g WHERE id=$1', [seed.otherGroupId])).rows;
    const result = await command<AdminGroup>(await request({ ...routes()[8], body: { commandId: randomUUID(), expectedRevision: '1', name: 'Turno corregido', capacity: 50 } }));
    expect(result.resource).toMatchObject({ id: seed.groupId, courseId: seed.courseId, capacity: 50, revision: '2', state: 'DRAFT' });
    expect((await pool().query('SELECT to_jsonb(c) AS value FROM "AcademicCourse" c ORDER BY id')).rows).toEqual(courseBefore);
    expect((await pool().query('SELECT to_jsonb(g) AS value FROM "AcademicGroup" g WHERE id=$1', [seed.otherGroupId])).rows).toEqual(otherBefore);
  });
  test('H08 PUT reemplaza franjas atómicamente y admite adyacencia; solo aumenta revisión propia', async () => {
    const schedule = [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }, { dayOfWeek: 1, startTime: '19:00', endTime: '20:00' }];
    const result = await command<AdminGroup>(await request({ ...routes()[9], body: { commandId: randomUUID(), expectedRevision: '1', schedule } }));
    expect(result.resource.schedule).toEqual(schedule); expect(result.resource.revision).toBe('2');
    expect((await pool().query('SELECT "dayOfWeek","startMinute","endMinute" FROM "AcademicSlot" WHERE "groupId"=$1 ORDER BY "startMinute"', [seed.groupId])).rows)
      .toEqual([{ dayOfWeek: 1, startMinute: 1080, endMinute: 1140 }, { dayOfWeek: 1, startMinute: 1140, endMinute: 1200 }]);
    const replaced = await command<AdminGroup>(await request({ ...routes()[9], body: { commandId: randomUUID(), expectedRevision: '2', schedule: [] } }));
    expect(replaced.resource).toMatchObject({ schedule: [], revision: '3', state: 'DRAFT' });
    expect((await pool().query('SELECT 1 FROM "AcademicSlot" WHERE "groupId"=$1', [seed.groupId])).rowCount).toBe(0);
    expect((await pool().query('SELECT revision::text FROM "AcademicCourse" WHERE id=$1', [seed.courseId])).rows[0].revision).toBe('1');
    expect((await pool().query('SELECT revision::text FROM "AcademicGroup" WHERE id=$1', [seed.otherGroupId])).rows[0].revision).toBe('1');
  });
  test('H09 datos creados por HTTP persisten tras cerrar/reabrir AppModule con la misma base aislada', async () => {
    const created = await command<AdminCourse>(await request({ method: 'POST', path: '/admin/academic/courses', body: { commandId: randomUUID(), name: 'Persistente' } }), 201);
    await http.close(); http = await us1Http(data);
    const response = await request({ method: 'GET', path: `/admin/academic/courses/${created.resource.id}` }); status(response, 200);
    expect((await response.json()).data).toEqual(created.resource);
  });
  test('H10 16 KiB exactos en UTF-8 no se rechazan ni se inventa límite de texto', async () => {
    const body = { commandId: randomUUID(), name: 'Álgebra', description: '' };
    body.description = 'a'.repeat(16384 - Buffer.byteLength(JSON.stringify(body)));
    expect(Buffer.byteLength(JSON.stringify(body))).toBe(16384);
    const result = await command<AdminCourse>(await request({ method: 'POST', path: '/admin/academic/courses', body }), 201);
    expect(result.resource.description).toBe(body.description);
  });
  test('H11 revisión bigint no pierde precisión al editar y serializar', async () => {
    await data.context.database.pool.query('UPDATE "AcademicCourse" SET revision=$2 WHERE id=$1', [seed.courseId, '9007199254740993']);
    const result = await command<AdminCourse>(await request({ ...routes()[6], body: { commandId: randomUUID(), expectedRevision: '9007199254740993', name: 'Precisión' } }));
    expect(result.resource.revision).toBe('9007199254740994'); expect(result.command.appliedRevision).toBe('9007199254740994');
    expect((await pool().query('SELECT revision::text FROM "AcademicCourse" WHERE id=$1', [seed.courseId])).rows[0].revision).toBe('9007199254740994');
  });
  test('H12 pertenencia inmutable: PATCH courseId es campo desconocido, cero efectos', async () => {
    await unchangedFailure({ ...routes()[8], body: { commandId: randomUUID(), expectedRevision: '1', courseId: seed.otherCourseId } });
  });
  test.each([6, 8, 9])('H13 ruta %s rechaza revisión obsoleta sin efectos', async index => {
    const route = routes()[index]; await unchangedFailure({ ...route, body: { ...route.body, expectedRevision: '99' } }, 409, 'OFFERING_VERSION_CONFLICT');
  });
  test.each([5, 6, 7, 8, 9])('H14 ruta %s rechaza campo desconocido sin escribir ni consumir commandId', async index => {
    const route = routes()[index]; await unchangedFailure({ ...route, body: { ...route.body, unexpected: 'no permitido' } });
  });
  test.each([0, 1, 2, 3, 4])('H15 GET %s rechaza query desconocida', async index => {
    await unchangedFailure({ ...routes()[index], path: routes()[index].path + '?unexpected=1' });
  });
  test.each([null, '', 0, -1, 1.5, 51])('H16 capacidad inválida %j no produce cambios parciales', async capacity => {
    await unchangedFailure({ ...routes()[8], body: { commandId: randomUUID(), expectedRevision: '1', name: 'No aplicar', capacity } });
  });
  test.each([
    { name: 'duplicado', schedule: [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }, { dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }] },
    { name: 'solapamiento', schedule: [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }, { dayOfWeek: 1, startTime: '18:30', endTime: '20:00' }] },
    { name: 'medianoche', schedule: [{ dayOfWeek: 1, startTime: '23:00', endTime: '01:00' }] },
    { name: 'día inválido', schedule: [{ dayOfWeek: 8, startTime: '18:00', endTime: '19:00' }] },
  ])('H17 PUT rechaza $name y conserva franjas/revisión/ledger/auditoría', async ({ schedule }) => {
    await unchangedFailure({ ...routes()[9], body: { commandId: randomUUID(), expectedRevision: '1', schedule } });
  });
  test('H18 cambiar periodo revalida las franjas existentes sin ocurrencias, cero efectos', async () => {
    await unchangedFailure({ ...routes()[8], body: { commandId: randomUUID(), expectedRevision: '1', periodStart: '2026-10-20' } });
  });
  test('H19 replay idéntico del alta no crea segundo curso, comando o auditoría', async () => {
    const route = { method: 'POST', path: '/admin/academic/courses', body: { commandId: randomUUID(), name: 'Repetido' } };
    const first = await command<AdminCourse>(await request(route), 201); const before = await academicFingerprint(pool());
    const replay = await command<AdminCourse>(await request(route), 201);
    expect(replay.resource).toEqual(first.resource); expect(replay.command).toEqual({ ...first.command, replayed: true });
    expect(await academicFingerprint(pool())).toBe(before);
  });
  test('H20 un 404 de recurso requiere primero ruta funcional, no confundir ausencia de controlador', async () => {
    const valid = await request(routes()[1]); status(valid, 200);
    await unchangedFailure({ method: 'GET', path: `/admin/academic/courses/${randomUUID()}` }, 404, 'NOT_FOUND');
  });
});

describe('T021 autorización backend de CADA ruta de preparación', () => {
  for (const actor of ['VISITOR','STUDENT','TEACHER'] as const) for (let index = 0; index < 10; index++) {
    test(`A-${actor}-${index} devuelve ${actor === 'VISITOR' ? 401 : 403}, sin datos ni efectos`, async () => {
      const before = await academicFingerprint(pool());
      const response = await request(routes()[index], actor === 'VISITOR' ? '' : data.account(actor).sessions[0].secret);
      status(response, actor === 'VISITOR' ? 401 : 403); const body = await response.json();
      expect(body.error.code).toBe(actor === 'VISITOR' ? 'AUTH_REQUIRED' : 'FORBIDDEN');
      expect(Object.keys(body.error).sort()).toEqual(['code','message','requestId']); expect(body).not.toHaveProperty('data');
      expect(await academicFingerprint(pool())).toBe(before);
    });
  }
});
