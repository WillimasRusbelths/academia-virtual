import type { Pool,PoolClient } from 'pg';
import { createHash,randomUUID } from 'node:crypto';
import { createEnrollmentTransaction,createSystemEnrollmentTransaction,EnrollmentTransactionUnavailable } from '../../../infrastructure/database/enrollment-transaction.js';
import type { EnrollmentTransactionContext,EnrollmentTransactionDependencies } from '../../../infrastructure/database/enrollment-transaction.js';
import type { ReservationOfferingAccess } from '../../academic-offering/public/reservation-boundary.js';
import type { EnrollmentFinancialReads,EnrollmentTopology } from '../application/ports.js';
import type { PaymentAttemptConfiguration,PaymentAttemptStore,PaymentAttemptState,PreparedPaymentAttempt } from '../application/payments.js';
import { EnrollmentError,enrollmentUuid } from '../domain/enrollment-error.js';
import { postgresInstantParameter } from './temporal.js';
import { createPaymentReceiptReceiver } from './payment-receipts.js';

interface AttemptRow {id:string;orderId:string;studentId:string;initiationId:string;payloadDigest:Buffer;state:PaymentAttemptState;merchantReference:string;externalIdempotencyKey:string;providerScope:string;providerReference:string|null}
interface Participants {
  discover(client:PoolClient,studentId:string,offering:ReservationOfferingAccess):Promise<EnrollmentTopology>;
  financial(context:EnrollmentTransactionContext):EnrollmentFinancialReads;
}
const unresolved=(state:PaymentAttemptState)=>['SUBMITTING','PENDING','INITIATION_UNKNOWN'].includes(state);
const view=(row:AttemptRow)=>Object.freeze({id:row.id,state:row.state});
const columns='id,"orderId","studentId","initiationId","payloadDigest",state,"merchantReference","externalIdempotencyKey","providerScope","providerReference"';

/** Infraestructura propia bajo la misma familia transaccional. No hay contador,
 * lease, segunda intención/ledger o clave externa elegida por el navegador. */
