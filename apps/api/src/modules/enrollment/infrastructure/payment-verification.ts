import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { createSystemEnrollmentTransaction,EnrollmentTransactionUnavailable } from '../../../infrastructure/database/enrollment-transaction.js';
import type { EnrollmentTopology } from '../application/ports.js';
import type { EnrollmentOrderSnapshot } from '../public/enrollment.js';
import type { AuthenticPaymentEvidence } from '../public/payments.js';
import type { ReservationOfferingAccess } from '../../academic-offering/public/reservation-boundary.js';
import type { EffectiveCommitment } from '../domain/compatibility.js';
import type { PaymentVerification,PaymentFinalizationResult } from '../application/payment-verification.js';
import { prepareFinalPaymentDecision } from '../application/payment-verification.js';
import { enrollmentUuid } from '../domain/enrollment-error.js';
import { formatInstant } from '../domain/instant.js';
import { postgresInstantParameter } from './temporal.js';
import { createExpirationNormalizer } from './expiration-store.js';

interface Participants {
  discover(client:PoolClient,studentId:string,offering:ReservationOfferingAccess):Promise<EnrollmentTopology>;
  order(client:PoolClient,id:string):Promise<EnrollmentOrderSnapshot|null>;
}
interface PaymentRow {
  id:string;orderId:string|null;providerScope:string;providerPaymentId:string;merchantReference:string;
  amount:string;amountScale:number;currency:string;state:'APPLIED'|'INCIDENT';at:string;
}
interface ReceiptRow {providerScope:string;normalizedEvidenceReference:string;merchantReferenceHint:string|null;providerPaymentIdHint:string|null;state:string;terminalPaymentId:string|null}
const empty=():EnrollmentTopology=>({accountIds:[],courseIds:[],groupIds:[],orderIds:[],attemptIds:[],receiptIds:[],paymentIds:[],enrollmentIds:[],incidentIds:[]});
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const same=(p:PaymentRow,e:AuthenticPaymentEvidence)=>p.providerScope===e.providerScope&&p.providerPaymentId===e.providerPaymentId
  &&p.merchantReference===e.merchantReference&&p.amount===e.amountUnits.toString()&&p.amountScale===e.amountScale&&p.currency===e.currency;
const result=(p:PaymentRow):PaymentFinalizationResult=>({state:p.state,paymentId:p.id,verificationFinishedAt:formatInstant(BigInt(p.at))});
class EconomicTopologyChanged extends Error {readonly transactionAborted=true;}

/** Autoridad SYSTEM exclusivamente interna. La evidencia ya autenticada se
 * contrasta con el recibo durable; no hay llamadas externas en esta unidad. */
