import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { test as enrollmentTest, expect } from './enrollment-fixture';
import { insertEnrollmentRow } from '../../../api/tests/support/enrollment-migration.js';

/** Hechos ficticios persistidos. Nunca confirma por SQL el recorrido del usuario:
 * ese caso usa PRICED y exige observar ADMITTED -> CONFIRMED en la API real. */
export const test=enrollmentTest.extend<{reservation:{seed:(kind:'PRICED'|'ADMITTED'|'EXPIRED')=>Promise<{intentionId:string;orderId:string}>}}>({
  reservation:async({enrollment},use)=>{
    const f=enrollment,pool=f.context.database.pool;
    const holder:{client?:PoolClient}={};
    try{await use({async seed(kind){
      if(!/^t_[a-z0-9_]+$/.test(f.context.isolated.schema))throw new Error('Fixture fuera del schema aislado.');
      // La recuperación de ADMITTED necesita una cabeza durable todavía sin decisión.
      if(kind==='ADMITTED'){const client=await pool.connect();holder.client=client;await client.query('BEGIN');await client.query('SELECT id FROM "DispatchState" WHERE id=1 FOR UPDATE');}
      await insertEnrollmentRow(pool,'CoursePrice',{courseId:f.offer.courseId,amountMinor:'12500',currency:'PEN',revision:'1',changedBy:f.actors.admin.id});
      const intentionId=randomUUID(),requestId=randomUUID(),orderId=randomUUID(),itemId=randomUUID();
      if(kind==='PRICED')return {intentionId,orderId};
      const session=(await pool.query('SELECT id FROM "Session" WHERE "userId"=$1 ORDER BY id LIMIT 1',[f.actors.owner.id])).rows[0].id;
      const expired=kind==='EXPIRED',at=expired?'2020-01-01T00:00:00.123456Z':(await pool.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`)).rows[0].at;
      await insertEnrollmentRow(pool,'ReservationRequest',{id:requestId,studentId:f.actors.owner.id,intentionId,selectionDigest:randomBytes(32),groupIds:[f.offer.groupId],admittedAt:at,admissionSequence:'1',actorSessionReference:session,authVersion:'0',state:expired?'CONFIRMED':'ADMITTED',decisionCode:expired?'RESERVATION_CONFIRMED':null,decidedAt:expired?at:null});
      await pool.query('UPDATE "AdmissionSequence" SET "nextSequence"=2 WHERE id=1');
      if(expired){
        await insertEnrollmentRow(pool,'EnrollmentOrder',{id:orderId,studentId:f.actors.owner.id,requestId,currency:'PEN',totalMinor:'12500',state:'EXPIRED',revision:'1',confirmedAt:at,expiresAt:'2020-01-02T00:00:00.123456Z',expirationProcessedAt:'2020-01-02T00:00:00.123456Z'});
        await insertEnrollmentRow(pool,'EnrollmentOrderItem',{id:itemId,orderId,courseId:f.offer.courseId,groupId:f.offer.groupId,priceMinor:'12500',courseName:'Curso original ficticio',groupName:'Grupo original ficticio',periodStart:'2090-01-02',periodEnd:'2090-03-31',timeZone:'America/Lima',groupStartAt:'2090-01-02T05:00:00.000000Z',enrollmentValidUntil:'2090-04-01T05:00:00.000000Z',scheduleSnapshot:[{dayOfWeek:1,startTime:'18:00',endTime:'19:00'}]});
        await insertEnrollmentRow(pool,'SeatReservation',{orderItemId:itemId,state:'EXPIRED'});
      }
      return {intentionId,orderId};
    }});}finally{if(holder.client){await holder.client.query('ROLLBACK');holder.client.release();}}
  },
});
export {expect};
