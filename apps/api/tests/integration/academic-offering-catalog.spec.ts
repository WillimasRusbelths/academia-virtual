import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { academicCatalogSeed } from '../support/academic-catalog.js';
import { academicFingerprint } from '../support/academic-preparation.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';

let data: AcademicOfferingDataset, http: Us1Http, seed: Awaited<ReturnType<typeof academicCatalogSeed>>;
const pool = () => data.observerPool;
const student = () => data.account('STUDENT').sessions[0].secret;
const routes = () => ['/academic/courses', `/academic/courses/${seed.visibleCourseId}`,
  `/academic/courses/${seed.visibleCourseId}/groups`, `/academic/courses/${seed.visibleCourseId}/groups/${seed.firstGroupId}`];
async function get(path: string, expected = 200, secret = student()) {
  const response = await http.get(path, secret);
  expect(response.status, `T037/T038 pendientes: catálogo real debe responder ${expected}; 404 de ruta ausente no aprueba el caso`).toBe(expected);
  return response;
}
async function unavailable(path: string) {
  // Control positivo obligatorio: no interpretar ausencia de todo el controlador como 404 válido.
  await get(routes()[3]); const before = await academicFingerprint(pool()); const response = await get(path, 404);
  const body = await response.json(); expect(Object.keys(body.error).sort()).toEqual(['code','message','requestId']);
  expect(body.error).toMatchObject({ code: 'NOT_FOUND', message: expect.any(String), requestId: expect.any(String) });
  expect(body).not.toHaveProperty('data'); expect(await academicFingerprint(pool())).toBe(before);
  return { code: body.error.code, message: body.error.message };
}
beforeAll(async () => { data = await academicOfferingDataset('academic_catalog'); http = await us1Http(data); }, 120000);
beforeEach(async () => {
  await data.context.isolated.ownerQuery('TRUNCATE "AcademicAuditEvent","AcademicCommand","AcademicSlot","AcademicGroup","AcademicCourse"');
  seed = await academicCatalogSeed(data);
});
afterAll(async () => { try { await http?.close(); } finally { await data?.cleanup(); } });

