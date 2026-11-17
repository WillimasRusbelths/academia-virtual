import { randomUUID } from 'node:crypto';
import { expect,test } from 'vitest';
import { insertEnrollmentRow } from '../support/enrollment-migration.js';
import { paymentFixture,assertApplied,counts,paymentRows } from '../support/enrollment-payment.js';
import type { PaymentFixture } from '../support/enrollment-payment.js';
import type { PaymentGateway,GatewayObservation } from '../../src/modules/enrollment/public/payments.js';
import { createPaymentRecovery } from '../../src/modules/enrollment/infrastructure/payment-recovery.js';
import { createPaymentAttempts } from '../../src/modules/enrollment/infrastructure/enrollment-store.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import { instrumentPool,latch } from '../support/academic-foundation-contract.js';
import { observe,milestone,unwrap } from '../support/reservation-processing.js';

function scenario(name:string,work:(f:PaymentFixture)=>Promise<void>){test(name,async()=>{const f=await paymentFixture();try{await work(f);}finally{await f.close();}},120000);}
function setup(f:PaymentFixture,verify:PaymentGateway['verify'],options:{batchSize?:number}={},recover:PaymentGateway['recover']=async()=>({state:'UNRESOLVED'})){
  const gateway:PaymentGateway={initiate:async()=>{throw new Error('Nunca iniciar durante recuperación.');},verify,recover};
  const attempts=createPaymentAttempts(f.pool,f.authorization,createReservationOfferingParticipant,gateway,{providerScope:f.evidence.providerScope});
  return createPaymentRecovery(f.pool,gateway,attempts,f.processor(),options);
}
scenario('PR01 reinicio reconstruye recibo durable y aplica todo sin sesión ni otro cobro',async f=>{
  await f.sessions.revoke(f.student.secret);
  const first=setup(f,async()=>({state:'UNRESOLVED'}));expect((await first.tick()).completed).toBe(0);await first.beforeApplicationShutdown();
  const second=setup(f,async()=>f.first.observation);expect(await second.tick()).toEqual({examined:1,completed:1,failed:0});
  const row=(await f.pool.query('SELECT id FROM "VerifiedPayment"')).rows[0];await assertApplied(f,row.id);
});
scenario('PR02 consulta externa sin conexión ni locks de negocio retenidos',async f=>{
  const reached=latch(),release=latch();
  const worker=setup(f,async()=>{reached.release();await release.promise;return f.first.observation;});
  const pending=observe(worker.tick());
  try{await milestone(reached.promise,pending);expect(f.pool.totalCount-f.pool.idleCount).toBe(0);
    const holder=await f.pool.connect();try{await holder.query('BEGIN');await holder.query('SELECT id FROM "EnrollmentOrder" WHERE id=$1 FOR UPDATE NOWAIT',[f.original.id]);}finally{await holder.query('ROLLBACK');holder.release();}
    release.release();expect((await unwrap(pending)).completed).toBe(1);
  }finally{release.release();await pending;}
});
scenario('PR03 single-flight comparte ejecución y shutdown espera la consulta activa',async f=>{
  const reached=latch(),release=latch();let calls=0,closed=false;
  const worker=setup(f,async()=>{calls++;reached.release();await release.promise;return f.first.observation;});
  const a=worker.tick(),b=worker.tick();expect(a).toBe(b);
  await reached.promise;const shutdown=worker.beforeApplicationShutdown().then(()=>{closed=true;});
  try{expect(closed).toBe(false);release.release();await shutdown;expect(closed).toBe(true);await a;expect(calls).toBe(1);expect((await worker.tick()).examined).toBe(0);}finally{release.release();await a;}
});
scenario('PR04 fallo aislado avanza cursor; horizonte finito revisita fallidas ante nuevas entradas',async f=>{
  const b=await f.receipt({providerPaymentId:randomUUID()}),c=await f.receipt({providerPaymentId:randomUUID()});
  const ids=[f.first.receiptId,b.receiptId,c.receiptId].sort();const calls:string[]=[];
  let fail=true;
  const known=new Map<string,GatewayObservation>([f.first,b,c].map(call=>[call.receiptId,call.observation]));
  const worker=setup(f,async({receiptId})=>{calls.push(receiptId);if(receiptId===ids[0]&&fail)throw new Error('Fallo aislado.');return known.get(receiptId)!;},{batchSize:1});
  expect((await worker.tick()).failed).toBe(1);
  const laterEvidence={...f.evidence,providerPaymentId:randomUUID()};
  const later={receiptId:randomUUID(),observation:{state:'ECONOMIC_FACT' as const,evidence:laterEvidence}};
  await insertEnrollmentRow(f.pool,'ProviderReceipt',{id:later.receiptId,providerScope:laterEvidence.providerScope,merchantReferenceHint:laterEvidence.merchantReference,providerPaymentIdHint:laterEvidence.providerPaymentId,normalizedEvidenceReference:laterEvidence.normalizedEvidenceReference,receivedAt:'2089-12-30T00:00:00.123457Z',state:'RECEIVED'});
  known.set(later.receiptId,later.observation);
  await worker.tick();await worker.tick();expect(calls).toEqual(ids);
  fail=false;await worker.tick();expect(calls[3]).toBe(ids[0]);
});
scenario('PR05 intentos inciertos se consultan con identidad original; recibo nuevo se finaliza después',async f=>{
  await f.processor().finalize({...f.first,observation:{state:'UNRESOLVED'}});
  let calls=0;
  let verified=0;
  const worker=setup(f,async()=>++verified===1?{state:'UNRESOLVED'}:f.first.observation,{},async attempt=>{calls++;expect(attempt).toMatchObject({attemptId:f.attemptId,merchantReference:f.evidence.merchantReference,providerScope:f.evidence.providerScope});return f.first.observation;});
  expect((await worker.tick()).examined).toBe(2);expect(calls).toBe(1);expect(await counts(f)).toMatchObject({payments:0,enrollments:0});
  expect((await worker.tick()).completed).toBe(2);expect(calls).toBe(1);expect(await counts(f)).toMatchObject({payments:1,enrollments:2});
});
scenario('PR06 55P03 no agrega reintento inmediato y conserva recibo para ciclo posterior',async f=>{
  let failures=0;const trace=instrumentPool(f.pool,{before:sql=>{if(/AcademicGroup/.test(sql)&&/FOR UPDATE/.test(sql)){failures++;throw Object.assign(new Error('Fixture lock timeout'),{code:'55P03'});}}});
  const gateway:PaymentGateway={initiate:async()=>{throw new Error('Prohibido');},recover:async()=>({state:'UNRESOLVED'}),verify:async()=>f.first.observation};
  const worker=createPaymentRecovery(f.pool,gateway,{initiate:async()=>{throw new Error('Prohibido');},recover:async()=>({id:f.attemptId,state:'PENDING'})},f.processor(trace.pool));
  expect((await worker.tick()).failed).toBe(1);expect(failures).toBe(1);expect(trace.statements.filter(s=>s.sql==='BEGIN')).toHaveLength(1);
  expect((await f.pool.query('SELECT state FROM "ProviderReceipt"')).rows).toEqual([{state:'RECEIVED'}]);expect(await counts(f)).toMatchObject({payments:0,enrollments:0});
});
scenario('PR07 observación no confirmada nunca fabrica dinero o matrículas',async f=>{
  const before=await paymentRows(f);const worker=setup(f,async()=>({state:'UNRESOLVED'}));
  expect(await worker.tick()).toEqual({examined:2,completed:0,failed:0});expect(await paymentRows(f)).toEqual(before);
});
for(const size of [0,21,1.5])scenario(`PR08 rechaza tamaño de lote inválido ${size}`,async f=>{
  expect(()=>setup(f,async()=>f.first.observation,{batchSize:size})).toThrow();
});
scenario('PF01 importe equivalente con escala real distinta conserva unidades sin redondeo',async f=>{
  const call=await f.receipt({amountUnits:250000n,amountScale:3});const applied=await f.processor().finalize(call);expect(applied.state).toBe('APPLIED');
  expect((await f.pool.query('SELECT "amountUnits"::text AS amount,"amountScale" FROM "VerifiedPayment"')).rows).toEqual([{amount:'250000',amountScale:3}]);
  expect(await counts(f)).toMatchObject({payments:1,enrollments:2,converted:2});
});
scenario('PF02 entrega incompatible deja diagnóstico durable sin alterar el hecho original',async f=>{
  const first=await f.processor().finalize(f.first),before=await paymentRows(f),other=await f.receipt({amountUnits:1n});
  expect(await f.processor().finalize(other)).toEqual({state:'INTEGRITY_CONFLICT'});expect(await paymentRows(f)).toEqual(before);
  expect((await f.pool.query('SELECT state,"integrityConflict","terminalPaymentId" FROM "ProviderReceipt" WHERE id=$1',[other.receiptId])).rows).toEqual([{state:'PROCESSED',integrityConflict:true,terminalPaymentId:first.paymentId}]);
});
scenario('PF03 identidad de evidencia incompatible con recibo no crea efectos',async f=>{
  const before=await paymentRows(f);const observation:GatewayObservation={state:'ECONOMIC_FACT',evidence:{...f.evidence,providerScope:'fixture/other/sandbox'}};
  await expect(f.processor().finalize({...f.first,observation})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(await paymentRows(f)).toEqual(before);
});
scenario('PF04 otro pago de orden matriculada no rebaja intento APPLIED',async f=>{
  await f.processor().finalize(f.first);const another=await f.receipt({providerPaymentId:randomUUID()});expect((await f.processor().finalize(another)).state).toBe('INCIDENT');
  expect((await f.pool.query('SELECT state FROM "PaymentAttempt" WHERE id=$1',[f.attemptId])).rows).toEqual([{state:'APPLIED'}]);
});
scenario('PF05 conflicto UNIQUE concurrente redescubre pago desconocido sin locks tardíos',async f=>{
  const reached=latch(),release=latch();let paused=false;
  const trace=instrumentPool(f.pool,{before:async sql=>{if(!paused&&/INSERT INTO "VerifiedPayment"/.test(sql)){paused=true;reached.release();await release.promise;}}});
  const pending=observe(f.processor(trace.pool).finalize(f.first));
  try{
    await milestone(reached.promise,pending);
    const unknown=await f.receipt({merchantReference:'fixture-unknown-'+randomUUID()});
    expect((await f.processor().finalize(unknown)).state).toBe('INCIDENT');
    release.release();expect((await unwrap(pending)).state).toBe('INTEGRITY_CONFLICT');
    expect(await counts(f)).toMatchObject({payments:1,enrollments:0,incidents:1,reserved:2});
    expect(trace.statements.filter(s=>s.sql==='ROLLBACK')).toHaveLength(1);
    expect(trace.statements.filter(s=>s.sql==='BEGIN')).toHaveLength(2);
  }finally{release.release();await pending;}
});
