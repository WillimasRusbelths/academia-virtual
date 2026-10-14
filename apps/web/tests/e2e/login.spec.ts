import type { Page } from '@playwright/test';
import { test, expect } from '../support/us1-fixture';
import type { FixtureAccount } from '../../../api/tests/support/identity-fixtures.js';

test.afterEach(async({page})=>{
  await page.locator('input[type="password"]').evaluateAll(inputs=>{
    for(const input of inputs)(input as HTMLInputElement).value='';
  }).catch(()=>undefined);
});
async function login(page:Page,account:FixtureAccount,password=account.password) {
  await page.goto('/login');
  const email=page.getByLabel(/correo/i);const credential=page.getByLabel(/contraseña/i);
  await expect(email).toBeVisible();await expect(credential).toBeVisible();
  // No incluir valores privados en errores ni artefactos de Playwright.
  try {await email.fill(account.email);await credential.fill(password);}
  catch {throw new Error('No se pudieron completar los campos de acceso. Valores omitidos.');}
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/login')&&value.request().method()==='POST');
  await page.getByRole('button',{name:/iniciar sesión|acceder|entrar/i}).click();
  return response;
}
async function noPrivateStorage(page:Page) {
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
  expect(await page.evaluate(()=>history.state)).toBeNull();
  expect(await page.evaluate(()=>!document.cookie.includes('av_session_dev'))).toBe(true);
}
test('control: aplicación real, proxy y sesión válida en PostgreSQL',async({page,identity})=>{
  expect((await page.goto('/'))?.status()).toBe(200);
  await expect(page.locator('#root')).not.toBeEmpty();
  const response=await page.request.get('/api/v1/me');
  // Diagnóstico de infraestructura, no aceptación: composición actual carece de /me.
  expect([200,401,404].includes(response.status())).toBe(true);
  expect(response.headers()['cache-control']).toBe('no-store');
  const {PostgresSessionStore}=await import('../../../api/src/modules/identity/infrastructure/session-store.js');
  expect((await new PostgresSessionStore(identity.context.database.pool).lookup(identity.account().sessions[0].secret))!==null).toBe(true);
});
for(const size of [{width:360,height:800},{width:1366,height:768}]) {
  for(const role of ['STUDENT','TEACHER','ADMIN'] as const) {
    test(`login/inicio/logout/atrás ${role} en ${size.width}`,async({page,context,identity})=>{
      await page.setViewportSize(size);const account=identity.account(role);
      expect((await login(page,account)).status()).toBe(200);
      await expect(page).toHaveURL(/\/inicio$/);
      const profile=page.waitForResponse(response=>response.url().endsWith('/api/v1/me'));
      await page.reload();expect((await profile).status()).toBe(200);
      await expect(page.getByText(account.name,{exact:true})).toBeVisible();
      const roleLabel={STUDENT:/^(alumno|estudiante|student)$/i,TEACHER:/^(docente|teacher)$/i,ADMIN:/^(administrador|admin)$/i};
      await expect(page.getByText(roleLabel[role])).toBeVisible();
      // Etiqueta visible de rol puede estar traducida; el contrato contiene exactamente un rol.
      const view=await page.request.get('/api/v1/me');expect((await view.json()).data.role===role).toBe(true);
      await noPrivateStorage(page);
      const logout=page.waitForResponse(response=>response.url().endsWith('/api/v1/auth/logout'));
      await page.getByRole('button',{name:/cerrar sesión/i}).click();expect((await logout).status()).toBe(204);
      await expect(page).toHaveURL(/\/login$/);await expect(page.getByText(account.name,{exact:true})).toHaveCount(0);
      expect((await page.request.get('/api/v1/me')).status()).toBe(401);
      expect((await context.cookies()).some(cookie=>cookie.name==='av_session_dev')).toBe(false);
      await page.goBack();await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByText(account.name,{exact:true})).toHaveCount(0);await noPrivateStorage(page);
    });
  }
  test(`credenciales incorrectas y recarga sin contraseña en ${size.width}`,async({page,identity})=>{
    await page.setViewportSize(size);const response=await login(page,identity.account(),'contraseña-incorrecta-sintética');
    expect(response.status()).toBe(401);await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);await page.reload();
    expect((await page.getByLabel(/contraseña/i).inputValue()).length).toBe(0);await noPrivateStorage(page);
  });
  for(const expiration of ['inactividad','absoluta'] as const) {
    test(`V04-A: ${expiration}, /me limpia UI y vuelve a login sin replay en ${size.width}`,async({page,identity})=>{
      await page.setViewportSize(size);const account=identity.account();expect((await login(page,account)).status()).toBe(200);
      await expect(page.getByText(account.name,{exact:true})).toBeVisible();
      if(expiration==='absoluta') {
        // Mantener actividad reciente permite aislar el límite de ocho horas.
        await identity.context.database.pool.query(`UPDATE "Session" SET "lastAcceptedAt"="createdAt"+interval '7 hours 59 minutes' WHERE "userId"=$1`,[account.id]);
      }
      await identity.clock!.advance(expiration==='inactividad'?1800000:28800000);
      let calls=0;page.on('request',request=>{if(request.url().endsWith('/api/v1/me'))calls++;});
      const expired=page.waitForResponse(response=>response.url().endsWith('/api/v1/me'));
      await page.reload();expect((await expired).status()).toBe(401);
      await expect(page).toHaveURL(/\/login$/);await expect(page.getByText(account.name,{exact:true})).toHaveCount(0);
      expect(calls).toBe(1);expect((await page.getByLabel(/contraseña/i).inputValue()).length).toBe(0);await noPrivateStorage(page);
    });
  }
}