describe('T033 controles del contexto; NO catálogo implementado', () => {
  test('I01 composición real, observador separado y fixture oculta por generación real', async () => {
    expect((await http.get('/me', student())).status).toBe(200);
    const a = (await http.database.pool.query('SELECT pg_backend_pid() AS pid,current_schema() AS schema')).rows[0];
    const b = (await pool().query('SELECT pg_backend_pid() AS pid,current_schema() AS schema')).rows[0];
    expect(a.pid).not.toBe(b.pid); expect(a.schema).toBe(b.schema); expect(a.schema).toBe(data.context.isolated.schema);
    const current = (await pool().query('SELECT "eligibilityVersion"::text AS v FROM "AcademicTeacherDirectory" WHERE "userId"=$1', [seed.staleTeacherId])).rows[0];
    const old = (await pool().query('SELECT "publishedTeacherEligibilityVersion"::text AS v FROM "AcademicGroup" WHERE id=$1', [seed.hiddenGroupIds[3]])).rows[0];
    expect(BigInt(current.v)).toBe(BigInt(old.v) + 1n);
  });
  test('I02 proyección administrativa existente conserva capacidad y revisión, sin GET con efectos', async () => {
    const before = await academicFingerprint(pool()); const response = await http.get(`/admin/academic/groups/${seed.hiddenGroupIds[3]}`, data.account('ADMIN').sessions[0].secret);
    expect(response.status).toBe(200); expect((await response.json()).data).toMatchObject({ studentVisible: false, teacherReviewRequired: true,
      capacity: 45, occupancy: null, availability: null, capacityStatus: 'NOT_CALCULATED' });
    expect(await academicFingerprint(pool())).toBe(before);
  });
});
describe('T033 catálogo HTTP/PG real — FR-006/009/010/011', () => {
  test('C01 vacío es 200 con página vacía; no falso error o disponibilidad', async () => {
    await data.context.isolated.ownerQuery('TRUNCATE "AcademicSlot","AcademicGroup","AcademicCourse"');
    expect((await (await get(routes()[0])).json()).data).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });
  test.each([1,2,3])('C02 filtra ocultos antes de contar/paginar cursos: página %i', async page => {
    const value = (await (await get(`/academic/courses?page=${page}&pageSize=1`)).json()).data;
    expect(value).toMatchObject({ page, pageSize: 1, total: 2 });
    expect(value.items.map((i: { id: string }) => i.id)).toEqual(page === 1 ? [seed.visibleCourseId] : page === 2 ? [seed.otherCourseId] : []);
  });
  test('C03 q recortado y sin distinguir mayúsculas; solo cuenta coincidencias visibles', async () => {
    const value = (await (await get('/academic/courses?q=%20aLfA%20&pageSize=1')).json()).data;
    expect(value.total).toBe(1); expect(value.items.map((i: { id: string }) => i.id)).toEqual([seed.visibleCourseId]);
  });
  for (const role of ['ADMIN','STUDENT'] as const) for (let index = 0; index < 4; index++) test(`C04 ${role} ruta ${index}: DTO cerrado sin privados ni ocupación ficticia`, async () => {
    const before = await academicFingerprint(pool()); const response = await get(routes()[index], 200, data.account(role).sessions[0].secret);
    expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    const value = (await response.json()).data; const items = index === 0 || index === 2 ? value.items : [value];
    for (const item of items) {
      if (index < 2) expect(Object.keys(item).sort()).toEqual(['id','name','description'].sort());
      else {
        expect(Object.keys(item).sort()).toEqual(['id','courseId','name','periodStart','periodEnd','timeZone','capacity','occupancy','availability','capacityStatus','schedule','teacher'].sort());
        expect(item).toMatchObject({ occupancy: null, availability: null, capacityStatus: 'NOT_CALCULATED', timeZone: 'America/Lima', periodStart: '2026-10-19', periodEnd: '2026-10-25' });
        expect([45,50]).toContain(item.capacity); expect(Object.keys(item.teacher)).toEqual(['name']);
        expect(item.schedule).toEqual([{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }]);
      }
    }
    expect(JSON.stringify(value)).not.toContain(data.account('TEACHER').email);
    expect(await academicFingerprint(pool())).toBe(before);
  });
  test.each([1,2,3])('C05 grupos: filtro antes de página %i, total no revela cuatro hijos ocultos', async page => {
    const value = (await (await get(`/academic/courses/${seed.visibleCourseId}/groups?page=${page}&pageSize=1`)).json()).data;
    expect(value).toMatchObject({ total: 2, page, pageSize: 1 });
    expect(value.items.map((g: { id: string }) => g.id)).toEqual(page === 1 ? [seed.firstGroupId] : page === 2 ? [seed.secondGroupId] : []);
  });
  test.each([0,1,2,3])('C06 grupo oculto %i y grupo inexistente son indistinguibles', async index => {
    expect(await unavailable(`/academic/courses/${seed.visibleCourseId}/groups/${seed.hiddenGroupIds[index]}`))
      .toEqual(await unavailable(`/academic/courses/${seed.visibleCourseId}/groups/${randomUUID()}`));
  });
  test('C07 grupo visible de otro curso no se filtra por enlace manipulado', async () => {
    expect(await unavailable(`/academic/courses/${seed.visibleCourseId}/groups/${seed.otherGroupId}`))
      .toEqual(await unavailable(`/academic/courses/${seed.visibleCourseId}/groups/${randomUUID()}`));
  });
  for (const kind of ['emptyCourseId','hiddenCourseId'] as const) test(`C08 curso ${kind} no se entrega ni enumera hijos`, async () => {
    const missing = await unavailable(`/academic/courses/${randomUUID()}`);
    expect(await unavailable(`/academic/courses/${seed[kind]}`)).toEqual(missing);
    expect(await unavailable(`/academic/courses/${seed[kind]}/groups`)).toEqual(missing);
  });
  for (const actor of ['VISITOR','TEACHER'] as const) for (let index = 0; index < 4; index++) test(`C09 ${actor} ruta ${index}: denegación sin datos`, async () => {
    const before = await academicFingerprint(pool()); const response = await get(routes()[index], actor === 'VISITOR' ? 401 : 403,
      actor === 'VISITOR' ? '' : data.account(actor).sessions[0].secret);
    const body = await response.json(); expect(body.error.code).toBe(actor === 'VISITOR' ? 'AUTH_REQUIRED' : 'FORBIDDEN');
    expect(Object.keys(body.error).sort()).toEqual(['code','message','requestId']); expect(body).not.toHaveProperty('data');
    expect(await academicFingerprint(pool())).toBe(before);
  });
  test.each(['page=0','page=1.5','pageSize=0','pageSize=51','q=a&q=b','state=PUBLISHED','unknown=1'])('C10 query inválida %s no abre filtros administrativos', async query => {
    const before = await academicFingerprint(pool()); const response = await get(`/academic/courses?${query}`, 400);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR'); expect(await academicFingerprint(pool())).toBe(before);
  });
  test('C11 grupo/listado no admite búsqueda q ni detalle parámetros desconocidos', async () => {
    for (const path of [routes()[2] + '?q=privado', routes()[1] + '?page=1', routes()[3] + '?state=PUBLISHED']) {
      expect((await (await get(path, 400)).json()).error.code).toBe('VALIDATION_ERROR');
    }
  });
  test('C12 pérdida y recuperación sin lecturas oculta futuras consultas; ninguna lectura renueva captura', async () => {
    await get(routes()[3]); const before = await academicFingerprint(pool());
    await pool().query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [seed.teacherId]);
    await pool().query(`UPDATE "User" SET status='ACTIVE',"disabledAt"=NULL WHERE id=$1`, [seed.teacherId]);
    const response = await get(routes()[3], 404); expect((await response.json()).error.code).toBe('NOT_FOUND');
    const courses = (await (await get(routes()[0])).json()).data; expect(courses.total).toBe(0); expect(courses.items).toEqual([]);
    expect(await academicFingerprint(pool())).toBe(before);
  });
  test('C13 fallo PostgreSQL real devuelve 503; recuperar permisos vuelve a ofrecer mismos datos', async () => {
    await get(routes()[0]); const role = new URL(data.context.environment.databaseUrl).username;
    if (!/^[a-z][a-z0-9_]+$/.test(role)) throw new Error('Rol ficticio inválido'); const before = await academicFingerprint(pool());
    await data.context.isolated.ownerQuery(`REVOKE SELECT ON "AcademicCourse" FROM "${role}"`);
    try { expect((await (await get(routes()[0], 503)).json()).error.code).toBe('TEMPORARILY_UNAVAILABLE'); }
    finally { await data.context.isolated.ownerQuery(`GRANT SELECT ON "AcademicCourse" TO "${role}"`); }
    expect((await (await get(routes()[0])).json()).data.total).toBe(2); expect(await academicFingerprint(pool())).toBe(before);
  });
  test('C14 texto con sintaxis SQL no altera consulta, permisos o datos', async () => {
    const before = await academicFingerprint(pool());
    expect((await (await get('/academic/courses?q=' + encodeURIComponent("%' OR 1=1 --"))).json()).data.total).toBe(0);
    expect(await academicFingerprint(pool())).toBe(before);
  });
});
