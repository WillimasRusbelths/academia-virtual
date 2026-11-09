import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { expect } from 'vitest';
import { AppModule,RESERVATION_DISPATCH_LIFECYCLE } from '../../dist/src/app.module.js';
import { configureTransport } from '../../dist/src/http/transport.js';
import { createDatabase } from '../../dist/src/infrastructure/database/database.js';
import { processingFixture,processingClock } from './reservation-processing.js';
import { createReservationDispatcher } from '../../src/modules/enrollment/infrastructure/dispatch.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import type { GatewayAttempt,GatewayInitiation,GatewayObservation,PaymentGateway } from '../../src/modules/enrollment/public/payments.js';
import { PAYMENT_CONFIGURATION } from '../../src/modules/enrollment/application/payments.js';
import { attemptService,gatewayBinding } from './payment-attempt-contract.js';

export function gate(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
/** Solo transporte externo ficticio. No implementa identidad, decisiones o transacciones. */
export function controlledGateway(){
  const calls:GatewayAttempt[]=[],recoveries:GatewayAttempt[]=[];
  const entered=gate(),release=gate();
  const control={calls,recoveries,entered,release,paused:false,
    result:{state:'PENDING',providerReference:'fixture-operation'} as GatewayInitiation,
    observation:{state:'UNRESOLVED'} as GatewayObservation,
    before:undefined as ((input:GatewayAttempt)=>Promise<void>)|undefined,
    error:undefined as Error|undefined,
  };
  const gateway:PaymentGateway={
    async initiate(input){calls.push({...input});try{await control.before?.(input);entered.resolve();if(control.paused)await release.promise;if(control.error)throw control.error;return control.result;}finally{entered.resolve();}},
    async recover(input){recoveries.push({...input});return control.observation;},
    async verify(){return control.observation;},
  };
  return {...control,gateway,control};
}
export async function attemptFixture(){
  const f=await processingFixture();
  try{
    const clock=await processingClock(f),pool=clock.pool;
    const input=f.selection([f.groupId,f.otherGroupId]);
    await f.target(pool).admit(f.actor,input,randomUUID());
    expect((await createReservationDispatcher(pool,f.authorization,createReservationOfferingParticipant).dispatchNext(randomUUID())).state).toBe('CONFIRMED');
    const orderId=(await f.row(input.intentionId)).orderId as string;
    const gateway=controlledGateway();
    const original=(await pool.query(`SELECT "totalMinor"::text AS total,to_char("confirmedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS confirmed,to_char("expiresAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS expires FROM "EnrollmentOrder" WHERE id=$1`,[orderId])).rows[0];
    const rows=async()=>(await pool.query(`SELECT id,"orderId","studentId","initiationId",encode("payloadDigest",'hex') AS digest,state,"merchantReference","externalIdempotencyKey","providerScope","providerReference",to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created FROM "PaymentAttempt" ORDER BY "createdAt",id`)).rows;
    const boundary=async(delta:number)=>{
      await pool.query(`UPDATE "DispatchTestClock" SET instant=(SELECT "expiresAt" FROM "EnrollmentOrder" WHERE id=$1)+($2*interval '1 microsecond')`,[orderId,delta]);
      await pool.query(`UPDATE "Session" SET "createdAt"=(SELECT instant FROM "DispatchTestClock")-interval '1 minute',"lastAcceptedAt"=(SELECT instant FROM "DispatchTestClock")-interval '1 minute',"absoluteExpiresAt"=(SELECT instant FROM "DispatchTestClock")+interval '7 hours 59 minutes'`);
    };
    return {...f,pool,orderId,original,gateway,rows,boundary,
      input:(initiationId=randomUUID())=>({orderId,initiationId}),
      service:()=>attemptService(pool,f.authorization,createReservationOfferingParticipant,gateway.gateway),
      async unchangedOrder(){const row=(await pool.query(`SELECT "totalMinor"::text AS total,to_char("confirmedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS confirmed,to_char("expiresAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS expires FROM "EnrollmentOrder" WHERE id=$1`,[orderId])).rows[0];expect(row).toEqual(original);},
      async noFinancialEffects(){expect((await pool.query(`SELECT (SELECT count(*)::int FROM "VerifiedPayment") AS payments,(SELECT count(*)::int FROM "Enrollment") AS enrollments,(SELECT count(*)::int FROM "PaymentIncident") AS incidents`)).rows[0]).toEqual({payments:0,enrollments:0,incidents:0});},
    };
  }catch(error){await f.close();throw error;}
}
export type AttemptFixture=Awaited<ReturnType<typeof attemptFixture>>;
export async function paymentHttp(f:AttemptFixture){
  const environment={...f.environment},database=createDatabase(environment);
  database.pool.options.options=`-c search_path=${f.isolated.schema},pg_catalog -c timezone=UTC`;
  let app:NestExpressApplication|undefined;
  try{
    const builder=Test.createTestingModule({imports:[AppModule.forRoot(environment,database)]});
    builder.overrideProvider(RESERVATION_DISPATCH_LIFECYCLE).useValue({});
    // Solo se sustituye el puerto externo del proveedor cuando exista. Sin controlador ficticio.
    if(gatewayBinding!==undefined){builder.overrideProvider(gatewayBinding).useValue(f.gateway.gateway);builder.overrideProvider(PAYMENT_CONFIGURATION).useValue({providerScope:'fixture/provider/merchant/sandbox'});}
    const module=await builder.compile();app=module.createNestApplication<NestExpressApplication>({logger:false,bodyParser:false});
    configureTransport(app,environment);await app.listen(0,'127.0.0.1');const url=await app.getUrl();
    expect((await fetch(url+'/health/ready')).status).toBe(200);
    const headers=(secret?:string)=>({'content-type':'application/json',origin:environment.appOrigin,'x-csrf-protection':'1',...(secret?{cookie:'av_session_dev='+secret}:{})});
    return {url,headers,
      async post(path:string,body:unknown,secret?:string,extra:Record<string,string>={}){return fetch(url+'/api/v1'+path,{method:'POST',headers:{...headers(secret),...extra},body:JSON.stringify(body)});},
      async get(path:string,secret?:string){return fetch(url+'/api/v1'+path,{headers:headers(secret)});},
      async close(){await app!.close();await database.close();},
    };
  }catch(error){await app?.close();await database.close();throw error;}
}
