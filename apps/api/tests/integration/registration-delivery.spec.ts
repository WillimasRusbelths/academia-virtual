import { afterAll,afterEach,beforeAll,beforeEach,expect,test } from 'vitest';
import { us2Dataset } from '../support/us2.js';
import type { Us2Dataset } from '../support/us2.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { generic202 } from '../support/us2-assertions.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';
import { DeliverPending } from '../../src/modules/mail/application/deliver-pending.js';
import { PostgresDeliveryStore } from '../../src/modules/mail/infrastructure/delivery-store.js';
import { PostgresDeliveryEligibility } from '../../src/modules/identity/infrastructure/delivery-eligibility.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';
import { createSmtpTransport } from '../../src/modules/mail/infrastructure/smtp-transport.js';

// El segundo ensayo Docker resuelve mailpit a loopback SOLO en su contenedor efímero.
// No detiene el Mailpit compartido ni cambia el adaptador o la configuración productiva.
const outage=process.env.TEST_SMTP_OUTAGE==='true';
let data:Us2Dataset;let http:Us1Http;
beforeAll(async()=>{data=await us2Dataset('us2_delivery');},120000);
beforeEach(async()=>{
  await data.reset();http=await us1Http(data);
  await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();
});
afterEach(async()=>{await http?.close();});afterAll(async()=>{await data?.cleanup();});
function worker() {
  const pool=data.context.database.pool;
  return new DeliverPending(new PostgresDeliveryStore(pool,new PostgresRateStore(pool,data.context.environment.rateHmacKey)),
    new PostgresDeliveryEligibility(pool),createPayloadCipher(data.context.environment),createSmtpTransport(data.context.environment));
}
async function state(email:string) {
  return (await data.context.database.pool.query(`SELECT u."emailVerifiedAt",t.id AS "tokenId",t."consumedAt",t."revokedAt",t."expiresAt",
    m.status,m.attempts,m."lastErrorClass",m."nextAttemptAt",m."encryptedPayload" IS NULL AS cleared
    FROM "User" u JOIN "ActionToken" t ON t."userId"=u.id JOIN "MailDelivery" m ON m."tokenId"=t.id
    WHERE u."emailCanonical"=$1`,[email])).rows;
}
test(`HTTP persiste sin esperar SMTP; ${outage?'caída real agota tres intentos':'transporte real acepta y limpia payload'}`,async()=>{
  const email=`entrega-${data.manifest.runId}@example.test`;
  await generic202(await http.post('/auth/register',{name:'Ensayo de entrega',email,password:data.account().password}));
  const initial=await state(email);expect(initial.length).toBe(1);
  expect(initial[0].status==='PENDING'&&initial[0].attempts===0&&initial[0].emailVerifiedAt===null).toBe(true);
  const executor=worker();const now=await data.clock!.now();
  await executor.tick();let row=(await state(email))[0];
  if(outage){
    expect(row.status==='PENDING'&&row.attempts===1&&['TEMPORARY','TIMEOUT'].includes(row.lastErrorClass)&&!row.cleared).toBe(true);
    expect(row.nextAttemptAt.getTime()-now.getTime()).toBe(60000);
    await data.clock!.set(row.nextAttemptAt);await executor.tick();row=(await state(email))[0];
    expect(row.status==='PENDING'&&row.attempts===2&&!row.cleared).toBe(true);
    expect(row.nextAttemptAt.getTime()-now.getTime()).toBe(360000);
    await data.clock!.set(row.nextAttemptAt);await executor.tick();row=(await state(email))[0];
    expect(row.status==='FAILED'&&row.attempts===3&&row.cleared).toBe(true);
    await executor.tick();expect((await state(email))[0].attempts).toBe(3);
  }else expect(row.status==='SENT'&&row.attempts===1&&row.cleared).toBe(true);
  expect(row.tokenId===initial[0].tokenId&&row.expiresAt.getTime()===initial[0].expiresAt.getTime()
    &&row.emailVerifiedAt===null&&row.consumedAt===null&&row.revokedAt===null).toBe(true);
},80000);

test('cuota SMTP agotada no limita admisión de reenvío ni gasta intento al posponer',async()=>{
  const account=data.account('STUDENT','UNVERIFIED');const pool=data.context.database.pool;
  const rates=new PostgresRateStore(pool,data.context.environment.rateHmacKey);
  for(let i=0;i<5;i++){
    expect((await rates.admitMail(account.email,'VERIFY_EMAIL','127.0.0.1','SMTP')).allowed).toBe(true);
    await data.clock!.advance(60000);
  }
  await generic202(await http.post('/auth/verification/request',{email:account.email}));
  const initial=(await state(account.email))[0];expect(initial.status==='PENDING'&&initial.attempts===0).toBe(true);
  await worker().tick();const row=(await state(account.email))[0];
  expect(row.status==='PENDING'&&row.attempts===0&&!row.cleared&&row.nextAttemptAt>initial.nextAttemptAt).toBe(true);
  expect(row.expiresAt.getTime()===initial.expiresAt.getTime()&&row.tokenId===initial.tokenId).toBe(true);
});
