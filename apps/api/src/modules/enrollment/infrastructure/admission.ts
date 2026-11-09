import type { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import type { EnrollmentTransactionDependencies } from '../../../infrastructure/database/enrollment-transaction.js';
import { accountTransaction } from '../../../infrastructure/database/account-transaction.js';
import { EnrollmentTransactionUnavailable } from '../../../infrastructure/database/enrollment-transaction.js';
import type { ReservationAdmission } from '../application/reserve.js';
import { AuthorizationFailure } from '../../authorization/public/session.js';
import { EnrollmentError, enrollmentUuid, reservationGroupIds } from '../domain/enrollment-error.js';
import { formatInstant } from '../domain/instant.js';
import type { ReservationAdmissionResult } from '../application/reserve.js';

/** Admite sin descubrir oferta, congelar precios o consumir plazas. La prioridad
 * es el contador transaccional, mantenido hasta el mismo COMMIT que la solicitud. */
export function createReservationAdmission(pool:Pool,authorization:EnrollmentTransactionDependencies):ReservationAdmission {
  return {async admit(actor,selection,requestId){
    const intentionId=enrollmentUuid(selection.intentionId),groupIds=reservationGroupIds(selection.groupIds);enrollmentUuid(requestId);
    if(Object.keys(selection).sort().join(',')!=='groupIds,intentionId')throw new EnrollmentError({code:'VALIDATION_ERROR'});
    const digest=createHash('sha256').update(JSON.stringify(groupIds)).digest();
    return accountTransaction(pool,async client=>{
      if((await client.query('SELECT id FROM "AdmissionSequence" WHERE id=1 FOR UPDATE')).rowCount!==1)throw new EnrollmentTransactionUnavailable();
      await authorization.revalidateInTransaction(client,actor,'enrollment:reserve-own');
      type Row={id:string;state:'ADMITTED'|'CONFIRMED'|'REJECTED';selectionDigest:Buffer;decisionCode:string|null;at:string};
      const prior=(await client.query<Row>(`SELECT id,state,"selectionDigest","decisionCode",(extract(epoch FROM "admittedAt")*1000000)::numeric(30,0)::text AS at
        FROM "ReservationRequest" WHERE "studentId"=$1 AND "intentionId"=$2 FOR UPDATE`,[actor.userId,intentionId])).rows[0];
      if(prior){
        if(!prior.selectionDigest.equals(digest))throw new EnrollmentError({code:'IDEMPOTENCY_CONFLICT'});
        if(prior.state==='ADMITTED')return {id:prior.id,intentionId,state:'ADMITTED',admittedAt:formatInstant(BigInt(prior.at))} satisfies ReservationAdmissionResult;
        if(prior.state==='REJECTED')return {id:prior.id,intentionId,state:'REJECTED',decisionCode:prior.decisionCode!} satisfies ReservationAdmissionResult;
        const order=(await client.query<{id:string}>('SELECT id FROM "EnrollmentOrder" WHERE "requestId"=$1',[prior.id])).rows[0];
        if(!order)throw new EnrollmentTransactionUnavailable();
        return {id:prior.id,intentionId,state:'CONFIRMED',orderId:order.id} satisfies ReservationAdmissionResult;
      }
      const id=randomUUID(),at=BigInt((await client.query<{at:string}>('SELECT (extract(epoch FROM clock_timestamp())*1000000)::numeric(30,0)::text AS at')).rows[0].at);
      const inserted=await client.query(`INSERT INTO "ReservationRequest" (id,"studentId","intentionId","selectionDigest","groupIds","admittedAt","admissionSequence","actorSessionReference","authVersion",state)
        SELECT $1,$2,$3,$4,$5,$6,"nextSequence",$7,$8,'ADMITTED' FROM "AdmissionSequence" WHERE id=1`,
      [id,actor.userId,intentionId,digest,groupIds,formatInstant(at),actor.sessionId,actor.authVersion.toString()]);
      if(inserted.rowCount!==1)throw new EnrollmentTransactionUnavailable();
      await client.query('UPDATE "AdmissionSequence" SET "nextSequence"="nextSequence"+1 WHERE id=1');
      return {id,intentionId,state:'ADMITTED',admittedAt:formatInstant(at)} satisfies ReservationAdmissionResult;
    },()=>new EnrollmentTransactionUnavailable(),error=>error instanceof EnrollmentError||error instanceof AuthorizationFailure||Boolean(authorization.preserve?.(error)));
  }};
}
