import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,test } from 'vitest';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { seedAction,tokenState,us2Dataset } from '../support/us2.js';
import { generic202,registrationError } from '../support/us2-assertions.js';
import type { Us2Dataset } from '../support/us2.js';
import { createPasswordCredentials,accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';
import { DeliverPending } from '../../src/modules/mail/application/deliver-pending.js';
import { MailTransportFailure } from '../../src/modules/mail/application/delivery-ports.js';
import { PostgresDeliveryStore } from '../../src/modules/mail/infrastructure/delivery-store.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';
import { createSmtpTransport } from '../../src/modules/mail/infrastructure/smtp-transport.js';
import { PostgresDeliveryEligibility } from '../../src/modules/identity/infrastructure/delivery-eligibility.js';
import { assertMailpitAvailable,mailpitOrigin } from '../support/mailpit.js';

describe('T041 · unicidad, enlaces y entrega en PostgreSQL real',()=>{
  let data:Us2Dataset;let http:Us1Http;
  beforeAll(async()=>{data=await us2Dataset('us2_concurrency');await assertMailpitAvailable();},120000);
  beforeEach(async()=>{await data.reset();});
  afterEach(async()=>{await http?.close();http=undefined!;});afterAll(async()=>{await data?.cleanup();});
  const start=async()=>{http=await us1Http(data);
    // Controlar cuándo se procesa correo en estos ensayos de enlaces; no cambia el runtime manual.
    await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();
    return http;};
  test('control: unicidad real y parcial estática sin reloj en predicado',async()=>{
    const account=data.account('STUDENT','UNVERIFIED');let code='';
    try {await data.context.database.pool.query(`INSERT INTO "User" (name,email,"emailCanonical",role,"passwordHash")
      SELECT name,email,"emailCanonical",role,"passwordHash" FROM "User" WHERE id=$1`,[account.id]);}
    catch(error){code=typeof error==='object'&&error!==null&&'code'in error?String(error.code):'';}
    expect(code).toBe('23505');
    const indexes=(await data.context.database.pool.query<{indexdef:string}>('SELECT indexdef FROM pg_indexes WHERE schemaname=$1 AND tablename=$2',
      [data.context.environment.databaseSchema,'ActionToken'])).rows;
    expect(indexes.some(row=>row.indexdef.includes('UNIQUE') && row.indexdef.includes('consumedAt') && row.indexdef.includes('revokedAt')
      && !/now\(|clock_timestamp\(/i.test(row.indexdef))).toBe(true);
  });
  test('20 altas canónicas simultáneas: exactamente una cuenta, credencial ganadora intacta y ninguna privilegiada',async()=>{
    await start();const email=`competencia-${data.manifest.runId}@example.test`;
    const attempts=Array.from({length:20},(_,i)=>({name:`Intento ${i}`,email:i%2?' '+email.toUpperCase()+' ':email,password:accessSecrets.issue().secret}));
    const responses=await Promise.all(attempts.map(body=>http.post('/auth/register',body)));
    expect(responses.filter(response=>![202,429].includes(response.status)).map(response=>response.status)).toEqual([]);
    const rows=(await data.context.database.pool.query('SELECT * FROM "User" WHERE "emailCanonical"=$1',[email])).rows;
    expect(rows.length).toBe(1);const winner=rows[0];const input=attempts.find(attempt=>attempt.name===winner.name);
    expect(input!==undefined && winner.role==='STUDENT' && winner.emailVerifiedAt===null).toBe(true);
    expect(await (await createPasswordCredentials()).verify(input!.password,winner.passwordHash)).toBe(true);
    for(const response of responses)if(response.status===202)await generic202(response,attempts.map(attempt=>attempt.password));
    else await registrationError(response,429,'RATE_LIMITED');
    const before=JSON.stringify(winner);
    await http.post('/auth/register',{name:'No sobrescribir',email,password:data.account().password});
    expect(JSON.stringify((await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[winner.id])).rows[0])===before).toBe(true);
    expect(Number((await data.context.database.pool.query('SELECT count(*) FROM "ActionToken" WHERE "userId"=$1',[winner.id])).rows[0].count)).toBeLessThanOrEqual(1);
  });
  test('20 duplicados contra una cuenta previa no sobrescriben contraseña, nombre ni estado',async()=>{
    await start();const account=data.account('STUDENT','DISABLED');
    const before=JSON.stringify((await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[account.id])).rows[0]);
    const responses=await Promise.all(Array.from({length:20},()=>http.post('/auth/register',{
      name:'Otro',email:' '+account.email.toUpperCase()+' ',password:data.account().password})));
    expect(responses.filter(response=>![202,429].includes(response.status)).map(response=>response.status)).toEqual([]);
    expect(JSON.stringify((await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[account.id])).rows[0])===before).toBe(true);
    expect((await data.context.database.pool.query('SELECT id FROM "ActionToken" WHERE "userId"=$1',[account.id])).rowCount).toBe(0);
  });
  test('doble consumo concurrente: un 204 y un 400; una única marca y sin sesiones nuevas',async()=>{
    const f=await seedAction(data);await start();
    const responses=await Promise.all([http.post('/auth/verification/confirm',{token:f.secret}),http.post('/auth/verification/confirm',{token:f.secret})]);
    expect(responses.map(response=>response.status).sort()).toEqual([204,400]);
    const row=await tokenState(data,f.id);expect(row.consumedAt!==null && row.revokedAt===null).toBe(true);
    expect((await data.context.database.pool.query('SELECT "emailVerifiedAt" FROM "User" WHERE id=$1',[f.account.id])).rows[0].emailVerifiedAt!==null).toBe(true);
    expect((await data.context.database.pool.query('SELECT id FROM "Session" WHERE "userId"=$1',[f.account.id])).rowCount).toBe(0);
    await registrationError(responses.find(response=>response.status===400)!,400,'INVALID_ACTION_LINK',[f.secret]);
  });
  for(const delta of [-1,0])test(`frontera de 24 horas ${delta===0?'exactas deniega':'menos 1 ms permite'}`,async()=>{
    const f=await seedAction(data);await data.clock!.set(new Date(f.expiresAt.getTime()+delta));await start();
    const response=await http.post('/auth/verification/confirm',{token:f.secret});
    if(delta===0){await registrationError(response,400,'INVALID_ACTION_LINK',[f.secret]);expect((await tokenState(data,f.id)).consumedAt).toBeNull();}
    else {expect(response.status).toBe(204);expect((await tokenState(data,f.id)).consumedAt!==null).toBe(true);}
  });
  for(const invalid of ['propósito','snapshot','desactivada'] as const)test(`consumo rechaza ${invalid} sin efectos`,async()=>{
    const f=await seedAction(data,invalid==='propósito'?'RESET_PASSWORD':'VERIFY_EMAIL');
    if(invalid==='snapshot')await data.context.database.pool.query('UPDATE "ActionToken" SET "emailCanonicalSnapshot"=$2 WHERE id=$1',[f.id,'otro@example.test']);
    if(invalid==='desactivada')await data.context.database.pool.query('UPDATE "User" SET status=\'DISABLED\',"disabledAt"=clock_timestamp() WHERE id=$1',[f.account.id]);
    const before=JSON.stringify((await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[f.account.id])).rows[0]);await start();
    await registrationError(await http.post('/auth/verification/confirm',{token:f.secret}),400,'INVALID_ACTION_LINK',[f.secret]);
    expect((await tokenState(data,f.id)).consumedAt).toBeNull();
    expect(JSON.stringify((await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[f.account.id])).rows[0])===before).toBe(true);
  });
  for(const expired of [false,true])test(`reemisión revoca anterior ${expired?'vencido':'vigente'} y cancela su entrega; el parcial no usa now()`,async()=>{
    await start();const f=await seedAction(data,'VERIFY_EMAIL',true);
    if(expired)await data.clock!.set(f.expiresAt);
    await generic202(await http.post('/auth/verification/request',{email:f.account.email}),[f.secret]);
    const old=await tokenState(data,f.id);expect(old.revokedAt!==null && old.consumedAt===null).toBe(true);
    const delivery=(await data.context.database.pool.query('SELECT status,"encryptedPayload" FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0];
    expect(delivery.status==='CANCELLED' && delivery.encryptedPayload===null).toBe(true);
    const active=(await data.context.database.pool.query(`SELECT id FROM "ActionToken" WHERE "userId"=$1 AND purpose='VERIFY_EMAIL'
      AND "consumedAt" IS NULL AND "revokedAt" IS NULL`,[f.account.id])).rows;
    expect(active.length===1 && active[0].id!==f.id).toBe(true);
    await registrationError(await http.post('/auth/verification/confirm',{token:f.secret}),400,'INVALID_ACTION_LINK',[f.secret]);
  });
  test('reenvío limitado no revoca ni cancela; conserva enlace utilizable',async()=>{
    await start();const f=await seedAction(data,'VERIFY_EMAIL',true);const rates=new PostgresRateStore(data.context.database.pool,data.context.environment.rateHmacKey);
    expect((await rates.admitMail(f.account.email,'VERIFY_EMAIL','127.0.0.1','ADMISSION')).allowed).toBe(true);
    await registrationError(await http.post('/auth/verification/request',{email:f.account.email}),429,'RATE_LIMITED',[f.secret]);
    expect((await tokenState(data,f.id)).revokedAt).toBeNull();expect((await tokenState(data,f.id)).consumedAt).toBeNull();
    expect((await data.context.database.pool.query('SELECT status FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0].status!=='CANCELLED').toBe(true);
    expect((await http.post('/auth/verification/confirm',{token:f.secret})).status).toBe(204);
  });
  test('fundamento: fallo temporal controlado y retry SMTP real conservan token, payload y caducidad',async()=>{
    // Error controlado en el contrato Mailer; no se apaga Mailpit ni la API manual.
    const f=await seedAction(data,'VERIFY_EMAIL',true);const pool=data.context.database.pool;
    const store=new PostgresDeliveryStore(pool,new PostgresRateStore(pool,data.context.environment.rateHmacKey));
    const cipher=createPayloadCipher(data.context.environment);const actual=createSmtpTransport(data.context.environment);
    let calls=0;
    const executor=new DeliverPending(store,new PostgresDeliveryEligibility(pool),cipher,{async send(payload,signal){
      expect(payload.link===f.link).toBe(true);calls++;if(calls===1)throw new MailTransportFailure('TEMPORARY');await actual.send(payload,signal);
    }});
    await executor.tick();let row=(await pool.query('SELECT * FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0];
    expect(row.status==='PENDING' && row.attempts===1 && row.lastErrorClass==='TEMPORARY').toBe(true);
    expect(cipher.decrypt(row).link===f.link).toBe(true);
    await data.clock!.set(row.nextAttemptAt);await executor.tick();row=(await pool.query('SELECT * FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0];
    expect(row.status==='SENT' && row.attempts===2 && row.encryptedPayload===null).toBe(true);
    const token=await tokenState(data,f.id);expect(token.expiresAt.getTime()===f.expiresAt.getTime() && token.consumedAt===null && token.revokedAt===null).toBe(true);
    expect((await pool.query('SELECT id FROM "ActionToken" WHERE "userId"=$1',[f.account.id])).rowCount).toBe(1);
    const messages=await fetch(`${mailpitOrigin}/api/v1/search?query=${encodeURIComponent(`to:${f.account.email}`)}`).then(response=>response.json());
    expect(messages.messages.length).toBe(1);expect(calls).toBe(2);
  });
});
