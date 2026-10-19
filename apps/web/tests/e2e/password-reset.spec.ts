import type { Page } from '@playwright/test';
import { test,expect,verificationLink,passwordResetLink } from '../support/us2-fixture';
import { seedAction,tokenState } from '../../../api/tests/support/us2.js';
import { accessSecrets } from '../../../api/src/modules/identity/infrastructure/credentials.js';
import { PostgresRateStore } from '../../../api/src/infrastructure/limits/rate-store.js';
import { restrictRead } from '../../../api/tests/support/us1-http.js';
import type { Us2Dataset } from '../../../api/tests/support/us2.js';

const headers={Origin:'http://localhost:5173','X-CSRF-Protection':'1'};
const forgot='/api/v1/auth/password/forgot';const reset='/api/v1/auth/password/reset';
const instructions='Si la cuenta cumple las condiciones, recibirás instrucciones. Si no llegan, revisa tu correo o solicita un nuevo envío.';
test.afterEach(async({page})=>{await page.locator('input[type="password"]').evaluateAll(inputs=>{
  for(const input of inputs)(input as HTMLInputElement).value='';}).catch(()=>undefined);});
async function visit(page:Page,path:string){
  try{await page.goto(path);}catch{throw new Error('Navegación de ensayo fallida. Valores omitidos.');}
}
async function recoveryView(page:Page){
  await visit(page,'/recuperar');const email=page.getByLabel(/^correo(?: electrónico)?$/i);
  const missing=page.getByRole('heading',{name:'Página no disponible',exact:true});
  await expect(email.or(missing).first()).toBeVisible();
  if(await missing.isVisible())throw new Error('US7_PENDING_UI: /recuperar muestra Página no disponible');
  await expect(email).toBeVisible();
}
async function resetView(page:Page,link:string){
  await visit(page,link);const password=page.getByLabel(/^nueva contraseña$/i);
  const missing=page.getByRole('heading',{name:'Página no disponible',exact:true});
  await expect(password.or(missing).first()).toBeVisible();
  if(await missing.isVisible())throw new Error('US7_PENDING_UI: /restablecer muestra Página no disponible');
  await expect(password).toBeVisible();
}
async function fillReset(page:Page,password:string,confirmation=password){
  try{await page.getByLabel(/^nueva contraseña$/i).fill(password);await page.getByLabel(/^confirm(?:ar|ación de) (?:la )?(?:nueva )?contraseña$/i).fill(confirmation);}
  catch{throw new Error('Campos de restablecimiento no disponibles. Valores omitidos.');}
}
async function sendReset(page:Page){
  const response=page.waitForResponse(value=>value.url().endsWith(reset)&&value.request().method()==='POST');
  await page.getByRole('button',{name:/restablecer|guardar.*contraseña|cambiar.*contraseña/i}).click();return response;
}
async function sendForgot(page:Page,email:string){
  try{await page.getByLabel(/^correo(?: electrónico)?$/i).fill(email);}catch{throw new Error('Campo de recuperación no disponible. Valores omitidos.');}
  const response=page.waitForResponse(value=>value.url().endsWith(forgot)&&value.request().method()==='POST');
  await page.getByRole('button',{name:/solicitar|enviar instrucciones|recuperar/i}).click();return response;
}
async function privateState(page:Page){
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
  expect(await page.evaluate(()=>history.state)).toBeNull();
  expect(await page.evaluate(()=>location.hash.length+location.search.length)).toBe(0);
}
async function login(page:Page,email:string,password:string){
  await visit(page,'/login');
  try{await page.getByLabel(/^correo$/i).fill(email);await page.getByLabel(/^contraseña$/i).fill(password);}
  catch{throw new Error('Campos de acceso del ensayo no disponibles. Valores omitidos.');}
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/login'));
  await page.getByRole('button',{name:/iniciar sesión/i}).click();expect((await response).status()).toBe(200);
  await expect.poll(()=>page.evaluate(()=>location.pathname==='/inicio')).toBe(true);
}
async function currentResetLink(identity:Us2Dataset,id:string,email:string){
  const rows=(await identity.context.database.pool.query(`SELECT "tokenHash" FROM "ActionToken"
    WHERE "userId"=$1 AND purpose='RESET_PASSWORD' AND "revokedAt" IS NULL AND "consumedAt" IS NULL`,[id])).rows;
  expect(rows.length).toBe(1);
  return passwordResetLink(email,identity.context.environment.appOrigin,link=>{
    const digest=accessSecrets.digest(link.split('#')[1]??'');return !!digest&&Buffer.from(digest).equals(rows[0].tokenHash);
  });
}
test('control: fixture RESET_PASSWORD capturada por SMTP local, TTL de 30 minutos y sin consumo',async({identity})=>{
  const f=await seedAction(identity,'RESET_PASSWORD',true);
  const captured=await passwordResetLink(f.account.email,identity.context.environment.appOrigin,link=>link===f.link);
  expect(captured===f.link).toBe(true);const token=await tokenState(identity,f.id);
  expect(token.consumedAt===null&&token.revokedAt===null&&token.expiresAt.getTime()-(await identity.clock!.now()).getTime()===1800000).toBe(true);
  await expect.poll(async()=>{
    const row=(await identity.context.database.pool.query('SELECT status,"encryptedPayload" FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0];
    return row.status==='SENT'&&row.encryptedPayload===null;
  }).toBe(true);
});
test('control: dos contextos reales habilitados con credenciales independientes',async({page,browser,identity})=>{
  const second=await browser.newContext({baseURL:'http://localhost:5173'});
  try{const other=await second.newPage();const f=identity.account();
    await login(page,f.email,f.password);await login(other,f.email,f.password);
    expect((await page.request.get('/api/v1/me')).status()).toBe(200);expect((await other.request.get('/api/v1/me')).status()).toBe(200);
    const a=(await page.context().cookies()).find(cookie=>cookie.name==='av_session_dev');const b=(await second.cookies()).find(cookie=>cookie.name==='av_session_dev');
    expect(!!a&&!!b&&a.httpOnly&&b.httpOnly&&a.value!==b.value).toBe(true);await privateState(page);await privateState(other);
  }finally{await second.close();}
});
for(const size of [{width:360,height:800},{width:1366,height:768}])test(`recuperación completa, dos contextos revocados y acceso solo con contraseña nueva a ${size.width}`,async({page,browser,identity})=>{
  await page.setViewportSize(size);await recoveryView(page);
  const second=await browser.newContext({baseURL:'http://localhost:5173',viewport:size});
  try{
    const other=await second.newPage();const f=identity.account();const password=accessSecrets.issue().secret;
    await login(page,f.email,f.password);await login(other,f.email,f.password);await recoveryView(page);
    const before=(await identity.context.database.pool.query('SELECT "passwordHash","authVersion" FROM "User" WHERE id=$1',[f.id])).rows[0];
    expect((await sendForgot(page,f.email)).status()).toBe(202);await expect(page.getByText(instructions,{exact:true})).toBeVisible();
    expect((await other.request.get('/api/v1/me')).status()).toBe(200);
    const link=await currentResetLink(identity,f.id,f.email);await resetView(page,link);await privateState(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await fillReset(page,password);const response=await sendReset(page);expect(response.status()).toBe(204);
    expect(await page.locator('input[type="password"]').evaluateAll(inputs=>inputs.every(input=>(input as HTMLInputElement).value.length===0))).toBe(true);
    const body=response.request().postDataJSON() as Record<string,unknown>;
    expect(Object.keys(body).sort()).toEqual(['newPassword','token']);expect(body.newPassword===password&&body.token===link.split('#')[1]).toBe(true);
    expect((await page.context().cookies()).some(cookie=>cookie.name==='av_session_dev')).toBe(false);
    expect((await page.request.get('/api/v1/me')).status()).toBe(401);expect((await other.request.get('/api/v1/me')).status()).toBe(401);
    await visit(other,'/inicio');await expect(other.getByLabel(/^contraseña$/i)).toBeVisible();await privateState(other);
    expect((await page.request.post('/api/v1/auth/login',{headers,data:{email:f.email,password:f.password}})).status()).toBe(401);
    const after=(await identity.context.database.pool.query('SELECT "passwordHash","authVersion",email,role FROM "User" WHERE id=$1',[f.id])).rows[0];
    expect(after.passwordHash!==before.passwordHash&&BigInt(after.authVersion)===BigInt(before.authVersion)+1n&&after.email===f.email&&after.role===f.role).toBe(true);
    await expect(page.getByRole('link',{name:/iniciar sesión|acceder/i})).toBeVisible();await login(page,f.email,password);await privateState(page);
  }finally{await second.close();}
});
for(const size of [{width:360,height:800},{width:1366,height:768}])test(`fragmento retirado, GET sin consumo y recarga sin secreto a ${size.width}`,async({page,identity})=>{
  await page.setViewportSize(size);const f=await seedAction(identity,'RESET_PASSWORD');let posts=0;
  page.on('request',request=>{if(request.url().endsWith(reset)&&request.method()==='POST')posts++;});
  await resetView(page,f.link);await privateState(page);expect(posts).toBe(0);expect((await tokenState(identity,f.id)).consumedAt).toBeNull();
  await page.reload();await privateState(page);expect(posts).toBe(0);
  await expect(page.getByRole('link',{name:/recuperar|solicitar.*(?:enlace|instrucciones)/i})).toBeVisible();
  expect((await tokenState(identity,f.id)).consumedAt).toBeNull();
});
test('confirmación distinta es solo local; la API recibe exactamente token y newPassword al corregir',async({page,identity})=>{
  const f=await seedAction(identity,'RESET_PASSWORD');const password=accessSecrets.issue().secret;let posts=0;
  page.on('request',request=>{if(request.url().endsWith(reset)&&request.method()==='POST')posts++;});
  await resetView(page,f.link);await fillReset(page,password,accessSecrets.issue().secret);
  await page.getByRole('button',{name:/restablecer|guardar.*contraseña|cambiar.*contraseña/i}).click();
  await expect(page.getByRole('alert')).toBeVisible();expect(posts).toBe(0);expect((await tokenState(identity,f.id)).consumedAt).toBeNull();
  await fillReset(page,password);const response=await sendReset(page);expect(response.status()).toBe(204);expect(posts).toBe(1);
  expect(Object.keys(response.request().postDataJSON()).sort()).toEqual(['newPassword','token']);await privateState(page);
});
test('enlace vencido: rechazo genérico sin cambios y posibilidad de solicitar otro',async({page,identity})=>{
  const f=await seedAction(identity,'RESET_PASSWORD');await identity.clock!.set(f.expiresAt);
  const before=JSON.stringify((await identity.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[f.account.id])).rows[0]);
  await resetView(page,f.link);await fillReset(page,accessSecrets.issue().secret);expect((await sendReset(page)).status()).toBe(400);
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('link',{name:/recuperar|solicitar.*(?:enlace|instrucciones)/i})).toBeVisible();
  expect(JSON.stringify((await identity.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[f.account.id])).rows[0])===before).toBe(true);
  expect((await tokenState(identity,f.id)).consumedAt).toBeNull();await privateState(page);
});
test('provisional vencida: verificar correo, recuperar y entrar con contraseña propia sin habilitar la provisional',async({page,identity})=>{
  const f=identity.account('TEACHER','PROVISIONAL');const row=(await identity.context.database.pool.query('SELECT "provisionalExpiresAt" FROM "User" WHERE id=$1',[f.id])).rows[0];
  await identity.clock!.set(row.provisionalExpiresAt);
  expect((await page.request.post('/api/v1/auth/verification/request',{headers,data:{email:f.email}})).status()).toBe(202);
  const verify=await verificationLink(f.email,identity.context.environment.appOrigin);await visit(page,verify);
  const confirming=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/verification/confirm'));
  await page.getByRole('button',{name:/confirmar|verificar correo/i}).click();expect((await confirming).status()).toBe(204);
  expect((await page.request.post('/api/v1/auth/login',{headers,data:{email:f.email,password:f.password}})).status()).toBe(401);
  await recoveryView(page);expect((await sendForgot(page,f.email)).status()).toBe(202);
  const link=await currentResetLink(identity,f.id,f.email);await resetView(page,link);
  const password=accessSecrets.issue().secret;await fillReset(page,password);expect((await sendReset(page)).status()).toBe(204);
  const after=(await identity.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[f.id])).rows[0];
  expect(after.mustSetPassword===false&&after.provisionalPasswordHash===null&&after.provisionalExpiresAt===null&&after.emailVerifiedAt!==null&&after.status==='ACTIVE').toBe(true);
  expect((await page.request.post('/api/v1/auth/password/initial',{headers,data:{email:f.email,provisionalPassword:f.password,newPassword:accessSecrets.issue().secret}})).status()).toBe(401);
  await login(page,f.email,password);await privateState(page);
});
for(const variant of ['DISABLED','UNVERIFIED','MISSING'] as const)test(`solicitud ${variant}: mensaje genérico sin prometer envío o revelar estado`,async({page,identity})=>{
  await recoveryView(page);const email=variant==='MISSING'?`ausente-${identity.manifest.runId}@example.test`:identity.account('STUDENT',variant).email;
  expect((await sendForgot(page,email)).status()).toBe(202);await expect(page.getByText(instructions,{exact:true})).toBeVisible();
  expect((await identity.context.database.pool.query(`SELECT id FROM "ActionToken" WHERE purpose='RESET_PASSWORD'`)).rowCount).toBe(0);await privateState(page);
});
test('cuota 429: espera y reintento manual sin reenvío automático ni promesa de entrega',async({page,identity})=>{
  await recoveryView(page);await page.clock.install();const f=identity.account();
  const rates=new PostgresRateStore(identity.context.database.pool,identity.context.environment.rateHmacKey);
  expect((await rates.admitMail(f.email,'RESET_PASSWORD','127.0.0.1','ADMISSION')).allowed).toBe(true);let posts=0;
  page.on('request',request=>{if(request.url().endsWith(forgot)&&request.method()==='POST')posts++;});
  expect((await sendForgot(page,f.email)).status()).toBe(429);await expect(page.getByRole('alert')).toContainText('60');expect(posts).toBe(1);
  await identity.clock!.advance(60000);await page.clock.fastForward(60000);expect(posts).toBe(1);
  expect((await sendForgot(page,f.email)).status()).toBe(202);expect(posts).toBe(2);await privateState(page);
});
test('503 real: mensaje seguro, sin confirmación falsa ni reintento automático',async({page,identity})=>{
  await recoveryView(page);const f=identity.account();let posts=0;
  page.on('request',request=>{if(request.url().endsWith(forgot)&&request.method()==='POST')posts++;});
  await restrictRead(identity,'User',false);
  try{expect((await sendForgot(page,f.email)).status()).toBe(503);await expect(page.getByRole('alert')).toContainText(/temporalmente|reintentar/i);expect(posts).toBe(1);}
  finally{await restrictRead(identity,'User',true);}
  expect(posts).toBe(1);await page.reload();await privateState(page);expect(posts).toBe(1);
});
