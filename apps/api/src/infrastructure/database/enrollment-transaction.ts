import type { Pool, PoolClient } from 'pg';
import type { Permission, SessionActor } from '../../modules/authorization/public/session.js';
import { AuthorizationFailure, permits } from '../../modules/authorization/public/session.js';
import type { EnrollmentAuditActor, EnrollmentPermission, EnrollmentTopology, TemporalDecision } from '../../modules/enrollment/application/ports.js';
import { accountTransaction } from './account-transaction.js';
import { canonicalLockIds, lockAccounts } from './account-locks.js';

export class EnrollmentTransactionUnavailable extends Error {
  readonly code = 'TEMPORARILY_UNAVAILABLE';
  constructor() { super('Operación temporalmente no disponible. Consulta el resultado antes de repetirla.'); }
}
export interface EnrollmentTransactionDependencies {
  revalidateInTransaction(client: PoolClient, actor: SessionActor, permission: Permission): Promise<void>;
  preserve?(error: unknown): boolean;
}
/** Superficie de infraestructura: nunca se exporta a dominio/aplicación/public. */
export interface EnrollmentTransactionContext {
  readonly client: PoolClient;
  readonly locked: EnrollmentTopology;
  readonly decision: TemporalDecision;
  readonly authority: EnrollmentAuditActor;
  readonly mode: 'WRITE' | 'READ';
  assertActive(): void;
  assertDecision(token: TemporalDecision): void;
  use<T>(operation: () => Promise<T>): Promise<T>;
}
export interface EnrollmentWork<T> {
  readonly mode?: 'WRITE' | 'READ';
  /** Tramos previos exclusivos del despachador; mismo cliente y presupuesto. */
  beforeDiscover?(client:PoolClient):Promise<void>;
  authorize?(client:PoolClient):Promise<void>;
  discover(client: PoolClient): Promise<EnrollmentTopology>;
  recheck(client: PoolClient, locked: EnrollmentTopology): Promise<EnrollmentTopology>;
  validate?(client: PoolClient, locked: EnrollmentTopology): Promise<void>;
  apply(context: EnrollmentTransactionContext): Promise<T>;
}
export interface UserEnrollmentWork<T> extends EnrollmentWork<T> { readonly actor: SessionActor; readonly permission: EnrollmentPermission }
export type EnrollmentTransaction = <T>(work: UserEnrollmentWork<T>) => Promise<T>;
export type SystemEnrollmentTransaction = <T>(work: EnrollmentWork<T>) => Promise<T>;
class TopologyChanged extends Error { readonly transactionAborted = true; }
const keys = ['accountIds','courseIds','groupIds','orderIds','attemptIds','receiptIds','paymentIds','enrollmentIds','incidentIds'] as const;
function snapshot(input: EnrollmentTopology, actor?: SessionActor): EnrollmentTopology {
  const result = Object.fromEntries(keys.map(key=>[key,canonicalLockIds(key==='accountIds' && actor ? [...input[key],actor.userId] : input[key])])) as unknown as EnrollmentTopology;
  return Object.freeze(result);
}
function same(a:EnrollmentTopology,b:EnrollmentTopology):boolean {
  return keys.every(key=>a[key].length===b[key].length && a[key].every((id,index)=>id===b[key][index]));
}
function covered(ids: readonly string[], value:string|null):void {
  if(value!==null && !ids.includes(value))throw new TopologyChanged();
}
/** Recursos existentes, no coordinadoras. Admisión/despacho añaden su tramo anterior
 * en sus tareas; nunca se toma una coordinadora desde esta familia de escritores.
 */
async function lockResources(client:PoolClient,t:EnrollmentTopology,mode:'WRITE'|'READ'):Promise<void> {
  const suffix=mode==='READ'?'SHARE':'UPDATE';
  async function rows(table:string,ids:readonly string[],columns:string) {
    if(!ids.length)return [];
    const result=await client.query<Record<string,string|null>>(`SELECT id,${columns} FROM "${table}" WHERE id=ANY($1::uuid[]) ORDER BY id FOR ${suffix}`,[ids]);
    if(result.rows.length!==ids.length)throw new TopologyChanged();
    return result.rows;
  }
  const courses=await rows('AcademicCourse',t.courseIds,'revision::text');void courses;
  for(const row of await rows('AcademicGroup',t.groupIds,'"courseId","teacherUserId"')){
    covered(t.courseIds,row.courseId);if(mode==='WRITE')covered(t.accountIds,row.teacherUserId);
  }
  const orders=await rows('EnrollmentOrder',t.orderIds,'"studentId","requestId"');
  for(const row of orders)if(mode==='WRITE')covered(t.accountIds,row.studentId);
  if(t.orderIds.length){
    const items=await client.query<{courseId:string;groupId:string}>(`SELECT id,"courseId","groupId" FROM "EnrollmentOrderItem"
      WHERE "orderId"=ANY($1::uuid[]) ORDER BY id FOR ${suffix}`,[t.orderIds]);
    for(const row of items.rows){covered(t.courseIds,row.courseId);covered(t.groupIds,row.groupId);}
    await client.query(`SELECT id FROM "SeatReservation" WHERE "orderItemId" IN
      (SELECT id FROM "EnrollmentOrderItem" WHERE "orderId"=ANY($1::uuid[])) ORDER BY id FOR ${suffix}`,[t.orderIds]);
    await client.query(`SELECT id FROM "ReservationRequest" WHERE id=ANY($1::uuid[]) ORDER BY id FOR ${suffix}`,[orders.map(row=>row.requestId)]);
  }
  for(const row of await rows('PaymentAttempt',t.attemptIds,'"orderId","studentId"')){
    covered(t.orderIds,row.orderId);if(mode==='WRITE')covered(t.accountIds,row.studentId);
  }
  for(const row of await rows('ProviderReceipt',t.receiptIds,'"terminalPaymentId"'))covered(t.paymentIds,row.terminalPaymentId);
  for(const row of await rows('VerifiedPayment',t.paymentIds,'"orderId"'))covered(t.orderIds,row.orderId);
  for(const row of await rows('Enrollment',t.enrollmentIds,'"studentId","courseId","groupId","paymentId"')){
    if(mode==='WRITE')covered(t.accountIds,row.studentId);
    covered(t.courseIds,row.courseId);covered(t.groupIds,row.groupId);covered(t.paymentIds,row.paymentId);
  }
  if(t.incidentIds.length){
    const incidents=await client.query<{orderId:string|null;verifiedPaymentId:string;affectedGroupIds:string[]}>(`SELECT id,"orderId","verifiedPaymentId","affectedGroupIds"
      FROM "PaymentIncident" WHERE id=ANY($1::uuid[]) ORDER BY id FOR ${suffix}`,[t.incidentIds]);
    if(incidents.rows.length!==t.incidentIds.length)throw new TopologyChanged();
    for(const row of incidents.rows){covered(t.orderIds,row.orderId);covered(t.paymentIds,row.verifiedPaymentId);for(const id of row.affectedGroupIds)covered(t.groupIds,id);}
  }
}
/** Una sola llamada al presupuesto compartido. Descubrimiento/recheck se repiten
 * desde cero después de rollback; no se conservan conexiones, tokens o snapshots.
 */
