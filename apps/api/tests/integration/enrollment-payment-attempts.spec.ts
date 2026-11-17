import { randomUUID } from 'node:crypto';
import { expect,test } from 'vitest';
import { attemptFixture,gate } from '../support/payment-attempt.js';
import type { AttemptFixture } from '../support/payment-attempt.js';
import { sessionFixture } from '../support/session-fixture.js';
import { paymentFixture,assertApplied,assertIncident } from '../support/enrollment-payment.js';
import { attemptService } from '../support/payment-attempt-contract.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import { attemptProcess } from '../support/payment-attempt-process.js';

function pg(name:string,body:(f:AttemptFixture)=>Promise<void>){test(name,async()=>{const f=await attemptFixture();try{await body(f);}finally{f.gateway.release.resolve();await f.close();}},120000);}
pg('PA00a control: orden multigrupo real de 25000, sin intento ni pago sembrado',async f=>{
  expect(f.original.total).toBe('25000');expect(await f.rows()).toEqual([]);expect((await f.pool.query('SELECT state FROM "SeatReservation"')).rows).toEqual([{state:'CONFIRMED'},{state:'CONFIRMED'}]);await f.noFinancialEffects();
});
pg('PA00b control: fecha SQL exacta y sesiones válidas al límite',async f=>{
  await f.boundary(0);expect((await f.pool.query(`SELECT clock_timestamp()=(SELECT "expiresAt" FROM "EnrollmentOrder") AS equal`)).rows[0].equal).toBe(true);expect(await f.sessions.lookup(f.student.secret)).not.toBeNull();await f.unchangedOrder();
});
pg('PA00c control: otro proceso conecta al schema sin iniciar cobro',async f=>{const child=await attemptProcess(f,'probe');try{expect(await child.next('READY')).toMatchObject({state:'READY'});expect(await f.rows()).toEqual([]);}finally{await child.close();}});
pg('PA21a PV21: duplicados concurrentes idénticos mantienen un intento y una llamada',async f=>{
  const service=f.service(),input=f.input();f.gateway.control.paused=true;
  const first=service.initiate(f.actor,input,randomUUID());await f.gateway.entered.promise;
  try{const duplicate=await service.initiate(f.actor,input,randomUUID());const rows=await f.rows();expect(rows).toHaveLength(1);expect(duplicate.id).toBe(rows[0].id);expect(f.gateway.calls).toHaveLength(1);}
  finally{f.gateway.release.resolve();await first;}await f.unchangedOrder();await f.noFinancialEffects();
});
pg('PA21b PV21: initiationId distinta durante SUBMITTING recupera canónico sin otra iniciación',async f=>{
  const service=f.service(),input=f.input();f.gateway.control.paused=true;
  const first=service.initiate(f.actor,input,randomUUID());await f.gateway.entered.promise;
  try{const next=await service.initiate(f.actor,f.input(),randomUUID());expect(next.id).toBe((await f.rows())[0].id);expect(await f.rows()).toHaveLength(1);expect((await f.rows())[0].initiationId).toBe(input.initiationId);expect(f.gateway.calls).toHaveLength(1);}
  finally{f.gateway.release.resolve();await first;}
});
pg('PA21c PV21: replay se resuelve antes de vencimiento y ocultamiento actuales',async f=>{
  const service=f.service(),input=f.input(),first=await service.initiate(f.actor,input,randomUUID()),rows=await f.rows();
  await f.boundary(1);await f.pool.query('UPDATE "AcademicCourse" SET state=\'WITHDRAWN\'');
  expect(await service.initiate(f.actor,input,randomUUID())).toEqual(first);expect(await f.rows()).toEqual(rows);expect(f.gateway.calls).toHaveLength(1);await f.unchangedOrder();
});
pg('PA21d PV21: mismo initiationId con otra orden da conflicto, no reasocia',async f=>{
  const service=f.service(),input=f.input();await service.initiate(f.actor,input,randomUUID());const rows=await f.rows();
  await expect(service.initiate(f.actor,{...input,orderId:randomUUID()},randomUUID())).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});expect(await f.rows()).toEqual(rows);expect(f.gateway.calls).toHaveLength(1);
});
pg('PA21e PV21: red ve SUBMITTING confirmado, referencia/clave/digest y cero locks de negocio',async f=>{
  const service=f.service(),input=f.input();
  f.gateway.control.before=async call=>{
    const row=(await f.rows())[0];expect(row).toMatchObject({state:'SUBMITTING',orderId:f.orderId,studentId:f.actor.userId,initiationId:input.initiationId,merchantReference:call.merchantReference,externalIdempotencyKey:call.externalIdempotencyKey,providerScope:call.providerScope});expect(row.digest).toMatch(/^[a-f0-9]{64}$/);expect(call.amountMinor).toBe(25000n);expect(call.currency).toBe('PEN');
    const other=await f.pool.connect();try{await other.query('BEGIN');for(const table of ['User','Session','AcademicCourse','AcademicGroup','EnrollmentOrder','PaymentAttempt'])await other.query(`SELECT * FROM "${table}" ORDER BY id FOR UPDATE NOWAIT`);await other.query('ROLLBACK');}finally{await other.query('ROLLBACK');other.release();}
    expect((await f.pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction' AND query LIKE '%PaymentAttempt%'`)).rows[0].n).toBe(0);
  };
  const result=await service.initiate(f.actor,input,randomUUID());expect(result.state).toBe('PENDING');expect(f.gateway.calls).toHaveLength(1);await f.noFinancialEffects();
});
pg('PA22a PV22: timeout después de posible envío conserva UNKNOWN y no reenvía',async f=>{
  const service=f.service(),input=f.input();f.gateway.control.error=new Error('fixture transport timeout');
  await service.initiate(f.actor,input,randomUUID()).catch(()=>undefined);
  const row=(await f.rows())[0];expect(row.state).toBe('INITIATION_UNKNOWN');expect(await service.initiate(f.actor,f.input(),randomUUID())).toMatchObject({id:row.id,state:'INITIATION_UNKNOWN'});expect(f.gateway.calls).toHaveLength(1);await f.noFinancialEffects();
});
for(const state of ['INITIATION_UNKNOWN','PENDING'] as const)pg('PA22b PV22: '+state+' recupera con la misma clave sin otro initiate',async f=>{
  const service=f.service();f.gateway.control.result=state==='PENDING'?{state,providerReference:'fixture-operation'}:{state};
  const result=await service.initiate(f.actor,f.input(),randomUUID()),rows=await f.rows();
  const restarted=f.service();await restarted.recover({attemptId:result.id,requestId:randomUUID()});expect(f.gateway.calls).toHaveLength(1);expect(f.gateway.recoveries).toHaveLength(1);expect(f.gateway.recoveries[0]).toEqual(f.gateway.calls[0]);expect(await f.rows()).toEqual(rows);await f.unchangedOrder();
});
for(const stage of ['BEFORE_EXTERNAL','EXTERNAL_ACCEPTED'] as const)pg('PA22c PV22: caída de proceso '+stage+' conserva SUBMITTING y consulta al reiniciar',async f=>{
  f.service(); // Disponibilidad antes de levantar el proceso que ejecuta el mismo objetivo real.
  const child=await attemptProcess(f,'initiate',f.input());
  try{await child.next('BEFORE_EXTERNAL');if(stage==='EXTERNAL_ACCEPTED'){child.send({kind:'continue'});await child.next('EXTERNAL_ACCEPTED');}expect(await f.rows()).toHaveLength(1);expect((await f.rows())[0].state).toBe('SUBMITTING');}
  finally{await child.close();}
  const row=(await f.rows())[0];await f.service().recover({attemptId:row.id,requestId:randomUUID()});expect(f.gateway.calls).toHaveLength(0);expect(f.gateway.recoveries[0]).toMatchObject({attemptId:row.id,merchantReference:row.merchantReference,externalIdempotencyKey:row.externalIdempotencyKey});expect(await f.rows()).toHaveLength(1);await f.noFinancialEffects();
});
pg('PA22d PV22: ausencia momentánea/404 aislado de consulta no habilita otro intento',async f=>{
  const service=f.service();f.gateway.control.result={state:'INITIATION_UNKNOWN'};f.gateway.control.observation={state:'UNRESOLVED'};
  const first=await service.initiate(f.actor,f.input(),randomUUID());await service.recover({attemptId:first.id,requestId:randomUUID()});
  expect((await f.rows())[0].state).not.toBe('FAILED_NO_CHARGE');expect((await service.initiate(f.actor,f.input(),randomUUID())).id).toBe(first.id);expect(f.gateway.calls).toHaveLength(1);
});
for(const delta of [-1,0,1])pg('PA23a PV23: intento nuevo en límite '+delta+'µs revalida plazo original',async f=>{
  const service=f.service();await f.boundary(delta);
  if(delta<0){expect((await service.initiate(f.actor,f.input(),randomUUID())).state).toBe('PENDING');expect(f.gateway.calls).toHaveLength(1);}
  else{await expect(service.initiate(f.actor,f.input(),randomUUID())).rejects.toMatchObject({code:'RESERVATION_EXPIRED'});expect(await f.rows()).toEqual([]);expect(f.gateway.calls).toHaveLength(0);}await f.unchangedOrder();
});
pg('PA23b PV23: rechazo definitivo permite otro intento explícito, sin renovar orden',async f=>{
  const service=f.service();f.gateway.control.result={state:'FAILED_NO_CHARGE'};const first=await service.initiate(f.actor,f.input(),randomUUID());
  expect(first.state).toBe('FAILED_NO_CHARGE');f.gateway.control.result={state:'PENDING',providerReference:'fixture-next'};
  const second=await service.initiate(f.actor,f.input(),randomUUID());expect(second.id).not.toBe(first.id);expect(await f.rows()).toHaveLength(2);expect(f.gateway.calls).toHaveLength(2);expect(f.gateway.calls[1].externalIdempotencyKey).not.toBe(f.gateway.calls[0].externalIdempotencyKey);await f.unchangedOrder();await f.noFinancialEffects();
});
for(const condition of ['expired','hidden'] as const)pg('PA23c PV23: rechazo definitivo no permite reemplazo si '+condition,async f=>{
  const service=f.service();f.gateway.control.result={state:'FAILED_NO_CHARGE'};await service.initiate(f.actor,f.input(),randomUUID());
  if(condition==='expired')await f.boundary(0);else await f.pool.query('UPDATE "AcademicCourse" SET state=\'WITHDRAWN\'');
  await expect(service.initiate(f.actor,f.input(),randomUUID())).rejects.toMatchObject({code:condition==='expired'?'RESERVATION_EXPIRED':'PAYMENT_NOT_ALLOWED'});expect(await f.rows()).toHaveLength(1);expect(f.gateway.calls).toHaveLength(1);await f.unchangedOrder();
});
pg('PA24a PV24: replay y nueva intención requieren sesión actual tras logout',async f=>{
  const service=f.service(),input=f.input();await service.initiate(f.actor,input,randomUUID());const rows=await f.rows();await f.sessions.revoke(f.student.secret);
  for(const next of [input,f.input()])await expect(service.initiate(f.actor,next,randomUUID())).rejects.toMatchObject({code:'AUTH_REQUIRED'});expect(await f.rows()).toEqual(rows);expect(f.gateway.calls).toHaveLength(1);
});
pg('PA24b PV24: otro alumno no recupera intento ajeno aun con initiationId conocido',async f=>{
  const service=f.service(),input=f.input();await service.initiate(f.actor,input,randomUUID());const other=await sessionFixture(f,'STUDENT');await f.boundary(-1);
  await expect(service.initiate({userId:other.userId,sessionId:other.sessionId,authVersion:0n,role:'STUDENT'},input,randomUUID())).rejects.toMatchObject({code:'NOT_FOUND'});expect(await f.rows()).toHaveLength(1);expect(f.gateway.calls).toHaveLength(1);
});
// La respuesta externa se retiene mientras el finalizador SYSTEM real hace COMMIT.
for(const terminal of ['APPLIED','INCIDENT'] as const)for(const late of ['PENDING','INITIATION_UNKNOWN','FAILED_NO_CHARGE'] as const)test('PA22e PV22/PV24: callback '+terminal+' antes de respuesta tardía '+late,async()=>{
  const f=await paymentFixture({seedPaymentAttempt:false});const {controlledGateway}=await import('../support/payment-attempt.js');const gateway=controlledGateway();let pending:Promise<unknown>|undefined;
  try{
    const service=attemptService(f.pool,f.authorization,createReservationOfferingParticipant,gateway.gateway);f.processor();
    // El intento bajo prueba lo crea producto; no se borra historial inmutable.
    gateway.control.paused=true;gateway.control.result=late==='PENDING'?{state:late,providerReference:'fixture-late'}:{state:late};
    const ready=gate();gateway.control.before=async()=>{ready.resolve();};pending=service.initiate(f.actor,{orderId:f.original.id,initiationId:randomUUID()},randomUUID());await ready.promise;
    const call=gateway.calls[0];const receipt=await f.receipt({merchantReference:call.merchantReference,providerScope:call.providerScope});await f.sessions.revoke(f.student.secret);if(terminal==='INCIDENT')await f.boundary(0);
    const result=await f.processor().finalize(receipt);expect(result.state).toBe(terminal);const before=(await f.pool.query('SELECT to_jsonb(p) AS row FROM "VerifiedPayment" p')).rows;
    gateway.release.resolve();expect(await pending).toMatchObject({state:terminal});expect((await f.pool.query('SELECT state FROM "PaymentAttempt"')).rows).toEqual([{state:terminal}]);expect((await f.pool.query('SELECT to_jsonb(p) AS row FROM "VerifiedPayment" p')).rows).toEqual(before);
    if(terminal==='APPLIED')await assertApplied(f,result.paymentId);else await assertIncident(f,receipt);expect(gateway.calls).toHaveLength(1);
    await expect(service.initiate(f.actor,{orderId:f.original.id,initiationId:randomUUID()},randomUUID())).rejects.toMatchObject({code:'AUTH_REQUIRED'});expect(gateway.calls).toHaveLength(1);
  }finally{gateway.release.resolve();await pending?.catch(()=>undefined);await f.close();}
},120000);