export function createPaymentVerificationStore(pool:Pool,offering:(client:PoolClient)=>ReservationOfferingAccess,participants:Participants):PaymentVerification{
  const run=createSystemEnrollmentTransaction(pool);
  const payment=async(client:Pick<PoolClient,'query'>,e:AuthenticPaymentEvidence)=>(await client.query<PaymentRow>(`SELECT id,"orderId","providerScope","providerPaymentId","merchantReference",
    "amountUnits"::text AS amount,"amountScale",currency,"reconciliationState" AS state,
    (extract(epoch FROM "verificationFinishedAt")*1000000)::numeric(30,0)::text AS at
    FROM "VerifiedPayment" WHERE "providerScope"=$1 AND "providerPaymentId"=$2`,[e.providerScope,e.providerPaymentId])).rows[0];
  return {async finalize(input){
    const receiptId=enrollmentUuid(input.receiptId),requestId=enrollmentUuid(input.requestId),observation=input.observation;
    if(!observation||!['ECONOMIC_FACT','UNRESOLVED','FAILED_NO_CHARGE'].includes(observation.state))throw new EnrollmentTransactionUnavailable();
    const evidence=observation.state==='ECONOMIC_FACT'?Object.freeze({...observation.evidence}):null;
    if(evidence&&(!text(evidence.providerScope)||!text(evidence.providerPaymentId)||!text(evidence.merchantReference)||!text(evidence.currency)
      ||!text(evidence.normalizedEvidenceReference)||typeof evidence.amountUnits!=='bigint'||!Number.isSafeInteger(evidence.amountScale)||evidence.amountScale<0))throw new EnrollmentTransactionUnavailable();
    const getReceipt=async(client:PoolClient)=>(await client.query<ReceiptRow>('SELECT "providerScope","normalizedEvidenceReference","merchantReferenceHint","providerPaymentIdHint",state,"terminalPaymentId" FROM "ProviderReceipt" WHERE id=$1',[receiptId])).rows[0];
    const association=async(client:PoolClient)=>evidence?(await client.query<{studentId:string;orderId:string;id:string}>(`SELECT id,"studentId","orderId" FROM "PaymentAttempt" WHERE "providerScope"=$1 AND "merchantReference"=$2`,[evidence.providerScope,evidence.merchantReference])).rows[0]:undefined;
    const discover=async(client:PoolClient)=>{
      const receipt=await getReceipt(client);if(!receipt)throw new EnrollmentTransactionUnavailable();
      const linked=await association(client),canonical=evidence?await payment(client,evidence):undefined;
      const students=new Set<string>();if(linked)students.add(linked.studentId);
      if(canonical?.orderId){const row=(await client.query<{studentId:string}>('SELECT "studentId" FROM "EnrollmentOrder" WHERE id=$1',[canonical.orderId])).rows[0];if(!row)throw new EnrollmentTransactionUnavailable();students.add(row.studentId);}
      const t=empty();const mutable=Object.fromEntries(Object.keys(t).map(k=>[k,[] as string[]])) as unknown as {[K in keyof EnrollmentTopology]:string[]};
      for(const student of students){const found=await participants.discover(client,student,offering(client));for(const key of Object.keys(t) as (keyof EnrollmentTopology)[])mutable[key].push(...found[key]);}
      mutable.receiptIds.push(receiptId);if(canonical)mutable.paymentIds.push(canonical.id);
      // Un recibo terminal también debe cubrir la identidad canónica que referencia.
      if(receipt.terminalPaymentId){
        mutable.paymentIds.push(receipt.terminalPaymentId);
        const previous=(await client.query<{studentId:string}>(`SELECT o."studentId" FROM "VerifiedPayment" p JOIN "EnrollmentOrder" o ON o.id=p."orderId" WHERE p.id=$1`,[receipt.terminalPaymentId])).rows[0];
        if(previous&&!students.has(previous.studentId)){
          const found=await participants.discover(client,previous.studentId,offering(client));
          for(const key of Object.keys(t) as (keyof EnrollmentTopology)[])mutable[key].push(...found[key]);
        }
      }
      if(mutable.paymentIds.length){
        const incidents=(await client.query<{id:string}>('SELECT id FROM "PaymentIncident" WHERE "verifiedPaymentId"=ANY($1::uuid[])',[mutable.paymentIds])).rows;
        mutable.incidentIds.push(...incidents.map(i=>i.id));
      }
      return mutable;
    };
    let canonical:PaymentRow|undefined,order:EnrollmentOrderSnapshot|null=null;
    let linked:Awaited<ReturnType<typeof association>>,groups:Awaited<ReturnType<ReservationOfferingAccess['snapshots']>>=[];
    type CommitmentRow={courseId:string;groupId:string;orderId:string|null;kind:EffectiveCommitment['kind'];state:EffectiveCommitment['state'];start:string;end:string;periodStart:string;periodEnd:string;timeZone:'America/Lima';schedule:EffectiveCommitment['schedule']};
    type Inventory={groupId:string;kind:string;start:string;end:string};
    let commitments:(EffectiveCommitment&{orderId:string|null})[]=[],inventory:Inventory[]=[],seats:{groupId:string;state:'CONFIRMED'|'CONVERTED'|'EXPIRED'}[]=[];
    let validated=false,canonicalMatches=false;
    let preparedDecision:ReturnType<typeof prepareFinalPaymentDecision>|undefined;
    try{return await run({discover,recheck:discover,async validate(client,locked){
      validated=false;canonicalMatches=false;preparedDecision=undefined;canonical=undefined;order=null;linked=undefined;groups=[];commitments=[];inventory=[];seats=[];
      const receipt=await getReceipt(client);if(!receipt||!locked.receiptIds.includes(receiptId))throw new EnrollmentTransactionUnavailable();
      if(!evidence){validated=true;return;}
      if(receipt.providerScope!==evidence.providerScope||receipt.normalizedEvidenceReference!==evidence.normalizedEvidenceReference
        ||(receipt.merchantReferenceHint!==null&&receipt.merchantReferenceHint!==evidence.merchantReference)
        ||(receipt.providerPaymentIdHint!==null&&receipt.providerPaymentIdHint!==evidence.providerPaymentId))throw new EnrollmentTransactionUnavailable();
      canonical=await payment(client,evidence);
      if(canonical&&!locked.paymentIds.includes(canonical.id))throw new EconomicTopologyChanged();
      linked=await association(client);
      if(linked){
        if(!locked.attemptIds.includes(linked.id)||!locked.orderIds.includes(linked.orderId))throw new EconomicTopologyChanged();
        order=await participants.order(client,linked.orderId);if(!order)throw new EnrollmentTransactionUnavailable();
        groups=await offering(client).snapshots(order.items.map(i=>i.groupId));
        seats=(await client.query<typeof seats[number]>(`SELECT i."groupId",r.state FROM "SeatReservation" r JOIN "EnrollmentOrderItem" i ON i.id=r."orderItemId" WHERE i."orderId"=$1`,[order.id])).rows;
        const rows=(await client.query<CommitmentRow>(`SELECT i."courseId",i."groupId",o.id AS "orderId",'RESERVATION' AS kind,r.state::text,
          (extract(epoch FROM o."confirmedAt")*1000000)::numeric(30,0)::text AS start,(extract(epoch FROM o."expiresAt")*1000000)::numeric(30,0)::text AS end,
          to_char(i."periodStart",'YYYY-MM-DD') AS "periodStart",to_char(i."periodEnd",'YYYY-MM-DD') AS "periodEnd",i."timeZone",i."scheduleSnapshot" AS schedule
          FROM "EnrollmentOrder" o JOIN "EnrollmentOrderItem" i ON i."orderId"=o.id JOIN "SeatReservation" r ON r."orderItemId"=i.id WHERE o."studentId"=$1 AND o.state='RESERVED'
          UNION ALL SELECT e."courseId",e."groupId",NULL,'ENROLLMENT','ENROLLED',
          (extract(epoch FROM e."confirmedAt")*1000000)::numeric(30,0)::text,(extract(epoch FROM e."validUntil")*1000000)::numeric(30,0)::text,
          to_char(e."originalPeriodStart",'YYYY-MM-DD'),to_char(e."originalPeriodEnd",'YYYY-MM-DD'),e."timeZone",e."scheduleSnapshot" FROM "Enrollment" e WHERE e."studentId"=$1`,[linked.studentId])).rows;
        commitments=rows.map(r=>({...r,confirmedAt:BigInt(r.start),validUntil:BigInt(r.end),studentVisible:false}));
        inventory=(await client.query<Inventory>(`SELECT i."groupId",'RESERVATION' AS kind,
          (extract(epoch FROM o."confirmedAt")*1000000)::numeric(30,0)::text AS start,(extract(epoch FROM o."expiresAt")*1000000)::numeric(30,0)::text AS end
          FROM "SeatReservation" r JOIN "EnrollmentOrderItem" i ON i.id=r."orderItemId" JOIN "EnrollmentOrder" o ON o.id=i."orderId"
          WHERE i."groupId"=ANY($1::uuid[]) AND r.state='CONFIRMED' AND o.state='RESERVED'
          UNION ALL SELECT "groupId",'ENROLLMENT',(extract(epoch FROM "confirmedAt")*1000000)::numeric(30,0)::text,
          (extract(epoch FROM "validUntil")*1000000)::numeric(30,0)::text FROM "Enrollment" WHERE "groupId"=ANY($1::uuid[])`,[order.items.map(i=>i.groupId)])).rows;
      }
      canonicalMatches=Boolean(canonical&&same(canonical,evidence));
      preparedDecision=prepareFinalPaymentDecision({order,merchantReference:linked?evidence.merchantReference:null,providerScope:evidence.providerScope,observation:{state:'ECONOMIC_FACT',evidence},commitments,groups:[]});
      validated=true;
    },async apply(context){
      if(!validated)throw new EnrollmentTransactionUnavailable();
      if(!evidence)return {state:'UNCONFIRMED'};
      const at=postgresInstantParameter(context.decision.at);
      const finishReceipt=async(state:'PROCESSED',id:string,integrityConflict=false)=>{
        await context.client.query(`UPDATE "ProviderReceipt" SET state=$2::"ProviderReceiptState","processedAt"=$3,"terminalPaymentId"=$4,"integrityConflict"=$5 WHERE id=$1 AND state='RECEIVED'`,[receiptId,state,at,id,integrityConflict]);
      };
      if(canonical){
        if(!canonicalMatches){await finishReceipt('PROCESSED',canonical.id,true);return {state:'INTEGRITY_CONFLICT'};}
        await finishReceipt('PROCESSED',canonical.id);return result(canonical);
      }
      if(!preparedDecision)throw new EnrollmentTransactionUnavailable();
      const decision=preparedDecision(context.decision,groups.map(g=>({groupId:g.groupId,studentVisible:g.studentVisible,
          teacherEligible:g.teacherEligible,teacherReviewRequired:g.teacherReviewRequired,capacity:g.capacity??0,
          seatState:seats.find(s=>s.groupId===g.groupId)?.state??'EXPIRED',
          reserved:inventory.filter(i=>i.groupId===g.groupId&&i.kind==='RESERVATION'&&BigInt(i.start)<=context.decision.at&&context.decision.at<BigInt(i.end)).length,
          occupied:inventory.filter(i=>i.groupId===g.groupId&&i.kind==='ENROLLMENT'&&BigInt(i.start)<=context.decision.at&&context.decision.at<BigInt(i.end)).length})));
      if(decision.state==='UNCONFIRMED')throw new EnrollmentTransactionUnavailable();
      const id=randomUUID();
      const inserted=await context.client.query(`INSERT INTO "VerifiedPayment" (id,"providerScope","providerPaymentId","orderId","amountUnits","amountScale",currency,"merchantReference","verificationFinishedAt","reconciliationState","normalizedEvidenceReference")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT ("providerScope","providerPaymentId") DO NOTHING RETURNING id`,
      [id,evidence.providerScope,evidence.providerPaymentId,order?.id??null,evidence.amountUnits.toString(),evidence.amountScale,evidence.currency,evidence.merchantReference,at,decision.state,evidence.normalizedEvidenceReference]);
      if(inserted.rowCount!==1)throw new EconomicTopologyChanged();
      if(decision.state==='APPLIED'){
        if(!order)throw new EnrollmentTransactionUnavailable();
        const converted=await context.client.query(`UPDATE "SeatReservation" SET state='CONVERTED' WHERE state='CONFIRMED' AND "orderItemId" IN (SELECT id FROM "EnrollmentOrderItem" WHERE "orderId"=$1)`,[order.id]);
        if(converted.rowCount!==order.items.length)throw new EnrollmentTransactionUnavailable();
        const enrolled=await context.client.query(`INSERT INTO "Enrollment" ("orderItemId","studentId","courseId","groupId","paymentId","confirmedAt","originalPeriodStart","originalPeriodEnd","timeZone","scheduleSnapshot","validUntil")
          SELECT id,$2,"courseId","groupId",$3,$4,"periodStart","periodEnd","timeZone","scheduleSnapshot","enrollmentValidUntil" FROM "EnrollmentOrderItem" WHERE "orderId"=$1 ORDER BY id`,[order.id,order.studentId,id,at]);
        if(enrolled.rowCount!==order.items.length)throw new EnrollmentTransactionUnavailable();
        if((await context.client.query(`UPDATE "EnrollmentOrder" SET state='ENROLLED',revision=revision+1 WHERE id=$1 AND state='RESERVED'`,[order.id])).rowCount!==1)throw new EnrollmentTransactionUnavailable();
      }else{
        await context.client.query(`INSERT INTO "PaymentIncident" ("orderId","verifiedPaymentId",reason,"affectedGroupIds","openedAt") VALUES ($1,$2,$3,$4,$5)`,[order?.id??null,id,decision.reason,decision.affectedGroupIds,at]);
        if(order)await createExpirationNormalizer(context,requestId).normalize(order.id,context.decision);
      }
      if(linked)await context.client.query(`UPDATE "PaymentAttempt" SET state=$2::"PaymentAttemptState" WHERE id=$1 AND state IN ('SUBMITTING','PENDING','INITIATION_UNKNOWN')`,[linked.id,decision.state]);
      await context.client.query(`INSERT INTO "EnrollmentAuditEvent" ("actorKind","actorReference",operation,"targetKind","targetId","providerEventId","effectKey","requestId","occurredAt",result)
        VALUES ('SYSTEM',$1,'PAYMENT_VERIFIED','PAYMENT',$2,$3,$4,$5,$6,$7)`,[context.authority.reference,id,receiptId,null,requestId,at,decision.state]);
      await finishReceipt('PROCESSED',id);
      return {state:decision.state,paymentId:id,verificationFinishedAt:formatInstant(context.decision.at)};
    }});}catch(error){
      // Nunca repetir una mutación por COMMIT ambiguo. Una lectura de identidad
      // terminal permite recuperar el resultado ya durable; sin él se falla seguro.
      if(validated&&evidence){try{const found=await payment(pool,evidence);if(found&&same(found,evidence))return result(found);}catch{/* fallo seguro, sin datos del proveedor */}}
      throw error;
    }
  }};
}
