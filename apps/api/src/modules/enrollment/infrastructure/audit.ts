import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { EnrollmentTransactionContext, EnrollmentTransactionDependencies, UserEnrollmentWork } from '../../../infrastructure/database/enrollment-transaction.js';
import { createEnrollmentTransaction, EnrollmentTransactionUnavailable } from '../../../infrastructure/database/enrollment-transaction.js';
import type { EnrollmentAudit, EnrollmentCommandOperation, EnrollmentCommandResult, EnrollmentResourceReferences } from '../application/ports.js';
import { EnrollmentCommandConflict } from '../application/ports.js';
import { instantFromEpochText, postgresInstantParameter } from './temporal.js';

/** ReservationRequest es el ledger; resultado terminal y este evento comparten
 * COMMIT. No se abre otro ledger de intención o una transacción de auditoría. */
export async function writeReservationDecision(context:EnrollmentTransactionContext,intentionRequestId:string,requestId:string,result:'CONFIRMED'|'REJECTED'):Promise<void> {
  await context.use(async()=>{
    if(context.mode!=='WRITE'||context.authority.kind!=='SYSTEM')throw new TypeError('Autoridad de despacho inválida.');
    const row=(await context.client.query<{studentId:string;state:string}>('SELECT "studentId",state FROM "ReservationRequest" WHERE id=$1',[intentionRequestId])).rows[0];
    if(!row||row.state!==result||!context.locked.accountIds.includes(row.studentId))throw new TypeError('Decisión sin cobertura.');
    if((await context.client.query(`INSERT INTO "EnrollmentAuditEvent" ("actorKind","actorReference",operation,"targetKind","targetId","requestId","occurredAt",result)
      VALUES ('SYSTEM',$1,$2,'REQUEST',$3,$4,$5,$6)`,[context.authority.reference,result==='CONFIRMED'?'RESERVATION_CONFIRMED':'RESERVATION_REJECTED',intentionRequestId,requestId,postgresInstantParameter(context.decision.at),result])).rowCount!==1)throw new EnrollmentTransactionUnavailable();
  });
}