function transaction<T>(pool:Pool,work:EnrollmentWork<T>,authorization?:EnrollmentTransactionDependencies,actor?:SessionActor,permission?:EnrollmentPermission):Promise<T> {
  return accountTransaction(pool,async client=>{
    const mode=work.mode??'WRITE';if(mode!=='WRITE'&&mode!=='READ')throw new TypeError('Modo interno inválido.');
    await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    // P06: la sesión del actor se revalida antes de descubrir datos financieros.
    if(mode==='READ'){
      if(!actor)throw new TypeError('Lectura sin actor.');
      await lockAccounts(client,[actor.userId]);
      if(!permission||!permission.startsWith('enrollment:')||!permits(actor.role,permission))throw new AuthorizationFailure('FORBIDDEN');
      await authorization!.revalidateInTransaction(client,actor,permission);
    }
    await work.beforeDiscover?.(client);
    const locked=snapshot(await work.discover(client),actor);
    if(mode==='READ' && (!actor || locked.accountIds.some(id=>id!==actor.userId.toLowerCase())))throw new TypeError('Lectura con cuentas ajenas.');
    if(mode==='WRITE')await lockAccounts(client,locked.accountIds);
    if(actor&&mode==='WRITE'){
      if(!permission || !permission.startsWith('enrollment:') || !permits(actor.role,permission))throw new AuthorizationFailure('FORBIDDEN');
      await authorization!.revalidateInTransaction(client,actor,permission);
    }
    await work.authorize?.(client);
    await lockResources(client,locked,mode);
    const checked=snapshot(await work.recheck(client,locked),actor);
    if(!same(locked,checked))throw new TopologyChanged();
    await work.validate?.(client,locked);
    // NUMERIC -> texto exacto -> bigint; nunca Date/now() de inicio de transacción.
    const at=(await client.query<{at:string}>('SELECT (extract(epoch FROM clock_timestamp())*1000000)::numeric(30,0)::text AS at')).rows[0].at;
    if(!/^-?\d+$/.test(at))throw new TypeError('Reloj no finito.');
    const decision=Object.freeze({at:BigInt(at)}) as TemporalDecision;
    let active=true,pending=0;
    const assertActive=()=>{if(!active)throw new EnrollmentTransactionUnavailable();};
    const authority:EnrollmentAuditActor=Object.freeze(actor?{kind:'ACCOUNT',reference:actor.userId.toLowerCase()}:{kind:'SYSTEM',reference:'enrollment-system'});
    const context:EnrollmentTransactionContext=Object.freeze({client,locked,decision,authority,mode,assertActive,
      assertDecision(token:TemporalDecision){assertActive();if(token!==decision)throw new EnrollmentTransactionUnavailable();},
      async use<R>(operation:()=>Promise<R>):Promise<R>{
        assertActive();pending++;try{const result=await operation();assertActive();return result;}finally{pending--;}
      },
    });
    try {
      const result=await work.apply(context);
      if(pending!==0)throw new EnrollmentTransactionUnavailable();
      return result;
    }finally{active=false;}
  },()=>new EnrollmentTransactionUnavailable(),error=>error instanceof AuthorizationFailure || Boolean(authorization?.preserve?.(error)));
}
/** Composición de usuario: sesión/cuenta reales, sin SYSTEM aceptado desde HTTP. */
export function createEnrollmentTransaction(pool: Pool, authorization: EnrollmentTransactionDependencies): EnrollmentTransaction {
  return work=>transaction(pool,work,authorization,work.actor,work.permission);
}
/** Solo composición técnica de infraestructura; no fabrica cuenta/sesión administrativa. */
export function createSystemEnrollmentTransaction(pool: Pool): SystemEnrollmentTransaction {
  return work=>transaction(pool,work);
}
