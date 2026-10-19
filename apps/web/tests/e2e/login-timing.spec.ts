import { writeFile } from 'node:fs/promises';
import { test, expect } from '../support/login-timing-fixture';

test('SC-008: veinte accesos secuenciales, desde submit hasta inicio visible', async ({ browser, identity }, info) => {
  const results: { access: number; role: string; milliseconds: number | null; valid: boolean }[] = [];
  for (let access = 1; access <= 20; access++) {
    const role = (['STUDENT', 'TEACHER', 'ADMIN'] as const)[(access - 1) % 3];
    const account = identity.account(role);
    const context = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    let milliseconds: number | null = null;
    let valid: boolean;
    try {
      await page.goto('/login');
      try {
        await page.getByLabel('Correo', { exact: true }).fill(account.email);
        await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
      } catch { throw new Error('No se pudo preparar el acceso; valores omitidos.'); }
      // Mismo reloj del navegador para ambos extremos; ninguna medición HTTP sustituye a la UI.
      await page.evaluate(({ name, label }) => {
        const root = document.documentElement;
        document.querySelector('form')!.addEventListener('submit', () => {
          const start = performance.now();
          root.dataset.loginTimingStart = String(start);
          const visible = (element: Element) => {
            const style = getComputedStyle(element);
            return element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0
              && style.display !== 'none' && style.visibility !== 'hidden';
          };
          const check = () => {
            const heading = document.querySelector('main h1');
            const paragraphs = [...document.querySelectorAll('main p')];
            if (location.pathname === '/inicio' && heading?.textContent === 'Inicio' && visible(heading)
              && [name, label].every(text => paragraphs.some(p => p.textContent === text && visible(p)))) {
              // Esperar otro frame permite pintar el inicio detectado; estimación conservadora.
              requestAnimationFrame(() => { root.dataset.loginTimingEnd = String(performance.now()); });
            } else if (performance.now() - start < 10_000) requestAnimationFrame(check);
            else root.dataset.loginTimingEnd = 'timeout';
          };
          requestAnimationFrame(check);
        }, { once: true, capture: true });
      }, { name: account.name, label: { STUDENT: 'Alumno', TEACHER: 'Docente', ADMIN: 'Administrador' }[role] });
      await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
      await page.waitForFunction(() => document.documentElement.dataset.loginTimingEnd !== undefined, { }, { timeout: 15_000 });
      milliseconds = await page.evaluate(() => {
        const { loginTimingStart, loginTimingEnd } = document.documentElement.dataset;
        return loginTimingEnd === 'timeout' ? null : Number(loginTimingEnd) - Number(loginTimingStart);
      });
      const response = await page.request.get('/api/v1/me');
      const user = response.status() === 200 ? (await response.json()).data : null;
      valid = user?.id === account.id && user?.role === role && milliseconds !== null;
      // Cierre fuera de la medición; evita acumular sesiones entre accesos.
      await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      expect((await page.request.get('/api/v1/me')).status()).toBe(401);
    } catch {
      // Retener la muestra fallida sin copiar DOM, credenciales o enlaces al reporte.
      valid = false;
    } finally { await context.close(); }
    results.push({ access, role, milliseconds, valid });
  }
  const passed = results.filter(value => value.valid && value.milliseconds !== null && value.milliseconds < 3000).length;
  const report = info.outputPath('login-timing.json');
  await writeFile(report, JSON.stringify({ date: new Date().toISOString(), browser: browser.version(),
    viewport: '1366x768', accesses: results, passed, total: results.length }, null, 2));
  await info.attach('login-timing.json', {
    path: report,
    contentType: 'application/json',
  });
  expect(results.filter(value => value.valid).length, 'accesos válidos, sin reemplazar fallos').toBe(20);
  expect(passed, 'SC-008: al menos 19/20 estrictamente por debajo de 3000 ms').toBeGreaterThanOrEqual(19);
});
