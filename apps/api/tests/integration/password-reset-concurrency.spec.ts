import { afterAll,afterEach,beforeAll,beforeEach,expect,test } from 'vitest';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { us2Dataset,seedAction,tokenState } from '../support/us2.js';
import type { Us2Dataset } from '../support/us2.js';
import { accountSnapshot,forgotPath,resetPath,forgotAccepted,resetAccepted,resetError,resetFixture,resetStatus } from '../support/us7.js';
import { adminRequest,adminData } from '../support/us4.js';
import { accessSecrets,createPasswordCredentials } from '../../src/modules/identity/infrastructure/credentials.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';

let data:Us2Dataset;let http:Us1Http;
beforeAll(async()=>{data=await us2Dataset('us7_concurrency');},120000);
beforeEach(async()=>{await data.reset();http=await us1Http(data);
  await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();});
afterEach(async()=>{await http?.close();});afterAll(async()=>{await data?.cleanup();});
const user=async(id:string)=>(await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[id])).rows[0];
test('control: PostgreSQL rechaza consumedAt y revokedAt simultáneos; token original sigue vigente',async()=>{
  const f=await resetFixture(data);let code='';
  try{await data.context.database.pool.query('UPDATE "ActionToken" SET "consumedAt"=clock_timestamp(),"revokedAt"=clock_timestamp() WHERE id=$1',[f.id]);}
  catch(error){code=String((error as {code?:unknown}).code);}
  expect(code).toBe('23514');const state=await tokenState(data,f.id);
  expect(state.consumedAt===null&&state.revokedAt===null).toBe(true);
});
test('control: GET y HEAD sin cuerpo no consumen el enlace ni cambian credenciales',async()=>{
  await resetFixture(data);const before=await accountSnapshot(data);
  for(const method of ['GET','HEAD']){const response=await fetch(`${http.url}/api/v1${resetPath}`,{method});expect(response.status).toBe(404);}
  expect(await accountSnapshot(data)===before).toBe(true);
});
for(const delta of [-1,0,1])test(`caducidad desde emisión: 30 minutos ${delta===0?'exactos':delta<0?'menos 1 ms':'más 1 ms'}`,async()=>{
  const f=await resetFixture(data);await data.clock!.set(new Date(f.expiresAt.getTime()+delta));
  const before=await accountSnapshot(data);const response=await http.post(resetPath,{token:f.secret,newPassword:accessSecrets.issue().secret});
  if(delta<0){await resetAccepted(response);const token=await tokenState(data,f.id);expect(token.consumedAt!==null&&token.revokedAt===null).toBe(true);}
  else{await resetError(response,400,'INVALID_ACTION_LINK',[f.secret]);expect(await accountSnapshot(data)===before).toBe(true);}
  expect((await tokenState(data,f.id)).expiresAt.getTime()===f.expiresAt.getTime()).toBe(true);
});
for(const kind of ['alterado','desconocido','malformado','UUID interno'] as const)test(`enlace ${kind}: rechazo genérico sin modificaciones`,async()=>{
  const f=await resetFixture(data);const before=await accountSnapshot(data);
  const token=kind==='alterado'?(f.secret.startsWith('A')?'B':'A')+f.secret.slice(1):kind==='desconocido'?accessSecrets.issue().secret:kind==='UUID interno'?f.id:'inválido';
  await resetError(await http.post(resetPath,{token,newPassword:accessSecrets.issue().secret}),400,'INVALID_ACTION_LINK',[token,f.secret]);
  expect(await accountSnapshot(data)===before).toBe(true);
});
test('propósitos separados: RESET_PASSWORD nunca verifica correo',async()=>{
  const f=await resetFixture(data);const before=await accountSnapshot(data);
  await resetError(await http.post('/auth/verification/confirm',{token:f.secret}),400,'INVALID_ACTION_LINK',[f.secret]);
  expect(await accountSnapshot(data)===before).toBe(true);
});
test('propósitos separados: VERIFY_EMAIL nunca sustituye contraseña ni verifica implícitamente',async()=>{
  const f=await seedAction(data);const before=await accountSnapshot(data);
  await resetError(await http.post(resetPath,{token:f.secret,newPassword:accessSecrets.issue().secret}),400,'INVALID_ACTION_LINK',[f.secret]);
  expect(await accountSnapshot(data)===before).toBe(true);
});
test('enlace consumido: segundo intento no vuelve a cambiar hash, versión ni sesiones',async()=>{
  const f=await resetFixture(data);await resetAccepted(await http.post(resetPath,{token:f.secret,newPassword:accessSecrets.issue().secret}));
  const before=await accountSnapshot(data);await resetError(await http.post(resetPath,{token:f.secret,newPassword:accessSecrets.issue().secret}),400,'INVALID_ACTION_LINK',[f.secret]);
  expect(await accountSnapshot(data)===before).toBe(true);
});
test('reemplazo solo del propósito reset: revoca anterior/cancela entrega; el nuevo sirve y no cambia correo',async()=>{
  const f=await resetFixture(data,data.account(),true);const before=await user(f.account.id);
  const verification=await seedAction(data);
  await data.context.database.pool.query('UPDATE "ActionToken" SET "userId"=$2,"emailCanonicalSnapshot"=$3 WHERE id=$1',
    [verification.id,f.account.id,f.account.email]);
  const verificationBefore=JSON.stringify(await tokenState(data,verification.id));
  await forgotAccepted(await http.post(forgotPath,{email:f.account.email}));
  const old=await tokenState(data,f.id);expect(old.revokedAt!==null&&old.consumedAt===null).toBe(true);
  const mail=(await data.context.database.pool.query('SELECT * FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0];
  expect(mail.status==='CANCELLED'&&['encryptedPayload','nonce','authTag','keyId'].every(key=>mail[key]===null)).toBe(true);
  expect(JSON.stringify(await tokenState(data,verification.id))===verificationBefore).toBe(true);
  await resetError(await http.post(resetPath,{token:f.secret,newPassword:accessSecrets.issue().secret}),400,'INVALID_ACTION_LINK',[f.secret]);
  const pending=(await data.context.database.pool.query(`SELECT delivery.* FROM "MailDelivery" delivery JOIN "ActionToken" token ON token.id=delivery."tokenId"
    WHERE token."userId"=$1 AND token.purpose='RESET_PASSWORD' AND token."revokedAt" IS NULL AND token."consumedAt" IS NULL`,[f.account.id])).rows;
  expect(pending.length).toBe(1);const payload=createPayloadCipher(data.context.environment).decrypt(pending[0]);
  await resetAccepted(await http.post(resetPath,{token:payload.link.split('#')[1],newPassword:accessSecrets.issue().secret}));
  const after=await user(f.account.id);expect(after.email===before.email&&after.emailCanonical===before.emailCanonical).toBe(true);
});
test('dos consumos simultáneos del mismo enlace: un éxito, un rechazo y una sola transición atómica',async()=>{
  const f=await resetFixture(data);const before=await user(f.account.id);const passwords=[accessSecrets.issue().secret,accessSecrets.issue().secret];
  const responses=await Promise.all(passwords.map(newPassword=>http.post(resetPath,{token:f.secret,newPassword})));
  for(const response of responses)if(response.status===404)await resetStatus(response,204);
  expect(responses.map(response=>response.status).sort()).toEqual([204,400]);
  const winner=responses.findIndex(response=>response.status===204);
  await resetAccepted(responses[winner]);await resetError(responses[1-winner],400,'INVALID_ACTION_LINK',[f.secret,...passwords]);
  const after=await user(f.account.id);const credentials=await createPasswordCredentials();
  expect(await credentials.verify(passwords[winner],after.passwordHash)).toBe(true);
  expect(await credentials.verify(passwords[1-winner],after.passwordHash)).toBe(false);
  expect(BigInt(after.authVersion)===BigInt(before.authVersion)+1n&&after.email===before.email&&after.role===before.role).toBe(true);
  const state=await tokenState(data,f.id);expect(state.consumedAt!==null&&state.revokedAt===null).toBe(true);
  const sessions=(await data.context.database.pool.query('SELECT * FROM "Session" WHERE "userId"=$1',[f.account.id])).rows;
  expect(sessions.length===2&&sessions.every(session=>session.revokedAt!==null)).toBe(true);
});
test('desactivar y reactivar no rescata enlace ni reactiva cuenta al intentar consumir',async()=>{
  const f=await resetFixture(data,data.account(),true);const actor=data.account('ADMIN');
  const status=async(value:string)=>adminData(await adminRequest(http,'PUT',`/admin/users/${f.account.id}/status`,actor.sessions[0].secret,{status:value}));
  await status('DISABLED');const revoked=JSON.stringify(await tokenState(data,f.id));const disabled=await accountSnapshot(data);
  await resetError(await http.post(resetPath,{token:f.secret,newPassword:accessSecrets.issue().secret}),400,'INVALID_ACTION_LINK',[f.secret]);
  expect(await accountSnapshot(data)===disabled).toBe(true);expect((await user(f.account.id)).status).toBe('DISABLED');
  await status('ACTIVE');const active=await accountSnapshot(data);
  await resetError(await http.post(resetPath,{token:f.secret,newPassword:accessSecrets.issue().secret}),400,'INVALID_ACTION_LINK',[f.secret]);
  expect(await accountSnapshot(data)===active&&JSON.stringify(await tokenState(data,f.id))===revoked).toBe(true);
});
for(const variant of ['UNVERIFIED','DISABLED','PROVISIONAL'] as const)test(`token sintético no habilita cuenta ${variant}`,async()=>{
  const f=await resetFixture(data,data.account('STUDENT',variant));const before=await accountSnapshot(data);
  await resetError(await http.post(resetPath,{token:f.secret,newPassword:accessSecrets.issue().secret}),400,'INVALID_ACTION_LINK',[f.secret]);
  expect(await accountSnapshot(data)===before).toBe(true);
});
test('snapshot del destinatario distinto: rechazo sin cambiar correo, rol ni hash',async()=>{
  const f=await resetFixture(data);
  await data.context.database.pool.query('UPDATE "ActionToken" SET "emailCanonicalSnapshot"=$2 WHERE id=$1',[f.id,'otra-cuenta@example.test']);
  const before=await accountSnapshot(data);
  await resetError(await http.post(resetPath,{token:f.secret,newPassword:accessSecrets.issue().secret}),400,'INVALID_ACTION_LINK',[f.secret]);
  expect(await accountSnapshot(data)===before).toBe(true);
});
