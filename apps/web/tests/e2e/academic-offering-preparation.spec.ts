import type { BrowserContext, Page } from '@playwright/test';
import type { AcademicOfferingDataset } from '../../../api/tests/support/academic-offering.js';
import { academicFingerprint, preparationSeed } from '../../../api/tests/support/academic-preparation.js';
import { test, expect } from '../support/academic-offering-fixture';
import { activate, typeField, accessibleErrors, controlsAccessible, pageFits } from '../support/accessibility';

// Enlaces/labels accesibles del recorrido previsto; sin UI sustituta ni respuestas API simuladas.
async function session(page: Page, context: BrowserContext, offering: AcademicOfferingDataset) {
  const account = offering.account('ADMIN');
  await context.addCookies([{ name: 'av_session_dev', value: account.sessions[0].secret,
    url: 'http://localhost:5173', httpOnly: true, sameSite: 'Lax' }]);
  const response = await page.request.get('/api/v1/me'); expect(response.status()).toBe(200);
  expect((await response.json()).data.id).toBe(account.id);
  await page.goto('/inicio'); await expect(page.getByText(account.name, { exact: true })).toBeVisible();
}
async function openOffering(page: Page) {
  const link = page.getByRole('link', { name: 'Gestionar oferta', exact: true });
  // Gate por caso tras render de identidad: fallo académico explícito, no timeout de fixture.
  expect(await link.count(), 'T029 pendiente: enlace Gestionar oferta ausente').toBe(1);
  await activate(page, link); await expect(page).toHaveURL(/\/admin\/oferta$/);
}
async function groupPage(page: Page, id: string) {
  await page.goto(`/admin/oferta/grupos/${id}`); await expect(page.locator('main h1')).toBeVisible();
  expect(await page.getByRole('heading', { name: 'Página no disponible', exact: true }).count(),
    'T028/T029 pendientes: ruta académica de grupo ausente').toBe(0);
  await expect(page.getByLabel('Nombre', { exact: true })).toBeVisible();
}
const writes = (page: Page) => {
  const requests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/admin/academic/') && ['POST','PATCH','PUT'].includes(request.method())) {
      requests.push(request.method());
    }
  });
  return requests;
};

