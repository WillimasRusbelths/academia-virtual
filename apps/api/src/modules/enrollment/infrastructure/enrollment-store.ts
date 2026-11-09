import type { Pool, PoolClient } from 'pg';
import type { EnrollmentTransactionContext } from '../../../infrastructure/database/enrollment-transaction.js';
import { createEnrollmentTransaction, EnrollmentTransactionUnavailable } from '../../../infrastructure/database/enrollment-transaction.js';
import type { EnrollmentTransactionDependencies } from '../../../infrastructure/database/enrollment-transaction.js';
import { canonicalLockIds } from '../../../infrastructure/database/account-locks.js';
import type { CourseReferenceAccess, ReservationOfferingAccess } from '../../academic-offering/public/reservation-boundary.js';
import type { EnrollmentTopology, EnrollmentFinancialReads, EnrollmentFoundationParticipants } from '../application/ports.js';
import { createEnrollmentCalendar } from './temporal.js';
import { postgresInstantParameter } from './temporal.js';
import type { CoursePrice, EnrollmentPriceStore } from '../application/prices.js';
import { EnrollmentError } from '../public/errors.js';
import { createEnrollmentCommandWriter } from './audit.js';
import type { EnrollmentStore } from '../application/ports.js';
import { randomUUID } from 'node:crypto';
import { createReservedOrder } from '../domain/order.js';
import { Payments } from '../application/payments.js';
import type { PaymentAttemptConfiguration,PaymentAttempts } from '../application/payments.js';
import type { PaymentGateway } from '../public/payments.js';
import { createPaymentAttemptStore } from './payment-attempts.js';
import { readEnrollmentOrder } from './financial-reads.js';
import { createPaymentVerificationStore } from './payment-verification.js';

export function createPaymentVerification(pool:Pool,offering:(client:PoolClient)=>ReservationOfferingAccess){
  return createPaymentVerificationStore(pool,offering,{discover:discoverEnrollmentTopology,order:readEnrollmentOrder});
}

/** Se conecta solo por composición interna con gateway y ámbito explícitos.
 * Sin configuración implícita, ruta de aprobación o adaptador externo ficticio. */
export function createPaymentAttempts(pool:Pool,authorization:EnrollmentTransactionDependencies,
  offering:(client:PoolClient)=>ReservationOfferingAccess,gateway:PaymentGateway,configuration:PaymentAttemptConfiguration):PaymentAttempts{
  return new Payments(createPaymentAttemptStore(pool,authorization,offering,configuration,
    {discover:discoverEnrollmentTopology,financial:createEnrollmentFinancialParticipant}),gateway);
}

/** Lectura cerrada propia; ausencia no se transforma en cero. */
async function coursePrice(context:EnrollmentTransactionContext,courseId:string):Promise<CoursePrice> {
  return context.use(async()=>{
    if(!context.locked.courseIds.includes(courseId))throw new EnrollmentError({code:'NOT_FOUND'});
    const row=(await context.client.query<{amountMinor:string;currency:'PEN';revision:string}>(
      'SELECT "amountMinor"::text,"currency",revision::text FROM "CoursePrice" WHERE "courseId"=$1',[courseId])).rows[0];
    return row?{courseId,defined:true,amountMinor:row.amountMinor,currency:row.currency,revision:row.revision}
      :{courseId,defined:false,amountMinor:null,currency:null,revision:null};
  });
}
/** Precio usa la misma familia transaccional que oferta/pago. El participante de
 * oferta solo consulta existencia; el coordinador adquiere el lock de curso. */
