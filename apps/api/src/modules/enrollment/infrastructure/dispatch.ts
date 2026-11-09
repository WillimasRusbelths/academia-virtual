import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { createSystemEnrollmentTransaction, EnrollmentTransactionUnavailable } from '../../../infrastructure/database/enrollment-transaction.js';
import type { EnrollmentTransactionDependencies } from '../../../infrastructure/database/enrollment-transaction.js';
import type { ReservationOfferingAccess } from '../../academic-offering/public/reservation-boundary.js';
import { AuthorizationFailure } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import type { EnrollmentTopology } from '../application/ports.js';
import { confirmReservation } from '../application/reserve.js';
import { EnrollmentError, enrollmentUuid } from '../domain/enrollment-error.js';
import { prepareReservation } from '../domain/reservation.js';
import { discoverEnrollmentTopology, createEnrollmentStore } from './enrollment-store.js';
import { createExpirationNormalizer } from './expiration-store.js';
import { reservationFacts } from './reservation-facts.js';
import { postgresInstantParameter } from './temporal.js';
import { writeReservationDecision } from './audit.js';

interface Head {id:string;studentId:string;intentionId:string;groupIds:string[];actorSessionReference:string;authVersion:string;admittedAt:string}
export interface DispatchResult {readonly state:'IDLE'|'CONFIRMED'|'REJECTED';readonly requestId?:string}
export interface ReservationDispatcher {
  dispatchNext(requestId:string):Promise<DispatchResult>;
  start():void;
  stop():Promise<void>;
  onModuleInit():void;
  onApplicationShutdown():Promise<void>;
}
const empty=():EnrollmentTopology=>({accountIds:[],courseIds:[],groupIds:[],orderIds:[],attemptIds:[],receiptIds:[],paymentIds:[],enrollmentIds:[],incidentIds:[]});

/** Un mutex durable hasta COMMIT; ningún SKIP LOCKED ni conexión por alumno. El
 * lifecycle usa el pool recibido y espera sus operaciones antes del shutdown. */
export function createReservationDispatcher(pool:Pool,authorization:EnrollmentTransactionDependencies,offeringFactory:(client:PoolClient)=>ReservationOfferingAccess):ReservationDispatcher {
  const run=createSystemEnrollmentTransaction(pool),operations=new Set<Promise<DispatchResult>>();
  let timer:ReturnType<typeof setTimeout>|undefined,running=false,closed=false;
  async function dispatch(requestId:string):Promise<DispatchResult>{
    enrollmentUuid(requestId);if(closed)throw new EnrollmentTransactionUnavailable();
    let head:Head|undefined,denial:string|undefined;
    const discover=async(client:PoolClient):Promise<EnrollmentTopology>=>{
      if(!head)return empty();
      const offering=offeringFactory(client),selected=await offering.discover(head.groupIds),past=await discoverEnrollmentTopology(client,head.studentId,offering);
      return {...past,accountIds:[...past.accountIds,...selected.flatMap(s=>s.teacherUserId?[s.teacherUserId]:[])],
        courseIds:[...past.courseIds,...selected.map(s=>s.courseId)],groupIds:[...past.groupIds,...selected.map(s=>s.groupId)]};
    };
    return run({
      async beforeDiscover(client){
        head=undefined;denial=undefined;
        if((await client.query('SELECT id FROM "DispatchState" WHERE id=1 FOR UPDATE')).rowCount!==1)throw new EnrollmentTransactionUnavailable();
        head=(await client.query<Head>(`SELECT id,"studentId","intentionId","groupIds","actorSessionReference","authVersion"::text,
          (extract(epoch FROM "admittedAt")*1000000)::numeric(30,0)::text AS "admittedAt" FROM "ReservationRequest" WHERE state='ADMITTED' ORDER BY "admissionSequence" LIMIT 1`)).rows[0];
      },discover,recheck:discover,
      async authorize(client){
        if(!head)return;
        const actor:SessionActor={userId:head.studentId,sessionId:head.actorSessionReference,authVersion:BigInt(head.authVersion),role:'STUDENT'};
        try{await authorization.revalidateInTransaction(client,actor,'enrollment:reserve-own');}
        catch(error){if(error instanceof AuthorizationFailure)denial=error.code;else throw error;}
      },
      async validate(client){
        if(!head)return;
        const row=(await client.query<{state:string}>('SELECT state FROM "ReservationRequest" WHERE id=$1 FOR UPDATE',[head.id])).rows[0];
        if(row?.state!=='ADMITTED')throw new EnrollmentTransactionUnavailable();
      },
      async apply(context):Promise<DispatchResult>{
        if(!head)return {state:'IDLE'};
        if(context.decision.at<BigInt(head.admittedAt))throw new EnrollmentTransactionUnavailable();
        let state:'CONFIRMED'|'REJECTED'='REJECTED',code=denial;
        if(!code){
          let prepared:Awaited<ReturnType<typeof reservationFacts>>|undefined;
          try{
            prepared=await reservationFacts(context,offeringFactory(context.client),head.studentId,head.groupIds);
            prepareReservation({...prepared.facts,at:context.decision.at});
          }catch(error){
            if(!(error instanceof EnrollmentError)||error.code==='TEMPORARILY_UNAVAILABLE')throw error;
            code=error.code;
          }
          // Desde la primera escritura cualquier fallo revierte también la
          // normalización: nunca se convierte una excepción de persistencia en rechazo.
          if(!code&&prepared){
            await confirmReservation(head.studentId,head.id,{intentionId:head.intentionId,groupIds:head.groupIds},prepared.facts,prepared.previousOrderId,
              {decision:context.decision,expiration:createExpirationNormalizer(context,requestId),store:createEnrollmentStore(context)});
            state='CONFIRMED';code='RESERVATION_CONFIRMED';
          }
        }
        if((await context.client.query(`UPDATE "ReservationRequest" SET state=$2,"decisionCode"=$3,"decidedAt"=$4 WHERE id=$1 AND state='ADMITTED'`,[head.id,state,code,postgresInstantParameter(context.decision.at)])).rowCount!==1)throw new EnrollmentTransactionUnavailable();
        await writeReservationDecision(context,head.id,requestId,state);
        return {state,requestId:head.id};
      },
    });
  }
  const dispatchNext=(requestId:string)=>{
    const operation=dispatch(requestId);operations.add(operation);
    void operation.then(()=>operations.delete(operation),()=>operations.delete(operation));return operation;
  };
  const schedule=(delay:number)=>{timer=setTimeout(()=>{timer=undefined;void tick();},delay);timer.unref();};
  const tick=async()=>{
    if(!running)return;
    try{await dispatchNext(randomUUID());}catch{/* Estado durable intacto; próximo sondeo, sin otro presupuesto inmediato. */}
    if(running)schedule(250);
  };
  const start=()=>{if(closed)throw new EnrollmentTransactionUnavailable();if(running)return;running=true;schedule(0);};
  const stop=async()=>{running=false;closed=true;if(timer)clearTimeout(timer);timer=undefined;await Promise.allSettled([...operations]);};
  return {dispatchNext,start,stop,onModuleInit:start,onApplicationShutdown:stop};
}
