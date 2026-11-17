import { test, expect } from '../support/enrollment-fixture';

test('harness de matrícula conecta alumno ficticio, oferta y teclado sin simular reservas', async ({ page, context, enrollment }) => {
  const actor = enrollment.actors.owner;
  expect((await fetch(`${enrollment.backendUrl}/health/ready`)).status).toBe(200);
  await context.addCookies([{ name: 'av_session_dev', value: actor.secret,
    url: 'http://localhost:5173', httpOnly: true, sameSite: 'Lax' }]);
  const me = await page.request.get('/api/v1/me');
  expect(me.status()).toBe(200);
  expect((await me.json()).data.id === actor.id).toBe(true);
  const group = await page.request.get(`/api/v1/academic/courses/${enrollment.offer.courseId}/groups/${enrollment.offer.groupId}`);
  expect(group.status()).toBe(200);
  expect((await group.json()).data.capacityStatus).toBe('NOT_CALCULATED');
  const hidden = await page.request.get(`/api/v1/academic/courses/${enrollment.offer.hiddenCourseId}/groups/${enrollment.offer.hiddenGroupId}`);
  expect(hidden.status()).toBe(404);
  await page.goto('/perfil');
  await expect(page.getByText(enrollment.account('STUDENT').name, { exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName !== 'BODY')).toBe(true);
  expect(new URL(page.url()).origin).toBe('http://localhost:5173');
  expect(enrollment.financial.persisted).toBe(false);
});
