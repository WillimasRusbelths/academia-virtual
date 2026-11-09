import { randomBytes, randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import type { Pool } from 'pg';
import type { AuthenticPaymentEvidence, GatewayObservation } from '../../src/modules/enrollment/public/payments.js';
import { processingFixture, processingClock } from './reservation-processing.js';
import { createReservationDispatcher } from '../../src/modules/enrollment/infrastructure/dispatch.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import { createSystemEnrollmentTransaction } from '../../src/infrastructure/database/enrollment-transaction.js';
import { discoverEnrollmentTopology } from '../../src/modules/enrollment/infrastructure/enrollment-store.js';
import { createExpirationNormalizer } from '../../src/modules/enrollment/infrastructure/expiration-store.js';
import { insertEnrollmentRow } from './enrollment-migration.js';
import { paymentProcessor } from './payment-verification-contract.js';
import type { PaymentProcessor } from './payment-verification-contract.js';
import { sessionFixture } from './session-fixture.js';
import { existingCommands } from './academic-maintenance.js';

/** Orden/reservas producidas por US1 real; solo intento/recibo/evidencia son hechos
 * ficticios de preparación. Nunca inserta un pago final o matrícula satisfactoria. */
export async function paymentFixture(options:{readonly seedPaymentAttempt?:boolean;readonly reservedAt?:string}={}){
  const f=await processingFixture();
  try{
    const clock=await processingClock(f),pool=clock.pool,selection=f.selection([f.groupId,f.otherGroupId]);
    await f.pool.query(`UPDATE "DispatchTestClock" SET instant='2089-12-30T00:00:00.123456Z' WHERE id=1;
      UPDATE "Session" SET "createdAt"='2089-12-30T00:00:00Z',"lastAcceptedAt"='2089-12-30T00:00:00Z',"absoluteExpiresAt"='2089-12-30T08:00:00Z'`);
    if(options.reservedAt){
      await f.pool.query('UPDATE "DispatchTestClock" SET instant=$1::timestamptz WHERE id=1',[options.reservedAt]);
      await f.pool.query(`UPDATE "Session" SET "createdAt"=(SELECT instant FROM "DispatchTestClock")-interval '1 minute',"lastAcceptedAt"=(SELECT instant FROM "DispatchTestClock")-interval '1 minute',"absoluteExpiresAt"=(SELECT instant FROM "DispatchTestClock")+interval '7 hours 59 minutes'`);
    }
    const admitted=await f.target(pool).admit(f.actor,selection,randomUUID());expect(admitted.state).toBe('ADMITTED');
    expect((await createReservationDispatcher(pool,f.authorization,createReservationOfferingParticipant).dispatchNext(randomUUID())).state).toBe('CONFIRMED');
    const original=(await f.pool.query(`SELECT id,"totalMinor"::text AS total,revision::text,
      to_char("confirmedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "confirmedAt",
      to_char("expiresAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "expiresAt"
      FROM "EnrollmentOrder"`)).rows[0] as {id:string;total:string;revision:string;confirmedAt:string;expiresAt:string};
    const originalItems=(await f.pool.query('SELECT to_jsonb(i) AS item FROM "EnrollmentOrderItem" i WHERE "orderId"=$1 ORDER BY id',[original.id])).rows.map(r=>r.item);
    const attemptId=randomUUID(),merchantReference='fixture-issued-'+randomUUID(),providerScope='fixture/provider/merchant/sandbox';
    if(options.seedPaymentAttempt!==false)await insertEnrollmentRow(f.pool,'PaymentAttempt',{id:attemptId,orderId:original.id,studentId:f.student.userId,initiationId:randomUUID(),payloadDigest:randomBytes(32),state:'PENDING',merchantReference,externalIdempotencyKey:'fixture-key-'+randomUUID(),providerScope,providerReference:'fixture-operation'});
    const evidence:AuthenticPaymentEvidence={providerScope,providerPaymentId:randomUUID(),merchantReference,amountUnits:25000n,amountScale:2,currency:'PEN',normalizedEvidenceReference:'fixture/evidence/'+randomUUID()};
    async function receipt(changes:Partial<AuthenticPaymentEvidence>={}){
      const actual={...evidence,...changes},receiptId=randomUUID();
      await insertEnrollmentRow(f.pool,'ProviderReceipt',{id:receiptId,providerScope:actual.providerScope,deliveryKey:randomUUID(),merchantReferenceHint:actual.merchantReference,providerPaymentIdHint:actual.providerPaymentId,normalizedEvidenceReference:actual.normalizedEvidenceReference,receivedAt:original.confirmedAt,externalObservedAt:original.confirmedAt,state:'RECEIVED'});
      return {receiptId,observation:{state:'ECONOMIC_FACT',evidence:actual} as const,requestId:randomUUID()};
    }
    const first=options.seedPaymentAttempt===false?{receiptId:randomUUID(),observation:{state:'ECONOMIC_FACT',evidence} as const,requestId:randomUUID()}:await receipt();
    const set=(at:string)=>f.pool.query('UPDATE "DispatchTestClock" SET instant=$1::timestamptz WHERE id=1',[at]);
    const boundary=(delta:number)=>f.pool.query(`UPDATE "DispatchTestClock" SET instant=(SELECT "expiresAt" FROM "EnrollmentOrder" WHERE id=$1)+($2*interval '1 microsecond') WHERE id=1`,[original.id,delta]);
    const time=async()=>(await f.pool.query(`SELECT to_char(instant AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at FROM "DispatchTestClock" WHERE id=1`)).rows[0].at as string;
    const refreshSessions=()=>f.pool.query(`UPDATE "Session" SET "createdAt"=(SELECT instant FROM "DispatchTestClock")-interval '1 minute',"lastAcceptedAt"=(SELECT instant FROM "DispatchTestClock")-interval '1 minute',"absoluteExpiresAt"=(SELECT instant FROM "DispatchTestClock")+interval '7 hours 59 minutes'`);
    const processor=(selectedPool:Pool=pool)=>paymentProcessor(selectedPool,createReservationOfferingParticipant);
    const expire=(orderId=original.id,selectedPool:Pool=pool)=>{
      const discover=(client:Parameters<typeof createReservationOfferingParticipant>[0])=>discoverEnrollmentTopology(client,f.student.userId,createReservationOfferingParticipant(client));
      return createSystemEnrollmentTransaction(selectedPool)({discover,recheck:discover,apply:context=>createExpirationNormalizer(context,randomUUID()).normalize(orderId,context.decision)});
    };
    async function reassign(){
      const other=await sessionFixture(f,'STUDENT');await refreshSessions();
      const actor={userId:other.userId,sessionId:other.sessionId,authVersion:0n,role:'STUDENT' as const},input=f.selection([f.groupId]);
      await f.target(pool).admit(actor,input,randomUUID());
      expect((await createReservationDispatcher(pool,f.authorization,createReservationOfferingParticipant).dispatchNext(randomUUID())).state).toBe('CONFIRMED');
      return actor;
    }
    const cancelGroup=(selectedPool:Pool=pool)=>existingCommands(selectedPool,f.sessions).execute({userId:f.admin.userId,sessionId:f.admin.sessionId,authVersion:0n,role:'ADMIN'},
      {operation:'GROUP_CANCEL',groupId:f.groupId,commandId:randomUUID(),expectedRevision:'1',cancellationReason:'Motivo ficticio'},{requestId:randomUUID()});
    return {...f,pool,original,originalItems,attemptId,evidence,first,receipt,set,boundary,time,processor,expire,refreshSessions,reassign,cancelGroup};
  }catch(error){await f.close();throw error;}
}
export type PaymentFixture=Awaited<ReturnType<typeof paymentFixture>>;
export type PaymentCall=PaymentFixture['first'];
export function observed(call:PaymentCall):AuthenticPaymentEvidence{return call.observation.evidence;}
export const unconfirmed=(call:PaymentCall,state:'UNRESOLVED'|'FAILED_NO_CHARGE')=>({...call,observation:{state} as GatewayObservation});
export async function paymentRows(f:PaymentFixture){
  const state:Record<string,unknown>={};
  for(const table of ['EnrollmentOrder','EnrollmentOrderItem','SeatReservation','VerifiedPayment','Enrollment','PaymentIncident','EnrollmentAuditEvent','IncidentFollowUp'])state[table]=(await f.pool.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM "${table}" t`)).rows[0].rows;
  return state;
}
export async function counts(f:PaymentFixture){return (await f.pool.query(`SELECT
  (SELECT count(*)::int FROM "VerifiedPayment") AS payments,(SELECT count(*)::int FROM "Enrollment") AS enrollments,
  (SELECT count(*)::int FROM "PaymentIncident") AS incidents,
  (SELECT count(*)::int FROM "SeatReservation" WHERE state='CONFIRMED') AS reserved,
  (SELECT count(*)::int FROM "SeatReservation" WHERE state='CONVERTED') AS converted,
  (SELECT count(*)::int FROM "SeatReservation" WHERE state='EXPIRED') AS expired`)).rows[0] as {payments:number;enrollments:number;incidents:number;reserved:number;converted:number;expired:number};}
export async function assertApplied(f:PaymentFixture,paymentId?:string){
  expect(paymentId).toEqual(expect.any(String));
  expect(await counts(f)).toMatchObject({payments:1,enrollments:2,incidents:0,reserved:0,converted:2,expired:0});
  const order=(await f.pool.query(`SELECT state,revision::text,"totalMinor"::text AS total,
    to_char("confirmedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "confirmedAt",
    to_char("expiresAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "expiresAt" FROM "EnrollmentOrder" WHERE id=$1`,[f.original.id])).rows[0];
  expect(order).toEqual({state:'ENROLLED',revision:'2',total:f.original.total,confirmedAt:f.original.confirmedAt,expiresAt:f.original.expiresAt});
  expect((await f.pool.query('SELECT to_jsonb(i) AS item FROM "EnrollmentOrderItem" i WHERE "orderId"=$1 ORDER BY id',[f.original.id])).rows.map(r=>r.item)).toEqual(f.originalItems);
  const rows=(await f.pool.query(`SELECT e."studentId"=$2 AS owner,e."courseId"=i."courseId" AND e."groupId"=i."groupId" AS identity,
    e."originalPeriodStart"=i."periodStart" AND e."originalPeriodEnd"=i."periodEnd" AND e."scheduleSnapshot"=i."scheduleSnapshot" AND e."timeZone"=i."timeZone" AS original,
    e."validUntil"=i."enrollmentValidUntil" AS deadline,e."confirmedAt"=p."verificationFinishedAt" AS token,
    p."reconciliationState"='APPLIED' AS applied,p."amountUnits"::text AS amount,p.currency
    FROM "Enrollment" e JOIN "EnrollmentOrderItem" i ON i.id=e."orderItemId" JOIN "VerifiedPayment" p ON p.id=e."paymentId" WHERE p.id=$1`,[paymentId,f.student.userId])).rows;
  expect(rows).toEqual(Array.from({length:2},()=>({owner:true,identity:true,original:true,deadline:true,token:true,applied:true,amount:'25000',currency:'PEN'})));
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentAuditEvent" WHERE "targetId"=$1 AND "actorKind"=\'SYSTEM\'',[paymentId])).rows[0].n).toBe(1);
}
export async function assertIncident(f:PaymentFixture,call:PaymentCall,options:{enrollments?:number;unknown?:boolean}={}){
  const actual=observed(call),row=(await f.pool.query(`SELECT id,"orderId","amountUnits"::text AS amount,"amountScale",currency,"merchantReference","reconciliationState" FROM "VerifiedPayment" WHERE "providerScope"=$1 AND "providerPaymentId"=$2`,[actual.providerScope,actual.providerPaymentId])).rows[0];
  expect(row).toMatchObject({orderId:options.unknown?null:f.original.id,amount:actual.amountUnits.toString(),amountScale:actual.amountScale,currency:actual.currency,merchantReference:actual.merchantReference,reconciliationState:'INCIDENT'});
  expect((await counts(f)).enrollments).toBe(options.enrollments??0);
  expect((await f.pool.query(`SELECT "totalMinor"::text AS total,to_char("confirmedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "confirmedAt",to_char("expiresAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "expiresAt" FROM "EnrollmentOrder" WHERE id=$1`,[f.original.id])).rows[0]).toEqual({total:f.original.total,confirmedAt:f.original.confirmedAt,expiresAt:f.original.expiresAt});
  expect((await f.pool.query('SELECT to_jsonb(i) AS item FROM "EnrollmentOrderItem" i WHERE "orderId"=$1 ORDER BY id',[f.original.id])).rows.map(r=>r.item)).toEqual(f.originalItems);
  const incidents=(await f.pool.query('SELECT "orderId","affectedGroupIds" FROM "PaymentIncident" WHERE "verifiedPaymentId"=$1',[row.id])).rows;
  expect(incidents).toHaveLength(1);expect(incidents[0].orderId).toBe(options.unknown?null:f.original.id);
  expect([...incidents[0].affectedGroupIds].sort()).toEqual(options.unknown?[]:[f.groupId,f.otherGroupId].sort());
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentAuditEvent" WHERE "targetId"=$1 AND "actorKind"=\'SYSTEM\'',[row.id])).rows[0].n).toBe(1);
  return row.id as string;
}
/** Reinicio real de Node, sin endpoint ni aprobación de proveedor. El padre
 * comprueba primero la capacidad de producto; probe solo acredita el harness. */
export async function paymentProcess(f:PaymentFixture,input:PaymentCall|'probe'){
  const child=fork(fileURLToPath(new URL('./payment-verification-process.mjs',import.meta.url)),[],{
    stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,APP_ENV:'test',TEST_DATABASE_URL:f.environment.databaseUrl,TEST_MIGRATION_DATABASE_URL:f.environment.migrationUrl},
  });
  const exited=new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.once('error',()=>resolve());});
  try{
    return await new Promise<{state:'READY'}|{state:'DONE';result:Awaited<ReturnType<PaymentProcessor['finalize']>>}>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Proceso financiero no alcanzó barrera. Datos omitidos.')),15000);
      child.once('error',()=>{clearTimeout(timer);reject(new Error('Proceso de prueba no disponible.'));});
      child.once('exit',code=>{if(code){clearTimeout(timer);reject(new Error('Proceso de prueba falló. Datos omitidos.'));}});
      child.once('message',message=>{clearTimeout(timer);if(message&&typeof message==='object'&&'state'in message&&(message.state==='READY'||message.state==='DONE'))resolve(message as {state:'READY'}|{state:'DONE';result:Awaited<ReturnType<PaymentProcessor['finalize']>>});else reject(new Error('Proceso de prueba rechazado. Datos omitidos.'));});
      child.send(input==='probe'?{kind:'probe'}:{kind:'finalize',input:JSON.parse(JSON.stringify(input,(_,v)=>typeof v==='bigint'?v.toString():v))});
    });
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited;}
}
