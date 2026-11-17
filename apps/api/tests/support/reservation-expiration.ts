import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import type { Pool } from 'pg';
import { paymentFixture } from './enrollment-payment.js';
import type { PaymentFixture } from './enrollment-payment.js';
import { createSystemEnrollmentTransaction } from '../../src/infrastructure/database/enrollment-transaction.js';
import { discoverEnrollmentTopology } from '../../src/modules/enrollment/infrastructure/enrollment-store.js';
import { createExpirationNormalizer } from '../../src/modules/enrollment/infrastructure/expiration-store.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import { expirationWorker } from './expiration-contract.js';
import type { ExpirationOptions } from './expiration-contract.js';

export async function expirationFixture(){
  const f=await paymentFixture();
  return {...f,
    normalize(orderId=f.original.id,pool:Pool=f.pool){
      const discover=(client:Parameters<typeof createReservationOfferingParticipant>[0])=>discoverEnrollmentTopology(client,f.student.userId,createReservationOfferingParticipant(client));
      return createSystemEnrollmentTransaction(pool)({discover,recheck:discover,apply:context=>createExpirationNormalizer(context,randomUUID()).normalize(orderId,context.decision)});
    },
    worker(options?:ExpirationOptions,pool:Pool=f.pool){return expirationWorker(pool,createReservationOfferingParticipant,options);},
  };
}
export type ExpirationFixture=Awaited<ReturnType<typeof expirationFixture>>;
export async function assertExpired(f:PaymentFixture){
  const row=(await f.pool.query(`SELECT state,revision::text,"totalMinor"::text AS total,
    to_char("confirmedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS confirmed,
    to_char("expiresAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS expires,
    to_char("expirationProcessedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS processed
    FROM "EnrollmentOrder" WHERE id=$1`,[f.original.id])).rows[0];
  expect(row).toEqual({state:'EXPIRED',revision:'2',total:f.original.total,confirmed:f.original.confirmedAt,expires:f.original.expiresAt,processed:await f.time()});
  expect((await f.pool.query('SELECT to_jsonb(i) AS item FROM "EnrollmentOrderItem" i WHERE "orderId"=$1 ORDER BY id',[f.original.id])).rows.map(r=>r.item)).toEqual(f.originalItems);
  expect((await f.pool.query(`SELECT state FROM "SeatReservation" r JOIN "EnrollmentOrderItem" i ON i.id=r."orderItemId" WHERE i."orderId"=$1 ORDER BY r.id`,[f.original.id])).rows).toEqual([{state:'EXPIRED'},{state:'EXPIRED'}]);
  expect((await f.pool.query('SELECT "actorKind",operation,result,"beforeRevision"::text,"afterRevision"::text FROM "EnrollmentAuditEvent" WHERE "effectKey"=$1',['ORDER_EXPIRED/'+f.original.id])).rows).toEqual([{actorKind:'SYSTEM',operation:'ORDER_EXPIRED',result:'EXPIRED',beforeRevision:'1',afterRevision:'2'}]);
}
export async function expirationProcess(f:ExpirationFixture,kind:'probe'|'tick'){
  const child=fork(fileURLToPath(new URL('./expiration-process.mjs',import.meta.url)),[],{stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,APP_ENV:'test',TEST_DATABASE_URL:f.environment.databaseUrl,TEST_MIGRATION_DATABASE_URL:f.environment.migrationUrl}});
  const exited=new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.once('error',()=>resolve());});
  try{return await new Promise<{state:'READY'|'DONE'|'FAILED'|'MISSING';result?:{examined:number;expired:number;failed:number}}>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Proceso de vencimiento no alcanzó barrera; datos omitidos.')),15000);
    child.once('message',message=>{clearTimeout(timer);resolve(message as {state:'READY'|'DONE'|'FAILED'|'MISSING'});});
    child.once('error',()=>{clearTimeout(timer);reject(new Error('Proceso de ensayo no disponible.'));});child.once('exit',code=>{if(code){clearTimeout(timer);reject(new Error('Proceso de ensayo falló; valores omitidos.'));}});
    child.send({kind});
  });}finally{if(child.connected)child.disconnect();if(child.exitCode===null)child.kill('SIGTERM');await exited;}
}