export function createPaymentAttemptStore(pool:Pool,authorization:EnrollmentTransactionDependencies,
  offering:(client:PoolClient)=>ReservationOfferingAccess,configuration:PaymentAttemptConfiguration,participants:Participants):PaymentAttemptStore{
  if(!configuration||typeof configuration.providerScope!=='string'||!configuration.providerScope.trim())throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
  const providerScope=configuration.providerScope;
  const user=createEnrollmentTransaction(pool,{...authorization,preserve:error=>error instanceof EnrollmentError||Boolean(authorization.preserve?.(error))});
  const system=createSystemEnrollmentTransaction(pool);
  const discover=(client:PoolClient,studentId:string)=>participants.discover(client,studentId,offering(client));
  const row=async(client:PoolClient,id:string)=>(await client.query<AttemptRow>('SELECT '+columns+' FROM "PaymentAttempt" WHERE id=$1',[id])).rows[0];
  async function prepared(context:EnrollmentTransactionContext,attempt:AttemptRow,dispatch=false):Promise<PreparedPaymentAttempt>{
    if(!context.locked.attemptIds.includes(attempt.id)&&!dispatch)throw new EnrollmentTransactionUnavailable();
    const order=await participants.financial(context).order(attempt.orderId);if(!order)throw new EnrollmentTransactionUnavailable();
    return Object.freeze({view:view(attempt),dispatch,external:Object.freeze({attemptId:attempt.id,merchantReference:attempt.merchantReference,
      externalIdempotencyKey:attempt.externalIdempotencyKey,providerScope:attempt.providerScope,amountMinor:order.totalMinor,currency:'PEN'})});
  }
  async function validateNew(context:EnrollmentTransactionContext,orderId:string):Promise<void>{
    const order=await participants.financial(context).order(orderId);if(!order)throw new EnrollmentError({code:'NOT_FOUND'});
    if(context.decision.at<order.confirmedAt)throw new EnrollmentTransactionUnavailable();
    if(order.state==='EXPIRED'||context.decision.at>=order.expiresAt)throw new EnrollmentError({code:'RESERVATION_EXPIRED'});
    if(order.state!=='RESERVED')throw new EnrollmentError({code:'PAYMENT_NOT_ALLOWED'});
    const final=(await context.client.query(`SELECT 1 FROM "VerifiedPayment" WHERE "orderId"=$1
      UNION ALL SELECT 1 FROM "PaymentIncident" WHERE "orderId"=$1
      UNION ALL SELECT 1 FROM "PaymentAttempt" WHERE "orderId"=$1 AND state IN ('APPLIED','INCIDENT') LIMIT 1`,[orderId])).rowCount;
    if(final)throw new EnrollmentError({code:'PAYMENT_NOT_ALLOWED'});
    const groups=await offering(context.client).snapshots(order.items.map(item=>item.groupId));
    if(groups.length!==order.items.length||groups.some(group=>!group.studentVisible||!group.teacherEligible||group.teacherReviewRequired))throw new EnrollmentError({code:'PAYMENT_NOT_ALLOWED'});
    const seats=await context.client.query(`SELECT r.state FROM "SeatReservation" r JOIN "EnrollmentOrderItem" i ON i.id=r."orderItemId" WHERE i."orderId"=$1`,[orderId]);
    if(seats.rows.length!==order.items.length||seats.rows.some(seat=>seat.state!=='CONFIRMED'))throw new EnrollmentError({code:'PAYMENT_NOT_ALLOWED'});
  }
  async function technicalWork<T>(attemptId:string,apply:(context:EnrollmentTransactionContext,attempt:AttemptRow)=>Promise<T>):Promise<T>{
    const discovery=async(client:PoolClient)=>{const attempt=await row(client,attemptId);if(!attempt)throw new EnrollmentTransactionUnavailable();return discover(client,attempt.studentId);};
    return system({discover:discovery,recheck:discovery,async apply(context){const attempt=await row(context.client,attemptId);if(!attempt||!context.locked.attemptIds.includes(attemptId))throw new EnrollmentTransactionUnavailable();return apply(context,attempt);}});
  }
  return {
    async prepare(actor,input,requestId){
      const orderId=enrollmentUuid(input.orderId),initiationId=enrollmentUuid(input.initiationId);enrollmentUuid(requestId);
      if(Object.keys(input).sort().join(',')!=='initiationId,orderId')throw new EnrollmentError({code:'VALIDATION_ERROR'});
      const digest=createHash('sha256').update(JSON.stringify({operation:'PAYMENT_INITIATE',orderId})).digest();
      return user({actor,permission:'enrollment:pay-own',discover:client=>discover(client,actor.userId),recheck:client=>discover(client,actor.userId),async apply(context){
        const prior=(await context.client.query<AttemptRow>('SELECT '+columns+' FROM "PaymentAttempt" WHERE "studentId"=$1 AND "initiationId"=$2',[actor.userId,initiationId])).rows[0];
        if(prior){if(!prior.payloadDigest.equals(digest))throw new EnrollmentError({code:'IDEMPOTENCY_CONFLICT'});return prepared(context,prior);}
        if(!context.locked.orderIds.includes(orderId))throw new EnrollmentError({code:'NOT_FOUND'});
        const pending=(await context.client.query<AttemptRow>('SELECT '+columns+' FROM "PaymentAttempt" WHERE "orderId"=$1 AND state IN (\'SUBMITTING\',\'PENDING\',\'INITIATION_UNKNOWN\')',[orderId])).rows[0];
        if(pending)return prepared(context,pending);
        await validateNew(context,orderId);
        const inserted=(await context.client.query<AttemptRow>(`INSERT INTO "PaymentAttempt" (id,"orderId","studentId","initiationId","payloadDigest",state,"merchantReference","externalIdempotencyKey","providerScope","createdAt")
          VALUES ($1,$2,$3,$4,$5,'SUBMITTING',$6,$7,$8,$9) RETURNING ${columns}`,[randomUUID(),orderId,actor.userId,initiationId,digest,randomUUID(),randomUUID(),providerScope,postgresInstantParameter(context.decision.at)])).rows[0];
        if(!inserted)throw new EnrollmentTransactionUnavailable();return prepared(context,inserted,true);
      }});
    },
    async authorizeDispatch(actor,input,attemptId,requestId){
      enrollmentUuid(attemptId);enrollmentUuid(requestId);
      const orderId=enrollmentUuid(input.orderId),initiationId=enrollmentUuid(input.initiationId);
      return user({actor,permission:'enrollment:pay-own',discover:client=>discover(client,actor.userId),recheck:client=>discover(client,actor.userId),async apply(context){
        const attempt=await row(context.client,attemptId);
        if(!attempt||attempt.studentId!==actor.userId||attempt.orderId!==orderId||attempt.initiationId!==initiationId)throw new EnrollmentError({code:'NOT_FOUND'});
        if(attempt.state!=='SUBMITTING')return prepared(context,attempt);
        await validateNew(context,attempt.orderId);return prepared(context,attempt,true);
      }});
    },
    async technical(attemptId,requestId){enrollmentUuid(attemptId);enrollmentUuid(requestId);return technicalWork(attemptId,async(context,attempt)=>{
      if(attempt.providerScope!==providerScope)throw new EnrollmentTransactionUnavailable();return prepared(context,attempt);
    });},
    async settle(attemptId,result,requestId){enrollmentUuid(attemptId);enrollmentUuid(requestId);return technicalWork(attemptId,async(context,attempt)=>{
      if(!unresolved(attempt.state))return view(attempt);
      if(attempt.state==='PENDING'&&result.state==='INITIATION_UNKNOWN')return view(attempt);
      if(result.state==='PENDING'&&attempt.providerReference!==null&&attempt.providerReference!==result.providerReference)throw new EnrollmentTransactionUnavailable();
      const updated=(await context.client.query<AttemptRow>(`UPDATE "PaymentAttempt" SET state=$2::"PaymentAttemptState","providerReference"=CASE WHEN $2::"PaymentAttemptState"='PENDING' THEN $3 ELSE "providerReference" END
        WHERE id=$1 AND state IN ('SUBMITTING','PENDING','INITIATION_UNKNOWN') RETURNING ${columns}`,[attemptId,result.state,result.state==='PENDING'?result.providerReference:null])).rows[0];
      if(!updated)throw new EnrollmentTransactionUnavailable();return view(updated);
    });},
    async recordObservation(observation,requestId){
      if(observation.state!=='ECONOMIC_FACT')return;
      const evidence=observation.evidence;
      await createPaymentReceiptReceiver(pool,{async authenticate(){return {providerScope:evidence.providerScope,normalizedEvidenceReference:evidence.normalizedEvidenceReference,merchantReferenceHint:evidence.merchantReference,observation};}}).receive(null,requestId);
    },
  };
}
