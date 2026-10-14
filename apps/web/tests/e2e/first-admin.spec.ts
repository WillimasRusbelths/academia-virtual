import type { Page } from '@playwright/test';
import { test,expect,verificationLink } from '../support/us2-fixture';
import { accessSecrets } from '../../../api/src/modules/identity/infrastructure/credentials.js';

async function privateState(page:Page) {
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
  expect(await page.evaluate(()=>history.state)).toBeNull();
  expect(await page.evaluate(()=>location.hash.length+location.search.length)).toBe(0);
}
async function initialForm(page:Page,email:string,provisional:string,newPassword:string) {
  await page.goto('/establecer-contrasena');
  await expect(page.getByLabel(/correo/i),'US6_PENDING_UI: pantalla de establecimiento inicial').toBeVisible();
  try{
    await page.getByLabel(/correo/i).fill(email);
    await page.getByLabel(/(?:credencial|contraseña) provisional/i).fill(provisional);
    await page.getByLabel(/nueva contraseña|contraseña propia/i).fill(newPassword);
  }catch{throw new Error('Formulario inicial incompleto. Valores omitidos.');}
}
async function submitInitial(page:Page) {
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/password/initial')&&value.request().method()==='POST');
  await page.getByRole('button',{name:/establecer|guardar|cambiar.*contraseña/i}).click();return response;
}
async function confirm(page:Page,link:string) {
  try{await page.goto(link);}catch{throw new Error('No se pudo abrir el enlace de ensayo. Valores omitidos.');}
  await expect.poll(()=>page.evaluate(()=>location.hash.length)).toBe(0);await privateState(page);
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/verification/confirm'));
  await page.getByRole('button',{name:/confirmar correo/i}).click();expect((await response).status()).toBe(204);
}
test.afterEach(async({page})=>{await page.locator('input[type="password"]').evaluateAll(inputs=>{
  for(const input of inputs)(input as HTMLInputElement).value='';
}).catch(()=>undefined);});

test('control: web/API reales, ADMIN provisional pendiente, Mailpit y ausencia de acceso',async({page,identity})=>{
  expect((await page.goto('/'))?.status()).toBe(200);await expect(page.locator('#root')).not.toBeEmpty();
  const f=identity.account('ADMIN','PROVISIONAL');
  expect((await page.request.post('/api/v1/auth/login',{headers:{Origin:'http://localhost:5173','X-CSRF-Protection':'1'},
    data:{email:f.email,password:f.password}})).status()).toBe(401);
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  expect((await page.request.post('/api/v1/auth/verification/request',{headers:{Origin:'http://localhost:5173','X-CSRF-Protection':'1'},data:{email:f.email}})).status()).toBe(202);
  const link=await verificationLink(f.email,identity.context.environment.appOrigin);expect(link.length>0).toBe(true);
  const row=(await identity.context.database.pool.query('SELECT "mustSetPassword","emailVerifiedAt" FROM "User" WHERE id=$1',[f.id])).rows[0];
  expect(row.mustSetPassword&&row.emailVerifiedAt===null).toBe(true);
});