test('B01 US1.1 listado vacío con acción para crear, navegación y teclado', async ({ page, context, offering }) => {
  await session(page, context, offering); await openOffering(page);
  await expect(page.getByText(/no hay cursos/i)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await activate(page, page.getByRole('button', { name: /crear curso|nuevo curso/i }));
  await expect(page.getByLabel('Nombre', { exact: true })).toBeVisible(); await controlsAccessible(page);
});

test('B02 US1.2 crea curso y dos grupos independientes, horarios/capacidad distintos y recarga', async ({ page, context, offering }) => {
  await session(page, context, offering); await openOffering(page);
  await activate(page, page.getByRole('button', { name: /crear curso|nuevo curso/i }));
  await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Curso de recorrido');
  await typeField(page, page.getByLabel('Descripción', { exact: true }), 'Descripción ficticia');
  await activate(page, page.getByRole('button', { name: /guardar|crear curso/i }));
  await expect(page).toHaveURL(/\/admin\/oferta\/cursos\/[0-9a-f-]+$/i);
  const courseUrl = page.url(); const ids: string[] = [];
  for (const [name, capacity, startTime, endTime] of [['Turno A', '1', '18:00', '19:00'], ['Turno B', '50', '19:00', '20:00']]) {
    await page.goto(courseUrl);
    await activate(page, page.getByRole('button', { name: /crear grupo|nuevo grupo/i }));
    await typeField(page, page.getByLabel('Nombre', { exact: true }), name);
    await typeField(page, page.getByLabel(/capacidad/i), capacity);
    await page.getByLabel(/fecha de inicio/i).fill('2026-10-19'); await page.getByLabel(/fecha de fin/i).fill('2026-10-25');
    await activate(page, page.getByRole('button', { name: /guardar grupo|crear grupo|guardar cambios/i }));
    await expect(page).toHaveURL(/\/admin\/oferta\/grupos\/[0-9a-f-]+$/i);
    ids.push(page.url().split('/').at(-1)!);
    await activate(page, page.getByRole('button', { name: /añadir franja/i }));
    await page.getByLabel(/^día/i).selectOption('1');
    await page.getByLabel(/hora de inicio/i).fill(startTime); await page.getByLabel(/hora de fin/i).fill(endTime);
    await activate(page, page.getByRole('button', { name: /guardar horario/i }));
    await page.reload(); await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(name);
    await expect(page.getByLabel(/capacidad/i)).toHaveValue(capacity);
    await expect(page.getByText('America/Lima', { exact: false }).first()).toBeVisible(); await pageFits(page);
  }
  const beforeOther = (await offering.observerPool.query('SELECT to_jsonb(g) AS value FROM "AcademicGroup" g WHERE id=$1', [ids[1]])).rows;
  await groupPage(page, ids[0]); await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Turno A corregido');
  await activate(page, page.getByRole('button', { name: /guardar grupo|guardar cambios/i }));
  await page.reload(); await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Turno A corregido');
  expect((await offering.observerPool.query('SELECT to_jsonb(g) AS value FROM "AcademicGroup" g WHERE id=$1', [ids[1]])).rows).toEqual(beforeOther);
  expect((await offering.observerPool.query('SELECT name FROM "AcademicCourse" WHERE id=$1', [new URL(courseUrl).pathname.split('/').at(-1)])).rows[0].name).toBe('Curso de recorrido');
});

test('B03 US1.3 nombre inválido conserva entradas, error asociado y cero guardado parcial', async ({ page, context, offering }) => {
  await session(page, context, offering); await openOffering(page);
  await activate(page, page.getByRole('button', { name: /crear curso|nuevo curso/i }));
  await typeField(page, page.getByLabel('Nombre', { exact: true }), '   ');
  await typeField(page, page.getByLabel('Descripción', { exact: true }), 'Conservar entrada');
  const before = await academicFingerprint(offering.observerPool);
  await activate(page, page.getByRole('button', { name: /guardar|crear curso/i }));
  await accessibleErrors(page); await expect(page.getByLabel('Descripción', { exact: true })).toHaveValue('Conservar entrada');
  expect(await academicFingerprint(offering.observerPool)).toBe(before);
});

test('B04 US1.4 cancelar alta vuelve al listado sin petición de escritura', async ({ page, context, offering }) => {
  await session(page, context, offering); await openOffering(page); const requests = writes(page);
  const before = await academicFingerprint(offering.observerPool);
  await activate(page, page.getByRole('button', { name: /crear curso|nuevo curso/i }));
  await typeField(page, page.getByLabel('Nombre', { exact: true }), 'No crear');
  await activate(page, page.getByRole('button', { name: 'Cancelar', exact: true }));
  await expect(page).toHaveURL(/\/admin\/oferta$/); expect(requests).toHaveLength(0);
  expect(await academicFingerprint(offering.observerPool)).toBe(before);
});

test('B05 US1.4 cancelar edición conserva datos y puede recorrerse solo con teclado', async ({ page, context, offering }) => {
  const seed = await preparationSeed(offering.context.database.pool);
  await session(page, context, offering); await groupPage(page, seed.groupId);
  const requests = writes(page); const before = await academicFingerprint(offering.observerPool);
  await typeField(page, page.getByLabel('Nombre', { exact: true }), 'No aplicar');
  await typeField(page, page.getByLabel(/capacidad/i), '50');
  await activate(page, page.getByRole('button', { name: 'Cancelar', exact: true }));
  await expect(page).toHaveURL(new RegExp(`/admin/oferta(?:/cursos/${seed.courseId})?$`));
  expect(requests).toHaveLength(0); expect(await academicFingerprint(offering.observerPool)).toBe(before);
  await groupPage(page, seed.groupId); await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Turno A');
  await expect(page.getByLabel(/capacidad/i)).toHaveValue('1'); await controlsAccessible(page);
});

for (const value of ['', '0', '-1', '1.5', '51']) test(`B06 US1.5 capacidad inválida ${JSON.stringify(value)} conserva entrada y datos`, async ({ page, context, offering }) => {
  const seed = await preparationSeed(offering.context.database.pool);
  await session(page, context, offering); await groupPage(page, seed.groupId);
  const before = await academicFingerprint(offering.observerPool);
  await typeField(page, page.getByLabel(/capacidad/i), value);
  await activate(page, page.getByRole('button', { name: /guardar grupo|guardar cambios/i }));
  await expect(page.getByText('La capacidad debe ser un número entero entre 1 y 50', { exact: false })).toBeVisible();
  await accessibleErrors(page); await expect(page.getByLabel(/capacidad/i)).toHaveValue(value);
  expect(await academicFingerprint(offering.observerPool)).toBe(before);
});

test('B07 US1.6 franjas contiguas, fechas inclusivas y America/Lima persisten tras recarga', async ({ page, context, offering }) => {
  const seed = await preparationSeed(offering.context.database.pool);
  await session(page, context, offering); await groupPage(page, seed.groupId);
  await activate(page, page.getByRole('button', { name: /añadir franja/i }));
  await page.getByLabel(/^día/i).nth(1).selectOption('1');
  await page.getByLabel(/hora de inicio/i).nth(1).fill('19:00'); await page.getByLabel(/hora de fin/i).nth(1).fill('20:00');
  await activate(page, page.getByRole('button', { name: /guardar horario/i })); await page.reload();
  await expect(page.getByLabel(/hora de inicio/i).nth(0)).toHaveValue('18:00');
  await expect(page.getByLabel(/hora de inicio/i).nth(1)).toHaveValue('19:00');
  await expect(page.getByLabel(/fecha de inicio/i)).toHaveValue('2026-10-19');
  await expect(page.getByLabel(/fecha de fin/i)).toHaveValue('2026-10-25');
  await expect(page.getByText('America/Lima', { exact: false }).first()).toBeVisible(); await controlsAccessible(page);
  expect((await offering.observerPool.query('SELECT count(*)::int AS n FROM "AcademicSlot" WHERE "groupId"=$1', [seed.groupId])).rows[0].n).toBe(2);
});

for (const [start, end] of [['18:00', '18:00'], ['19:00', '18:00'], ['23:00', '01:00']]) test(`B08 US1.6 horas inválidas ${start}–${end}, sin persistencia parcial`, async ({ page, context, offering }) => {
  const seed = await preparationSeed(offering.context.database.pool);
  await session(page, context, offering); await groupPage(page, seed.groupId);
  const before = await academicFingerprint(offering.observerPool);
  await page.getByLabel(/hora de inicio/i).fill(start); await page.getByLabel(/hora de fin/i).fill(end);
  await activate(page, page.getByRole('button', { name: /guardar horario/i }));
  await accessibleErrors(page); await expect(page.getByLabel(/hora de inicio/i)).toHaveValue(start);
  expect(await academicFingerprint(offering.observerPool)).toBe(before);
});

test('B09 listado fallido por permiso SQL real muestra error/reintento, nunca vacío ficticio', async ({ page, context, offering }) => {
  await session(page, context, offering); await openOffering(page);
  const role = new URL(offering.context.environment.databaseUrl).username;
  if (!/^[a-z][a-z0-9_]+$/.test(role)) throw new Error('Rol de ensayo inválido.');
  await offering.context.isolated.ownerQuery(`REVOKE SELECT ON "AcademicCourse" FROM "${role}"`);
  try {
    const failure = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/admin/academic/courses');
    await page.reload(); expect((await failure).status()).toBe(503);
    await expect(page.getByRole('alert')).toContainText(/temporalmente|error/i);
    await expect(page.getByText(/no hay cursos/i)).toHaveCount(0);
  } finally { await offering.context.isolated.ownerQuery(`GRANT SELECT ON "AcademicCourse" TO "${role}"`); }
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/admin/academic/courses');
  await activate(page, page.getByRole('button', { name: 'Reintentar', exact: true })); expect((await response).status()).toBe(200);
  await expect(page.getByText(/no hay cursos/i)).toBeVisible();
});

for (const problem of ['duplicado', 'solapamiento', 'periodo invertido', 'sin ocurrencia']) test(`B10 US1.6 ${problem}: rechazo por campo y datos intactos`, async ({ page, context, offering }) => {
  const seed = await preparationSeed(offering.context.database.pool);
  await session(page, context, offering); await groupPage(page, seed.groupId);
  const before = await academicFingerprint(offering.observerPool);
  if (problem === 'duplicado' || problem === 'solapamiento') {
    await activate(page, page.getByRole('button', { name: /añadir franja/i }));
    await page.getByLabel(/^día/i).nth(1).selectOption('1');
    await page.getByLabel(/hora de inicio/i).nth(1).fill(problem === 'duplicado' ? '18:00' : '18:30');
    await page.getByLabel(/hora de fin/i).nth(1).fill(problem === 'duplicado' ? '19:00' : '19:30');
    await activate(page, page.getByRole('button', { name: /guardar horario/i }));
  } else {
    await page.getByLabel(/fecha de inicio/i).fill(problem === 'sin ocurrencia' ? '2026-10-20' : '2026-10-26');
    await activate(page, page.getByRole('button', { name: /guardar grupo|guardar cambios/i }));
  }
  await accessibleErrors(page); expect(await academicFingerprint(offering.observerPool)).toBe(before);
});
