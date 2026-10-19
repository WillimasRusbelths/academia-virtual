import { test, expect } from '../support/academic-offering-fixture';

test('harness inicia API real, web loopback y sesión ficticia con teclado', async ({ page, context, offering }) => {
  const account = offering.account('STUDENT');
  expect((await fetch(`${offering.backendUrl}/health/ready`)).status).toBe(200);
  await context.addCookies([{ name: 'av_session_dev', value: account.sessions[0].secret,
    url: 'http://localhost:5173', httpOnly: true, sameSite: 'Lax' }]);
  const response = await page.request.get('/api/v1/me');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.data.id === account.id).toBe(true);
  await page.goto('/perfil');
  await expect(page.getByText(account.name, { exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName !== 'BODY')).toBe(true);
  // Limitar este smoke al harness: todavía no hay rutas ni datos de oferta académica.
  expect(new URL(page.url()).origin).toBe('http://localhost:5173');
});