for(const size of [{width:360,height:800},{width:1366,height:768}]){
  for(const order of ['verificar-primero','cambiar-primero'])test(`activación ADMIN ${order} en ${size.width}: ambos requisitos, sin auto-login`,async({page,context,identity})=>{
    await page.setViewportSize(size);const f=identity.account('ADMIN','PROVISIONAL');const password=accessSecrets.issue().secret;
    // Esta fixture prueba la activación, no sustituye al recorrido CLI de T050/T058.
    const response=await page.request.post('/api/v1/auth/verification/request',{headers:{Origin:'http://localhost:5173','X-CSRF-Protection':'1'},data:{email:f.email}});
    expect(response.status()).toBe(202);
    const current=(await identity.context.database.pool.query('SELECT "tokenHash" FROM "ActionToken" WHERE "userId"=$1 AND "revokedAt" IS NULL AND "consumedAt" IS NULL',[f.id])).rows[0];
    const link=await verificationLink(f.email,identity.context.environment.appOrigin,value=>{
      const digest=accessSecrets.digest(value.slice(value.indexOf('#')+1));return digest!==null&&Buffer.from(digest).equals(current.tokenHash);
    });
    if(order==='verificar-primero'){
      await confirm(page,link);
      expect((await page.request.post('/api/v1/auth/login',{headers:{Origin:'http://localhost:5173','X-CSRF-Protection':'1'},data:{email:f.email,password:f.password}})).status()).toBe(401);
    }
    await initialForm(page,f.email,f.password,password);expect((await submitInitial(page)).status()).toBe(204);await privateState(page);
    await expect.poll(()=>page.locator('input[type="password"]').evaluateAll(inputs=>inputs.every(input=>(input as HTMLInputElement).value.length===0))).toBe(true);
    expect((await context.cookies()).some(cookie=>cookie.name==='av_session_dev')).toBe(false);
    if(order==='cambiar-primero'){
      expect((await page.request.post('/api/v1/auth/login',{headers:{Origin:'http://localhost:5173','X-CSRF-Protection':'1'},data:{email:f.email,password}})).status()).toBe(401);
      await confirm(page,link);
    }
    await page.goto('/login');
    try{await page.getByLabel(/correo/i).fill(f.email);await page.getByLabel(/contraseña/i).fill(password);}
    catch{throw new Error('Formulario de acceso no disponible. Valores omitidos.');}
    const login=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/login'));
    await page.getByRole('button',{name:/iniciar sesión/i}).click();expect((await login).status()).toBe(200);
    await expect(page).toHaveURL(/\/inicio$/);await privateState(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
  test(`nueva inválida y recarga no conservan credenciales en ${size.width}`,async({page,identity})=>{
    await page.setViewportSize(size);const f=identity.account('ADMIN','PROVISIONAL');let requests=0;
    page.on('request',value=>{if(value.url().endsWith('/api/v1/auth/password/initial'))requests++;});
    await initialForm(page,f.email,f.password,'corta');const before=JSON.stringify((await identity.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[f.id])).rows[0]);
    await page.getByRole('button',{name:/establecer|guardar|cambiar.*contraseña/i}).click();await expect(page.getByRole('alert')).toBeVisible();
    expect(requests).toBe(0);expect(JSON.stringify((await identity.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[f.id])).rows[0])===before).toBe(true);
    await page.reload();expect((await page.getByLabel(/(?:credencial|contraseña) provisional/i).inputValue()).length).toBe(0);
    expect((await page.getByLabel(/nueva contraseña|contraseña propia/i).inputValue()).length).toBe(0);await privateState(page);
  });
}
test('provisional vencida ofrece verificar y recuperar; ningún acceso ni recuperación ficticia',async({page,identity})=>{
  const f=identity.account('ADMIN','PROVISIONAL');const expires=(await identity.context.database.pool.query('SELECT "provisionalExpiresAt" FROM "User" WHERE id=$1',[f.id])).rows[0].provisionalExpiresAt;
  await identity.clock!.set(expires);await initialForm(page,f.email,f.password,accessSecrets.issue().secret);
  expect((await submitInitial(page)).status()).toBe(401);await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('link',{name:/verificar.*correo/i})).toHaveAttribute('href','/verificar-correo');
  await expect(page.getByRole('link',{name:/recuperar/i})).toHaveAttribute('href','/recuperar');
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);await privateState(page);
  const current=(await identity.context.database.pool.query('SELECT "mustSetPassword","emailVerifiedAt" FROM "User" WHERE id=$1',[f.id])).rows[0];
  expect(current.mustSetPassword&&current.emailVerifiedAt===null).toBe(true);
  // El destino de recuperación se verifica como enlace; el flujo pertenece a US7/T081.
});
test('provisional incorrecta conserva cuenta y muestra error seguro sin guardar secretos',async({page,identity})=>{
  const f=identity.account('ADMIN','PROVISIONAL');await initialForm(page,f.email,accessSecrets.issue().secret,accessSecrets.issue().secret);
  const before=JSON.stringify((await identity.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[f.id])).rows[0]);
  expect((await submitInitial(page)).status()).toBe(401);await expect(page.getByRole('alert')).toBeVisible();await privateState(page);
  expect(JSON.stringify((await identity.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[f.id])).rows[0])===before).toBe(true);
});
