import { randomUUID } from 'node:crypto';
import { resetAcademicFixture } from '../support/academic-maintenance-fixture.js';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import * as persistence from '../../src/modules/academic-offering/infrastructure/offering-queries.js';
import type { CatalogReads } from '../../src/modules/academic-offering/application/queries.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import type { Pool } from 'pg';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { academicCatalogSeed } from '../support/academic-catalog.js';
import { academicFingerprint } from '../support/academic-preparation.js';
import { sessionFixture } from '../support/session-fixture.js';

type Factory = (pool: Pool, sessions: PostgresSessionStore) => CatalogReads;
let data: AcademicOfferingDataset, sessions: PostgresSessionStore;
let seed: Awaited<ReturnType<typeof academicCatalogSeed>>;
const pool = () => data.context.database.pool;
const page = { page: 1, pageSize: 20 };
async function actor(role: 'ADMIN' | 'STUDENT' | 'TEACHER' = 'STUDENT') {
  return (await sessions.lookup(data.account(role).sessions[0].secret))!;
}
function reads() {
  const factory = (persistence as unknown as { createCatalogQueries?: Factory }).createCatalogQueries;
  expect(factory, 'T037: consultas reales de catálogo ausentes').toBeTypeOf('function');
  return factory!(pool(), sessions);
}
const operations = (who: SessionActor) => [
  () => reads().catalogCourses(who, page),
  () => reads().catalogCourse(who, seed.visibleCourseId),
  () => reads().catalogGroups(who, seed.visibleCourseId, page),
  () => reads().catalogGroup(who, seed.visibleCourseId, seed.firstGroupId),
];
beforeAll(async () => {
  data = await academicOfferingDataset('academic_catalog_layers');
  // Conexión real separada: contar consultas académicas no incluye aceptación de sesión.
  sessions = new PostgresSessionStore(data.observerPool);
}, 120000);
beforeEach(async () => {
  await resetAcademicFixture(data);
  seed = await academicCatalogSeed(data);
});
afterAll(async () => { await data?.cleanup(); });

