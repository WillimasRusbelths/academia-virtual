import type { Pool, PoolClient } from 'pg';
import type { SessionActor } from '../../authorization/public/session.js';
import type { ReservationCatalogAccess } from '../../academic-offering/public/reservation-boundary.js';
import type { EnrollmentTopology } from '../application/ports.js';
import type { EnrollmentQueries, EnrollmentPage, OfferingPage, InventoryItem, OrderView, RequestView,EnrollmentView } from '../application/queries.js';
import { createEnrollmentTransaction, EnrollmentTransactionUnavailable } from '../../../infrastructure/database/enrollment-transaction.js';
import type { EnrollmentTransactionContext, EnrollmentTransactionDependencies } from '../../../infrastructure/database/enrollment-transaction.js';
import { EnrollmentError, enrollmentUuid, reservationGroupIds } from '../domain/enrollment-error.js';
import { formatInstant } from '../domain/instant.js';
import { createEnrollmentFinancialParticipant } from './enrollment-store.js';
import { postgresInstantParameter } from './temporal.js';
import { ENROLLMENT_ERROR_MESSAGES } from '../public/errors.js';

const empty=():EnrollmentTopology=>({accountIds:[],courseIds:[],groupIds:[],orderIds:[],attemptIds:[],receiptIds:[],paymentIds:[],enrollmentIds:[],incidentIds:[]});
const invalid=()=>new EnrollmentError({code:'VALIDATION_ERROR'});
class ReadTopologyChanged extends Error {readonly transactionAborted=true;}
function page(input:EnrollmentPage,withQuery=false):EnrollmentPage {
  if(!input||Object.keys(input).some(key=>!['page','pageSize',...(withQuery?['q']:[])].includes(key))
    ||!Number.isSafeInteger(input.page)||input.page<1||!Number.isSafeInteger(input.pageSize)||input.pageSize<1||input.pageSize>50
    ||!Number.isSafeInteger((input.page-1)*input.pageSize))throw invalid();
  return {page:input.page,pageSize:input.pageSize};
}
/** Un lector conserva únicamente referencias, nunca filas/contadores de descubrimiento.
 * Cursos/grupos compartidos serializan contra todos los escritores de compromisos. */
