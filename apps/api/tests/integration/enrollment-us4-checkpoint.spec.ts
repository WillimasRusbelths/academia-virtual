import { randomUUID } from 'node:crypto';
import { expect,test } from 'vitest';
import type { Pool } from 'pg';
import { processingFixture,milestone,observe,unwrap } from '../support/reservation-processing.js';
import { paymentFixture,assertApplied,assertIncident } from '../support/enrollment-payment.js';
import { instrumentPool,latch } from '../support/academic-foundation-contract.js';
import { waitForBlockedBy } from '../support/locks.js';
import { accessChanger } from '../support/academic-us4.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { createReservationDispatcher } from '../../src/modules/enrollment/infrastructure/dispatch.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';

/** Dos escritores reales, barrera antes del COMMIT y bloqueo observado en PG.
 * El orden no depende de sleeps ni de insertar una reserva/matrícula exitosa. */
for(const operation of ['RESERVATION','PAYMENT'] as const)for(const first of ['ELIGIBILITY','COMMITMENT'] as const)test('U4C '+operation+' '+first+' primero conserva efectos e historial',async()=>{
  const payment=operation==='PAYMENT'?await paymentFixture():undefined,f=payment??await processingFixture();
  const reached=latch(),release=latch();let paused=false;
  const trace=instrumentPool(f.pool,{before:async sql=>{if(!paused&&sql==='COMMIT'){paused=true;reached.release();await release.promise;}}});
  let pending:ReturnType<typeof observe<unknown>>|undefined,second:ReturnType<typeof observe<unknown>>|undefined;
  try{
    const selection=operation==='RESERVATION'?f.selection([f.groupId,f.otherGroupId]):undefined;
    if(selection)expect((await f.target(f.pool).admit(f.actor,selection,randomUUID())).state).toBe('ADMITTED');
    const actor={userId:f.admin.userId,sessionId:f.admin.sessionId,authVersion:0n,role:'ADMIN' as const};
    const change=(pool:Pool)=>accessChanger(pool,new PostgresSessionStore(pool)).execute(actor,{id:f.teacher.userId,kind:'status',value:'DISABLED',requestId:randomUUID()});
    const commit=(pool:Pool):Promise<unknown>=>payment?payment.processor(pool).finalize(payment.first):createReservationDispatcher(pool,f.authorization,createReservationOfferingParticipant).dispatchNext(randomUUID());
    pending=observe(first==='ELIGIBILITY'?change(trace.pool):commit(trace.pool));await milestone(reached.promise,pending);
    second=observe(first==='ELIGIBILITY'?commit(f.pool):change(f.pool));await waitForBlockedBy(f.pool,trace.pids[0]);release.release();const firstResult=await unwrap(pending),secondResult=await unwrap(second);
    expect((await f.pool.query('SELECT status FROM "User" WHERE id=$1',[f.teacher.userId])).rows[0].status).toBe('DISABLED');
    if(payment){
      if(first==='COMMITMENT'){expect(firstResult).toMatchObject({state:'APPLIED'});const row=(await f.pool.query('SELECT id FROM "VerifiedPayment"')).rows[0];await assertApplied(payment,row.id);}
      else{expect(secondResult).toMatchObject({state:'INCIDENT'});await assertIncident(payment,payment.first);}
      expect((await f.pool.query('SELECT to_jsonb(i) AS item FROM "EnrollmentOrderItem" i ORDER BY id')).rows.map(r=>r.item)).toEqual(payment.originalItems);
    }else{
      const row=await f.row(selection!.intentionId);expect(row.state).toBe(first==='COMMITMENT'?'CONFIRMED':'REJECTED');
      expect(first==='COMMITMENT'?firstResult:secondResult).toMatchObject({state:row.state});
      const counts=await f.counts();expect(counts.orders).toBe(first==='COMMITMENT'?1:0);expect(counts.seats).toBe(first==='COMMITMENT'?2:0);
      if(first==='COMMITMENT'){const order=(await f.pool.query('SELECT (extract(epoch FROM ("expiresAt"-"confirmedAt"))*1000000)::bigint::text AS duration FROM "EnrollmentOrder"')).rows[0];expect(order.duration).toBe('86400000000');}
    }
  }finally{release.release();await pending;await second;await f.close();}
},120000);
