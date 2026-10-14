import { beforeAll,beforeEach,afterAll,afterEach,test,expect } from 'vitest';
import { us2Dataset,seedAction } from '../support/us2.js';
import type { Us2Dataset } from '../support/us2.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { adminRequest,adminData,adminError,adminSnapshot } from '../support/us4.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';

let data:Us2Dataset;let http:Us1Http;
beforeAll(async()=>{data=await us2Dataset('us4_revocation');},120000);
beforeEach(async()=>{await data.reset();http=await us1Http(data);await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();});
afterEach(async()=>{await http?.close();});afterAll(async()=>{await data?.cleanup();});
const command=(id:string,field:'role'|'status',value:string,secret=data.account('ADMIN').sessions[0].secret)=>adminRequest(http,'PUT',`/admin/users/${id}/${field}`,secret,{[field]:value});
const row=async(id:string)=>(await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[id])).rows[0];
async function actionFixtures(){
  const verification=await seedAction(data,'VERIFY_EMAIL',true);const reset=await seedAction(data,'RESET_PASSWORD',true);
  const f=data.account();const db=data.context.database.pool;const cipher=createPayloadCipher(data.context.environment);
  const rates=new PostgresRateStore(db,data.context.environment.rateHmacKey);
  for(const [token,purpose] of [[verification,'VERIFY_EMAIL'],[reset,'RESET_PASSWORD']] as const){
    await db.query('UPDATE "ActionToken" SET "userId"=$2,"emailCanonicalSnapshot"=$3 WHERE id=$1',[token.id,f.id,f.email]);
    const payload=cipher.encrypt({recipient:f.email,link:token.link,template:purpose});const keys=rates.mailKeys(f.email,purpose,'127.0.0.1');
    await db.query(`UPDATE "MailDelivery" SET "recipientKey"=$2,"originKey"=$3,"encryptedPayload"=$4,nonce=$5,"authTag"=$6,"keyId"=$7 WHERE "tokenId"=$1`,
      [token.id,keys.recipientKey,keys.originKey,Buffer.from(payload.encryptedPayload),Buffer.from(payload.nonce),Buffer.from(payload.authTag),payload.keyId]);
  }
  return {verification,reset,f};
}
test('control: dos sesiones habilitadas reales y revocación aislada de logout',async()=>{
  const f=data.account();const store=new PostgresSessionStore(data.context.database.pool);
  expect((await store.lookup(f.sessions[0].secret))!==null&&(await store.lookup(f.sessions[1].secret))!==null).toBe(true);
  expect((await http.post('/auth/logout',{},f.sessions[0].secret)).status).toBe(204);
  expect((await http.get('/me',f.sessions[0].secret)).status).toBe(401);expect((await http.get('/me',f.sessions[1].secret)).status).toBe(200);
});
test('control: fixtures de ambos propósitos y payload cifrado coherente, sin SMTP',async()=>{
  const {f}=await actionFixtures();const tokens=(await data.context.database.pool.query('SELECT * FROM "ActionToken"')).rows;
  expect(tokens.length===2&&tokens.every(token=>token.userId===f.id&&token.emailCanonicalSnapshot===f.email&&token.revokedAt===null&&token.consumedAt===null)).toBe(true);
  const cipher=createPayloadCipher(data.context.environment);const rows=(await data.context.database.pool.query('SELECT * FROM "MailDelivery"')).rows;
  expect(rows.length===2&&rows.every(value=>value.status==='PENDING'&&cipher.decrypt(value).recipient===f.email)).toBe(true);
});
for(const role of ['TEACHER','ADMIN'])test(`cambio efectivo a ${role}: authVersion una vez y dos sesiones revocadas después del commit`,async()=>{
  const f=data.account();const before=await row(f.id);
  const view=await adminData(await command(f.id,'role',role));expect(view.role===role).toBe(true);
  const after=await row(f.id);expect(BigInt(after.authVersion)===BigInt(before.authVersion)+1n).toBe(true);
  const sessions=(await data.context.database.pool.query('SELECT "revokedAt" FROM "Session" WHERE "userId"=$1',[f.id])).rows;
  expect(sessions.length===2&&sessions.every(value=>value.revokedAt!==null)).toBe(true);
  for(const session of f.sessions)await adminError(await http.get('/me',session.secret),401,'AUTH_REQUIRED',[session.secret]);
  const login=await http.post('/auth/login',{email:f.email,password:f.password});expect(login.status).toBe(200);expect((await login.json()).data.role===role).toBe(true);
});
test('desactivar y reactivar no revive sesiones, verificación ni tokens/correos revocados',async()=>{
  // Ambos propósitos son fixtures de persistencia; no se declara reset funcional.
  const {verification,reset,f}=await actionFixtures();const db=data.context.database.pool;
  const before=await row(f.id);await adminData(await command(f.id,'status','DISABLED'));
  const disabled=await row(f.id);expect(disabled.status==='DISABLED'&&BigInt(disabled.authVersion)===BigInt(before.authVersion)+1n).toBe(true);
  for(const session of f.sessions)await adminError(await http.get('/me',session.secret),401,'AUTH_REQUIRED');
  const tokens=(await db.query('SELECT "revokedAt","consumedAt" FROM "ActionToken" WHERE "userId"=$1',[f.id])).rows;
  expect(tokens.length===2&&tokens.every(token=>token.revokedAt!==null&&token.consumedAt===null)).toBe(true);
  const deliveries=(await db.query('SELECT status,"encryptedPayload",nonce,"authTag" FROM "MailDelivery"')).rows;
  expect(deliveries.length===2&&deliveries.every(value=>value.status==='CANCELLED'&&value.encryptedPayload===null&&value.nonce===null&&value.authTag===null)).toBe(true);
  const invalidated=JSON.stringify(tokens);await adminData(await command(f.id,'status','ACTIVE'));
  const active=await row(f.id);expect(active.status==='ACTIVE'&&active.emailVerifiedAt?.getTime()===before.emailVerifiedAt?.getTime()).toBe(true);
  expect(JSON.stringify((await db.query('SELECT "revokedAt","consumedAt" FROM "ActionToken" WHERE "userId"=$1',[f.id])).rows)===invalidated).toBe(true);
  for(const session of f.sessions)await adminError(await http.get('/me',session.secret),401,'AUTH_REQUIRED');
  expect((await http.post('/auth/login',{email:f.email,password:f.password})).status).toBe(200);
  expect((await http.post('/auth/verification/confirm',{token:verification.secret})).status).toBe(400);
  expect(reset.secret.length>0).toBe(true);
});
for(const field of ['role','status'] as const)test(`no-op ${field}: no incrementa versión ni revive sesión revocada`,async()=>{
  const f=data.account();await http.post('/auth/logout',{},f.sessions[0].secret);const before=await row(f.id);
  await adminData(await command(f.id,field,field==='role'?'STUDENT':'ACTIVE'));
  expect((await row(f.id)).authVersion===before.authVersion).toBe(true);
  await adminError(await http.get('/me',f.sessions[0].secret),401,'AUTH_REQUIRED');expect((await http.get('/me',f.sessions[1].secret)).status).toBe(200);
});
for(const field of ['role','status'] as const)test(`cambio propio ${field} prohibido sin efectos`,async()=>{
  const actor=data.account('ADMIN');const before=await adminSnapshot(data);
  await adminError(await command(actor.id,field,field==='role'?'STUDENT':'DISABLED'),409,'ADMIN_INVARIANT');expect(await adminSnapshot(data)===before).toBe(true);
});
test('único ADMIN ACTIVE no puede retirarse; marca de bootstrap se conserva',async()=>{
  const actor=data.account('ADMIN');await data.context.database.pool.query(`UPDATE "User" SET role='TEACHER' WHERE role='ADMIN' AND id<>$1`,[actor.id]);
  expect((await data.context.database.pool.query(`SELECT count(*)::int AS n FROM "User" WHERE role='ADMIN' AND status='ACTIVE'`)).rows[0].n).toBe(1);
  const before=await adminSnapshot(data);for(const field of ['role','status'] as const)await adminError(await command(actor.id,field,field==='role'?'TEACHER':'DISABLED'),409,'ADMIN_INVARIANT');
  expect(await adminSnapshot(data)===before).toBe(true);
});
for(const change of ['sesión','rol','estado'] as const)test(`actor pierde ${change} después del guard: escritura bloqueada no confirma`,async()=>{
  const actor=data.account('ADMIN');const target=data.account();
  // Comprobar la ruta antes del lock evita confundir un 404 con una barrera defectuosa.
  await adminData(await command(target.id,'role','STUDENT'));
  const before=JSON.stringify(await row(target.id));const auditBefore=(await data.context.database.pool.query('SELECT count(*)::int AS n FROM "AuditEvent"')).rows[0].n;
  const holder=await data.context.database.pool.connect();let pending:Promise<Response>|undefined;
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "SystemState" WHERE id=1 FOR UPDATE');
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending=command(target.id,'role','TEACHER',actor.sessions[0].secret);
    await expect.poll(async()=>Number((await holder.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows[0].n)>0,{timeout:3000}).toBe(true);
    if(change==='sesión')await data.context.database.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[actor.sessions[0].id]);
    else if(change==='rol')await data.context.database.pool.query(`UPDATE "User" SET role='TEACHER',"authVersion"="authVersion"+1 WHERE id=$1`,[actor.id]);
    else await data.context.database.pool.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp(),"authVersion"="authVersion"+1 WHERE id=$1`,[actor.id]);
    await holder.query('COMMIT');await adminError(await pending,401,'AUTH_REQUIRED');
    expect(JSON.stringify(await row(target.id))===before).toBe(true);
    expect((await data.context.database.pool.query('SELECT count(*)::int AS n FROM "AuditEvent"')).rows[0].n).toBe(auditBefore);
  }finally{await holder.query('ROLLBACK').catch(()=>undefined);holder.release();await pending;}
});
