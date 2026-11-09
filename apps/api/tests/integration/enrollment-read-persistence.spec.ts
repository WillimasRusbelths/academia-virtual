import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { processingFixture, queueRequest, observe, milestone, unwrap } from '../support/reservation-processing.js';
import type { ReservationAdmissionFixture } from '../support/reservation-admission.js';
import { createEnrollmentQueries } from '../../src/modules/enrollment/infrastructure/queries.js';
import { createReservationDispatcher } from '../../src/modules/enrollment/infrastructure/dispatch.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import { financialFingerprint, seedCommitment } from '../support/enrollment-maintenance.js';
import { instrumentPool, latch } from '../support/academic-foundation-contract.js';
import { sessionFixture } from '../support/session-fixture.js';

const page={page:1,pageSize:20};
const queries=(f:ReservationAdmissionFixture,pool=f.pool)=>createEnrollmentQueries(pool,f.authorization,createReservationOfferingParticipant);
const dispatcher=(f:ReservationAdmissionFixture,pool=f.pool)=>createReservationDispatcher(pool,f.authorization,createReservationOfferingParticipant);
function check(name:string,work:(f:ReservationAdmissionFixture)=>Promise<void>){test(name,async()=>{const f=await processingFixture();try{await work(f);}finally{await f.close();}},120000);}

for(const table of ['EnrollmentOrder','EnrollmentOrderItem','SeatReservation','EnrollmentAuditEvent'])check(`RP01 trigger omite ${table}: cero parcialidad`,async f=>{
  await queueRequest(f,[f.groupId,f.otherGroupId]);const before=await financialFingerprint(f.pool);
  await f.isolated.ownerQuery(`CREATE FUNCTION skip_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER skip_write BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION skip_write()`);
  await expect(dispatcher(f).dispatchNext(randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(await financialFingerprint(f.pool)).toBe(before);
});
check('RP01b trigger omite resultado terminal: revierte orden y reservas',async f=>{
  await queueRequest(f);const before=await financialFingerprint(f.pool);
  await f.isolated.ownerQuery(`CREATE FUNCTION skip_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER skip_result BEFORE UPDATE ON "ReservationRequest" FOR EACH ROW EXECUTE FUNCTION skip_result()`);
  await expect(dispatcher(f).dispatchNext(randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(await financialFingerprint(f.pool)).toBe(before);
});
check('RP02 resultado no se publica antes de COMMIT',async f=>{
  const request=await queueRequest(f),entered=latch(),release=latch();
  const trace=instrumentPool(f.pool,{before:async sql=>{if(sql==='COMMIT'){entered.release();await release.promise;}}});
  let settled=false;const pending=observe(dispatcher(f,trace.pool).dispatchNext(randomUUID()).then(result=>{settled=true;return result;}));
  try{
    await milestone(entered.promise,pending);expect(settled).toBe(false);expect((await f.row(request.intentionId)).state).toBe('ADMITTED');
    expect((await f.counts()).orders).toBe(0);release.release();expect(await unwrap(pending)).toMatchObject({state:'CONFIRMED'});
    expect((await f.row(request.intentionId)).state).toBe('CONFIRMED');
  }finally{release.release();await pending;}
});
check('RP03 solicitudes propias recuperables, paginadas y con proyección cerrada',async f=>{
  const request=await queueRequest(f),other=await sessionFixture(f,'STUDENT');await queueRequest(f,[f.otherGroupId],other);
  const q=queries(f),before=await financialFingerprint(f.pool);
  expect(await q.requests(f.actor,{page:2,pageSize:1})).toMatchObject({items:[],total:1,page:2,pageSize:1});
  expect(await q.request(f.actor,request.intentionId)).toMatchObject({id:request.id,state:'ADMITTED'});
  expect(await financialFingerprint(f.pool)).toBe(before);
  await dispatcher(f).dispatchNext(randomUUID());
  const result=await q.request(f.actor,request.intentionId);expect(result).toMatchObject({state:'CONFIRMED'});
  expect(Object.keys(result!).sort()).toEqual(['id','intentionId','state','admittedAt','orderId'].sort());
  const otherActor=(await f.sessions.lookup(other.secret))!;
  expect(await q.request(otherActor,request.intentionId)).toBeNull();expect(await q.request(f.actor,randomUUID())).toBeNull();
});
check('RP04 órdenes paginadas conservan precio original y vencimiento efectivo sin escribir',async f=>{
  await seedCommitment(f,'DEADLINE_PASSED');const before=await financialFingerprint(f.pool),q=queries(f);
  const result=await q.orders(f.actor,{page:1,pageSize:1});expect(result.total).toBe(1);
  expect(result.items[0]).toMatchObject({state:'EXPIRED',paymentAllowed:false,totalMinor:'12500',paymentState:'NOT_PAID'});
  expect(result.items[0].items[0].priceMinor).toBe('12500');
  expect(await financialFingerprint(f.pool)).toBe(before);
  const other=await sessionFixture(f,'STUDENT'),actor=(await f.sessions.lookup(other.secret))!;
  expect((await q.orders(actor,page)).items).toEqual([]);
});
check('RP05 revalida sesión antes de descubrir y solo bloquea cuenta del actor',async f=>{
  const trace=instrumentPool(f.pool),q=queries(f,trace.pool);await q.offerings(f.actor,page);
  const account=trace.statements.findIndex(s=>/FROM "User"/.test(s.sql)&&/FOR UPDATE/.test(s.sql));
  const discovery=trace.statements.findIndex(s=>/AcademicGroup/.test(s.sql));expect(account).toBeGreaterThanOrEqual(0);expect(discovery).toBeGreaterThan(account);
  expect(trace.statements.filter(s=>/FROM "User"/.test(s.sql)&&/FOR UPDATE/.test(s.sql))).toHaveLength(2);
  expect(trace.statements.some(s=>/FOR UPDATE/.test(s.sql)&&/AcademicCourse|AcademicGroup|EnrollmentOrder/.test(s.sql))).toBe(false);
  await f.sessions.revoke(f.student.secret);const before=trace.statements.length;
  await expect(q.offerings(f.actor,page)).rejects.toMatchObject({code:'AUTH_REQUIRED'});
  expect(trace.statements.slice(before).some(s=>/AcademicGroup|EnrollmentOrder/.test(s.sql))).toBe(false);
});
check('RP06 límites de paginación, selección y búsqueda literal',async f=>{
  const q=queries(f);
  expect((await q.offerings(f.actor,{page:1,pageSize:1})).items).toHaveLength(1);
  expect((await q.offerings(f.actor,{...page,q:'%'})).items).toEqual([]);
  expect((await q.offerings(f.actor,{...page,q:'ausente ficticio'})).total).toBe(0);
  await expect(async()=>q.orders(f.actor,{page:0,pageSize:20})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await expect(async()=>q.requests(f.actor,{page:1,pageSize:51})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await expect(async()=>q.preview(f.actor,[f.groupId,f.groupId])).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await f.pool.query('DELETE FROM "CoursePrice" WHERE "courseId"=$1',[f.courseId]);
  await expect(q.preview(f.actor,[f.groupId])).rejects.toMatchObject({code:'OFFERING_NOT_RESERVABLE'});
});
