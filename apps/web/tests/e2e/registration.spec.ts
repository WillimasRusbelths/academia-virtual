import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test,expect,verificationLink } from '../support/us2-fixture';
import { seedAction,tokenState } from '../../../api/tests/support/us2.js';
import { PostgresRateStore } from '../../../api/src/infrastructure/limits/rate-store.js';
import { restrictRead } from '../../../api/tests/support/us1-http.js';
import { DeliverPending } from '../../../api/src/modules/mail/application/deliver-pending.js';
import { MailTransportFailure } from '../../../api/src/modules/mail/application/delivery-ports.js';
import { PostgresDeliveryStore } from '../../../api/src/modules/mail/infrastructure/delivery-store.js';
import { createPayloadCipher } from '../../../api/src/modules/mail/infrastructure/payload-cipher.js';
import { PostgresDeliveryEligibility } from '../../../api/src/modules/identity/infrastructure/delivery-eligibility.js';

test.afterEach(async({page})=>{await page.locator('input[type="password"]').evaluateAll(inputs=>{
  for(const input of inputs)(input as HTMLInputElement).value='';
}).catch(()=>undefined);});
async function register(page:Page,password:string,email=`registro-${randomUUID()}@example.test`) {
  await page.goto('/registro');await expect(page.getByLabel(/^nombre/i)).toBeVisible();
  try{await page.getByLabel(/^nombre/i).fill('Alumno de ensayo');await page.getByLabel(/correo/i).fill(email);await page.getByLabel(/contraseña/i).fill(password);}
  catch{throw new Error('No se pudieron completar los campos de registro. Valores omitidos.');}
  await expect(page.getByRole('combobox')).toHaveCount(0);
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/register')&&value.request().method()==='POST');
  await page.getByRole('button',{name:/registrar|crear cuenta/i}).click();return {email,response:await response};
}
async function privateState(page:Page) {
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
  expect(await page.evaluate(()=>history.state)).toBeNull();
  expect(await page.evaluate(()=>location.hash.length+location.search.length)).toBe(0);
}
async function cleanFragment(page:Page,link:string) {
  try{await page.goto(link);}catch{throw new Error('No se pudo abrir el enlace local. Valores omitidos.');}
  await expect.poll(()=>page.evaluate(()=>location.hash.length)).toBe(0);
}
test('control: React, proxy, fixtures habilitados y Mailpit capturan un enlace sintético',async({page,identity})=>{
  expect((await page.goto('/'))?.status()).toBe(200);await expect(page.locator('#root')).not.toBeEmpty();
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  const f=await seedAction(identity,'VERIFY_EMAIL',true);
  const link=await verificationLink(f.account.email,identity.context.environment.appOrigin);
  expect(link===f.link).toBe(true);expect((await tokenState(identity,f.id)).consumedAt).toBeNull();
});
for(const size of [{width:360,height:800},{width:1366,height:768}]) {
  test(`registro → correo → confirmación explícita → login en ${size.width}`,async({page,context,identity})=>{
    await page.setViewportSize(size);const password=identity.account().password;const {email,response}=await register(page,password);
    expect(response.status()).toBe(202);expect((await context.cookies()).some(cookie=>cookie.name==='av_session_dev')).toBe(false);
    await expect(page.getByText(/Si la cuenta cumple las condiciones/)).toBeVisible();await privateState(page);
    expect((await page.request.post('/api/v1/auth/login',{headers:{Origin:'http://localhost:5173','X-CSRF-Protection':'1'},data:{email,password}})).status()).toBe(401);
    const link=await verificationLink(email,identity.context.environment.appOrigin);let confirms=0;
    page.on('request',request=>{if(request.url().endsWith('/api/v1/auth/verification/confirm')&&request.method()==='POST')confirms++;});
    await cleanFragment(page,link);await privateState(page);expect(confirms).toBe(0);
    const user=(await identity.context.database.pool.query('SELECT * FROM "User" WHERE "emailCanonical"=$1',[email])).rows[0];
    expect(user.emailVerifiedAt).toBeNull();
    expect((await identity.context.database.pool.query('SELECT "consumedAt" FROM "ActionToken" WHERE "userId"=$1',[user.id])).rows.every(row=>row.consumedAt===null)).toBe(true);
    const confirmation=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/verification/confirm'));
    await page.getByRole('button',{name:/confirmar|verificar correo/i}).click();expect((await confirmation).status()).toBe(204);expect(confirms).toBe(1);
    expect((await context.cookies()).some(cookie=>cookie.name==='av_session_dev')).toBe(false);
    await page.getByRole('link',{name:/iniciar sesión|acceder/i}).click();
    try{await page.getByLabel(/correo/i).fill(email);await page.getByLabel(/contraseña/i).fill(password);}
    catch{throw new Error('No se pudieron completar los campos de acceso. Valores omitidos.');}
    const login=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/login'));
    await page.getByRole('button',{name:/iniciar sesión/i}).click();expect((await login).status()).toBe(200);await expect(page).toHaveURL(/\/inicio$/);
    expect((await page.request.get('/api/v1/me')).status()).toBe(200);await privateState(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
  test(`GET no consume y recarga sin secreto exige reabrir/reenvío en ${size.width}`,async({page,identity})=>{
    await page.setViewportSize(size);const f=await seedAction(identity);let posts=0;
    page.on('request',request=>{if(request.url().endsWith('/api/v1/auth/verification/confirm')&&request.method()==='POST')posts++;});
    await cleanFragment(page,f.link);expect(posts).toBe(0);expect((await tokenState(identity,f.id)).consumedAt).toBeNull();
    await page.reload();await privateState(page);expect(posts).toBe(0);
    await expect(page.getByLabel(/correo/i)).toBeVisible();await expect(page.getByRole('button',{name:/reenviar|solicitar.*envío/i})).toBeVisible();
    expect((await tokenState(identity,f.id)).consumedAt).toBeNull();
  });
  test(`campos inválidos y recarga sin contraseña en ${size.width}`,async({page,identity})=>{
    await page.setViewportSize(size);await page.goto('/registro');await expect(page.getByLabel(/^nombre/i)).toBeVisible();
    await page.getByLabel(/correo/i).fill('inválido');await page.getByLabel(/contraseña/i).fill('corta');
    await page.getByRole('button',{name:/registrar|crear cuenta/i}).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect((await identity.context.database.pool.query('SELECT count(*) FROM "User"')).rows[0].count).toBe('12');
    await page.reload();expect((await page.getByLabel(/contraseña/i).inputValue()).length).toBe(0);await privateState(page);
  });
}
test('enlace inválido muestra error genérico y ofrece reenvío sin sesión',async({page,context,identity})=>{
  const f=await seedAction(identity);await identity.context.database.pool.query('UPDATE "ActionToken" SET "revokedAt"=clock_timestamp() WHERE id=$1',[f.id]);
  await cleanFragment(page,f.link);const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/verification/confirm'));
  await page.getByRole('button',{name:/confirmar|verificar correo/i}).click();expect((await response).status()).toBe(400);
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:/reenviar|solicitar.*envío/i})).toBeVisible();
  expect((await context.cookies()).some(cookie=>cookie.name==='av_session_dev')).toBe(false);await privateState(page);
});
test('registro limitado conserva pendiente y ofrece reenvío tras espera sin volver a registrar automáticamente',async({page,identity})=>{
  await page.clock.install();
  const email=`limitado-${randomUUID()}@example.test`;const rates=new PostgresRateStore(identity.context.database.pool,identity.context.environment.rateHmacKey);
  expect((await rates.admitMail(email,'VERIFY_EMAIL','127.0.0.1','ADMISSION')).allowed).toBe(true);let registrations=0;
  page.on('request',request=>{if(request.url().endsWith('/api/v1/auth/register'))registrations++;});
  expect((await register(page,identity.account().password,email)).response.status()).toBe(429);
  await expect(page.getByRole('alert')).toContainText('60');
  expect((await identity.context.database.pool.query('SELECT id FROM "User" WHERE "emailCanonical"=$1',[email])).rowCount).toBe(1);
  await identity.clock!.advance(60000);await page.clock.fastForward(60000);
  await page.getByRole('link',{name:/reenviar|verificar|nuevo envío/i}).click();
  try{await page.getByLabel(/correo/i).fill(email);}catch{throw new Error('Campo de reenvío no disponible. Valores omitidos.');}
  const resend=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/verification/request'));
  await page.getByRole('button',{name:/reenviar|solicitar.*envío/i}).click();expect((await resend).status()).toBe(202);expect(registrations).toBe(1);
});
test('503 real de BD al registrar no afirma entrega ni repite automáticamente; contraseña no persiste',async({page,identity})=>{
  await restrictRead(identity,'User',false);let registrations=0;
  page.on('request',request=>{if(request.url().endsWith('/api/v1/auth/register'))registrations++;});
  try {
    const {response}=await register(page,identity.account().password);expect(response.status()).toBe(503);
    await expect(page.getByRole('alert')).toContainText(/temporalmente|no.*completar/i);expect(registrations).toBe(1);
    await page.reload();expect((await page.getByLabel(/contraseña/i).inputValue()).length).toBe(0);await privateState(page);
  }finally{await restrictRead(identity,'User',true);}
});
test('202 y fallo temporal controlado del envío conservan pendiente sin prometer entrega',async({page,identity})=>{
  await identity.pauseMail();const {email,response}=await register(page,identity.account().password);
  expect(response.status()).toBe(202);await expect(page.getByText(/Si la cuenta cumple las condiciones/)).toBeVisible();
  const pool=identity.context.database.pool;const rates=new PostgresRateStore(pool,identity.context.environment.rateHmacKey);
  // Prueba del contrato de fallo, sin detener el Mailpit compartido con la prueba manual.
  const worker=new DeliverPending(new PostgresDeliveryStore(pool,rates),new PostgresDeliveryEligibility(pool),
    createPayloadCipher(identity.context.environment),{async send(){throw new MailTransportFailure('TEMPORARY');}});
  await worker.tick();
  const rows=(await pool.query(`SELECT u."emailVerifiedAt",t."consumedAt",m.status,m."lastErrorClass",m.attempts
    FROM "User" u JOIN "ActionToken" t ON t."userId"=u.id JOIN "MailDelivery" m ON m."tokenId"=t.id WHERE u."emailCanonical"=$1`,[email])).rows;
  expect(rows.length===1 && rows[0].emailVerifiedAt===null && rows[0].consumedAt===null
    && rows[0].status==='PENDING' && rows[0].lastErrorClass==='TEMPORARY' && rows[0].attempts===1).toBe(true);
  await expect(page.getByText(/correo (fue |ha sido )?entregado|mensaje (fue |ha sido )?enviado con éxito/i)).toHaveCount(0);
  await expect(page.getByRole('link',{name:/reenviar|verificar|nuevo envío/i})).toBeVisible();await privateState(page);
});