export function createEnrollmentQueries(pool:Pool,authorization:EnrollmentTransactionDependencies,
  offeringFactory:(client:PoolClient)=>ReservationCatalogAccess):EnrollmentQueries {
  const run=createEnrollmentTransaction(pool,{...authorization,preserve:error=>error instanceof EnrollmentError||Boolean(authorization.preserve?.(error))});
  type Selection={groups?:readonly string[];orderId?:string;ownOrders?:boolean};
  async function topology(client:PoolClient,studentId:string,selection:Selection):Promise<EnrollmentTopology>{
    const t=empty(),offering=offeringFactory(client),groups=selection.groups??[];
    const orders=(await client.query<{id:string}>(`SELECT o.id FROM "EnrollmentOrder" o WHERE
      ($1::boolean AND o."studentId"=$2) OR (o.id=$3::uuid AND o."studentId"=$2)
      OR EXISTS (SELECT 1 FROM "EnrollmentOrderItem" i WHERE i."orderId"=o.id AND i."groupId"=ANY($4::uuid[])) ORDER BY o.id`,
    [selection.ownOrders??false,studentId,selection.orderId??null,groups])).rows.map(r=>r.id);
    const items=(await client.query<{courseId:string;groupId:string}>('SELECT "courseId","groupId" FROM "EnrollmentOrderItem" WHERE "orderId"=ANY($1::uuid[])',[orders])).rows;
    const groupIds=[...new Set([...groups,...items.map(i=>i.groupId)])].sort(),refs=await offering.discover(groupIds);
    // Una referencia solicitada inexistente se maneja como ausencia de oferta.
    return {...t,orderIds:orders,groupIds:refs.map(r=>r.groupId),courseIds:[...new Set([...items.map(i=>i.courseId),...refs.map(r=>r.courseId)])].sort()};
  }
  function read<T>(actor:SessionActor,permission:'enrollment:reserve-own'|'enrollment:read-own',
    select:(client:PoolClient)=>Promise<Selection>,apply:(context:EnrollmentTransactionContext)=>Promise<T>):Promise<T>{
    let selection:Selection;
    return run({actor,permission,mode:'READ',
      async discover(client){selection=await select(client);return topology(client,actor.userId,selection);},
      recheck:client=>topology(client,actor.userId,selection),apply});
  }
  async function inventory(context:EnrollmentTransactionContext,groupIds:readonly string[],strict:boolean):Promise<InventoryItem[]>{
    const snapshots=await offeringFactory(context.client).snapshots(groupIds);
    if(snapshots.some(s=>!context.locked.groupIds.includes(s.groupId)||!context.locked.courseIds.includes(s.courseId)))throw new ReadTopologyChanged();
    if(strict&&(snapshots.length!==groupIds.length||snapshots.some(s=>!s.studentVisible)))throw new EnrollmentError({code:'OFFERING_NOT_RESERVABLE'});
    const rows:InventoryItem[]=[];
    for(const s of snapshots.filter(s=>s.studentVisible)){
      const row=(await context.client.query<{reserved:number;occupied:number;priceMinor:string|null}>(`SELECT
        (SELECT count(*)::int FROM "SeatReservation" r JOIN "EnrollmentOrderItem" i ON i.id=r."orderItemId" JOIN "EnrollmentOrder" o ON o.id=i."orderId"
          WHERE i."groupId"=$1 AND r.state='CONFIRMED' AND o.state='RESERVED' AND o."confirmedAt"<=$2::timestamptz AND $2::timestamptz<o."expiresAt") AS reserved,
        (SELECT count(*)::int FROM "Enrollment" e WHERE e."groupId"=$1 AND e."confirmedAt"<=$2::timestamptz AND $2::timestamptz<e."validUntil") AS occupied,
        (SELECT "amountMinor"::text FROM "CoursePrice" WHERE "courseId"=$3) AS "priceMinor"`,[s.groupId,postgresInstantParameter(context.decision.at),s.courseId])).rows[0];
      if(s.capacity===null||!Number.isInteger(s.capacity)||s.capacity<1||s.capacity>50||row.reserved+row.occupied>s.capacity)throw new EnrollmentTransactionUnavailable();
      rows.push({groupId:s.groupId,courseId:s.courseId,courseName:s.courseName,groupName:s.groupName,teacherName:s.teacherName,
        periodStart:s.periodStart,periodEnd:s.periodEnd,timeZone:s.timeZone,schedule:s.schedule,capacity:s.capacity,
        reserved:row.reserved,occupied:row.occupied,available:s.capacity-row.reserved-row.occupied,priceMinor:row.priceMinor,currency:'PEN'});
    }
    return rows;
  }
  async function orderView(context:EnrollmentTransactionContext,id:string,studentId:string):Promise<OrderView|null>{
    if(!context.locked.orderIds.includes(id))return null;
    const order=await createEnrollmentFinancialParticipant(context).order(id);
    if(!order||order.studentId!==studentId)return null;
    if(context.decision.at<order.confirmedAt)throw new EnrollmentTransactionUnavailable();
    const snapshots=await offeringFactory(context.client).snapshots(order.items.map(i=>i.groupId));
    if(snapshots.some(s=>!context.locked.groupIds.includes(s.groupId)||!context.locked.courseIds.includes(s.courseId)))throw new ReadTopologyChanged();
    const visible=snapshots.length===order.items.length&&snapshots.every(s=>s.studentVisible);
    const state=order.state==='RESERVED'&&context.decision.at>=order.expiresAt?'EXPIRED':order.state;
    const summary=(await context.client.query<{applied:boolean;incident:boolean;pending:boolean}>(`SELECT
      EXISTS(SELECT 1 FROM "VerifiedPayment" WHERE "orderId"=$1 AND "reconciliationState"='APPLIED') AS applied,
      EXISTS(SELECT 1 FROM "PaymentIncident" WHERE "orderId"=$1) AS incident,
      EXISTS(SELECT 1 FROM "PaymentAttempt" WHERE "orderId"=$1 AND state IN ('SUBMITTING','PENDING','INITIATION_UNKNOWN')) AS pending`,[id])).rows[0];
    return {id:order.id,revision:order.revision,state,totalMinor:order.totalMinor.toString(),currency:'PEN',
      confirmedAt:formatInstant(order.confirmedAt),expiresAt:formatInstant(order.expiresAt),serverNow:formatInstant(context.decision.at),
      items:order.items.map(i=>({courseId:i.courseId,groupId:i.groupId,courseName:i.courseName,groupName:i.groupName,
        priceMinor:i.priceMinor.toString(),currency:'PEN',periodStart:i.periodStart,periodEnd:i.periodEnd,timeZone:i.timeZone,schedule:i.schedule,
        groupStartAt:formatInstant(i.groupStartAt),enrollmentValidUntil:formatInstant(i.enrollmentValidUntil)})),
      paymentAllowed:state==='RESERVED'&&visible&&!summary.applied&&!summary.incident&&!summary.pending,
      paymentMessage:visible?null:'Oferta no disponible.',paymentState:summary.incident?'INCIDENT':summary.applied?'APPLIED':summary.pending?'PENDING':'NOT_PAID',
      incidentSummary:summary.incident?'Pago en conciliación, sin matrícula.':null};
  }
  async function requestRows(context:EnrollmentTransactionContext,studentId:string,intentionId:string|null):Promise<RequestView[]>{
    type Row={id:string;intentionId:string;state:'ADMITTED'|'CONFIRMED'|'REJECTED';admittedAt:string;decisionCode:string|null;orderId:string|null};
    const rows=(await context.client.query<Row>(`SELECT r.id,r."intentionId",r.state,r."decisionCode",
      (extract(epoch FROM r."admittedAt")*1000000)::numeric(30,0)::text AS "admittedAt",o.id AS "orderId"
      FROM "ReservationRequest" r LEFT JOIN "EnrollmentOrder" o ON o."requestId"=r.id AND o."studentId"=r."studentId"
      WHERE r."studentId"=$1 AND ($2::uuid IS NULL OR r."intentionId"=$2) ORDER BY r."admissionSequence" DESC`,[studentId,intentionId])).rows;
    return rows.map(r=>{
      const base={id:r.id,intentionId:r.intentionId,admittedAt:formatInstant(BigInt(r.admittedAt))};
      if(r.state==='CONFIRMED'){if(!r.orderId)throw new EnrollmentTransactionUnavailable();if(!context.locked.orderIds.includes(r.orderId))throw new ReadTopologyChanged();return {...base,state:r.state,orderId:r.orderId};}
      if(r.state==='REJECTED'){if(!r.decisionCode||!Object.hasOwn(ENROLLMENT_ERROR_MESSAGES,r.decisionCode))throw new EnrollmentTransactionUnavailable();return {...base,state:r.state,decisionCode:r.decisionCode};}
      return {...base,state:r.state};
    });
  }
  async function enrollmentRows(context:EnrollmentTransactionContext,studentId:string,id:string|null):Promise<EnrollmentView[]>{
    type Row={id:string;orderId:string;courseId:string;groupId:string;courseName:string;groupName:string;periodStart:string;periodEnd:string;
      timeZone:'America/Lima';schedule:EnrollmentView['schedule'];start:string;end:string};
    const rows=(await context.client.query<Row>(`SELECT e.id,i."orderId",e."courseId",e."groupId",i."courseName",i."groupName",
      to_char(e."originalPeriodStart",'YYYY-MM-DD') AS "periodStart",to_char(e."originalPeriodEnd",'YYYY-MM-DD') AS "periodEnd",
      e."timeZone",e."scheduleSnapshot" AS schedule,(extract(epoch FROM e."confirmedAt")*1000000)::numeric(30,0)::text AS start,
      (extract(epoch FROM e."validUntil")*1000000)::numeric(30,0)::text AS end
      FROM "Enrollment" e JOIN "EnrollmentOrderItem" i ON i.id=e."orderItemId"
      JOIN "VerifiedPayment" p ON p.id=e."paymentId" AND p."reconciliationState"='APPLIED'
      WHERE e."studentId"=$1 AND ($2::uuid IS NULL OR e.id=$2) ORDER BY e."confirmedAt" DESC,e.id`,[studentId,id])).rows;
    return rows.map(row=>{
      if(!context.locked.orderIds.includes(row.orderId)||!context.locked.groupIds.includes(row.groupId)||!context.locked.courseIds.includes(row.courseId))throw new ReadTopologyChanged();
      if(context.decision.at<BigInt(row.start))throw new EnrollmentTransactionUnavailable();
      return {id:row.id,orderId:row.orderId,courseId:row.courseId,groupId:row.groupId,courseName:row.courseName,groupName:row.groupName,
        state:context.decision.at<BigInt(row.end)?'ENROLLED':'HISTORICAL',periodStart:row.periodStart,periodEnd:row.periodEnd,timeZone:row.timeZone,
        schedule:row.schedule.map(s=>({dayOfWeek:s.dayOfWeek,startTime:s.startTime,endTime:s.endTime})),confirmedAt:formatInstant(BigInt(row.start)),validUntil:formatInstant(BigInt(row.end))};
    });
  }
  return {
    enrollment(actor,input){const id=enrollmentUuid(input);return read(actor,'enrollment:read-own',async()=>({ownOrders:true}),async context=>(await enrollmentRows(context,actor.userId,id))[0]??null);},
    enrollments(actor,input){const pagination=page(input);return read(actor,'enrollment:read-own',async()=>({ownOrders:true}),async context=>{
      const rows=await enrollmentRows(context,actor.userId,null);return {...pagination,total:rows.length,items:rows.slice((pagination.page-1)*pagination.pageSize,pagination.page*pagination.pageSize)};
    });},
    offerings(actor,input){
      const pagination=page(input,true);
      if(input.q!==undefined&&typeof input.q!=='string')throw invalid();
      const selection:OfferingPage={...pagination,...(input.q===undefined?{}:{q:input.q})};let ids:readonly string[]=[],total=0;
      return read(actor,'enrollment:reserve-own',async client=>{const result=await offeringFactory(client).page(selection);ids=result.groupIds;total=result.total;return {groups:ids};},
        async context=>({items:await inventory(context,ids,false),...pagination,total,evaluatedAt:formatInstant(context.decision.at)}));
    },
    preview(actor,input){const ids=reservationGroupIds(input);return read(actor,'enrollment:reserve-own',async()=>({groups:ids}),async context=>{
      const items=await inventory(context,ids,true);
      if(new Set(items.map(i=>i.courseId)).size!==items.length)throw invalid();
      if(items.some(i=>i.priceMinor===null))throw new EnrollmentError({code:'OFFERING_NOT_RESERVABLE'});
      return {items,totalMinor:items.reduce((sum,i)=>sum+BigInt(i.priceMinor!),0n).toString(),evaluatedAt:formatInstant(context.decision.at)};
    });},
    order(actor,input){const id=enrollmentUuid(input);return read(actor,'enrollment:read-own',async()=>({orderId:id}),context=>orderView(context,id,actor.userId));},
    currentOrder(actor){return read(actor,'enrollment:read-own',async()=>({ownOrders:true}),async context=>{
      const row=(await context.client.query<{id:string}>(`SELECT id FROM "EnrollmentOrder" WHERE "studentId"=$1 AND state='RESERVED'
        AND "confirmedAt"<=$2::timestamptz AND $2::timestamptz<"expiresAt" ORDER BY id`,[actor.userId,postgresInstantParameter(context.decision.at)])).rows;
      if(row.length>1)throw new EnrollmentTransactionUnavailable();
      if(row.some(r=>!context.locked.orderIds.includes(r.id)))throw new ReadTopologyChanged();
      return row.length?orderView(context,row[0].id,actor.userId):null;
    });},
    orders(actor,input){const pagination=page(input);return read(actor,'enrollment:read-own',async()=>({ownOrders:true}),async context=>{
      const ids=(await context.client.query<{id:string}>('SELECT id FROM "EnrollmentOrder" WHERE "studentId"=$1 ORDER BY "confirmedAt" DESC,id',[actor.userId])).rows.map(r=>r.id);
      if(ids.some(id=>!context.locked.orderIds.includes(id)))throw new ReadTopologyChanged();
      const items:OrderView[]=[];for(const id of ids.slice((pagination.page-1)*pagination.pageSize,pagination.page*pagination.pageSize)){const view=await orderView(context,id,actor.userId);if(view)items.push(view);}
      return {...pagination,total:ids.length,items};
    });},
    request(actor,input){const id=enrollmentUuid(input);return read(actor,'enrollment:read-own',async()=>({ownOrders:true}),async context=>(await requestRows(context,actor.userId,id))[0]??null);},
    requests(actor,input){const pagination=page(input);return read(actor,'enrollment:read-own',async()=>({ownOrders:true}),async context=>{
      const items=await requestRows(context,actor.userId,null);return {...pagination,total:items.length,items:items.slice((pagination.page-1)*pagination.pageSize,pagination.page*pagination.pageSize)};
    });},
  };
}
