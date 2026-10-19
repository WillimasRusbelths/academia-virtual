import { afterAll,afterEach,beforeAll,beforeEach,expect,test } from 'vitest';
import type { Pool } from 'pg';
import { us2Dataset,tokenState } from '../support/us2.js';
import type { Us2Dataset } from '../support/us2.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { adminData,adminError,adminRequest } from '../support/us4.js';
import { forgotAccepted,forgotPath,resetAccepted,resetError,resetFixture,resetPath } from '../support/us7.js';
import { Login } from '../../src/modules/identity/application/login.js';
import { ResetPassword } from '../../src/modules/identity/application/reset-password.js';
import { IssueActionLink } from '../../src/modules/identity/application/issue-action-link.js';
import { PostgresLoginStore } from '../../src/modules/identity/infrastructure/login-store.js';
import { PostgresPasswordResetStore } from '../../src/modules/identity/infrastructure/password-reset-store.js';
import { PostgresActionTokenStore } from '../../src/modules/identity/infrastructure/action-token-store.js';
import { PostgresDeliveryEligibility } from '../../src/modules/identity/infrastructure/delivery-eligibility.js';
import { accessSecrets,createPasswordCredentials } from '../../src/modules/identity/infrastructure/credentials.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';
import { DeliverPending } from '../../src/modules/mail/application/deliver-pending.js';
import { MailTransportFailure } from '../../src/modules/mail/application/delivery-ports.js';
import type { Mailer } from '../../src/modules/mail/application/delivery-ports.js';
import { PostgresDeliveryStore } from '../../src/modules/mail/infrastructure/delivery-store.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';
import { createSmtpTransport } from '../../src/modules/mail/infrastructure/smtp-transport.js';

let data:Us2Dataset;let http:Us1Http;
beforeAll(async()=>{data=await us2Dataset('us7_credential_races');},120000);
beforeEach(async()=>{await data.reset();http=await us1Http(data);
  await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();});
afterEach(async()=>{await http?.close();});afterAll(async()=>{await data?.cleanup();});
const row=async(id:string)=>(await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[id])).rows[0];
const rates=()=>new PostgresRateStore(data.context.database.pool,data.context.environment.rateHmacKey);
const disable=(id:string)=>adminRequest(http,'PUT',`/admin/users/${id}/status`,data.account('ADMIN').sessions[0].secret,{status:'DISABLED'});
function signal(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}