export function createEnrollmentPriceStore(pool:Pool,authorization:EnrollmentTransactionDependencies,
  courseReferences:(client:PoolClient)=>CourseReferenceAccess):EnrollmentPriceStore {
  const dependencies={...authorization,preserve:(error:unknown)=>error instanceof EnrollmentError||Boolean(authorization.preserve?.(error))};
  const read=createEnrollmentTransaction(pool,dependencies),write=createEnrollmentCommandWriter(pool,dependencies);
  const discover=async(client:PoolClient,courseId:string):Promise<EnrollmentTopology>=>({accountIds:[],
    courseIds:await courseReferences(client).exists(courseId)?[courseId]:[],groupIds:[],orderIds:[],attemptIds:[],receiptIds:[],paymentIds:[],enrollmentIds:[],incidentIds:[]});
  return {
    read:(actor,courseId)=>read({actor,permission:'enrollment:price-manage',mode:'READ',
      discover:client=>discover(client,courseId),recheck:client=>discover(client,courseId),apply:context=>coursePrice(context,courseId)}),
    set:(actor,courseId,input,requestId)=>write({actor,operation:'COURSE_PRICE_SET',targetId:courseId,commandId:input.commandId,requestId,
      expectedRevision:input.expectedRevision,payload:{amountMinor:input.amountMinor,currency:input.currency},
      discover:client=>discover(client,courseId),recheck:client=>discover(client,courseId),
      async validateTarget(_client,locked){if(!locked.courseIds.includes(courseId))throw new EnrollmentError({code:'NOT_FOUND'});},
      async apply(context){
        const before=await coursePrice(context,courseId);
        if(before.defined&&before.amountMinor===input.amountMinor&&before.currency===input.currency){
          return {outcomeCode:'NO_CHANGE',resultingRevision:before.revision,resourceReferences:{courseId}};
        }
        const revision=String(BigInt(before.revision??'0')+1n);
        await context.use(()=>context.client.query(`INSERT INTO "CoursePrice" ("courseId","amountMinor",currency,revision,"changedBy","changedAt")
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("courseId") DO UPDATE SET "amountMinor"=EXCLUDED."amountMinor",currency=EXCLUDED.currency,
          revision=EXCLUDED.revision,"changedBy"=EXCLUDED."changedBy","changedAt"=EXCLUDED."changedAt"`,
        [courseId,input.amountMinor,input.currency,revision,actor.userId,postgresInstantParameter(context.decision.at)]));
        return {outcomeCode:'APPLIED',resultingRevision:revision,resourceReferences:{courseId}};
      },project:(context,refs)=>{if(!('courseId' in refs))throw new EnrollmentTransactionUnavailable();return coursePrice(context,refs.courseId);},
    }),
  };
}

/** Descubrimiento conservador sin reloj decisorio: incluye historial del titular,
 * oferta oculta y órdenes RESERVED aunque su plazo haya vencido. Nunca bloquea aquí.
 * Los padres/docentes se resuelven por el dueño público; no consulta tablas ajenas.
 */
export async function discoverEnrollmentTopology(client: PoolClient, studentId: string, offering: ReservationOfferingAccess): Promise<EnrollmentTopology> {
  canonicalLockIds([studentId]);
  const row=(await client.query<Omit<EnrollmentTopology,'accountIds'>>(`WITH
    o AS (SELECT id FROM "EnrollmentOrder" WHERE "studentId"=$1),
    e AS (SELECT * FROM "Enrollment" WHERE "studentId"=$1),
    i AS (SELECT * FROM "PaymentIncident" WHERE "orderId" IN (SELECT id FROM o)),
    p AS (SELECT id FROM "VerifiedPayment" WHERE "orderId" IN (SELECT id FROM o)
      UNION SELECT "paymentId" FROM e UNION SELECT "verifiedPaymentId" FROM i),
    items AS (SELECT "courseId","groupId" FROM "EnrollmentOrderItem" WHERE "orderId" IN (SELECT id FROM o))
    SELECT ARRAY(SELECT id FROM o ORDER BY id) AS "orderIds",
      ARRAY(SELECT id FROM "PaymentAttempt" WHERE "orderId" IN (SELECT id FROM o) ORDER BY id) AS "attemptIds",
      ARRAY(SELECT id FROM "ProviderReceipt" WHERE "terminalPaymentId" IN (SELECT id FROM p) ORDER BY id) AS "receiptIds",
      ARRAY(SELECT id FROM p ORDER BY id) AS "paymentIds",ARRAY(SELECT id FROM e ORDER BY id) AS "enrollmentIds",
      ARRAY(SELECT id FROM i ORDER BY id) AS "incidentIds",
      ARRAY(SELECT "courseId" FROM items UNION SELECT "courseId" FROM e) AS "courseIds",
      ARRAY(SELECT "groupId" FROM items UNION SELECT "groupId" FROM e UNION SELECT unnest("affectedGroupIds") FROM i) AS "groupIds"`,[studentId])).rows[0];
  const refs=await offering.discover(row.groupIds);
  if(refs.length!==row.groupIds.length)throw new EnrollmentTransactionUnavailable();
  return Object.freeze({...row,accountIds:canonicalLockIds([studentId,...refs.flatMap(r=>r.teacherUserId?[r.teacherUserId]:[])]),
    courseIds:canonicalLockIds([...row.courseIds,...refs.map(r=>r.courseId)]),groupIds:canonicalLockIds(row.groupIds),
    orderIds:canonicalLockIds(row.orderIds),attemptIds:canonicalLockIds(row.attemptIds),receiptIds:canonicalLockIds(row.receiptIds),
    paymentIds:canonicalLockIds(row.paymentIds),enrollmentIds:canonicalLockIds(row.enrollmentIds),incidentIds:canonicalLockIds(row.incidentIds)});
}
/** Participante efímero de lectura: no abre transacción, toma locks o confirma reservas. */
export function createEnrollmentFinancialParticipant(context: EnrollmentTransactionContext): EnrollmentFinancialReads {
  const {client}=context;
  const scoped=(id:string)=>{const canonical=canonicalLockIds([id])[0];if(!context.locked.orderIds.includes(canonical))throw new EnrollmentTransactionUnavailable();return canonical;};
  const reads:EnrollmentFinancialReads={
    order(id){return context.use(async()=>{
      id=scoped(id);
      return readEnrollmentOrder(client,id);
    });},
    currentOrder(studentId){return context.use(async()=>{
      const row=(await client.query<{id:string}>(`SELECT id FROM "EnrollmentOrder" WHERE "studentId"=$1 AND state='RESERVED'
        AND id=ANY($2::uuid[])`,[studentId,context.locked.orderIds])).rows[0];
      return row?reads.order(row.id):null;
    });},
  };
  return Object.freeze(reads);
}
/** Composición recibe la capacidad pública de oferta ya ligada al mismo cliente.
 * Cada método impide uso fuera del callback o referencias añadidas tras el token.
 */
