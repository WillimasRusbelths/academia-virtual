import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeAll,beforeEach,expect,test } from 'vitest';
import { us1Http,restrictRead } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { us2Dataset,tokenState } from '../support/us2.js';
import type { Us2Dataset } from '../support/us2.js';
import { accountSnapshot,forgotPath,resetPath,forgotAccepted,resetAccepted,resetError,resetFixture } from '../support/us7.js';
import { accessSecrets,createPasswordCredentials } from '../../src/modules/identity/infrastructure/credentials.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';

let data:Us2Dataset;let http:Us1Http;
beforeAll(async()=>{data=await us2Dataset('us7_contract');},120000);
beforeEach(async()=>{await data.reset();http=await us1Http(data);
  await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();});
afterEach(async()=>{await http?.close();});afterAll(async()=>{await data?.cleanup();});
const user=async(id:string)=>(await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[id])).rows[0];
async function credentialsAndSessions(){return JSON.stringify([
  (await data.context.database.pool.query('SELECT * FROM "User" ORDER BY id')).rows,
  (await data.context.database.pool.query('SELECT * FROM "Session" ORDER BY id')).rows]);}
test('control: composición real disponible, fixtures aislados y dos sesiones habilitadas',async()=>{
  expect(data.context.environment.databaseSchema.startsWith('t_')).toBe(true);
  expect((await fetch(`${http.url}/health/ready`)).status).toBe(200);
  for(const session of data.account().sessions)expect((await http.get('/me',session.secret)).status).toBe(200);
  const f=await resetFixture(data,data.account(),true);const token=await tokenState(data,f.id);
  expect(token.expiresAt.getTime()-(await data.clock!.now()).getTime()).toBe(30*60000);
  const delivery=(await data.context.database.pool.query('SELECT * FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0];
  const payload=createPayloadCipher(data.context.environment).decrypt(delivery);
  expect(payload.template==='RESET_PASSWORD'&&payload.recipient===f.account.email&&payload.link===f.link).toBe(true);
});
test('forgot: mismo 202 para habilitada, desactivada, no verificada, provisional e inexistente; ninguna credencial o sesión cambia',async()=>{
  const before=await credentialsAndSessions();const results=[];
  for(const variant of ['ENABLED','DISABLED','UNVERIFIED','PROVISIONAL'] as const){
    const account=data.account('STUDENT',variant);
    results.push(await forgotAccepted(await http.post(forgotPath,{email:account.email}),[account.email,account.password]));
  }
  results.push(await forgotAccepted(await http.post(forgotPath,{email:`ausente-${randomUUID()}@example.test`})));
  expect(results.every(result=>JSON.stringify(result)===JSON.stringify(results[0]))).toBe(true);
  expect(await credentialsAndSessions()===before).toBe(true);
  const tokens=(await data.context.database.pool.query('SELECT * FROM "ActionToken"')).rows;
  expect(tokens.length===1&&tokens[0].userId===data.account().id&&tokens[0].purpose==='RESET_PASSWORD').toBe(true);
});
for(const role of ['STUDENT','TEACHER','ADMIN'] as const)test(`forgot ${role}: destinatario verificado, enlace cifrado de 30 minutos y sin efectos sobre cuenta/sesiones`,async()=>{
  const account=data.account(role);const before=await credentialsAndSessions();
  await forgotAccepted(await http.post(forgotPath,{email:' '+account.email.toUpperCase()+' '}),[account.email,account.password]);
  expect(await credentialsAndSessions()===before).toBe(true);
  const token=(await data.context.database.pool.query('SELECT * FROM "ActionToken"')).rows[0];
  expect(!!token&&token.userId===account.id&&token.emailCanonicalSnapshot===account.email&&token.purpose==='RESET_PASSWORD'
    &&token.expiresAt.getTime()-token.createdAt.getTime()===1800000&&token.consumedAt===null&&token.revokedAt===null).toBe(true);
  const delivery=(await data.context.database.pool.query('SELECT * FROM "MailDelivery" WHERE "tokenId"=$1',[token.id])).rows[0];
  const payload=createPayloadCipher(data.context.environment).decrypt(delivery);const secret=payload.link.split('#')[1];
  expect(payload.recipient===account.email&&payload.template==='RESET_PASSWORD'&&payload.link.startsWith(`${http.origin}/restablecer#`)
    &&Buffer.from(accessSecrets.digest(secret)!).equals(token.tokenHash)).toBe(true);
});
test('provisional vencida: solo después de verificar admite recuperación; solicitar no sustituye la credencial',async()=>{
  const account=data.account('TEACHER','PROVISIONAL');const db=data.context.database.pool;
  await data.clock!.set((await user(account.id)).provisionalExpiresAt);
  await forgotAccepted(await http.post(forgotPath,{email:account.email}));
  expect((await db.query('SELECT id FROM "ActionToken" WHERE "userId"=$1',[account.id])).rowCount).toBe(0);
  await db.query('UPDATE "User" SET "emailVerifiedAt"=clock_timestamp() WHERE id=$1',[account.id]);await data.clock!.advance(60000);
  const before=await credentialsAndSessions();await forgotAccepted(await http.post(forgotPath,{email:account.email}));
  expect(await credentialsAndSessions()===before).toBe(true);
  expect((await db.query('SELECT id FROM "ActionToken" WHERE "userId"=$1',[account.id])).rowCount).toBe(1);
});
for(const [label,body] of [['ausente',{}],['inválido',{email:'inválido'}],['array',{email:['alumno@example.test']}],
  ['extra',{email:'alumno@example.test',role:'ADMIN'}]] as const)test(`forgot rechaza DTO ${label} sin efectos`,async()=>{
  const before=await accountSnapshot(data);await resetError(await http.post(forgotPath,body),400,'VALIDATION_ERROR');
  expect(await accountSnapshot(data)===before).toBe(true);
});
for(const [label,patch] of [['corta',{newPassword:'🔒'.repeat(11)}],['larga',{newPassword:'🔒'.repeat(129)}],
  ['array',{newPassword:['no convertir']}],['ausente',{newPassword:undefined}],['token array',{token:['inválido']}],
  ['confirmación extra',{confirmPassword:'no enviar'}]] as const)test(`reset DTO ${label}: no cambia contraseña ni consume enlace y permite corrección`,async()=>{
  const f=await resetFixture(data);const before=await accountSnapshot(data);const password=accessSecrets.issue().secret;
  await resetError(await http.post(resetPath,{token:f.secret,newPassword:password,...patch}),400,'VALIDATION_ERROR',[f.secret,password]);
  expect(await accountSnapshot(data)===before).toBe(true);
  await resetAccepted(await http.post(resetPath,{token:f.secret,newPassword:password}));
  expect((await tokenState(data,f.id)).consumedAt!==null).toBe(true);
});
for(const length of [12,128])test(`reset acepta ${length} caracteres Unicode sin recortar espacios`,async()=>{
  const f=await resetFixture(data);const password=' '+'🔒'.repeat(length-2)+' ';
  await resetAccepted(await http.post(resetPath,{token:f.secret,newPassword:password}));
  const after=await user(f.account.id);const credentials=await createPasswordCredentials();
  expect(await credentials.verify(password,after.passwordHash)).toBe(true);expect(await credentials.verify(password.trim(),after.passwordHash)).toBe(false);
});
for(const role of ['STUDENT','TEACHER','ADMIN'] as const)test(`reset ${role}: hash nuevo, versión siguiente, todas las sesiones revocadas, cookie eliminada y sin auto-login`,async()=>{
  const account=data.account(role);const f=await resetFixture(data,account);const before=await user(account.id);
  const password=accessSecrets.issue().secret;
  await resetAccepted(await http.post(resetPath,{token:f.secret,newPassword:password},account.sessions[0].secret));
  const after=await user(account.id);
  expect(after.email===before.email&&after.emailCanonical===before.emailCanonical&&after.role===before.role&&after.status===before.status
    &&after.emailVerifiedAt.getTime()===before.emailVerifiedAt.getTime()&&BigInt(after.authVersion)===BigInt(before.authVersion)+1n
    &&after.mustSetPassword===false&&after.provisionalPasswordHash===null&&after.provisionalExpiresAt===null).toBe(true);
  const sessions=(await data.context.database.pool.query('SELECT * FROM "Session" WHERE "userId"=$1',[account.id])).rows;
  expect(sessions.length===2&&sessions.every(session=>session.revokedAt!==null)).toBe(true);
  const token=await tokenState(data,f.id);expect(token.consumedAt!==null&&token.revokedAt===null).toBe(true);
  for(const session of account.sessions)expect((await http.get('/me',session.secret)).status).toBe(401);
  expect((await http.post('/auth/login',{email:account.email,password:account.password})).status).toBe(401);
  expect((await http.get('/me')).status).toBe(401);
  expect((await http.post('/auth/login',{email:account.email,password})).status).toBe(200);
});
test('cuota por correo existente/inexistente: mismo 429 y espera, sin sustituir el enlace anterior',async()=>{
  const f=await resetFixture(data);const rates=new PostgresRateStore(data.context.database.pool,data.context.environment.rateHmacKey);
  const emails=[f.account.email,`sin-cuenta-${randomUUID()}@example.test`];
  for(const email of emails)expect((await rates.admitMail(email,'RESET_PASSWORD','127.0.0.1','ADMISSION')).allowed).toBe(true);
  const before=await accountSnapshot(data);const errors=[];
  for(const email of emails){const response=await http.post(forgotPath,{email});
    errors.push(await resetError(response,429,'RATE_LIMITED',[email,f.secret]));expect(response.headers.get('retry-after')).toBe('60');}
  expect(errors[0]).toEqual(errors[1]);expect(await accountSnapshot(data)===before).toBe(true);
});
test('fallo SQL al solicitar: 503 seguro, ninguna confirmación falsa ni cambio de credenciales',async()=>{
  const before=await accountSnapshot(data);await restrictRead(data,'User',false);
  try{await resetError(await http.post(forgotPath,{email:data.account().email}),503,'TEMPORARILY_UNAVAILABLE',[data.account().password]);}
  finally{await restrictRead(data,'User',true);}
  expect(await accountSnapshot(data)===before).toBe(true);
});
test('fallo intermedio revierte hash/versión/sesiones/consumo y permite reintento explícito',async()=>{
  const f=await resetFixture(data);const before=await accountSnapshot(data);const password=accessSecrets.issue().secret;
  await data.context.isolated.ownerQuery(`CREATE FUNCTION fail_reset_contract() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Fallo privado de ensayo' USING ERRCODE='23514'; END $$;
    CREATE TRIGGER fail_reset_contract BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION fail_reset_contract();`);
  try{await resetError(await http.post(resetPath,{token:f.secret,newPassword:password}),503,'TEMPORARILY_UNAVAILABLE',[f.secret,password]);
    expect(await accountSnapshot(data)===before).toBe(true);
  }finally{await data.context.isolated.ownerQuery('DROP TRIGGER fail_reset_contract ON "User"; DROP FUNCTION fail_reset_contract()');}
  await resetAccepted(await http.post(resetPath,{token:f.secret,newPassword:password}));
});
for(const path of [forgotPath,resetPath])test(`control de transporte ${path}: CSRF y tipo simple se rechazan sin efectos`,async()=>{
  const before=await accountSnapshot(data);
  const denied=await fetch(`${http.url}/api/v1${path}`,{method:'POST',headers:{...http.headers(),origin:'http://otro.example.test'},body:'{}'});
  await resetError(denied,403,'REQUEST_NOT_ALLOWED');
  const simple=await fetch(`${http.url}/api/v1${path}`,{method:'POST',headers:{origin:http.origin,'content-type':'text/plain'},body:'{}'});
  await resetError(simple,415,'UNSUPPORTED_MEDIA_TYPE');expect(await accountSnapshot(data)===before).toBe(true);
});