// Solo harness: no altera SQL ni añade puertas de prueba al código de producción.
function barrier(pool:Pool,point:'before-lock'|'before-commit'){
  const reached=signal();const release=signal();let pid=0;
  const paused=new Proxy(pool,{get(target,key){
    if(key==='connect')return async()=>{
      const client=await target.connect();pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      return new Proxy(client,{get(connection,property){
        if(property==='query')return async(...args:unknown[])=>{
          const sql=args[0];
          if(typeof sql==='string'&&(point==='before-lock'?sql.includes('FROM "User"')&&sql.includes('FOR UPDATE'):sql==='COMMIT')){
            reached.resolve();await release.promise;
          }
          return Reflect.apply(connection.query,connection,args);
        };
        const value=Reflect.get(connection,property);return typeof value==='function'?value.bind(connection):value;
      }});
    };
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  return {pool:paused,reached:reached.promise,release:release.resolve,get pid(){return pid;}};
}
async function blockedBy(pid:number){
  // Consultar fuera de la transacción retenida evita el snapshot de estadísticas de PostgreSQL.
  await expect.poll(async()=>Number((await data.context.database.pool.query(`SELECT count(*)::int AS n
    FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))`,[pid])).rows[0].n),{timeout:2500}).toBe(1);
}
test('login pausado tras verificar hash: reset confirma versión nueva y no nace ninguna sesión antigua',async()=>{
  const f=await resetFixture(data);const db=data.context.database.pool;const credentials=await createPasswordCredentials();
  const reached=signal();const release=signal();const password=accessSecrets.issue().secret;let verified=false;
  const login=new Login(new PostgresLoginStore(db),{hash:credentials.hash,async verify(value,hash){
    verified=await credentials.verify(value,hash);reached.resolve();await release.promise;return verified;
  }},accessSecrets,rates());
  const pending=login.execute({email:f.account.email,password:f.account.password,origin:'127.0.0.1'}).then(()=> 'UNEXPECTED_SUCCESS',error=>error.code);
  try{
    await reached.promise;expect(verified).toBe(true);await resetAccepted(await http.post(resetPath,{token:f.secret,newPassword:password}));
    release.resolve();expect(await pending).toBe('INVALID_CREDENTIALS');
    const sessions=(await db.query('SELECT "authVersion","revokedAt" FROM "Session" WHERE "userId"=$1',[f.account.id])).rows;
    expect(sessions.length===2&&sessions.every(session=>BigInt(session.authVersion)===0n&&session.revokedAt!==null)).toBe(true);
    expect(BigInt((await row(f.account.id)).authVersion)===1n).toBe(true);
    for(const session of f.account.sessions)await adminError(await http.get('/me',session.secret),401,'AUTH_REQUIRED');
    expect((await http.post('/auth/login',{email:f.account.email,password:f.account.password})).status).toBe(401);
    expect((await http.post('/auth/login',{email:f.account.email,password})).status).toBe(200);
    const fresh=(await db.query('SELECT "authVersion" FROM "Session" WHERE "userId"=$1 AND "revokedAt" IS NULL',[f.account.id])).rows;
    expect(fresh.length===1&&BigInt(fresh[0].authVersion)===1n).toBe(true);
  }finally{release.resolve();await pending;}
});
for(const point of ['before-lock','before-commit'] as const)test(`reset frente a desactivación (${point}): orden serial y ningún rescate al reactivar`,async()=>{
  const f=await resetFixture(data,data.account(),true);const db=data.context.database.pool;const paused=barrier(db,point);
  const reset=new ResetPassword(new PostgresPasswordResetStore(paused.pool),await createPasswordCredentials(),accessSecrets);
  const pending=reset.execute({token:f.secret,newPassword:accessSecrets.issue().secret}).then(()=> 'RESET',error=>error.code);
  let disabling:Promise<Response>|undefined;
  try{
    await paused.reached;disabling=disable(f.account.id);
    if(point==='before-lock')await adminData(await disabling);else await blockedBy(paused.pid);
    paused.release();expect(await pending).toBe(point==='before-lock'?'INVALID_ACTION_LINK':'RESET');
    if(point==='before-commit')await adminData(await disabling);
    const user=await row(f.account.id);expect(user.status==='DISABLED'&&BigInt(user.authVersion)===(point==='before-lock'?1n:2n)).toBe(true);
    const token=await tokenState(data,f.id);expect((token.revokedAt!==null)!==(token.consumedAt!==null)).toBe(true);
    expect(token.consumedAt!==null).toBe(point==='before-commit');
    const mail=(await db.query('SELECT status,"encryptedPayload" FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0];
    expect(mail.status==='CANCELLED'&&mail.encryptedPayload===null).toBe(true);
    await adminData(await adminRequest(http,'PUT',`/admin/users/${f.account.id}/status`,data.account('ADMIN').sessions[0].secret,{status:'ACTIVE'}));
    await resetError(await http.post(resetPath,{token:f.secret,newPassword:accessSecrets.issue().secret}),400,'INVALID_ACTION_LINK');
    for(const session of f.account.sessions)await adminError(await http.get('/me',session.secret),401,'AUTH_REQUIRED');
  }finally{paused.release();await pending;await disabling;}
});
for(const point of ['before-lock','before-commit'] as const)test(`emisión de reset frente a desactivación (${point}): no queda enlace ni entrega utilizables`,async()=>{
  const f=data.account();const db=data.context.database.pool;const paused=barrier(db,point);
  const issuer=new IssueActionLink(new PostgresActionTokenStore(paused.pool),rates(),accessSecrets,
    createPayloadCipher(data.context.environment),data.context.environment.appOrigin);
  const pending=issuer.execute({email:f.email,purpose:'RESET_PASSWORD',origin:'127.0.0.1'});
  let disabling:Promise<Response>|undefined;
  try{
    await paused.reached;disabling=disable(f.id);
    if(point==='before-lock')await adminData(await disabling);else await blockedBy(paused.pid);
    paused.release();const result=await pending;expect(result.admitted).toBe(true);expect(result.queued).toBe(point==='before-commit');
    if(point==='before-commit')await adminData(await disabling);
    expect((await row(f.id)).status).toBe('DISABLED');
    const tokens=(await db.query('SELECT "revokedAt","consumedAt" FROM "ActionToken" WHERE "userId"=$1',[f.id])).rows;
    expect(tokens.length).toBe(point==='before-commit'?1:0);
    expect(tokens.every(token=>token.revokedAt!==null&&token.consumedAt===null)).toBe(true);
    const mail=(await db.query('SELECT status,"encryptedPayload" FROM "MailDelivery"')).rows;
    expect(mail.length===tokens.length&&mail.every(value=>value.status==='CANCELLED'&&value.encryptedPayload===null)).toBe(true);
  }finally{paused.release();await pending;await disabling;}
});

function unavailableSmtp(){
  let calls=0;
  // TEST_MAILPIT_DOWN se usa solo al aislar DNS en un contenedor transitorio de ensayo.
  // El servicio Mailpit compartido y el ensayo manual no se detienen ni se reconfiguran.
  const transport:Mailer=process.env.TEST_MAILPIT_DOWN==='true'?createSmtpTransport(data.context.environment)
    :{async send(){throw new MailTransportFailure('TEMPORARY');}};
  const worker=new DeliverPending(new PostgresDeliveryStore(data.context.database.pool,rates()),
    new PostgresDeliveryEligibility(data.context.database.pool),createPayloadCipher(data.context.environment),
    {async send(payload,signal){calls++;await transport.send(payload,signal);}});
  return {worker,get calls(){return calls;}};
}
async function currentToken(){
  return (await data.context.database.pool.query(`SELECT * FROM "ActionToken"
    WHERE purpose='RESET_PASSWORD' AND "consumedAt" IS NULL AND "revokedAt" IS NULL`)).rows[0];
}
test('SMTP indisponible: solicitudes repetidas conservan cuenta/sesiones, cuotas y reemplazo sin ampliar caducidad',async()=>{
  const f=data.account();const db=data.context.database.pool;const before=JSON.stringify(await row(f.id));
  const smtp=unavailableSmtp();const oldTokens:string[]=[];
  for(let attempt=0;attempt<5;attempt++){
    await forgotAccepted(await http.post(forgotPath,{email:f.email}));
    const token=await currentToken();oldTokens.push(token.id);
    expect(token.expiresAt.getTime()-token.createdAt.getTime()).toBe(1800000);
    await smtp.worker.tick();
    const delivery=(await db.query('SELECT * FROM "MailDelivery" WHERE "tokenId"=$1',[token.id])).rows[0];
    expect(delivery.status==='PENDING'&&delivery.attempts===1&&['TEMPORARY','TIMEOUT'].includes(delivery.lastErrorClass)
      &&delivery.nextAttemptAt.getTime()===(await data.clock!.now()).getTime()+60000).toBe(true);
    await resetError(await http.post(forgotPath,{email:f.email}),429,'RATE_LIMITED');
    expect((await currentToken()).id===token.id).toBe(true);await data.clock!.advance(60000);
  }
  expect(smtp.calls).toBe(5);const last=await currentToken();
  const limited=await http.post(forgotPath,{email:f.email});await resetError(limited,429,'RATE_LIMITED');
  expect(limited.headers.get('retry-after')).toBe('3300');expect((await currentToken()).id===last.id).toBe(true);
  expect(JSON.stringify(await row(f.id))===before).toBe(true);
  for(const session of f.sessions)expect((await http.get('/me',session.secret)).status).toBe(200);
  const tokens=(await db.query('SELECT * FROM "ActionToken" WHERE id=ANY($1::uuid[])',[oldTokens])).rows;
  expect(tokens.length===5&&tokens.every(token=>token.expiresAt.getTime()-token.createdAt.getTime()===1800000)
    &&tokens.filter(token=>token.revokedAt!==null).length===4).toBe(true);
  // Al llegar al TTL, sweep cancela sin contactar SMTP ni transformar un envío en consumo.
  await data.clock!.set(last.expiresAt);await smtp.worker.tick();expect(smtp.calls).toBe(5);
  const delivery=(await db.query('SELECT * FROM "MailDelivery" WHERE "tokenId"=$1',[last.id])).rows[0];
  expect(delivery.status==='CANCELLED'&&delivery.encryptedPayload===null&&delivery.lastErrorClass==='EXPIRED').toBe(true);
  expect((await tokenState(data,last.id)).expiresAt.getTime()).toBe(last.expiresAt.getTime());
  expect((await tokenState(data,last.id)).consumedAt).toBeNull();
},process.env.TEST_MAILPIT_DOWN==='true'?180000:15000);
test('SMTP indisponible: veinte admisiones por origen suman propósitos, incluso sin destinatario; reiniciar adaptadores no libera cuota',async()=>{
  const f=data.account();await forgotAccepted(await http.post(forgotPath,{email:f.email}));
  const smtp=unavailableSmtp();await smtp.worker.tick();expect(smtp.calls).toBe(1);
  const token=await currentToken();
  for(let index=1;index<20;index++)await forgotAccepted(await http.post(index%2?'/auth/verification/request':forgotPath,
    {email:`ausente-${index}-${data.manifest.runId}@example.test`}));
  await resetError(await http.post('/auth/verification/request',{email:`otro-${data.manifest.runId}@example.test`}),429,'RATE_LIMITED');
  await data.clock!.advance(60000);
  const refused=await rates().admitMail(`nuevo-${data.manifest.runId}@example.test`,'RESET_PASSWORD','127.0.0.1','ADMISSION');
  expect(refused.allowed===false&&refused.retryAfterSeconds===3540).toBe(true);
  expect((await currentToken()).id===token.id).toBe(true);
  // La fase SMTP es independiente de admisión; un reintento no crea otro enlace.
  const restarted=unavailableSmtp();await restarted.worker.tick();expect(restarted.calls).toBe(1);
  const delivery=(await data.context.database.pool.query('SELECT * FROM "MailDelivery" WHERE "tokenId"=$1',[token.id])).rows[0];
  expect(delivery.attempts===2&&delivery.status==='PENDING'&&delivery.nextAttemptAt.getTime()===(await data.clock!.now()).getTime()+300000).toBe(true);
  expect((await tokenState(data,token.id)).expiresAt.getTime()).toBe(token.expiresAt.getTime());
  await data.clock!.set(token.expiresAt);await restarted.worker.tick();expect(restarted.calls).toBe(1);
  expect((await data.context.database.pool.query('SELECT status,"encryptedPayload" FROM "MailDelivery" WHERE "tokenId"=$1',[token.id])).rows
    .every(value=>value.status==='CANCELLED'&&value.encryptedPayload===null)).toBe(true);
},process.env.TEST_MAILPIT_DOWN==='true'?180000:15000);