export function createEnrollmentParticipants(context:EnrollmentTransactionContext,offering:ReservationOfferingAccess):EnrollmentFoundationParticipants {
  const assertGroups=(ids:readonly string[])=>{
    for(const id of canonicalLockIds(ids))if(!context.locked.groupIds.includes(id))throw new EnrollmentTransactionUnavailable();
  };
  const calendar=createEnrollmentCalendar(context.client);
  return Object.freeze({decision:context.decision,financial:createEnrollmentFinancialParticipant(context),
    calendar:Object.freeze({originalBounds:(start:string,end:string)=>context.use(()=>calendar.originalBounds(start,end))}),
    offering:Object.freeze({
      discover:(ids:readonly string[])=>context.use(()=>{assertGroups(ids);return offering.discover(ids);}),
      snapshots:(ids:readonly string[])=>context.use(()=>{assertGroups(ids);return offering.snapshots(ids);}),
    }),
  });
}

/** Escritor de confirmación ligado a la transacción; no abre otra conexión. */
export function createEnrollmentStore(context:EnrollmentTransactionContext):EnrollmentStore {
  return {currentOrder:createEnrollmentFinancialParticipant(context).currentOrder,
    confirm:input=>context.use(async()=>{
      context.assertDecision(input.decision);
      if(context.mode!=='WRITE'||!context.locked.accountIds.includes(input.studentId)||input.items.some(i=>!context.locked.courseIds.includes(i.courseId)||!context.locked.groupIds.includes(i.groupId)))throw new EnrollmentTransactionUnavailable();
      const request=(await context.client.query<{studentId:string;intentionId:string;groupIds:string[];state:string}>(
        'SELECT "studentId","intentionId","groupIds",state FROM "ReservationRequest" WHERE id=$1 FOR UPDATE',[input.requestId])).rows[0];
      const selected=canonicalLockIds(input.selection.groupIds),itemGroups=canonicalLockIds(input.items.map(i=>i.groupId));
      if(!request||request.state!=='ADMITTED'||request.studentId!==input.studentId||request.intentionId!==input.selection.intentionId
        ||JSON.stringify(request.groupIds)!==JSON.stringify(selected)||JSON.stringify(selected)!==JSON.stringify(itemGroups)
        ||selected.length!==input.items.length)throw new EnrollmentTransactionUnavailable();
      const inserted=async(sql:string,parameters:unknown[])=>{if((await context.client.query(sql,parameters)).rowCount!==1)throw new EnrollmentTransactionUnavailable();};
      const order=createReservedOrder({id:randomUUID(),studentId:input.studentId,confirmedAt:input.decision.at,items:input.items});
      if(order.totalMinor!==input.totalMinor)throw new EnrollmentTransactionUnavailable();
      await inserted(`INSERT INTO "EnrollmentOrder" (id,"studentId","requestId",currency,"totalMinor",state,revision,"confirmedAt","expiresAt")
        VALUES ($1,$2,$3,'PEN',$4,'RESERVED',1,$5,$6)`,[order.id,input.studentId,input.requestId,order.totalMinor.toString(),postgresInstantParameter(order.confirmedAt),postgresInstantParameter(order.expiresAt)]);
      for(const item of order.items){
        const id=randomUUID();
        await inserted(`INSERT INTO "EnrollmentOrderItem" (id,"orderId","courseId","groupId","priceMinor","courseName","groupName","periodStart","periodEnd","timeZone","groupStartAt","enrollmentValidUntil","scheduleSnapshot")
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[id,order.id,item.courseId,item.groupId,item.priceMinor.toString(),item.courseName,item.groupName,item.periodStart,item.periodEnd,item.timeZone,postgresInstantParameter(item.groupStartAt),postgresInstantParameter(item.enrollmentValidUntil),JSON.stringify(item.schedule)]);
        await inserted('INSERT INTO "SeatReservation" ("orderItemId",state) VALUES ($1,\'CONFIRMED\')',[id]);
      }
      return order.id;
    }),
  };
}

