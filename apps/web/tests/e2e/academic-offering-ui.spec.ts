import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/academic-offering-fixture';
import { activate, choose, controlsAccessible, typeField, accessibleErrors } from '../support/accessibility';
import type { AcademicOfferingDataset } from '../../../api/tests/support/academic-offering.js';
import { academicFingerprint, preparationSeed } from '../../../api/tests/support/academic-preparation.js';

async function admin(page: Page, data: AcademicOfferingDataset) {
  await page.context().addCookies([{ name: 'av_session_dev', value: data.account('ADMIN').sessions[0].secret,
    url: 'http://localhost:5173', httpOnly: true, sameSite: 'Lax' }]);
}
async function openGroup(page: Page, data: AcademicOfferingDataset) {
  const seed = await preparationSeed(data.context.database.pool); await admin(page, data);
  await page.goto(`/admin/oferta/grupos/${seed.groupId}`); await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Turno A');
  return seed;
}
const groupWrite = (page: Page) => page.waitForResponse(value => value.request().method() === 'PATCH' && /\/admin\/academic\/groups\//.test(value.url()));

for (const role of ['VISITOR','STUDENT','TEACHER'] as const) test(`U01 acceso directo denegado a ${role}, sin consultar datos académicos`, async ({ page, offering }) => {
  if (role !== 'VISITOR') await page.context().addCookies([{ name: 'av_session_dev', value: offering.account(role).sessions[0].secret,
    url: 'http://localhost:5173', httpOnly: true, sameSite: 'Lax' }]);
  let academicRequests = 0; page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/v1/admin/academic/')) academicRequests++; });
  for (const path of ['/admin/oferta', '/admin/oferta/cursos/00000000-0000-4000-8000-000000000001', '/admin/oferta/grupos/00000000-0000-4000-8000-000000000001']) {
    await page.goto(path);
    if (role === 'VISITOR') await expect(page).toHaveURL(/\/login$/);
    else { await expect(page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible(); await expect(page.getByLabel('Nombre', { exact: true })).toHaveCount(0); }
  }
  expect(academicRequests).toBe(0);
});

test('U02 inicio conserva perfil, cuentas y cierre al navegar por teclado hacia oferta', async ({ page, offering }) => {
  await admin(page, offering); await page.goto('/inicio');
  await activate(page, page.getByRole('link', { name: 'Mi perfil', exact: true }));
  await expect(page.getByRole('heading', { name: /perfil/i })).toBeVisible();
  await page.goto('/inicio'); await activate(page, page.getByRole('link', { name: 'Gestionar cuentas', exact: true }));
  await expect(page.getByRole('heading', { name: 'Gestión de cuentas', exact: true })).toBeVisible();
  await page.goto('/inicio'); await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
  await activate(page, page.getByRole('link', { name: 'Gestionar oferta', exact: true }));
  await expect(page.getByRole('heading', { name: 'Gestión de oferta académica' })).toBeVisible(); await controlsAccessible(page);
});

test('U03 sesión revocada elimina borrador privado; login real no reenvía el guardado', async ({ page, offering }) => {
  await openGroup(page, offering); const account = offering.account('ADMIN');
  await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Borrador a eliminar');
  const before = await academicFingerprint(offering.observerPool); let writes = 0;
  page.on('request', request => { if (request.method() === 'PATCH' && /\/admin\/academic\/groups\//.test(request.url())) writes++; });
  await offering.context.database.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [account.sessions[0].id]);
  const response = groupWrite(page); await activate(page, page.getByRole('button', { name: 'Guardar grupo', exact: true }));
  expect((await response).status()).toBe(401); await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveCount(0);
  await typeField(page, page.getByLabel('Correo', { exact: true }), account.email);
  await typeField(page, page.getByLabel('Contraseña', { exact: true }), account.password);
  await activate(page, page.getByRole('button', { name: 'Iniciar sesión', exact: true })); await expect(page).toHaveURL(/\/inicio$/);
  await activate(page, page.getByRole('link', { name: 'Gestionar oferta', exact: true })); await expect(page.getByRole('link', { name: 'Curso preparado', exact: true })).toBeVisible();
  expect(writes).toBe(1); expect(await academicFingerprint(offering.observerPool)).toBe(before);
});

test('U04 fallo real de auditoría, rollback y reintento manual idéntico sin duplicar', async ({ page, offering }) => {
  const seed = await openGroup(page, offering); await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Reintento confirmado');
  const bodies: unknown[] = []; page.on('request', request => { if (request.method() === 'PATCH' && /\/admin\/academic\/groups\//.test(request.url())) bodies.push(request.postDataJSON()); });
  const before = await academicFingerprint(offering.observerPool);
  await offering.context.isolated.ownerQuery(`CREATE FUNCTION reject_ui_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo ficticio'; END $$;
    CREATE TRIGGER reject_ui_audit BEFORE INSERT ON "AcademicAuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_ui_audit();`);
  try {
    const response = groupWrite(page); await activate(page, page.getByRole('button', { name: 'Guardar grupo', exact: true })); expect((await response).status()).toBe(503);
    await expect(page.getByRole('alert')).toContainText(/temporalmente/i); await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Reintento confirmado');
    expect(bodies).toHaveLength(1); expect(await academicFingerprint(offering.observerPool)).toBe(before);
  } finally { await offering.context.isolated.ownerQuery('DROP TRIGGER reject_ui_audit ON "AcademicAuditEvent"; DROP FUNCTION reject_ui_audit()'); }
  const response = groupWrite(page); await activate(page, page.getByRole('button', { name: 'Reintentar', exact: true })); expect((await response).status()).toBe(200);
  await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible(); expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]);
  const commandId = (bodies[0] as { commandId: string }).commandId;
  expect((await offering.observerPool.query('SELECT name,revision::text FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0]).toEqual({ name: 'Reintento confirmado', revision: '2' });
  for (const table of ['AcademicCommand','AcademicAuditEvent']) expect((await offering.observerPool.query(`SELECT 1 FROM "${table}" WHERE "commandId"=$1`, [commandId])).rowCount).toBe(1);
});

test('U05 conflicto conserva entradas y permite comparar sin adoptar otra revisión automáticamente', async ({ page, offering }) => {
  const seed = await openGroup(page, offering);
  await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Borrador local'); await typeField(page, page.getByLabel('Capacidad máxima', { exact: true }), '25');
  const changed = await page.request.patch(`/api/v1/admin/academic/groups/${seed.groupId}`, { headers: { origin: 'http://localhost:5173', 'x-csrf-protection': '1',
    cookie: `av_session_dev=${offering.secondAdmin.secret}` }, data: { commandId: randomUUID(), expectedRevision: '1', name: 'Actualización paralela' } });
  expect(changed.status()).toBe(200); const before = await academicFingerprint(offering.observerPool);
  const response = groupWrite(page); await activate(page, page.getByRole('button', { name: 'Guardar grupo', exact: true })); expect((await response).status()).toBe(409);
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Borrador local'); await expect(page.getByLabel('Capacidad máxima', { exact: true })).toHaveValue('25');
  await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Borrador local revisado');
  await activate(page, page.getByRole('button', { name: 'Consultar datos guardados', exact: true }));
  await expect(page.getByText(/Datos guardados: Actualización paralela/)).toBeVisible(); await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Borrador local revisado');
  expect(await academicFingerprint(offering.observerPool)).toBe(before);
  await activate(page, page.getByRole('button', { name: 'Descartar edición y cargar datos guardados', exact: true }));
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Actualización paralela'); await expect(page.getByLabel('Capacidad máxima', { exact: true })).toHaveValue('1');
  expect(await academicFingerprint(offering.observerPool)).toBe(before);
});

async function selectTeacher(page: Page, teacherId: string) {
  const control = page.getByLabel('Docente asignado', { exact: true }); await expect(control).toBeEnabled();
  const index = await control.locator('option').evaluateAll((options, id) => options.findIndex(option => (option as HTMLOptionElement).value === id), teacherId);
  expect(index).toBeGreaterThan(0); await choose(page, control, index);
}
test('U06 selector mínimo permite asignar un docente real y conservarlo tras recarga', async ({ page, offering }) => {
  const seed = await openGroup(page, offering); const teacher = offering.account('TEACHER');
  await selectTeacher(page, teacher.id); const response = groupWrite(page); await activate(page, page.getByRole('button', { name: 'Guardar grupo', exact: true }));
  expect((await response).status()).toBe(200); await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel('Docente asignado', { exact: true })).toHaveValue(teacher.id);
  await expect(page.locator('main')).not.toContainText(teacher.email);
  expect((await offering.observerPool.query('SELECT "teacherUserId" FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0].teacherUserId).toBe(teacher.id);
});
test('U07 docente pierde habilitación antes de guardar: rechazo real por campo y cero efectos académicos', async ({ page, offering }) => {
  await openGroup(page, offering); const teacher = offering.account('TEACHER'); await selectTeacher(page, teacher.id);
  await offering.context.database.pool.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [teacher.id]);
  const before = await academicFingerprint(offering.observerPool); const response = groupWrite(page);
  await activate(page, page.getByRole('button', { name: 'Guardar grupo', exact: true })); expect((await response).status()).toBe(409);
  await expect(page.getByRole('alert')).toContainText('Selecciona un docente habilitado'); await accessibleErrors(page);
  expect(await academicFingerprint(offering.observerPool)).toBe(before);
});
test('U08 Enter al buscar docente consulta candidatos sin guardar ni consumir comando', async ({ page, offering }) => {
  await openGroup(page, offering); const teacher = offering.account('TEACHER'); const requests: string[] = [];
  page.on('request', request => { if (['POST','PATCH','PUT'].includes(request.method()) && /\/admin\/academic\//.test(request.url())) requests.push(request.method()); });
  const before = await academicFingerprint(offering.observerPool);
  await typeField(page, page.getByLabel('Buscar docente por nombre', { exact: true }), teacher.name);
  const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/v1/admin/academic/teachers' && new URL(value.url()).searchParams.get('q') === teacher.name);
  await page.keyboard.press('Enter'); const result = await response; expect(result.status()).toBe(200);
  expect((await result.json()).data.items.some((value: { id: string }) => value.id === teacher.id)).toBe(true);
  await expect(page.getByLabel('Docente asignado', { exact: true })).toBeEnabled(); expect(requests).toHaveLength(0);
  expect(await academicFingerprint(offering.observerPool)).toBe(before);
});
test('U09 publicado bajo curso retirado y cancelado permanecen de solo lectura', async ({ page, offering }) => {
  const seed = await preparationSeed(offering.context.database.pool); const teacher = offering.account('TEACHER');
  await offering.context.database.pool.query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`, [seed.courseId]);
  await offering.context.database.pool.query(`UPDATE "AcademicCourse" SET state='WITHDRAWN' WHERE id=$1`, [seed.courseId]);
  await offering.context.database.pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"teacherUserId"=$2,
    "publishedTeacherUserId"=$2,"publishedTeacherEligibilityVersion"=0 WHERE id=$1`, [seed.groupId, teacher.id]);
  await admin(page, offering); const before = await academicFingerprint(offering.observerPool);
  await page.goto(`/admin/oferta/grupos/${seed.groupId}`);
  await expect(page.getByLabel('Nombre', { exact: true })).toBeDisabled();
  for (const label of ['Guardar grupo','Guardar horario','Añadir franja']) await expect(page.getByRole('button', { name: label, exact: true })).toBeDisabled();
  expect(await academicFingerprint(offering.observerPool)).toBe(before);
  await offering.context.database.pool.query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Motivo ficticio',"cancelledAt"=clock_timestamp() WHERE id=$1`, [seed.groupId]);
  const cancelled = await academicFingerprint(offering.observerPool); await page.reload();
  await expect(page.getByText('El grupo está cancelado. No permite cambios ni republicación.', { exact: true })).toBeVisible();
  for (const label of ['Guardar grupo','Guardar horario','Añadir franja']) await expect(page.getByRole('button', { name: label, exact: true })).toBeDisabled();
  expect(await academicFingerprint(offering.observerPool)).toBe(cancelled);
});
