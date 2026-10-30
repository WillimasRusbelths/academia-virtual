import type { Page } from '@playwright/test';
import { test, expect } from '../support/academic-offering-fixture';
import { activate, accessibleErrors, controlsAccessible, pageFits } from '../support/accessibility';
import type { AcademicOfferingDataset } from '../../../api/tests/support/academic-offering.js';
import { academicCatalogSeed } from '../../../api/tests/support/academic-catalog.js';
import { academicFingerprint, preparationSeed } from '../../../api/tests/support/academic-preparation.js';

async function login(page: Page, data: AcademicOfferingDataset, role: 'ADMIN'|'STUDENT'|'TEACHER' = 'STUDENT') {
  await page.context().clearCookies();
  await page.context().addCookies([{ name: 'av_session_dev', value: data.account(role).sessions[0].secret,
    url: 'http://localhost:5173', httpOnly: true, sameSite: 'Lax' }]);
  expect((await page.request.get('/api/v1/me')).status()).toBe(200);
  await page.goto('/inicio'); await expect(page.getByText(data.account(role).name, { exact: true })).toBeVisible();
}
async function catalog(page: Page) {
  const link = page.getByRole('link', { name: /^(consultar )?oferta$/i });
  expect(await link.count(), 'T041 pendiente: enlace a catálogo ausente tras identidad válida').toBe(1);
  await activate(page, link); await expect(page).toHaveURL(/\/oferta$/);
  await expect(page.getByText('Ocupación y disponibilidad no calculadas', { exact: true })).toBeVisible();
}
async function publication(page: Page, kind: 'curso'|'grupo') {
  const button = page.getByRole('button', { name: `Publicar ${kind}`, exact: true });
  expect(await button.count(), 'T039 pendiente: acción de publicación ausente en preparación real').toBe(1);
  await activate(page, button);
}
const writes = (page: Page) => {
  const events: string[] = [];
  page.on('request', r => { if (/\/api\/v1\/(admin\/)?academic\//.test(r.url()) && ['POST','PATCH','PUT','DELETE'].includes(r.method())) events.push(r.method()); });
  return events;
};
async function compare(page: Page, data: AcademicOfferingDataset, ids: { visibleCourseId: string; firstGroupId: string; secondGroupId: string }) {
  await login(page, data); await catalog(page);
  await activate(page, page.getByRole('link', { name: 'Curso visible Alfa', exact: true }));
  await expect(page).toHaveURL(new RegExp(`/oferta/cursos/${ids.visibleCourseId}$`));
  await expect(page.getByText('Descripción Alfa', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Grupo visible A', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Grupo visible B', exact: true })).toBeVisible();
  await activate(page, page.getByRole('link', { name: 'Grupo visible A', exact: true }));
  await expect(page).toHaveURL(new RegExp(`/grupos/${ids.firstGroupId}$`));
}

test('B01 US2.1 grupo incompleto informa campos y no publica parcialmente', async ({ page, offering }) => {
  const seed = await preparationSeed(offering.context.database.pool);
  await offering.context.database.pool.query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`, [seed.courseId]);
  await offering.context.database.pool.query('UPDATE "AcademicGroup" SET capacity=NULL WHERE id=$1', [seed.otherGroupId]);
  await login(page, offering, 'ADMIN');
  await page.goto(`/admin/oferta/grupos/${seed.otherGroupId}`); await expect(page.getByLabel('Nombre', { exact: true })).toBeVisible();
  const before = await academicFingerprint(offering.observerPool); await publication(page, 'grupo');
  await accessibleErrors(page); expect(await academicFingerprint(offering.observerPool)).toBe(before);
});
test('B02 US2.2 confirmación/cancelación y publicación real de curso y dos grupos, sin publicación implícita', async ({ page, offering }) => {
  const seed = await preparationSeed(offering.context.database.pool);
  await offering.context.database.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1', [offering.account('TEACHER').id]);
  await offering.context.database.pool.query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1140,1200)', [seed.otherGroupId]);
  await login(page, offering, 'ADMIN'); await page.goto(`/admin/oferta/cursos/${seed.courseId}`);
  await expect(page.getByLabel('Nombre', { exact: true })).toBeVisible(); const sent = writes(page); const before = await academicFingerprint(offering.observerPool);
  await publication(page, 'curso'); const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Curso preparado');
  await activate(page, dialog.getByRole('button', { name: 'Cancelar', exact: true }));
  expect(sent).toHaveLength(0); expect(await academicFingerprint(offering.observerPool)).toBe(before);
  await publication(page, 'curso'); const courseResponse = page.waitForResponse(r => /\/courses\/[^/]+\/publish$/.test(r.url()) && r.request().method() === 'POST');
  await activate(page, page.getByRole('dialog').getByRole('button', { name: /confirmar publicación/i })); expect((await courseResponse).status()).toBe(200);
  expect((await offering.observerPool.query('SELECT state,"publishedTeacherUserId" FROM "AcademicGroup" ORDER BY id')).rows)
    .toEqual([{ state: 'DRAFT', publishedTeacherUserId: null }, { state: 'DRAFT', publishedTeacherUserId: null }]);
  for (const id of [seed.groupId, seed.otherGroupId]) {
    await page.goto(`/admin/oferta/grupos/${id}`); await expect(page.getByLabel('Nombre', { exact: true })).toBeVisible();
    await publication(page, 'grupo'); await expect(page.getByRole('dialog')).toContainText('America/Lima');
    const response = page.waitForResponse(r => /\/groups\/[^/]+\/publish$/.test(r.url()) && r.request().method() === 'POST');
    await activate(page, page.getByRole('dialog').getByRole('button', { name: /confirmar publicación/i })); expect((await response).status()).toBe(200);
    await page.reload(); await expect(page.getByLabel('Nombre', { exact: true })).toBeDisabled();
  }
  expect((await offering.observerPool.query(`SELECT count(*)::int AS n FROM "AcademicGroup" WHERE state='PUBLISHED'`)).rows[0].n).toBe(2);
  await login(page, offering); await catalog(page); await activate(page, page.getByRole('link', { name: 'Curso preparado', exact: true }));
  for (const name of ['Turno A','Turno B']) await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
});
test('B03 US2.3/4 compara dos grupos, datos completos, capacidad máxima y privacidad, solo teclado', async ({ page, offering }) => {
  const ids = await academicCatalogSeed(offering); const before = await academicFingerprint(offering.observerPool); const sent = writes(page);
  await compare(page, offering, ids);
  for (const text of [/Curso visible Alfa/,/Grupo visible A/,/lunes/i,/18:00/,/19:00/,/2026-10-19/,/2026-10-25/,/America\/Lima/,
    /Capacidad máxima: 45 alumnos/,/Ocupación y disponibilidad no calculadas/]) await expect(page.locator('main')).toContainText(text);
  await expect(page.getByText(offering.account('TEACHER').name, { exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(offering.account('TEACHER').email);
  await expect(page.locator('main')).not.toContainText(/45 cupos disponibles|0 inscritos|agotado|Motivo ficticio privado/i);
  await expect(page.getByRole('button', { name: /comprar|reservar|matricular|pagar/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /comprar|reservar|matricular|pagar/i })).toHaveCount(0);
  await page.reload(); await expect(page.locator('main')).toContainText('Capacidad máxima: 45 alumnos');
  await page.goto(`/oferta/cursos/${ids.visibleCourseId}`); await activate(page, page.getByRole('link', { name: 'Grupo visible B', exact: true }));
  await expect(page.locator('main')).toContainText('Capacidad máxima: 50 alumnos'); await controlsAccessible(page); await pageFits(page);
  expect(sent).toHaveLength(0); expect(await academicFingerprint(offering.observerPool)).toBe(before);
});
test('B04 US2.5 vacío publicado distinto de error y sin acciones de compra', async ({ page, offering }) => {
  await login(page, offering); await catalog(page); await expect(page.getByText('No hay oferta publicada', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0); await pageFits(page);
});
test('B05 US2.5 fallo SQL real y reintento manual; nunca vacío ficticio', async ({ page, offering }) => {
  await login(page, offering); await catalog(page); await expect(page.getByText('No hay oferta publicada', { exact: true })).toBeVisible();
  const role = new URL(offering.context.environment.databaseUrl).username; if (!/^[a-z][a-z0-9_]+$/.test(role)) throw new Error('Rol de prueba inválido');
  await offering.context.isolated.ownerQuery(`REVOKE SELECT ON "AcademicCourse" FROM "${role}"`);
  try {
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/academic/courses'); await page.reload(); expect((await response).status()).toBe(503);
    await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByText('No hay oferta publicada', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Ocupación y disponibilidad no calculadas', { exact: true })).toBeVisible();
  } finally { await offering.context.isolated.ownerQuery(`GRANT SELECT ON "AcademicCourse" TO "${role}"`); }
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/academic/courses');
  await activate(page, page.getByRole('button', { name: 'Reintentar', exact: true })); expect((await response).status()).toBe(200);
  await expect(page.getByText('No hay oferta publicada', { exact: true })).toBeVisible();
  await expect(page.getByText('Ocupación y disponibilidad no calculadas', { exact: true })).toBeVisible();
});
for (const target of ['grupo','curso'] as const) test(`B06 US2.6 retirada de ${target}: enlace previo no disponible, sin causa privada`, async ({ page, offering }) => {
  const ids = await academicCatalogSeed(offering); await compare(page, offering, ids);
  if (target === 'grupo') await offering.context.database.pool.query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`, [ids.firstGroupId]);
  else await offering.context.database.pool.query(`UPDATE "AcademicCourse" SET state='WITHDRAWN' WHERE id=$1`, [ids.visibleCourseId]);
  const before = await academicFingerprint(offering.observerPool); const response = page.waitForResponse(r => new URL(r.url()).pathname.endsWith(`/groups/${ids.firstGroupId}`));
  await page.reload(); expect((await response).status()).toBe(404); await expect(page.getByText('Oferta no disponible', { exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/retirado|revisión docente|generación|Motivo ficticio privado/i);
  expect(await academicFingerprint(offering.observerPool)).toBe(before);
});
for (const actor of ['VISITOR','TEACHER'] as const) test(`B07 ${actor}: catálogo directo exige audiencia autorizada`, async ({ page, offering }) => {
  if (actor === 'TEACHER') await login(page, offering, 'TEACHER');
  await page.goto('/oferta'); await expect(page.locator('main h1')).toBeVisible();
  expect(await page.getByRole('heading', { name: 'Página no disponible', exact: true }).count(), 'T041 pendiente: ruta catálogo ausente, no denegación académica aprobada').toBe(0);
  if (actor === 'VISITOR') await expect(page).toHaveURL(/\/login$/);
  else await expect(page.getByRole('heading', { name: 'Acceso no permitido', exact: true })).toBeVisible();
});
test('B08 administrador consulta misma oferta pública, sin incidencias privadas', async ({ page, offering }) => {
  await academicCatalogSeed(offering); await login(page, offering, 'ADMIN'); await catalog(page);
  await expect(page.getByRole('link', { name: 'Curso visible Alfa', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /vacío Alfa|retirado Alfa/ })).toHaveCount(0);
  await controlsAccessible(page); await pageFits(page);
});
