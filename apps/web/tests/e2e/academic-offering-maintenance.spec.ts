import type { Page } from '@playwright/test';
import { test, expect } from '../support/academic-offering-fixture';
import { activate, accessibleErrors, controlsAccessible, pageFits, typeField } from '../support/accessibility';
import type { AcademicOfferingDataset } from '../../../api/tests/support/academic-offering.js';
import { maintenanceSeed } from '../../../api/tests/support/academic-maintenance-fixture.js';
import { academicFingerprint } from '../../../api/tests/support/academic-preparation.js';

async function enter(page: Page, data: AcademicOfferingDataset, second = false) {
  await page.context().addCookies([{ name: 'av_session_dev', value: second ? data.secondAdmin.secret : data.account('ADMIN').sessions[0].secret,
    url: 'http://localhost:5173', httpOnly: true, sameSite: 'Lax' }]);
}
async function transition(page: Page, label: string) {
  const button = page.getByRole('button', { name: label, exact: true });
  expect(await button.count(), 'T050 pendiente: acción de mantenimiento ausente, no error de fixture ni carga').toBe(1);
  await activate(page, button); await expect(page.getByRole('dialog')).toBeVisible();
}
async function confirm(page: Page, name: string, path: string) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1'+path && r.request().method() === 'POST');
  await activate(page, page.getByRole('dialog').getByRole('button', { name, exact: true }));
  expect((await response).status()).toBe(200);
}
const groupPath = (id: string) => `/admin/academic/groups/${id}`;
async function openGroup(page: Page, data: AcademicOfferingDataset, withdrawn = false) {
  const seed = await maintenanceSeed(data);
  if (withdrawn) await data.context.database.pool.query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`, [seed.groupId]);
  await enter(page, data); await page.goto(`/admin/oferta/grupos/${seed.groupId}`);
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Turno A'); return seed;
}
test('M01 SC-001 curso y dos grupos: retirar/corregir/republicar explícitamente, sin modificar hermano', async ({ page, offering }) => {
  const seed = await maintenanceSeed(offering); await enter(page, offering);
  const sibling = (await offering.observerPool.query('SELECT to_jsonb(g) AS value FROM "AcademicGroup" g WHERE id=$1', [seed.otherGroupId])).rows[0].value;
  await page.goto(`/admin/oferta/cursos/${seed.courseId}`); await expect(page.getByLabel('Nombre', { exact: true })).toBeDisabled();
  await transition(page, 'Retirar curso'); await confirm(page, 'Confirmar retiro', `/admin/academic/courses/${seed.courseId}/withdraw`);
  await expect(page.getByLabel('Nombre', { exact: true })).toBeEnabled();
  await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Curso corregido');
  const saved = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/courses/${seed.courseId}`));
  await activate(page, page.getByRole('button', { name: 'Guardar curso', exact: true })); expect((await saved).status()).toBe(200);
  expect((await offering.observerPool.query('SELECT state FROM "AcademicCourse" WHERE id=$1', [seed.courseId])).rows[0].state).toBe('WITHDRAWN');
  await transition(page, 'Publicar curso'); await confirm(page, 'Confirmar publicación', `/admin/academic/courses/${seed.courseId}/publish`);
  await page.goto(`/admin/oferta/grupos/${seed.groupId}`); await transition(page, 'Retirar grupo');
  await confirm(page, 'Confirmar retiro', groupPath(seed.groupId)+'/withdraw');
  await typeField(page, page.getByLabel('Capacidad máxima', { exact: true }), '45');
  const changed = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/groups/${seed.groupId}`));
  await activate(page, page.getByRole('button', { name: 'Guardar grupo', exact: true })); expect((await changed).status()).toBe(200);
  expect((await offering.observerPool.query('SELECT state FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0].state).toBe('WITHDRAWN');
  await transition(page, 'Publicar grupo'); await confirm(page, 'Confirmar publicación', groupPath(seed.groupId)+'/publish'); await page.reload();
  await expect(page.getByLabel('Capacidad máxima', { exact: true })).toHaveValue('45'); await expect(page.getByLabel('Nombre', { exact: true })).toBeDisabled();
  expect((await offering.observerPool.query('SELECT to_jsonb(g) AS value FROM "AcademicGroup" g WHERE id=$1', [seed.otherGroupId])).rows[0].value).toEqual(sibling);
  await controlsAccessible(page); await pageFits(page);
});
test('M02 cancelación exige motivo asociado, confirmación explícita e instante exclusivamente servidor', async ({ page, offering }) => {
  const seed = await openGroup(page, offering); const before = await academicFingerprint(offering.observerPool);
  await transition(page, 'Cancelar grupo'); await activate(page, page.getByRole('dialog').getByRole('button', { name: 'Confirmar cancelación', exact: true }));
  await accessibleErrors(page); expect(await academicFingerprint(offering.observerPool)).toBe(before);
  await typeField(page, page.getByLabel('Motivo de cancelación', { exact: true }), 'Motivo ficticio privado');
  const request = page.waitForRequest(r => r.url().endsWith('/cancel') && r.method() === 'POST');
  await confirm(page, 'Confirmar cancelación', groupPath(seed.groupId)+'/cancel');
  expect((await request).postDataJSON()).not.toHaveProperty('cancelledAt');
  await page.reload(); await expect(page.getByText('Motivo ficticio privado', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).toBeDisabled();
});
test('M03 cancelado consultable con motivo administrativo y todos los controles de edición bloqueados', async ({ page, offering }) => {
  const seed = await maintenanceSeed(offering);
  await offering.context.database.pool.query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Motivo terminal ficticio',"cancelledAt"=clock_timestamp() WHERE id=$1`, [seed.groupId]);
  await enter(page, offering); const before = await academicFingerprint(offering.observerPool); await page.goto(`/admin/oferta/grupos/${seed.groupId}`);
  await expect(page.getByLabel('Nombre', { exact: true })).toBeDisabled();
  for (const name of ['Guardar grupo','Guardar horario','Publicar grupo']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  expect(await page.getByText('Motivo terminal ficticio', { exact: true }).count(), 'T050 pendiente: motivo administrativo del cancelado no mostrado').toBe(1);
  await expect(page.getByText('Motivo terminal ficticio', { exact: true })).toBeVisible();
  expect(await academicFingerprint(offering.observerPool)).toBe(before);
});
test('M04 dos administradores conservan borrador obsoleto y exigen revisión e intención nueva', async ({ page, offering }) => {
  const seed = await openGroup(page, offering, true);
  const context = await page.context().browser()!.newContext({ viewport: page.viewportSize()! }); const second = await context.newPage();
  try {
    await enter(second, offering, true); await second.goto(`/admin/oferta/grupos/${seed.groupId}`);
    await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Primer cambio');
    await typeField(second, second.getByLabel('Nombre', { exact: true }), 'Borrador segundo');
    const first = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/groups/${seed.groupId}`));
    await activate(page, page.getByRole('button', { name: 'Guardar grupo', exact: true })); expect((await first).status()).toBe(200);
    const bodies: Record<string, unknown>[] = []; second.on('request', r => { if (r.method() === 'PATCH') bodies.push(r.postDataJSON()); });
    const stale = second.waitForResponse(r => r.request().method() === 'PATCH'); await activate(second, second.getByRole('button', { name: 'Guardar grupo', exact: true })); expect((await stale).status()).toBe(409);
    await expect(second.getByLabel('Nombre', { exact: true })).toHaveValue('Borrador segundo');
    await activate(second, second.getByRole('button', { name: 'Consultar datos guardados', exact: true }));
    await expect(second.getByText(/Datos guardados: Primer cambio/)).toBeVisible(); await expect(second.getByLabel('Nombre', { exact: true })).toHaveValue('Borrador segundo');
    await activate(second, second.getByRole('button', { name: 'Descartar edición y cargar datos guardados', exact: true }));
    await typeField(second, second.getByLabel('Nombre', { exact: true }), 'Segunda revisión consciente');
    const revised = second.waitForResponse(r => r.request().method() === 'PATCH'); await activate(second, second.getByRole('button', { name: 'Guardar grupo', exact: true })); expect((await revised).status()).toBe(200);
    expect(bodies).toHaveLength(2); expect(bodies[0].commandId).not.toBe(bodies[1].commandId); expect(bodies.map(b => b.expectedRevision)).toEqual(['1','2']);
    expect((await offering.observerPool.query('SELECT name,state,revision::text FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0])
      .toEqual({ name: 'Segunda revisión consciente', state: 'WITHDRAWN', revision: '3' });
  } finally { await context.close(); }
});
test('M05 guardar grupo retirado conserva ocultamiento; no envía publicación implícita', async ({ page, offering }) => {
  const seed = await openGroup(page, offering, true); const writes: string[] = [];
  page.on('request', r => { if (['POST','PATCH','PUT'].includes(r.method()) && /\/academic\//.test(r.url())) writes.push(r.method()); });
  await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Corregido sin publicar');
  const response = page.waitForResponse(r => r.request().method() === 'PATCH'); await activate(page, page.getByRole('button', { name: 'Guardar grupo', exact: true })); expect((await response).status()).toBe(200);
  expect(writes).toEqual(['PATCH']);
  expect((await offering.observerPool.query('SELECT state FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0].state).toBe('WITHDRAWN');
  const result = await page.request.get(`/api/v1/academic/courses/${seed.courseId}/groups/${seed.groupId}`); expect(result.status()).toBe(404);
  await page.reload(); await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Corregido sin publicar');
});
test('M06 padre retirado no habilita edición del hijo publicado; retiro propio requiere confirmación', async ({ page, offering }) => {
  const seed = await maintenanceSeed(offering); await offering.context.database.pool.query(`UPDATE "AcademicCourse" SET state='WITHDRAWN' WHERE id=$1`, [seed.courseId]);
  await enter(page, offering); await page.goto(`/admin/oferta/grupos/${seed.groupId}`); await expect(page.getByLabel('Nombre', { exact: true })).toBeDisabled();
  await transition(page, 'Retirar grupo'); await confirm(page, 'Confirmar retiro', groupPath(seed.groupId)+'/withdraw'); await expect(page.getByLabel('Nombre', { exact: true })).toBeEnabled();
});
test('M07 503 real revierte guardado, conserva formulario y repite misma intención solo manualmente', async ({ page, offering }) => {
  const seed = await openGroup(page, offering, true); await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Edición incierta ficticia');
  const before = await academicFingerprint(offering.observerPool); const bodies: unknown[] = [];
  page.on('request', r => { if (r.method() === 'PATCH') bodies.push(r.postDataJSON()); });
  await offering.context.isolated.ownerQuery('ALTER TABLE "AcademicAuditEvent" ADD CONSTRAINT maintenance_ui_audit_failure CHECK (false)');
  try {
    const response = page.waitForResponse(r => r.request().method() === 'PATCH'); await activate(page, page.getByRole('button', { name: 'Guardar grupo', exact: true })); expect((await response).status()).toBe(503);
    await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Edición incierta ficticia');
    expect(await academicFingerprint(offering.observerPool)).toBe(before); expect(bodies).toHaveLength(1);
  } finally { await offering.context.isolated.ownerQuery('ALTER TABLE "AcademicAuditEvent" DROP CONSTRAINT maintenance_ui_audit_failure'); }
  const retry = page.waitForResponse(r => r.request().method() === 'PATCH'); await activate(page, page.getByRole('button', { name: 'Reintentar', exact: true })); expect((await retry).status()).toBe(200);
  expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]);
  const id = (bodies[0] as { commandId: string }).commandId;
  for (const table of ['AcademicCommand','AcademicAuditEvent']) expect((await offering.observerPool.query(`SELECT count(*)::int AS n FROM "${table}" WHERE "commandId"=$1`, [id])).rows[0].n).toBe(1);
  expect((await offering.observerPool.query('SELECT state FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0].state).toBe('WITHDRAWN');
});
test('M08 respuesta perdida tras retiro aplicado: retry manual conserva cuerpo/ID y una sola auditoría', async ({ page, offering }) => {
  const seed = await openGroup(page, offering); let dropped = false; const bodies: string[] = [];
  await page.route('**/api/v1/admin/academic/groups/*/withdraw', async route => {
    bodies.push(route.request().postData()!);
    if (!dropped) { const result = await route.fetch(); expect(result.status()).toBe(200); dropped = true; await route.abort('failed'); } else await route.continue();
  });
  await transition(page, 'Retirar grupo'); await activate(page, page.getByRole('dialog').getByRole('button', { name: 'Confirmar retiro', exact: true }));
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible(); await expect(page.getByRole('dialog')).toContainText(/incierto|comprueba.*estado/i);
  await confirm(page, 'Confirmar retiro', groupPath(seed.groupId)+'/withdraw'); expect(bodies).toHaveLength(2); expect(bodies[0]).toBe(bodies[1]);
  const id = JSON.parse(bodies[0]).commandId;
  for (const table of ['AcademicCommand','AcademicAuditEvent']) expect((await offering.observerPool.query(`SELECT count(*)::int AS n FROM "${table}" WHERE "commandId"=$1`, [id])).rows[0].n).toBe(1);
});
test('M09 sesión revocada cancela intención de retiro y login nuevo no la reenvía', async ({ page, offering }) => {
  await openGroup(page, offering); await transition(page, 'Retirar grupo');
  const account = offering.account('ADMIN'); await offering.context.database.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [account.sessions[0].id]);
  let writes = 0; page.on('request', r => { if (r.url().endsWith('/withdraw') && r.method() === 'POST') writes++; });
  const denied = page.waitForResponse(r => r.url().endsWith('/withdraw')); await activate(page, page.getByRole('dialog').getByRole('button', { name: 'Confirmar retiro', exact: true })); expect((await denied).status()).toBe(401);
  await expect(page).toHaveURL(/\/login$/); await expect(page.getByRole('dialog')).toHaveCount(0);
  await typeField(page, page.getByLabel('Correo', { exact: true }), account.email); await typeField(page, page.getByLabel('Contraseña', { exact: true }), account.password);
  await activate(page, page.getByRole('button', { name: 'Iniciar sesión', exact: true })); await expect(page).toHaveURL(/\/inicio$/); expect(writes).toBe(1);
  expect((await offering.observerPool.query('SELECT count(*)::int AS n FROM "AcademicCommand"')).rows[0].n).toBe(0);
});
test('M10 cancelar confirmación de retiro devuelve foco, no escribe y mantiene oferta consultable', async ({ page, offering }) => {
  const seed = await openGroup(page, offering); const before = await academicFingerprint(offering.observerPool);
  await transition(page, 'Retirar grupo'); await activate(page, page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }));
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Retirar grupo', exact: true })).toBeFocused();
  expect(await academicFingerprint(offering.observerPool)).toBe(before); expect((await page.request.get(`/api/v1/academic/courses/${seed.courseId}/groups/${seed.groupId}`)).status()).toBe(200); await pageFits(page);
});
