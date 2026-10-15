import { afterAll,afterEach,beforeAll,beforeEach,expect,test } from 'vitest';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { us2Dataset,tokenState } from '../support/us2.js';
import type { Us2Dataset } from '../support/us2.js';
import { accountSnapshot,resetFixture,resetPath,resetAccepted,resetError } from '../support/us7.js';
import { ResetPassword } from '../../src/modules/identity/application/reset-password.js';
import { PostgresPasswordResetStore } from '../../src/modules/identity/infrastructure/password-reset-store.js';
import { accessSecrets,createPasswordCredentials } from '../../src/modules/identity/infrastructure/credentials.js';

let data:Us2Dataset;let http:Us1Http;
beforeAll(async()=>{data=await us2Dataset('us7_reset_store');},120000);
beforeEach(async()=>{await data.reset();http=await us1Http(data);
  await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();});
afterEach(async()=>{await http?.close();});afterAll(async()=>{await data?.cleanup();});
test('provisional vencida verificada: reset limpia provisional, conserva identidad y habilita solo contraseña nueva',async()=>{
  const account=data.account('TEACHER','PROVISIONAL');const db=data.context.database.pool;
  const before=(await db.query('SELECT * FROM "User" WHERE id=$1',[account.id])).rows[0];
  await data.clock!.set(before.provisionalExpiresAt);await db.query('UPDATE "User" SET "emailVerifiedAt"=clock_timestamp() WHERE id=$1',[account.id]);
  const f=await resetFixture(data,account);const password=accessSecrets.issue().secret;
  const others=JSON.stringify((await db.query('SELECT * FROM "Session" WHERE "userId"<>$1 ORDER BY id',[account.id])).rows);
  await resetAccepted(await http.post(resetPath,{token:f.secret,newPassword:password}));
  const after=(await db.query('SELECT * FROM "User" WHERE id=$1',[account.id])).rows[0];
  expect(after.mustSetPassword===false&&after.provisionalPasswordHash===null&&after.provisionalExpiresAt===null
    &&after.emailVerifiedAt!==null&&after.email===before.email&&after.role===before.role&&after.status==='ACTIVE'
    &&BigInt(after.authVersion)===BigInt(before.authVersion)+1n).toBe(true);
  expect(JSON.stringify((await db.query('SELECT * FROM "Session" WHERE "userId"<>$1 ORDER BY id',[account.id])).rows)===others).toBe(true);
  expect((await http.post('/auth/login',{email:account.email,password:account.password})).status).toBe(401);
  expect((await http.post('/auth/login',{email:account.email,password})).status).toBe(200);
  expect((await http.post('/auth/password/initial',{email:account.email,provisionalPassword:account.password,newPassword:accessSecrets.issue().secret})).status).toBe(401);
});
test('fallo después de cambiar hash y consumir token: rollback total y posterior reintento con el mismo enlace',async()=>{
  const f=await resetFixture(data,data.account(),true);const before=await accountSnapshot(data);const password=accessSecrets.issue().secret;
  await data.context.isolated.ownerQuery(`CREATE FUNCTION fail_reset_session() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Fallo privado de prueba' USING ERRCODE='23514'; END $$;
    CREATE TRIGGER fail_reset_session BEFORE UPDATE ON "Session" FOR EACH ROW EXECUTE FUNCTION fail_reset_session();`);
  try{await resetError(await http.post(resetPath,{token:f.secret,newPassword:password}),503,'TEMPORARILY_UNAVAILABLE',[password,f.secret]);
    expect(await accountSnapshot(data)===before).toBe(true);
  }finally{await data.context.isolated.ownerQuery('DROP TRIGGER fail_reset_session ON "Session"; DROP FUNCTION fail_reset_session()');}
  await resetAccepted(await http.post(resetPath,{token:f.secret,newPassword:password}));
  const delivery=(await data.context.database.pool.query('SELECT * FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0];
  expect(delivery.status==='CANCELLED'&&['encryptedPayload','nonce','authTag','keyId','leaseUntil','claimId'].every(key=>delivery[key]===null)).toBe(true);
});
test('hash fuera de locks y caducidad revalidada después de calcularlo',async()=>{
  const f=await resetFixture(data);const credentials=await createPasswordCredentials();const before=await accountSnapshot(data);
  let reached!:()=>void;let release!:()=>void;const hashing=new Promise<void>(resolve=>{reached=resolve;});const proceed=new Promise<void>(resolve=>{release=resolve;});
  const reset=new ResetPassword(new PostgresPasswordResetStore(data.context.database.pool),{verify:credentials.verify,async hash(password){
    const result=await credentials.hash(password);reached();await proceed;return result;
  }},accessSecrets);
  const pending=reset.execute({token:f.secret,newPassword:accessSecrets.issue().secret}).then(()=> 'UNEXPECTED_SUCCESS',error=>error.code);
  const connection=await data.context.database.pool.connect();
  try{await hashing;await connection.query('BEGIN');
    await connection.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE NOWAIT',[f.account.id]);
    await connection.query('ROLLBACK');await data.clock!.set(f.expiresAt);release();
    expect(await pending).toBe('INVALID_ACTION_LINK');expect(await accountSnapshot(data)===before).toBe(true);
    expect((await tokenState(data,f.id)).consumedAt).toBeNull();
  }finally{release();await connection.query('ROLLBACK').catch(()=>undefined);connection.release();await pending;}
});
test('cookie configurada HTTPS: solo se elimina tras éxito, sin emitir sesión',async()=>{
  await http.close();http=await us1Http(data,'https://academia.example.test');
  await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();
  const f=await resetFixture(data);const response=await http.post(resetPath,{token:f.secret,newPassword:accessSecrets.issue().secret});
  expect(response.status).toBe(204);expect(await response.text()).toBe('');
  expect(response.headers.get('set-cookie')).toBe('__Host-av_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0');
  const sessions=(await data.context.database.pool.query('SELECT "revokedAt" FROM "Session" WHERE "userId"=$1',[f.account.id])).rows;
  expect(sessions.length===2&&sessions.every(session=>session.revokedAt!==null)).toBe(true);
});
