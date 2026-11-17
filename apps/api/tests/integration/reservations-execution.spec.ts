import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { processingFixture, queueRequest, observe, milestone, unwrap } from '../support/reservation-processing.js';
import type { ReservationAdmissionFixture } from '../support/reservation-admission.js';
import { createReservationDispatcher } from '../../src/modules/enrollment/infrastructure/dispatch.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import { createSystemEnrollmentTransaction, EnrollmentTransactionUnavailable } from '../../src/infrastructure/database/enrollment-transaction.js';
import { discoverEnrollmentTopology } from '../../src/modules/enrollment/infrastructure/enrollment-store.js';
import { createExpirationNormalizer } from '../../src/modules/enrollment/infrastructure/expiration-store.js';
import { instrumentPool, latch } from '../support/academic-foundation-contract.js';
import { financialFingerprint, seedCommitment } from '../support/enrollment-maintenance.js';
import { waitForBlockedBy } from '../support/locks.js';

function execution(name:string,work:(f:ReservationAdmissionFixture)=>Promise<void>){test(name,async()=>{const f=await processingFixture();try{await work(f);}finally{await f.close();}},120000);}
const target=(f:ReservationAdmissionFixture)=>createReservationDispatcher(f.pool,f.authorization,createReservationOfferingParticipant);
function normalizer(f:ReservationAdmissionFixture,pool=f.pool){
  const discover=(client:Parameters<typeof createReservationOfferingParticipant>[0])=>discoverEnrollmentTopology(client,f.student.userId,createReservationOfferingParticipant(client));
  return (orderId:string)=>createSystemEnrollmentTransaction(pool)({discover,recheck:discover,
    apply:context=>createExpirationNormalizer(context,randomUUID()).normalize(orderId,context.decision)});
}
execution('RX01 revocación comprobada deja REJECTED y auditoría, sin plazas',async f=>{
  const request=await queueRequest(f);await f.sessions.revoke(f.student.secret);
  expect(await target(f).dispatchNext(randomUUID())).toMatchObject({state:'REJECTED',requestId:request.id});
  expect((await f.counts()).orders).toBe(0);expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentAuditEvent" WHERE "targetId"=$1',[request.id])).rows[0].n).toBe(1);
});
execution('RX02 autorización indisponible conserva ADMITTED y cero efectos',async f=>{
  const request=await queueRequest(f),before=await financialFingerprint(f.pool);
  const dispatcher=createReservationDispatcher(f.pool,{async revalidateInTransaction(){throw new EnrollmentTransactionUnavailable();}},createReservationOfferingParticipant);
  await expect(dispatcher.dispatchNext(randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect((await f.row(request.intentionId)).state).toBe('ADMITTED');expect(await financialFingerprint(f.pool)).toBe(before);
});
execution('RX03 normalizador compartido materializa una vez sin scheduler ni otra captura',async f=>{
  await seedCommitment(f,'DEADLINE_PASSED');const id=(await f.pool.query('SELECT id FROM "EnrollmentOrder"')).rows[0].id;
  const trace=instrumentPool(f.pool),normalize=normalizer(f,trace.pool);
  expect(await normalize(id)).toBe('EXPIRED');const before=await financialFingerprint(f.pool);expect(await normalize(id)).toBe('ALREADY_TERMINAL');expect(await financialFingerprint(f.pool)).toBe(before);
  expect(trace.statements.filter(s=>/extract\(epoch FROM clock_timestamp\(\)/.test(s.sql))).toHaveLength(2);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentAuditEvent" WHERE "effectKey"=$1',['ORDER_EXPIRED/'+id])).rows[0].n).toBe(1);
});
execution('RX04 fallo al crear nueva orden revierte también normalización anterior',async f=>{
  await seedCommitment(f,'DEADLINE_PASSED');await f.pool.query('UPDATE "AdmissionSequence" SET "nextSequence"=2 WHERE id=1');await queueRequest(f,[f.otherGroupId]);
  const before=await financialFingerprint(f.pool);
  await f.isolated.ownerQuery(`CREATE FUNCTION fail_new_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture insert failure'; END $$;
    CREATE TRIGGER fail_new_order BEFORE INSERT ON "EnrollmentOrder" FOR EACH ROW EXECUTE FUNCTION fail_new_order()`);
  await expect(target(f).dispatchNext(randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(await financialFingerprint(f.pool)).toBe(before);
  expect((await f.pool.query('SELECT state FROM "EnrollmentOrder"')).rows).toEqual([{state:'RESERVED'}]);
});
execution('RX05 normalización SYSTEM concurrente y despacho producen un solo efecto',async f=>{
  await seedCommitment(f,'DEADLINE_PASSED');await f.pool.query('UPDATE "AdmissionSequence" SET "nextSequence"=2 WHERE id=1');await queueRequest(f,[f.otherGroupId]);
  const id=(await f.pool.query('SELECT id FROM "EnrollmentOrder"')).rows[0].id,entered=latch(),release=latch();let holderPid=0;
  const trace=instrumentPool(f.pool,{after:async(sql,pid)=>{if(/UPDATE "EnrollmentOrder"/.test(sql)){holderPid=pid;entered.release();await release.promise;}}});
  const first=observe(normalizer(f,trace.pool)(id));let next:ReturnType<typeof observe>|undefined;
  try{
    await milestone(entered.promise,first);next=observe(target(f).dispatchNext(randomUUID()));
    try{await waitForBlockedBy(f.pool,holderPid);}finally{release.release();}
    expect(await unwrap(first)).toBe('EXPIRED');expect(await unwrap(next)).toMatchObject({state:'CONFIRMED'});
    expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentAuditEvent" WHERE "effectKey"=$1',['ORDER_EXPIRED/'+id])).rows[0].n).toBe(1);
  }finally{release.release();await first;await next;}
});
execution('RX06 lifecycle inicia single-flight y shutdown impide nuevos trabajos',async f=>{
  const request=await queueRequest(f),dispatcher=target(f);
  try{
    dispatcher.onModuleInit();dispatcher.start();await expect.poll(async()=>(await f.row(request.intentionId)).state,{timeout:5000}).toBe('CONFIRMED');
  }finally{await dispatcher.onApplicationShutdown();}
  await expect(dispatcher.dispatchNext(randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentOrder"')).rows[0].n).toBe(1);
});
for(const groupIds of [[],['bad'],['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001']])execution(`RX07 forma inválida directa ${JSON.stringify(groupIds)}`,async f=>{
  const before=await financialFingerprint(f.pool);await expect(f.target().admit(f.actor,f.selection(groupIds),randomUUID())).rejects.toMatchObject({code:'VALIDATION_ERROR'});expect(await financialFingerprint(f.pool)).toBe(before);
});
execution('RX08 admisión real → despacho → replay recupera orden original sin nueva secuencia',async f=>{
  const input=f.selection([f.groupId,f.otherGroupId]);
  const admitted=await f.target().admit(f.actor,input,randomUUID());expect(admitted.state).toBe('ADMITTED');expect((await f.counts()).orders).toBe(0);
  expect(await target(f).dispatchNext(randomUUID())).toMatchObject({state:'CONFIRMED',requestId:admitted.id});
  const order=(await f.pool.query('SELECT id,"totalMinor"::text AS total FROM "EnrollmentOrder" WHERE "requestId"=$1',[admitted.id])).rows[0];
  expect(order.total).toBe('25000');
  const before=await financialFingerprint(f.pool);
  expect(await f.target().admit(f.actor,{...input,groupIds:[...input.groupIds].reverse()},randomUUID())).toEqual({id:admitted.id,intentionId:input.intentionId,state:'CONFIRMED',orderId:order.id});
  expect(await financialFingerprint(f.pool)).toBe(before);expect((await f.counts()).next).toBe('2');
});
