import type { Page } from '@playwright/test';
import { test, expect } from '../support/academic-offering-fixture';
import { activate, typeField, pageFits } from '../support/accessibility';
import type { AcademicOfferingDataset } from '../../../api/tests/support/academic-offering.js';
import { preparationSeed } from '../../../api/tests/support/academic-preparation.js';
import { academicCatalogSeed } from '../../../api/tests/support/academic-catalog.js';

async function enter(page: Page, data: AcademicOfferingDataset, role: 'ADMIN' | 'STUDENT' = 'ADMIN') {
  await page.context().addCookies([{ name: 'av_session_dev', value: data.account(role).sessions[0].secret,
    url: 'http://localhost:5173', httpOnly: true, sameSite: 'Lax' }]);
}
const confirming = (page: Page) => page.getByRole('dialog').getByRole('button', { name: 'Confirmar publicación', exact: true });
test('P01 edición sin guardar bloquea publicación; Escape cancela y devuelve foco sin escribir', async ({ page, offering }) => {
  const seed = await preparationSeed(offering.context.database.pool); await enter(page, offering);
  await page.goto(`/admin/oferta/cursos/${seed.courseId}`);
  await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Edición local');
  await expect(page.getByRole('button', { name: 'Publicar curso', exact: true })).toBeDisabled();
  await typeField(page, page.getByLabel('Nombre', { exact: true }), 'Curso preparado');
  await activate(page, page.getByRole('button', { name: 'Publicar curso', exact: true }));
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publicar curso', exact: true })).toBeFocused();
  expect((await offering.observerPool.query('SELECT count(*)::int AS n FROM "AcademicCommand"')).rows[0].n).toBe(0);
});
test('P02 revisión concurrente rechaza publicación; comparar no reemplaza hasta decisión explícita', async ({ page, offering }) => {
  const seed = await preparationSeed(offering.context.database.pool); await enter(page, offering);
  await page.goto(`/admin/oferta/cursos/${seed.courseId}`);
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Curso preparado');
  await offering.context.database.pool.query('UPDATE "AcademicCourse" SET revision=revision+1,name=$2 WHERE id=$1', [seed.courseId, 'Nombre actualizado']);
  await activate(page, page.getByRole('button', { name: 'Publicar curso', exact: true }));
  const response = page.waitForResponse(r => r.url().endsWith('/publish')); await activate(page, confirming(page));
  expect((await response).status()).toBe(409); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('La oferta cambió');
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Curso preparado');
  await activate(page, page.getByRole('button', { name: 'Consultar datos guardados', exact: true }));
  await expect(page.getByText(/Datos guardados: Nombre actualizado/)).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Curso preparado');
  await activate(page, page.getByRole('button', { name: 'Descartar edición y cargar datos guardados', exact: true }));
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Nombre actualizado');
  expect((await offering.observerPool.query('SELECT state FROM "AcademicCourse" WHERE id=$1', [seed.courseId])).rows[0].state).toBe('DRAFT');
});
test('P03 respuesta perdida después de commit: confirmación manual repite commandId y no duplica auditoría', async ({ page, offering }) => {
  const seed = await preparationSeed(offering.context.database.pool); await enter(page, offering);
  const bodies: string[] = []; let lost = false;
  await page.route('**/api/v1/admin/academic/courses/*/publish', async route => {
    bodies.push(route.request().postData()!);
    if (!lost) { const result = await route.fetch(); expect(result.status()).toBe(200); lost = true; await route.abort('failed'); }
    else await route.continue();
  });
  await page.goto(`/admin/oferta/cursos/${seed.courseId}`);
  await activate(page, page.getByRole('button', { name: 'Publicar curso', exact: true })); await activate(page, confirming(page));
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByText(/El resultado es incierto/)).toBeVisible();
  const response = page.waitForResponse(r => r.url().endsWith('/publish')); await activate(page, confirming(page));
  const result = await response; expect(result.status()).toBe(200); expect((await result.json()).data.command.replayed).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0); expect(bodies).toHaveLength(2); expect(bodies[0]).toBe(bodies[1]);
  const commandId = JSON.parse(bodies[0]).commandId;
  expect((await offering.observerPool.query(`SELECT (SELECT count(*)::int FROM "AcademicCommand" WHERE "commandId"=$1) AS ledger,
    (SELECT count(*)::int FROM "AcademicAuditEvent" WHERE "commandId"=$1) AS audit`, [commandId])).rows[0]).toEqual({ ledger: 1, audit: 1 });
});
test('P04 curso bloqueado por revisión docente muestra referencias académicas administrativas seguras', async ({ page, offering }) => {
  const ids = await academicCatalogSeed(offering);
  await offering.context.database.pool.query(`UPDATE "AcademicCourse" SET state='WITHDRAWN' WHERE id=$1`, [ids.visibleCourseId]);
  await enter(page, offering); await page.goto(`/admin/oferta/cursos/${ids.visibleCourseId}`);
  await activate(page, page.getByRole('button', { name: 'Publicar curso', exact: true }));
  const response = page.waitForResponse(r => r.url().endsWith('/publish')); await activate(page, confirming(page)); expect((await response).status()).toBe(409);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Revisa los grupos publicados');
  await expect(page.getByRole('dialog').getByRole('link', { name: `Revisar grupo ${ids.hiddenGroupIds[3]}` })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toContainText(offering.account('TEACHER').email); await pageFits(page);
});
test('P05 comparación paginada consulta segunda página real sin enumerar grupos ocultos', async ({ page, offering }) => {
  const ids = await academicCatalogSeed(offering);
  await offering.context.database.pool.query(`WITH copies AS (
    INSERT INTO "AcademicGroup" (id,"courseId",name,state,capacity,"periodStart","periodEnd","teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion")
    SELECT gen_random_uuid(),"courseId",'Grupo paginado '||lpad(n::text,2,'0'),state,capacity,"periodStart","periodEnd","teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion"
    FROM "AcademicGroup" CROSS JOIN generate_series(1,20) n WHERE id=$1 RETURNING id)
    INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") SELECT id,1,1080,1140 FROM copies`, [ids.firstGroupId]);
  await enter(page, offering, 'STUDENT'); await page.goto(`/oferta/cursos/${ids.visibleCourseId}`);
  await expect(page.getByRole('navigation', { name: 'Paginación de grupos' })).toContainText('22 grupos');
  await expect(page.getByRole('link', { name: 'Grupo visible A', exact: true })).toHaveCount(0);
  const response = page.waitForResponse(r => /\/groups\?page=2&/.test(r.url()));
  await activate(page, page.getByRole('button', { name: 'Página siguiente', exact: true })); expect((await response).status()).toBe(200);
  await expect(page.getByRole('link', { name: 'Grupo visible A', exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('D revisión privada'); await pageFits(page);
});