test.each([1, 2, 3])('Q01 cursos visibles antes de página/conteo %i', async p => {
  const result = await reads().catalogCourses(await actor(), { page: p, pageSize: 1 });
  expect(result).toMatchObject({ page: p, pageSize: 1, total: 2 });
  expect(result.items.map(c => c.id)).toEqual(p === 1 ? [seed.visibleCourseId] : p === 2 ? [seed.otherCourseId] : []);
});
test('Q02 búsqueda literal recortada sin distinguir mayúsculas e inyección inerte', async () => {
  const who = await actor();
  expect((await reads().catalogCourses(who, { ...page, q: ' aLfA ' })).items.map(c => c.id)).toEqual([seed.visibleCourseId]);
  expect((await reads().catalogCourses(who, { ...page, q: "%' OR 1=1 --" })).total).toBe(0);
  expect((await reads().catalogCourses(who, { ...page, q: '  ' })).total).toBe(2);
});
test.each([1, 2, 3])('Q03 grupos visibles antes de página/conteo %i', async p => {
  const result = await reads().catalogGroups(await actor(), seed.visibleCourseId, { page: p, pageSize: 1 });
  expect(result).toMatchObject({ page: p, pageSize: 1, total: 2 });
  expect(result!.items.map(g => g.id)).toEqual(p === 1 ? [seed.firstGroupId] : p === 2 ? [seed.secondGroupId] : []);
});
test.each(['ADMIN', 'STUDENT'] as const)('Q04 %s DTO exactos y franjas/capacidad sin privados ni efectos académicos', async role => {
  const who = await actor(role), before = await academicFingerprint(pool());
  const course = await reads().catalogCourse(who, seed.visibleCourseId);
  expect(course).toEqual({ id: seed.visibleCourseId, name: 'Curso visible Alfa', description: 'Descripción Alfa' });
  const list = await reads().catalogGroups(who, seed.visibleCourseId, page);
  expect(list!.items).toHaveLength(2);
  for (const [index, group] of list!.items.entries()) {
    expect(group).toEqual({ id: index ? seed.secondGroupId : seed.firstGroupId, courseId: seed.visibleCourseId,
      name: index ? 'Grupo visible B' : 'Grupo visible A', periodStart: '2026-10-19', periodEnd: '2026-10-25',
      timeZone: 'America/Lima', capacity: index ? 50 : 45, occupancy: null, availability: null,
      capacityStatus: 'NOT_CALCULATED', teacher: { name: data.account('TEACHER').name },
      schedule: [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }] });
    expect(await reads().catalogGroup(who, seed.visibleCourseId, group.id)).toEqual(group);
  }
  expect(await academicFingerprint(pool())).toBe(before);
});
test.each(['emptyCourseId', 'hiddenCourseId'] as const)('Q05 %s e inexistente indistinguibles, sin hijos', async key => {
  const who = await actor();
  for (const id of [seed[key], randomUUID()]) {
    expect(await reads().catalogCourse(who, id)).toBeNull();
    expect(await reads().catalogGroups(who, id, page)).toBeNull();
  }
});
test.each([0, 1, 2, 3])('Q06 grupo oculto %i e inexistente indistinguibles', async index => {
  const who = await actor();
  for (const id of [seed.hiddenGroupIds[index], randomUUID(), seed.otherGroupId]) {
    expect(await reads().catalogGroup(who, seed.visibleCourseId, id)).toBeNull();
  }
  expect(await reads().catalogGroup(who, seed.hiddenCourseId, seed.hiddenParentGroupId)).toBeNull();
});
test('Q07 catálogo vacío verdadero devuelve página vacía', async () => {
  await resetAcademicFixture(data);
  expect(await reads().catalogCourses(await actor(), page)).toEqual({ ...page, total: 0, items: [] });
});
for (const loss of ['role', 'status', 'verification'] as const) test(`Q08 pérdida ${loss} y recuperación sin lectura nunca rehabilita captura`, async () => {
  const who = await actor(), before = await academicFingerprint(pool());
  expect(await reads().catalogGroup(who, seed.visibleCourseId, seed.firstGroupId)).not.toBeNull();
  const changes = loss === 'role' ? ["role='STUDENT'", "role='TEACHER'"] : loss === 'status'
    ? ["status='DISABLED',\"disabledAt\"=clock_timestamp()", "status='ACTIVE',\"disabledAt\"=NULL"]
    : ['"emailVerifiedAt"=NULL', '"emailVerifiedAt"=clock_timestamp()'];
  for (const change of changes) await pool().query(`UPDATE "User" SET ${change} WHERE id=$1`, [seed.teacherId]);
  expect(await reads().catalogGroup(who, seed.visibleCourseId, seed.firstGroupId)).toBeNull();
  expect(await reads().catalogCourse(who, seed.visibleCourseId)).toBeNull();
  expect(await reads().catalogGroups(who, seed.visibleCourseId, page)).toBeNull();
  expect(await reads().catalogCourses(who, page)).toEqual({ ...page, total: 0, items: [] });
  expect(await academicFingerprint(pool())).toBe(before);
});
test.each([0, 1, 2, 3])('Q09 operación %i ejecuta una sola sentencia de proyección real sin N+1', async index => {
  const who = await actor(); const spy = vi.spyOn(pool(), 'query');
  try {
    await operations(who)[index]();
    expect(spy).toHaveBeenCalledTimes(1);
    const sql = String(spy.mock.calls[0][0]);
    expect(sql).toContain('AcademicTeacherDirectory');
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE|FOR UPDATE)\b/);
  } finally { spy.mockRestore(); }
});
test.each([0, 1, 2, 3])('Q10 docente rechazado antes de consultar operación %i', async index => {
  const who = await actor('TEACHER'), query = reads(), spy = vi.spyOn(pool(), 'query');
  const work = [() => query.catalogCourses(who, page), () => query.catalogCourse(who, seed.visibleCourseId),
    () => query.catalogGroups(who, seed.visibleCourseId, page), () => query.catalogGroup(who, seed.visibleCourseId, seed.firstGroupId)];
  try { await expect(work[index]()).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(spy).not.toHaveBeenCalled(); }
  finally { spy.mockRestore(); }
});
test.each([0, 1, 2, 3])('Q11 sesión revocada impide entregar proyección operación %i', async index => {
  const fixture = await sessionFixture(data.context, 'STUDENT');
  const who = (await sessions.lookup(fixture.secret))!;
  await pool().query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [who.sessionId]);
  await expect(operations(who)[index]()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
});
test.each([{ page: 0 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: 51 }, { page: Number.MAX_SAFE_INTEGER },
  { state: 'PUBLISHED' }, { unknown: 1 }, { q: 1 }])('Q12 consulta inválida %j rechazada', async bad => {
  await expect(reads().catalogCourses(await actor(), { ...page, ...bad } as never)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
test('Q13 listado de grupos no admite q ni state', async () => {
  const who = await actor();
  for (const extra of [{ q: 'a' }, { state: 'PUBLISHED' }]) {
    await expect(reads().catalogGroups(who, seed.visibleCourseId, { ...page, ...extra })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
});
test('Q14 error PostgreSQL real no se convierte en vacío y recuperación conserva datos', async () => {
  const who = await actor(), query = reads(), before = await academicFingerprint(pool());
  const role = new URL(data.context.environment.databaseUrl).username;
  if (!/^[a-z][a-z0-9_]+$/.test(role)) throw new Error('Rol ficticio inválido');
  await data.context.isolated.ownerQuery(`REVOKE SELECT ON "AcademicCourse" FROM "${role}"`);
  try { await expect(query.catalogCourses(who, page)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' }); }
  finally { await data.context.isolated.ownerQuery(`GRANT SELECT ON "AcademicCourse" TO "${role}"`); }
  expect((await query.catalogCourses(who, page)).total).toBe(2);
  expect(await academicFingerprint(pool())).toBe(before);
});
