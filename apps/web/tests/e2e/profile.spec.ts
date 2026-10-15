import type { Page } from '@playwright/test';
import { test,expect } from '../support/us1-fixture';
import { restrictRead } from '../../../api/tests/support/us1-http.js';
import type { FixtureAccount } from '../../../api/tests/support/identity-fixtures.js';
import { activate,controlsAccessible,pageFits,typeField } from '../support/accessibility';

async function profile(page:Page,account:FixtureAccount){
  await page.goto('/login');
  await typeField(page,page.getByLabel('Correo',{exact:true}),account.email);
  await typeField(page,page.getByLabel('Contraseña',{exact:true}),account.password);
  const login=page.waitForResponse(response=>response.url().endsWith('/api/v1/auth/login'));
  await activate(page,page.getByRole('button',{name:'Iniciar sesión',exact:true}));expect((await login).status()).toBe(200);
  await expect.poll(()=>page.evaluate(()=>location.pathname)).toBe('/inicio');
  await activate(page,page.getByRole('link',{name:'Mi perfil',exact:true}));
  await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible();
}

for(const invalid of ['vencida','revocada'] as const)test(`perfil con sesión ${invalid}: recarga vuelve a acceso sin datos privados`,async({page,identity})=>{
  const account=identity.account();await profile(page,account);
  if(invalid==='vencida')await identity.clock!.advance(1800000);
  else await identity.context.database.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE "userId"=$1',[account.id]);
  let calls=0;page.on('request',request=>{if(request.url().endsWith('/api/v1/me'))calls++;});
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/me'));
  await page.reload();expect((await response).status()).toBe(401);
  await expect.poll(()=>page.evaluate(()=>location.pathname)).toBe('/login');
  expect((await page.locator('main').innerText()).includes(account.email)).toBe(false);expect(calls).toBe(1);
  await controlsAccessible(page);
});

test('perfil con fallo SQL: sin datos ni reintentos automáticos; recuperación explícita',async({page,identity})=>{
  const account=identity.account();await profile(page,account);
  let calls=0;page.on('request',request=>{if(request.url().endsWith('/api/v1/me'))calls++;});
  await restrictRead(identity,'User',false);
  try{
    const failed=page.waitForResponse(value=>value.url().endsWith('/api/v1/me'));
    await page.reload();expect((await failed).status()).toBe(503);
    await expect(page.getByRole('alert')).toContainText('temporalmente');
    expect((await page.locator('main').innerText()).includes(account.email)).toBe(false);
    await controlsAccessible(page);expect(calls).toBe(1);
  }finally{await restrictRead(identity,'User',true);}
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/me'));
  await activate(page,page.getByRole('button',{name:'Reintentar',exact:true}));expect((await response).status()).toBe(200);
  await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible();expect(calls).toBe(2);
  expect((await page.locator('main').innerText()).includes(account.email)).toBe(true);await pageFits(page);
});

test('perfil: nombre de 100 caracteres, lectura semántica y cierre por teclado',async({page,identity})=>{
  const account=identity.account();const name='N'.repeat(100);
  await identity.context.database.pool.query('UPDATE "User" SET name=$1 WHERE id=$2',[name,account.id]);
  await profile(page,account);expect((await page.locator('main dd').allTextContents())[0]===name).toBe(true);
  expect(await page.locator('main dt').allTextContents()).toEqual(['Nombre','Correo','Rol','Estado']);
  await controlsAccessible(page);
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/logout'));
  await activate(page,page.getByRole('button',{name:'Cerrar sesión',exact:true}));expect((await response).status()).toBe(204);
  await expect.poll(()=>page.evaluate(()=>location.pathname)).toBe('/login');
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  await page.goBack();await expect.poll(()=>page.evaluate(()=>location.pathname)).toBe('/login');
  expect((await page.locator('main').innerText()).includes(account.email)).toBe(false);await pageFits(page);
});
