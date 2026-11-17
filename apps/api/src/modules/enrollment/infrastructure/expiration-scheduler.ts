import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient,QueryResultRow } from 'pg';
import { createSystemEnrollmentTransaction,EnrollmentTransactionUnavailable } from '../../../infrastructure/database/enrollment-transaction.js';
import type { ReservationOfferingAccess } from '../../academic-offering/public/reservation-boundary.js';
import { discoverEnrollmentTopology } from './enrollment-store.js';
import { createExpirationNormalizer } from './expiration-store.js';
import { postgresInstantParameter } from './temporal.js';

export interface ExpirationCandidate {readonly id:string;readonly expiresAt:bigint}
export interface ExpirationTick {readonly examined:number;readonly expired:number;readonly failed:number}
export interface ExpirationWork {
  horizon():Promise<ExpirationCandidate|null>;
  page(input:{readonly after:ExpirationCandidate|null;readonly through:ExpirationCandidate;readonly limit:number}):Promise<readonly ExpirationCandidate[]>;
  expire(orderId:string):Promise<'EXPIRED'|'NOT_DUE'|'ALREADY_TERMINAL'>;
}
export interface ExpirationOptions {readonly batchSize?:number;readonly intervalMs?:number}
export interface ExpirationWorker {
  tick():Promise<ExpirationTick>;
  onApplicationBootstrap():void|Promise<void>;
  beforeApplicationShutdown():Promise<void>;
  assertHealthy():void;
}
/** Suspensión de esta instancia: requiere comprobar D13/configuración y reiniciar.
 * No convierte una anomalía temporal en un plazo nuevo o reloj lógico. */
export class ExpirationSuspended extends Error {
  constructor(readonly reason:'CLOCK_UNHEALTHY'|'CONFIGURATION_INVALID') {super('Vencimiento suspendido: '+reason);}
}
const empty=():ExpirationTick=>({examined:0,expired:0,failed:0});
const compare=(a:ExpirationCandidate,b:ExpirationCandidate)=>a.expiresAt===b.expiresAt?(a.id<b.id?-1:a.id===b.id?0:1):a.expiresAt<b.expiresAt?-1:1;

/** Cursor efímero por examinada, horizonte fijo y una operación en vuelo.
 * El timer organiza mantenimiento; no decide el vencimiento de ninguna orden. */
export function createExpirationScheduler(work:ExpirationWork,options:ExpirationOptions={}):ExpirationWorker {
  const batchSize=options.batchSize??20,intervalMs=options.intervalMs??5000;
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>20||!Number.isSafeInteger(intervalMs)||intervalMs<1||intervalMs>2147483647)throw new ExpirationSuspended('CONFIGURATION_INVALID');
  let through:ExpirationCandidate|null=null,after:ExpirationCandidate|null=null;
  let flight:Promise<ExpirationTick>|undefined,timer:ReturnType<typeof setTimeout>|undefined,started=false,closed=false,fatal:ExpirationSuspended|undefined;
  const assertHealthy=()=>{if(fatal)throw fatal;};
  async function run():Promise<ExpirationTick>{
    assertHealthy();if(closed)return empty();
    try{
      through??=await work.horizon();if(!through)return empty();
      const page=await work.page({after,through,limit:batchSize}),result={...empty()};
      for(const row of page){
        // Cierre impide otro tick; el lote ya activo termina antes de cerrar pool.
        result.examined++;after=row;
        try{if(await work.expire(row.id)==='EXPIRED')result.expired++;}
        catch(error){if(error instanceof ExpirationSuspended)throw error;result.failed++;}
      }
      if(page.length<batchSize||after&&compare(after,through)>=0){through=null;after=null;}
      return result;
    }catch(error){
      if(error instanceof ExpirationSuspended){fatal=error;closed=true;started=false;if(timer)clearTimeout(timer);timer=undefined;}
      throw error;
    }
  }
  const tick=():Promise<ExpirationTick>=>{
    if(flight)return flight;
    const operation=run();flight=operation;
    void operation.then(()=>{flight=undefined;},()=>{flight=undefined;});return operation;
  };
  const automatic=()=>tick().catch(()=>{
    // Mensaje cerrado: nunca excepciones, URLs, sesiones o evidencias financieras.
    console.warn('SYSTEM ORDER_EXPIRATION TEMPORARILY_UNAVAILABLE');
  }).then(()=>{if(started&&!closed)schedule(intervalMs);});
  const schedule=(delay:number)=>{timer=setTimeout(()=>{timer=undefined;void automatic();},delay);timer.unref?.();};
  return {tick,assertHealthy,
    onApplicationBootstrap(){if(started||closed)return;started=true;return automatic();},
    async beforeApplicationShutdown(){closed=true;started=false;if(timer)clearTimeout(timer);timer=undefined;await flight?.catch(()=>undefined);},
  };
}

/** Composición PG: un pool compartido y el protocolo transaccional de T032.
 * El sondeo solo obtiene referencias; cada candidata redescubre y captura su
 * propio token después de locks/recheck, con el presupuesto existente. */