export interface EnrollmentCommandMutation {
  readonly outcomeCode:'APPLIED'|'NO_CHANGE'; readonly resultingRevision:string;
  readonly resourceReferences:EnrollmentResourceReferences;
}
export interface EnrollmentCommandWork<T> extends Omit<UserEnrollmentWork<T>,'permission'|'apply'> {
  readonly operation:EnrollmentCommandOperation; readonly targetId:string; readonly commandId:string; readonly requestId:string;
  readonly expectedRevision:string|null; readonly payload:Readonly<Record<string,unknown>>;
  /** Existencia tras reautorizar/bloquear y recuperar replay, antes de nueva revisión. */
  validateTarget?(client:PoolClient,locked:EnrollmentTransactionContext['locked']):Promise<void>;
  apply(context:EnrollmentTransactionContext):Promise<EnrollmentCommandMutation>;
  project(context:EnrollmentTransactionContext,references:EnrollmentResourceReferences):Promise<T>;
}
export interface EnrollmentAuditWriter { create(context:EnrollmentTransactionContext):EnrollmentAudit }
export type EnrollmentCommandWriter = <T>(work:EnrollmentCommandWork<T>)=>Promise<EnrollmentCommandResult<T>>;
interface StoredCommand { operation:string;payloadDigest:Buffer;outcomeCode:'APPLIED'|'NO_CHANGE';resourceReferences:unknown;resultingRevision:string;at:string }
function uuid(value:string):string {
  if(value.length!==36||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new TypeError('Referencia inválida.');
  return value.toLowerCase();
}
function revision(value:string|null):void {
  if(value!==null && (value.trim()!==value||!/^[1-9]\d*$/.test(value)||BigInt(value)>9223372036854775807n))throw new TypeError('Revisión inválida.');
}
/** JSON canónico propio: no depende del orden de propiedades ni admite valores que
 * JSON silenciosamente elimina/coacciona. El contenido nunca se almacena. */
function canonical(value:unknown):string {
  if(value===null || typeof value==='boolean' || typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number' && Number.isSafeInteger(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+Array.from(value,canonical).join(',')+']';
  if(typeof value==='object' && value!==null && Object.getPrototypeOf(value)===Object.prototype){
    return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';
  }
  throw new TypeError('Payload no canónico.');
}
function references(operation:EnrollmentCommandOperation,targetId:string,input:unknown):EnrollmentResourceReferences {
  if(typeof input!=='object'||input===null||Array.isArray(input))throw new TypeError('Referencias inválidas.');
  const row=input as Record<string,unknown>;
  const keys=operation==='COURSE_PRICE_SET'?['courseId']:['followUpId','incidentId'];
  if(Object.keys(row).sort().join(',')!==keys.join(','))throw new TypeError('Referencias inválidas.');
  for(const key of keys)if(typeof row[key]!=='string'||uuid(row[key])!==row[key])throw new TypeError('Referencia inválida.');
  if(row[operation==='COURSE_PRICE_SET'?'courseId':'incidentId']!==targetId)throw new TypeError('Destino inválido.');
  return operation==='COURSE_PRICE_SET'?{courseId:targetId}:{incidentId:targetId,followUpId:row.followUpId as string};
}
/** Puerto efímero ligado al cliente, autoridad y reloj del dueño transaccional. */
export function createEnrollmentAudit(context:EnrollmentTransactionContext):EnrollmentAudit {
  return {write:event=>context.use(async()=>{
    if(context.mode!=='WRITE')throw new TypeError('Auditoría requiere escritura.');
    const targetId=uuid(event.targetId),requestId=uuid(event.requestId);
    revision(event.beforeRevision);revision(event.afterRevision);
    const expired=event.operation==='ORDER_EXPIRED',price=event.operation==='COURSE_PRICE_SET';
    if(!expired && !price && event.operation!=='INCIDENT_FOLLOW_UP')throw new TypeError('Operación inválida.');
    const ids=expired?context.locked.orderIds:price?context.locked.courseIds:context.locked.incidentIds;
    if(!ids.includes(targetId) || context.authority.kind!==(expired?'SYSTEM':'ACCOUNT'))throw new TypeError('Autoridad/cobertura inválida.');
    if(expired ? event.result!=='EXPIRED' : !['APPLIED','NO_CHANGE'].includes(event.result))throw new TypeError('Resultado inválido.');
    const effectKey=expired?`ORDER_EXPIRED/${targetId}`:null;
    const inserted=await context.client.query<{id:string;at:string}>(`INSERT INTO "EnrollmentAuditEvent"
      ("actorKind","actorReference",operation,"targetKind","targetId","commandId","effectKey","requestId","occurredAt","beforeRevision","afterRevision",result)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT ("effectKey") DO NOTHING
      RETURNING id,(extract(epoch FROM "occurredAt")*1000000)::numeric(30,0)::text AS at`,
    [context.authority.kind,context.authority.reference,event.operation,expired?'ORDER':price?'COURSE':'INCIDENT',targetId,
      expired?null:uuid(event.commandId),effectKey,requestId,postgresInstantParameter(context.decision.at),event.beforeRevision,event.afterRevision,event.result]);
    if(inserted.rows[0])return {id:inserted.rows[0].id,recorded:true,occurredAt:instantFromEpochText(inserted.rows[0].at)};
    const prior=(await context.client.query<{id:string;at:string}>(`SELECT id,(extract(epoch FROM "occurredAt")*1000000)::numeric(30,0)::text AS at
      FROM "EnrollmentAuditEvent" WHERE "effectKey"=$1 AND "actorKind"='SYSTEM' AND operation='ORDER_EXPIRED' AND "targetKind"='ORDER' AND "targetId"=$2 AND result='EXPIRED'`,[effectKey,targetId])).rows[0];
    if(!prior)throw new TypeError('Efecto previo inválido.');
    return {id:prior.id,recorded:false,occurredAt:instantFromEpochText(prior.at)};
  })};
}
export function createEnrollmentCommandWriter(pool:Pool,authorization:EnrollmentTransactionDependencies,
  options:{readonly audit?:EnrollmentAuditWriter}={}):EnrollmentCommandWriter {
  const run=createEnrollmentTransaction(pool,{...authorization,preserve:error=>error instanceof EnrollmentCommandConflict||Boolean(authorization.preserve?.(error))});
  const audit=options.audit??{create:createEnrollmentAudit};
  return async work=>{
    // Estado de intento: validate lo reinicia tras cada rollback/redescubrimiento.
    let prior:StoredCommand|undefined;
    let before:string|null=null;
    const targetId=uuid(work.targetId),commandId=uuid(work.commandId),actorReference=uuid(work.actor.userId);
    revision(work.expectedRevision);
    if(work.mode==='READ'||!['COURSE_PRICE_SET','INCIDENT_FOLLOW_UP'].includes(work.operation))throw new TypeError('Comando inválido.');
    const digest=createHash('sha256').update(canonical({operation:work.operation,targetId,expectedRevision:work.expectedRevision,payload:work.payload})).digest();
    return run({...work,mode:'WRITE',permission:work.operation==='COURSE_PRICE_SET'?'enrollment:price-manage':'enrollment:incident-follow-up',
      async validate(client,locked){
        prior=undefined;before=null;
        prior=(await client.query<StoredCommand>(`SELECT operation,"payloadDigest","outcomeCode","resourceReferences","resultingRevision"::text,
          (extract(epoch FROM "appliedAt")*1000000)::numeric(30,0)::text AS at FROM "EnrollmentCommand"
          WHERE "actorKind"='ACCOUNT' AND "actorReference"=$1 AND "commandId"=$2`,[actorReference,commandId])).rows[0];
        if(prior){if(prior.operation!==work.operation||!prior.payloadDigest.equals(digest))throw new EnrollmentCommandConflict('IDEMPOTENCY_CONFLICT');return;}
        await work.validateTarget?.(client,locked);
        const ids=work.operation==='COURSE_PRICE_SET'?locked.courseIds:locked.incidentIds;
        if(!ids.includes(targetId))throw new TypeError('Destino sin bloqueo.');
        if(work.operation==='COURSE_PRICE_SET')before=(await client.query<{revision:string}>('SELECT revision::text FROM "CoursePrice" WHERE "courseId"=$1',[targetId])).rows[0]?.revision??null;
        if(work.expectedRevision!==before)throw new EnrollmentCommandConflict('ENROLLMENT_VERSION_CONFLICT');
        await work.validate?.(client,locked);
      },
      async apply(context){
        if(prior){
          const refs=references(work.operation,targetId,prior.resourceReferences);revision(prior.resultingRevision);
          if(!['APPLIED','NO_CHANGE'].includes(prior.outcomeCode))throw new TypeError('Resultado previo inválido.');
          return {resource:await work.project(context,refs),command:{id:commandId,replayed:true,outcomeCode:prior.outcomeCode,resultingRevision:prior.resultingRevision,appliedAt:instantFromEpochText(prior.at)}};
        }
        const mutation=await work.apply(context),refs=references(work.operation,targetId,mutation.resourceReferences);
        revision(mutation.resultingRevision);
        if(!['APPLIED','NO_CHANGE'].includes(mutation.outcomeCode))throw new TypeError('Resultado inválido.');
        if(work.operation==='COURSE_PRICE_SET'){
          const expected=mutation.outcomeCode==='NO_CHANGE'?before:String(BigInt(before??'0')+1n);
          const actual=(await context.client.query<{revision:string}>('SELECT revision::text FROM "CoursePrice" WHERE "courseId"=$1',[targetId])).rows[0]?.revision;
          if(!expected||mutation.resultingRevision!==expected||actual!==expected)throw new TypeError('Mutación sin revisión consistente.');
        }else{
          if(mutation.outcomeCode!=='APPLIED'||mutation.resultingRevision!=='1'||!('followUpId' in refs))throw new TypeError('Seguimiento inválido.');
          const row=await context.client.query('SELECT id FROM "IncidentFollowUp" WHERE id=$1 AND "incidentId"=$2 AND "adminUserId"=$3 AND "commandId"=$4',[refs.followUpId,targetId,actorReference,commandId]);
          if(row.rowCount!==1)throw new TypeError('Seguimiento no persistido.');
        }
        await context.client.query(`INSERT INTO "EnrollmentCommand" ("actorKind","actorReference","commandId",operation,"payloadDigest","outcomeCode","resourceReferences","resultingRevision","appliedAt")
          VALUES ('ACCOUNT',$1,$2,$3,$4,$5,$6,$7,$8)`,[actorReference,commandId,work.operation,digest,mutation.outcomeCode,JSON.stringify(refs),mutation.resultingRevision,postgresInstantParameter(context.decision.at)]);
        await audit.create(context).write({operation:work.operation,targetId,commandId,requestId:work.requestId,
          beforeRevision:work.operation==='COURSE_PRICE_SET'?before:null,afterRevision:work.operation==='COURSE_PRICE_SET'?mutation.resultingRevision:null,result:mutation.outcomeCode});
        return {resource:await work.project(context,refs),command:{id:commandId,replayed:false,outcomeCode:mutation.outcomeCode,resultingRevision:mutation.resultingRevision,appliedAt:context.decision.at}};
      }});
  };
}
