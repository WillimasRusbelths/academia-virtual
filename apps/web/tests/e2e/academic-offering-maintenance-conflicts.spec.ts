import type { Page } from '@playwright/test';
import { test, expect } from '../support/academic-offering-fixture';
import { activate, pageFits, typeField } from '../support/accessibility';
import type { AcademicOfferingDataset } from '../../../api/tests/support/academic-offering.js';
import { commandCounts, maintenanceSeed } from '../../../api/tests/support/academic-maintenance-fixture.js';

async function enter(page: Page, data: AcademicOfferingDataset, second = false) {
  await page.context().addCookies([{ name: 'av_session_dev', value: second ? data.secondAdmin.secret : data.account('ADMIN').sessions[0].secret,
    url: 'http://localhost:5173', httpOnly: true, sameSite: 'Lax' }]);
}
async function openCancel(page: Page) {
  await activate(page, page.getByRole('button', { name: 'Cancelar grupo', exact: true })); await expect(page.getByRole('dialog')).toBeVisible();
}
async function confirm(page: Page, verb: 'withdraw' | 'cancel', status: number) {
  const response = page.waitForResponse(r => r.url().endsWith('/'+verb) && r.request().method() === 'POST');
  await activate(page, page.getByRole('dialog').getByRole('button', { name: verb === 'cancel' ? 'Confirmar cancelación' : 'Confirmar retiro', exact: true }));
  expect((await response).status()).toBe(status);
}
test('C01 cancelación obsoleta conserva motivo; comparar no adopta revisión hasta descarte explícito y nuevo ID', async ({ page, offering }) => {
  const seed = await maintenanceSeed(offering); await enter(page, offering); await page.goto(`/admin/oferta/grupos/${seed.groupId}`);
  const context = await page.context().browser()!.newContext({ viewport: page.viewportSize()! }), second = await context.newPage();
  try {
    await enter(second, offering, true); await second.goto(`/admin/oferta/grupos/${seed.groupId}`); await openCancel(second);
    await typeField(second, second.getByLabel('Motivo de cancelación', { exact: true }), 'Motivo del segundo administrador');
    await activate(page, page.getByRole('button', { name: 'Retirar grupo', exact: true })); await confirm(page, 'withdraw', 200);
    const bodies: { commandId: string; expectedRevision: string; cancellationReason: string }[] = [];
    second.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/cancel')) bodies.push(r.postDataJSON()); });
    await confirm(second, 'cancel', 409); await expect(second.getByLabel('Motivo de cancelación', { exact: true })).toHaveValue('Motivo del segundo administrador');
    await activate(second, second.getByRole('button', { name: 'Consultar datos guardados', exact: true }));
    await expect(second.getByText(/Datos guardados: Turno A · Retirado/)).toBeVisible(); expect(bodies).toHaveLength(1);
    await expect(second.getByLabel('Motivo de cancelación', { exact: true })).toHaveValue('Motivo del segundo administrador');
    await activate(second, second.getByRole('button', { name: 'Descartar edición y cargar datos guardados', exact: true }));
    await expect(second.getByRole('dialog')).toHaveCount(0); await openCancel(second);
    await typeField(second, second.getByLabel('Motivo de cancelación', { exact: true }), 'Motivo revisado conscientemente'); await confirm(second, 'cancel', 200);
    expect(bodies).toHaveLength(2); expect(bodies.map(b => b.expectedRevision)).toEqual(['1','2']); expect(bodies[0].commandId).not.toBe(bodies[1].commandId);
    expect(bodies[1].cancellationReason).toBe('Motivo revisado conscientemente');
    expect(await commandCounts(offering, bodies[0].commandId)).toEqual({ ledger: 0, audit: 0 });
    expect(await commandCounts(offering, bodies[1].commandId)).toEqual({ ledger: 1, audit: 1 });
    expect((await offering.observerPool.query('SELECT state,revision::text,"cancellationReason" FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0])
      .toEqual({ state: 'CANCELLED', revision: '3', cancellationReason: 'Motivo revisado conscientemente' }); await pageFits(second);
  } finally { await context.close(); }
});
for (const correction of [false, true]) test(`C02 cancelación 503 real: ${correction ? 'motivo corregido usa ID nuevo' : 'cerrar/reabrir conserva intención incierta sin reenvío automático'}`, async ({ page, offering }) => {
  const seed = await maintenanceSeed(offering); await enter(page, offering); await page.goto(`/admin/oferta/grupos/${seed.groupId}`); await openCancel(page);
  await typeField(page, page.getByLabel('Motivo de cancelación', { exact: true }), 'Motivo original ficticio');
  const bodies: { commandId: string; expectedRevision: string; cancellationReason: string }[] = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/cancel')) bodies.push(r.postDataJSON()); });
  await offering.context.isolated.ownerQuery('ALTER TABLE "AcademicAuditEvent" ADD CONSTRAINT maintenance_conflict_failure CHECK (false)');
  try { await confirm(page, 'cancel', 503); await expect(page.getByRole('dialog')).toContainText(/incierto/);
    await expect(page.getByLabel('Motivo de cancelación', { exact: true })).toHaveValue('Motivo original ficticio'); expect(bodies).toHaveLength(1);
    expect(await commandCounts(offering, bodies[0].commandId)).toEqual({ ledger: 0, audit: 0 }); }
  finally { await offering.context.isolated.ownerQuery('ALTER TABLE "AcademicAuditEvent" DROP CONSTRAINT maintenance_conflict_failure'); }
  if (correction) await typeField(page, page.getByLabel('Motivo de cancelación', { exact: true }), 'Motivo corregido ficticio');
  else {
    await expect(page.getByRole('dialog')).toContainText(/Salir no deshace/);
    await activate(page, page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true })); await openCancel(page);
    await expect(page.getByLabel('Motivo de cancelación', { exact: true })).toHaveValue('Motivo original ficticio');
  }
  expect(bodies).toHaveLength(1); await confirm(page, 'cancel', 200); expect(bodies).toHaveLength(2);
  expect(bodies[1].expectedRevision).toBe('1'); expect(bodies[1]).not.toHaveProperty('cancelledAt');
  if (correction) { expect(bodies[1].commandId).not.toBe(bodies[0].commandId); expect(bodies[1].cancellationReason).toBe('Motivo corregido ficticio'); }
  else expect(bodies[1]).toEqual(bodies[0]);
  expect(await commandCounts(offering, bodies[1].commandId)).toEqual({ ledger: 1, audit: 1 });
  expect((await offering.observerPool.query('SELECT state,revision::text FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0]).toEqual({ state: 'CANCELLED', revision: '2' });
});
test('C03 edición con 503 conserva aviso incierto incluso al corregir; salir no envía otro comando', async ({ page, offering }) => {
  const seed = await maintenanceSeed(offering, { firstGroupDraft: true }); await enter(page, offering); await page.goto(`/admin/oferta/grupos/${seed.groupId}`);
  await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Edición incierta'); let writes = 0;
  page.on('request', r => { if (r.method() === 'PATCH' && r.url().endsWith('/'+seed.groupId)) writes++; });
  await offering.context.isolated.ownerQuery('ALTER TABLE "AcademicAuditEvent" ADD CONSTRAINT maintenance_form_failure CHECK (false)');
  try {
    const response = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith('/'+seed.groupId));
    await activate(page, page.getByRole('button', { name: 'Guardar grupo', exact: true })); expect((await response).status()).toBe(503);
    await expect(page.getByRole('alert')).toContainText(/Salir no deshace/);
    await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Corrección todavía no enviada');
    await expect(page.getByRole('alert')).toContainText(/incierto/); expect(writes).toBe(1);
    await activate(page, page.getByRole('button', { name: 'Cancelar', exact: true }));
    await expect(page).toHaveURL(new RegExp('/admin/oferta/cursos/'+seed.courseId+'$')); expect(writes).toBe(1);
    expect((await offering.observerPool.query('SELECT name,revision::text FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0]).toEqual({ name: 'Turno A', revision: '1' });
    for (const table of ['AcademicCommand','AcademicAuditEvent']) expect((await offering.observerPool.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n).toBe(0);
  } finally { await offering.context.isolated.ownerQuery('ALTER TABLE "AcademicAuditEvent" DROP CONSTRAINT maintenance_form_failure'); }
});
