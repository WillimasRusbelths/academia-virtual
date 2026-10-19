import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test,expect } from '../support/us2-fixture';
import type { Us2Dataset } from '../../../api/tests/support/us2.js';

const headers={Origin:'http://localhost:5173','X-CSRF-Protection':'1'};
async function authenticate(page:Page,data:Us2Dataset,role:'ADMIN'|'STUDENT'|'TEACHER'='ADMIN') {
  const actor=data.account(role);
  const response=await page.request.post('/api/v1/auth/login',{headers,data:{email:actor.email,password:actor.password}});
  expect(response.status()).toBe(200);
}
async function clean(page:Page) {
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length+location.hash.length+location.search.length)).toBe(0);
  expect(await page.evaluate(()=>history.state)).toBeNull();
  expect(await page.evaluate(()=>document.cookie.includes('av_session_dev'))).toBe(false);
}
test.beforeEach(async({identity})=>{await identity.pauseMail();});
for(const width of [360,1366]) {
  test(`visitante: rutas protegidas directas y atrás no muestran datos en ${width}`,async({page,identity})=>{
    await page.setViewportSize({width,height:800});let administrative=0;
    page.on('request',request=>{if(request.url().includes('/api/v1/admin/users'))administrative++;});
    for(const path of ['/inicio','/admin/cuentas',`/admin/cuentas/${identity.account().id}`]) {
      const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/me'));
      await page.goto(path);expect((await response).status()).toBe(401);await expect(page).toHaveURL(/\/login$/);
      await expect(page.locator('.account-list li')).toHaveCount(0);
      await expect(page.getByLabel('Credencial provisional',{exact:true})).toHaveCount(0);
    }
    expect(administrative).toBe(0);await page.goBack();await expect(page).toHaveURL(/\/login$/);await clean(page);
  });

  for(const role of ['STUDENT','TEACHER'] as const)test(`${role}: guarda visual y denegación independiente de API en ${width}`,async({page,identity})=>{
    await page.setViewportSize({width,height:800});await authenticate(page,identity,role);let administrative=0;
    page.on('request',request=>{if(request.url().includes('/api/v1/admin/users'))administrative++;});
    for(const path of ['/admin/cuentas',`/admin/cuentas/${identity.account().id}`]) {
      await page.goto(path);await expect(page.getByRole('alert')).toHaveText('No tienes permiso para esta acción.');
      await expect(page.locator('.account-list li')).toHaveCount(0);await expect(page.getByLabel('Nombre',{exact:true})).toHaveCount(0);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    expect(administrative).toBe(0); // La guarda evita montar la UI; no concede ningún permiso.
    for(const path of ['/admin/users',`/admin/users/${identity.account().id}`]) {
      const response=await page.request.get('/api/v1'+path);expect(response.status()).toBe(403);
      expect((await response.json()).error.code).toBe('FORBIDDEN');
    }
    expect((await page.request.get('/api/v1/me')).status()).toBe(200);await clean(page);
  });

  test(`ADMIN: hidratación directa, recarga y salida de datos abiertos tras 401 en ${width}`,async({page,identity})=>{
    await page.setViewportSize({width,height:800});await authenticate(page,identity);
    await page.goto('/admin/cuentas');await expect(page.locator('.account-list li')).toHaveCount(12);
    await page.reload();await expect(page.locator('.account-list li')).toHaveCount(12);
    await page.getByRole('button',{name:'Nueva cuenta',exact:true}).click();
    const provisional=identity.account().password;
    try{await page.getByLabel('Nombre',{exact:true}).fill('Cuenta aún no enviada');await page.getByLabel('Correo',{exact:true}).fill(`${randomUUID()}@example.test`);
      await page.getByLabel('Credencial provisional',{exact:true}).fill(provisional);}
    catch{throw new Error('Formulario aislado no disponible. Valores omitidos.');}
    await identity.context.database.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE "userId"=$1',[identity.account('ADMIN').id]);
    let creations=0;page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/v1/admin/users'))creations++;});
    const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/admin/users')&&value.request().method()==='POST');
    await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();expect((await response).status()).toBe(401);
    await expect(page).toHaveURL(/\/login$/);await expect(page.getByText('Debes volver a iniciar sesión.')).toBeVisible();
    await expect(page.locator('.account-list li')).toHaveCount(0);await expect(page.getByLabel('Credencial provisional',{exact:true})).toHaveCount(0);
    expect(await page.getByLabel('Contraseña',{exact:true}).inputValue().then(value=>value.length)).toBe(0);
    await authenticate(page,identity);await page.goto('/admin/cuentas');await expect(page.locator('.account-list li')).toHaveCount(12);
    expect(creations).toBe(1);await expect(page.getByLabel('Credencial provisional',{exact:true})).toHaveCount(0);await clean(page);
  });

  test(`detalle abierto: caducidad limpia edición y conserva BD en ${width}`,async({page,identity})=>{
    await page.setViewportSize({width,height:800});await authenticate(page,identity);const target=identity.account();
    await page.goto(`/admin/cuentas/${target.id}`);await expect(page.getByLabel('Nombre',{exact:true})).toBeVisible();
    await page.getByLabel('Nombre',{exact:true}).fill('Cambio que no debe persistir');
    await identity.clock!.advance(1800000);let mutations=0;
    page.on('request',request=>{if(request.method()==='PATCH')mutations++;});
    const response=page.waitForResponse(value=>value.url().endsWith(`/${target.id}/name`));
    await page.getByRole('button',{name:'Guardar nombre',exact:true}).click();expect((await response).status()).toBe(401);
    await expect(page).toHaveURL(/\/login$/);await expect(page.getByLabel('Nombre',{exact:true})).toHaveCount(0);
    expect((await identity.context.database.pool.query('SELECT name FROM "User" WHERE id=$1',[target.id])).rows[0].name===target.name).toBe(true);
    expect((await identity.context.database.pool.query('SELECT count(*)::int AS n FROM "AuditEvent"')).rows[0].n).toBe(0);
    await authenticate(page,identity);await page.goto('/inicio');await expect(page.getByText('Administrador',{exact:true})).toBeVisible();
    expect(mutations).toBe(1);await clean(page);
  });
}

test('401 cancela una consulta en vuelo y su respuesta tardía no restaura datos',async({page,identity})=>{
  await authenticate(page,identity);await page.goto('/admin/cuentas');await expect(page.locator('.account-list li')).toHaveCount(12);
  await page.getByRole('button',{name:'Nueva cuenta',exact:true}).click();
  try{await page.getByLabel('Nombre',{exact:true}).fill('Cuenta no confirmada');await page.getByLabel('Correo',{exact:true}).fill(`${randomUUID()}@example.test`);
    await page.getByLabel('Credencial provisional',{exact:true}).fill(identity.account().password);}
  catch{throw new Error('Formulario aislado no disponible. Valores omitidos.');}
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  let fetched!:()=>void;const ready=new Promise<void>(resolve=>{fetched=resolve;});
  await page.route('**/api/v1/admin/users?*',async route=>{
    const response=await route.fetch();fetched();await held;
    await route.fulfill({response}).catch(()=>undefined); // La solicitud cancelada no puede recuperar el DOM.
  });
  try{
    await page.getByRole('button',{name:'Buscar',exact:true}).click();await ready;
    await identity.clock!.advance(1800000);
    await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();await expect(page).toHaveURL(/\/login$/);
  }finally{release();}
  await page.unrouteAll({behavior:'wait'});await expect(page.locator('.account-list li')).toHaveCount(0);
  await expect(page.getByLabel('Credencial provisional',{exact:true})).toHaveCount(0);await clean(page);
});

test('datos se muestran como texto; CSP bloquea scripts inline, externos y destinos ajenos',async({page,identity})=>{
  const marker='<img src=x onerror="window.__us5Executed=true">';const actor=identity.account('ADMIN');
  await identity.context.database.pool.query('UPDATE "User" SET name=$2 WHERE id=$1',[actor.id,marker]);
  await authenticate(page,identity);await page.goto('/inicio');await expect(page.getByText(marker,{exact:true})).toBeVisible();
  expect(await page.locator('main img, main script').count()).toBe(0);
  const policy=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy?.includes('__ACADEMIA_')).toBe(false);
  const script=policy?.split(';').find(value=>value.trim().startsWith('script-src'))??'';
  expect(script.includes("'self'")).toBe(true);expect(script.includes('unsafe-inline')||script.includes('unsafe-eval')).toBe(false);
  const outcome=await page.evaluate(async()=>{
    const violations:string[]=[];document.addEventListener('securitypolicyviolation',event=>violations.push(event.effectiveDirective));
    const inline=document.createElement('script');inline.textContent='window.__us5Executed=true';document.body.append(inline);
    const external=document.createElement('script');external.src='https://scripts.example.invalid/third-party.js';document.body.append(external);
    let blocked=false;try{await fetch('https://data.example.invalid/private');}catch{blocked=true;}
    await new Promise(resolve=>setTimeout(resolve,50));
    return {executed:Reflect.get(window,'__us5Executed')===true,blocked,scripts:violations.includes('script-src-elem'),connections:violations.includes('connect-src')};
  });
  expect(outcome).toEqual({executed:false,blocked:true,scripts:true,connections:true});
  expect(await page.locator('script[src]').evaluateAll(elements=>elements.every(element=>new URL((element as HTMLScriptElement).src).origin===location.origin
    ||(element as HTMLScriptElement).src==='https://scripts.example.invalid/third-party.js'))).toBe(true);
  await clean(page);
});
