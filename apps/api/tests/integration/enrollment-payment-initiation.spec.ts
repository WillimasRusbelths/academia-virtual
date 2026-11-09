import { expect,test } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { attemptFixture } from '../support/payment-attempt.js';
import type { AttemptFixture } from '../support/payment-attempt.js';
import { createPaymentAttempts } from '../../src/modules/enrollment/infrastructure/enrollment-store.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import { createPaymentReceiptReceiver } from '../../src/modules/enrollment/infrastructure/payment-receipts.js';
import type { AuthenticatedReceipt } from '../../src/modules/enrollment/infrastructure/payment-receipts.js';

function pg(name:string,body:(f:AttemptFixture)=>Promise<void>){test(name,async()=>{const f=await attemptFixture();try{await body(f);}finally{f.gateway.release.resolve();await f.close();}},120000);}
pg('PIA01 ámbito explícito obligatorio, sin gateway o proveedor de producción por defecto',async f=>{
  expect(()=>createPaymentAttempts(f.pool,f.authorization,createReservationOfferingParticipant,f.gateway.gateway,{providerScope:''})).toThrowError(expect.objectContaining({code:'TEMPORARILY_UNAVAILABLE'}));expect(f.gateway.calls).toHaveLength(0);expect(await f.rows()).toEqual([]);
});
pg('PIA02 UUID canónico conserva digest, clave e identidad con mayúsculas',async f=>{
  const service=f.service(),input=f.input(),first=await service.initiate(f.actor,{orderId:input.orderId.toUpperCase(),initiationId:input.initiationId.toUpperCase()},randomUUID());
  expect(await service.initiate(f.actor,input,randomUUID())).toEqual(first);expect(f.gateway.calls).toHaveLength(1);expect((await f.rows())[0].providerScope).toBe('fixture/provider/merchant/sandbox');
});
for(const terminal of ['APPLIED','INCIDENT'] as const)for(const late of ['PENDING','INITIATION_UNKNOWN','FAILED_NO_CHARGE'] as const)pg('PIA03 actualización condicional conserva terminal de intento '+terminal+' frente a '+late,async f=>{
  const service=f.service();f.gateway.control.paused=true;f.gateway.control.result=late==='PENDING'?{state:late,providerReference:'fixture-late'}:{state:late};
  const starting=service.initiate(f.actor,f.input(),randomUUID());await f.gateway.entered.promise;
  try{
    // Hecho terminal ficticio de control. No siembra VerifiedPayment/Enrollment,
    // ni acredita al finalizador SYSTEM que se comprobará por separado en T051.
    await f.pool.query('UPDATE "PaymentAttempt" SET state=$1',[terminal]);const before=await f.rows();
    f.gateway.release.resolve();expect(await starting).toMatchObject({state:terminal});expect(await f.rows()).toEqual(before);
    await expect(service.initiate(f.actor,f.input(),randomUUID())).rejects.toMatchObject({code:'PAYMENT_NOT_ALLOWED'});expect(f.gateway.calls).toHaveLength(1);await f.noFinancialEffects();
  }finally{f.gateway.release.resolve();await starting.catch(()=>undefined);}
});
pg('PIA04 prueba definitiva en consulta no vuelve a PENDING por respuesta de inicio tardía',async f=>{
  const service=f.service();f.gateway.control.paused=true;const starting=service.initiate(f.actor,f.input(),randomUUID());await f.gateway.entered.promise;
  try{
    const row=(await f.rows())[0];f.gateway.control.observation={state:'FAILED_NO_CHARGE'};
    expect(await service.recover({attemptId:row.id,requestId:randomUUID()})).toMatchObject({state:'FAILED_NO_CHARGE'});
    f.gateway.release.resolve();expect(await starting).toMatchObject({state:'FAILED_NO_CHARGE'});expect((await f.rows())[0].providerReference).toBeNull();expect(f.gateway.calls).toHaveLength(1);
  }finally{f.gateway.release.resolve();await starting.catch(()=>undefined);}
});
pg('PIA05 cierre de sesión durante red no pierde resultado; replay posterior sigue denegado',async f=>{
  const service=f.service(),input=f.input();f.gateway.control.paused=true;const starting=service.initiate(f.actor,input,randomUUID());await f.gateway.entered.promise;
  try{await f.sessions.revoke(f.student.secret);f.gateway.release.resolve();expect(await starting).toMatchObject({state:'PENDING'});await expect(service.initiate(f.actor,input,randomUUID())).rejects.toMatchObject({code:'AUTH_REQUIRED'});await f.noFinancialEffects();}
  finally{f.gateway.release.resolve();await starting.catch(()=>undefined);}
});
pg('PIA06 consulta económica conserva recibo durable sin completar pago/matrícula',async f=>{
  const service=f.service();f.gateway.control.result={state:'INITIATION_UNKNOWN'};const first=await service.initiate(f.actor,f.input(),randomUUID()),issued=f.gateway.calls[0];
  f.gateway.control.observation={state:'ECONOMIC_FACT',evidence:{providerScope:issued.providerScope,providerPaymentId:'fixture-payment',merchantReference:issued.merchantReference,amountUnits:25000n,amountScale:2,currency:'PEN',normalizedEvidenceReference:'fixture/recover/evidence'}};
  expect(await service.recover({attemptId:first.id,requestId:randomUUID()})).toMatchObject({id:first.id,state:'INITIATION_UNKNOWN'});
  const row=(await f.pool.query('SELECT "providerScope","merchantReferenceHint","providerPaymentIdHint",state,"processedAt","terminalPaymentId" FROM "ProviderReceipt"')).rows;
  expect(row).toEqual([{providerScope:issued.providerScope,merchantReferenceHint:issued.merchantReference,providerPaymentIdHint:'fixture-payment',state:'RECEIVED',processedAt:null,terminalPaymentId:null}]);expect(f.gateway.calls).toHaveLength(1);await f.unchangedOrder();await f.noFinancialEffects();
});
function commitFault(pool:Pool,after:boolean):Pool{
  let armed=true;
  return new Proxy(pool,{get(target,key){if(key==='connect')return async()=>{
    const client=await target.connect(),query=client.query.bind(client);
    return new Proxy(client,{get(selected,property){if(property==='query')return async(sql:string,parameters?:unknown[])=>{if(sql==='COMMIT'&&armed){armed=false;if(after)await query(sql,parameters);throw new Error('fixture COMMIT acknowledgement lost');}return query(sql,parameters);};const value:unknown=Reflect.get(selected,property);return typeof value==='function'?value.bind(selected):value;}}) as PoolClient;
  };const value:unknown=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
}
for(const after of [false,true])pg('PIA07 fallo '+(after?'después':'antes')+' del COMMIT de preparación no dispara red a ciegas',async f=>{
  const input=f.input(),service=createPaymentAttempts(commitFault(f.pool,after),f.authorization,createReservationOfferingParticipant,f.gateway.gateway,{providerScope:'fixture/provider/merchant/sandbox'});
  await expect(service.initiate(f.actor,input,randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(f.gateway.calls).toHaveLength(0);expect(await f.rows()).toHaveLength(after?1:0);
  const result=await f.service().initiate(f.actor,input,randomUUID());expect(result.state).toBe(after?'SUBMITTING':'PENDING');expect(f.gateway.calls).toHaveLength(after?0:1);expect(await f.rows()).toHaveLength(1);await f.noFinancialEffects();
});
const minimal:AuthenticatedReceipt={providerScope:'fixture/provider/merchant/sandbox',normalizedEvidenceReference:'fixture/normalized',merchantReferenceHint:null,observation:{state:'UNRESOLVED'}};
pg('PIR01 error de autenticación no confirma recibo ni revela payload',async f=>{
  const receiver=createPaymentReceiptReceiver(f.pool,{async authenticate(){throw new Error('PRIVATE_FIXTURE_BODY');}});await expect(receiver.receive({card:'PRIVATE_FIXTURE_BODY'},randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect((await f.pool.query('SELECT count(*)::int AS n FROM "ProviderReceipt"')).rows[0].n).toBe(0);
});
pg('PIR02 normalización incoherente rechazada antes de persistir',async f=>{
  const receiver=createPaymentReceiptReceiver(f.pool,{async authenticate(){return {...minimal,observation:{state:'ECONOMIC_FACT',evidence:{providerScope:'wrong',normalizedEvidenceReference:'wrong',merchantReference:'issued',providerPaymentId:'fixture-payment',amountUnits:1n,amountScale:2,currency:'PEN'}}};}});
  await expect(receiver.receive({},randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect((await f.pool.query('SELECT count(*)::int AS n FROM "ProviderReceipt"')).rows[0].n).toBe(0);await f.noFinancialEffects();
});
pg('PIR03 fallo real de escritura nunca produce acuse ACCEPTED',async f=>{
  await f.isolated.ownerQuery(`CREATE FUNCTION reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture receipt failure'; END $$;CREATE TRIGGER reject_receipt BEFORE INSERT ON "ProviderReceipt" FOR EACH ROW EXECUTE FUNCTION reject_receipt()`);
  await expect(createPaymentReceiptReceiver(f.pool,{async authenticate(){return minimal;}}).receive({},randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect((await f.pool.query('SELECT count(*)::int AS n FROM "ProviderReceipt"')).rows[0].n).toBe(0);
});
pg('PIR04 entregas repetidas son recibos, no pagos finalmente verificados',async f=>{
  const receiver=createPaymentReceiptReceiver(f.pool,{async authenticate(){return minimal;}}),results=await Promise.all([receiver.receive({rawPan:'PRIVATE_FIXTURE'},randomUUID()),receiver.receive({rawPan:'PRIVATE_FIXTURE'},randomUUID())]);
  expect(results.map(row=>row.state)).toEqual(['ACCEPTED','ACCEPTED']);expect(results[0].receiptId).not.toBe(results[1].receiptId);expect((await f.pool.query('SELECT count(*)::int AS n FROM "ProviderReceipt"')).rows[0].n).toBe(2);expect(JSON.stringify((await f.pool.query('SELECT to_jsonb(r) FROM "ProviderReceipt" r')).rows)).not.toContain('PRIVATE_FIXTURE');await f.noFinancialEffects();
});