export function createReservationExpiration(pool:Pool,offeringFactory:(client:PoolClient)=>ReservationOfferingAccess,options:ExpirationOptions={}):ExpirationWorker {
  const transaction=createSystemEnrollmentTransaction(pool);
  let observed:bigint|undefined,checkedStartup=false;
  function clock(at:bigint,known:bigint|null){
    if(observed!==undefined&&at<observed||known!==null&&at<known)throw new ExpirationSuspended('CLOCK_UNHEALTHY');
    observed=at;
  }
  async function query<T extends QueryResultRow>(sql:string,values?:unknown[]){
    let client:PoolClient|undefined;
    try{client=await pool.connect();return await client.query<T>(sql,values);}catch(error){
      if(error&&typeof error==='object'&&'code'in error&&['42P01','42703','3D000','28P01','42501'].includes(String(error.code)))throw new ExpirationSuspended('CONFIGURATION_INVALID');
      throw error;
    }finally{client?.release();}
  }
  async function inspectClock(){
    const row=(await query<{at:string;known:string|null}>(`SELECT
      (extract(epoch FROM clock_timestamp())*1000000)::numeric(30,0)::text AS at,
      ${checkedStartup?'NULL::text':`(extract(epoch FROM greatest(
        (SELECT max("confirmedAt") FROM "EnrollmentOrder"),
        (SELECT max("expirationProcessedAt") FROM "EnrollmentOrder"),
        (SELECT max("verificationFinishedAt") FROM "VerifiedPayment")))*1000000)::numeric(30,0)::text`} AS known`)).rows[0];
    if(!/^-?\d+$/.test(row.at)||row.known!==null&&!/^-?\d+$/.test(row.known))throw new ExpirationSuspended('CLOCK_UNHEALTHY');
    clock(BigInt(row.at),row.known===null?null:BigInt(row.known));checkedStartup=true;
  }
  type CandidateRow={id:string;expires:string};
  const candidate=(row:CandidateRow):ExpirationCandidate=>({id:row.id,expiresAt:BigInt(row.expires)});
  const scheduler=createExpirationScheduler({
    async horizon(){
      await inspectClock();
      const row=(await query<CandidateRow>(`SELECT id,(extract(epoch FROM "expiresAt")*1000000)::numeric(30,0)::text AS expires
        FROM "EnrollmentOrder" WHERE state='RESERVED' AND "expiresAt"<=clock_timestamp() ORDER BY "expiresAt" DESC,id DESC LIMIT 1`)).rows[0];
      return row?candidate(row):null;
    },
    async page({after,through,limit}){
      await inspectClock();
      return (await query<CandidateRow>(`SELECT id,(extract(epoch FROM "expiresAt")*1000000)::numeric(30,0)::text AS expires
        FROM "EnrollmentOrder" WHERE state='RESERVED' AND "expiresAt"<=clock_timestamp()
        AND ($1::timestamptz IS NULL OR ("expiresAt",id)>($1::timestamptz,$2::uuid))
        AND ("expiresAt",id)<=($3::timestamptz,$4::uuid) ORDER BY "expiresAt",id LIMIT $5`,
      [after?postgresInstantParameter(after.expiresAt):null,after?.id??null,postgresInstantParameter(through.expiresAt),through.id,limit])).rows.map(candidate);
    },
    async expire(orderId){
      let unhealthy:ExpirationSuspended|undefined;
      const discover=async(client:PoolClient)=>{
        const row=(await client.query<{studentId:string}>('SELECT "studentId" FROM "EnrollmentOrder" WHERE id=$1',[orderId])).rows[0];
        if(!row)throw new EnrollmentTransactionUnavailable();
        return discoverEnrollmentTopology(client,row.studentId,offeringFactory(client));
      };
      try{return await transaction({discover,recheck:discover,async apply(context){
        const known=(await context.client.query<{known:string|null}>(`SELECT (extract(epoch FROM greatest(
          (SELECT greatest(max("confirmedAt"),max("expirationProcessedAt")) FROM "EnrollmentOrder" WHERE id=ANY($1::uuid[])),
          (SELECT max("verificationFinishedAt") FROM "VerifiedPayment" WHERE id=ANY($2::uuid[]))))*1000000)::numeric(30,0)::text AS known`,[context.locked.orderIds,context.locked.paymentIds])).rows[0].known;
        try{clock(context.decision.at,known===null?null:BigInt(known));}catch(error){if(error instanceof ExpirationSuspended)unhealthy=error;throw error;}
        return createExpirationNormalizer(context,randomUUID()).normalize(orderId,context.decision);
      }});}catch(error){if(unhealthy)throw unhealthy;throw error;}
    },
  },options);
  return {...scheduler,async onApplicationBootstrap(){
    await scheduler.onApplicationBootstrap();scheduler.assertHealthy();
    if(!checkedStartup)throw new EnrollmentTransactionUnavailable();
  }};
}
