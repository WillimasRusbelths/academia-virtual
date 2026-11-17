import { randomUUID } from 'node:crypto';
import { expect,test } from 'vitest';
import { expirationFixture,assertExpired,expirationProcess } from '../support/reservation-expiration.js';
import type { ExpirationFixture } from '../support/reservation-expiration.js';
import { counts,assertApplied,assertIncident } from '../support/enrollment-payment.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { seedCommitment } from '../support/enrollment-maintenance.js';
import { sessionFixture } from '../support/session-fixture.js';
import { createReservationDispatcher } from '../../src/modules/enrollment/infrastructure/dispatch.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import { instrumentPool,latch } from '../support/academic-foundation-contract.js';
import { observe,milestone,unwrap,queriesTarget } from '../support/reservation-processing.js';
import { waitForBlockedBy } from '../support/locks.js';

function pg(name:string,work:(f:ExpirationFixture)=>Promise<void>){test(name,async()=>{const f=await expirationFixture();try{await work(f);}finally{await f.close();}},120000);}
async function nextSelection(f:ExpirationFixture){
  const groupId=randomUUID();
  await f.pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,state,capacity,"periodStart","periodEnd","teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion") SELECT $1,"courseId",'Nueva selección ficticia','PUBLISHED',1,"periodStart","periodEnd","teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion" FROM "AcademicGroup" WHERE id=$2`,[groupId,f.groupId]);
  await f.pool.query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,3,1080,1140)',[groupId]);
  await f.refreshSessions();const input=f.selection([groupId]);await f.target(f.pool).admit(f.actor,input,randomUUID());return input;
}
pg('EX00a control: US1 confirma24h reales, dos reservas y recibo pendiente sin pago',async f=>{
  expect(await counts(f)).toEqual({payments:0,enrollments:0,incidents:0,reserved:2,converted:0,expired:0});
  expect((await f.pool.query(`SELECT (extract(epoch FROM ("expiresAt"-"confirmedAt"))*1000000)::bigint::text AS duration FROM "EnrollmentOrder"`)).rows[0].duration).toBe('86400000000');
});
pg('EX00b control: proceso Node separado conecta al schema sin vencer',async f=>{expect(await expirationProcess(f,'probe')).toEqual({state:'READY'});expect((await counts(f)).reserved).toBe(2);});
for(const delta of [-1,0,1])pg('EX01 TV13/TV16 normalizador existente en límite '+delta+'µs',async f=>{
  await f.boundary(delta);expect(await f.normalize()).toBe(delta<0?'NOT_DUE':'EXPIRED');
  if(delta<0){expect((await counts(f)).reserved).toBe(2);expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentAuditEvent" WHERE operation=\'ORDER_EXPIRED\'')).rows[0].n).toBe(0);}
  else await assertExpired(f);
  expect((await f.pool.query('SELECT state FROM "ProviderReceipt"')).rows).toEqual([{state:'RECEIVED'}]);expect((await counts(f)).payments).toBe(0);
});
pg('EX02 TV13 worker detenido: GET/inventario efectivos sin materialización',async f=>{
  await f.boundary(0);await f.refreshSessions();const before=await financialFingerprint(f.pool),queries=queriesTarget(f,f.pool);
  expect(await queries.order(f.actor,f.original.id)).toMatchObject({state:'EXPIRED',paymentAllowed:false});
  expect((await queries.offerings(f.actor,{page:1,pageSize:20})).items.find(item=>item.groupId===f.groupId)).toMatchObject({reserved:0,occupied:0,available:1});
  expect(await financialFingerprint(f.pool)).toBe(before);expect((await f.pool.query('SELECT state,"expirationProcessedAt" FROM "EnrollmentOrder"')).rows).toEqual([{state:'RESERVED',expirationProcessedAt:null}]);
});
pg('EX03 TV14 dos normalizadores reales producen una revisión/efecto',async f=>{
  await f.boundary(0);await Promise.all([f.normalize(),f.normalize()]);await assertExpired(f);const before=await financialFingerprint(f.pool);
  expect(await f.normalize()).toBe('ALREADY_TERMINAL');expect(await financialFingerprint(f.pool)).toBe(before);
});
pg('EX04 TV16 pago APPLIED real no se expira después del plazo',async f=>{
  const result=await f.processor().finalize(f.first);await assertApplied(f,result.paymentId);await f.boundary(1);const before=await financialFingerprint(f.pool);
  expect(await f.normalize()).toBe('ALREADY_TERMINAL');expect(await financialFingerprint(f.pool)).toBe(before);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentAuditEvent" WHERE operation=\'ORDER_EXPIRED\'')).rows[0].n).toBe(0);
});
pg('EX05 TV23 retirar/republicar no renueva plazo y se conserva historial',async f=>{
  await f.pool.query('UPDATE "AcademicCourse" SET state=\'WITHDRAWN\' WHERE id=$1',[f.courseId]);await f.boundary(0);await f.normalize();await assertExpired(f);
  const before=await financialFingerprint(f.pool);await f.pool.query('UPDATE "AcademicCourse" SET state=\'PUBLISHED\' WHERE id=$1',[f.courseId]);expect(await f.normalize()).toBe('ALREADY_TERMINAL');expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const table of ['SeatReservation','EnrollmentAuditEvent'])pg('EX06 TV15 fallo real de '+table+' revierte el conjunto',async f=>{
  await f.boundary(0);const before=await financialFingerprint(f.pool);
  await f.isolated.ownerQuery(`CREATE FUNCTION expiration_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture-expiration-fault'; END $$;
    CREATE TRIGGER expiration_fault BEFORE ${table==='SeatReservation'?'UPDATE':'INSERT'} ON "${table}" FOR EACH ROW EXECUTE FUNCTION expiration_fault()`);
  await expect(f.normalize()).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(await financialFingerprint(f.pool)).toBe(before);
  await f.isolated.ownerQuery(`DROP TRIGGER expiration_fault ON "${table}"; DROP FUNCTION expiration_fault()`);
  await f.boundary(1);await f.normalize();await assertExpired(f);expect((await counts(f)).expired).toBe(2);
});
for(const code of ['40001','40P01'])pg('EX07 TV10/TV19 '+code+' toma token nuevo tras rollback',async f=>{
  await f.boundary(0);await f.isolated.ownerQuery(`CREATE SEQUENCE expiration_fault_counter;
    CREATE FUNCTION expiration_abort_once() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF nextval('expiration_fault_counter')=1 THEN RAISE SQLSTATE '${code}'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER expiration_abort_once BEFORE UPDATE ON "EnrollmentOrder" FOR EACH ROW EXECUTE FUNCTION expiration_abort_once()`);
  let rolled=false;const trace=instrumentPool(f.pool,{after:async sql=>{if(sql==='ROLLBACK'&&!rolled){rolled=true;await f.boundary(1);}}});
  await f.normalize(f.original.id,trace.pool);expect(rolled).toBe(true);await assertExpired(f);
  expect(trace.statements.filter(s=>/extract\(epoch FROM clock_timestamp\(\)/.test(s.sql))).toHaveLength(2);
});
pg('EX08 TV19 55P03 no reintenta ni materializa hasta otro ciclo',async f=>{
  await f.boundary(0);const client=await f.pool.connect(),before=await financialFingerprint(f.pool),trace=instrumentPool(f.pool);
  try{await client.query('BEGIN');await client.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.groupId]);await expect(f.normalize(f.original.id,trace.pool)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(await financialFingerprint(f.pool)).toBe(before);expect(trace.statements.filter(s=>s.sql==='ROLLBACK')).toHaveLength(1);}finally{await client.query('ROLLBACK');client.release();}
  await f.normalize();await assertExpired(f);
});
pg('EX09 TV24 retroceso detectado no altera plazo ni reactiva terminal',async f=>{
  await f.boundary(0);await f.normalize();const before=await financialFingerprint(f.pool);await f.set('2089-12-29T00:00:00.123456Z');
  await expect(f.normalize()).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const phase of ['before','after'] as const)pg('EX10 TV11 COMMIT ambiguo '+phase+' se recupera sin doble liberación',async f=>{
  await f.boundary(0);let fail=true;const hook=async(sql:string)=>{if(sql==='COMMIT'&&fail){fail=false;throw new Error('COMMIT incierto ficticio');}};
  const trace=instrumentPool(f.pool,phase==='before'?{before:hook}:{after:hook});
  await expect(f.normalize(f.original.id,trace.pool)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  const result=await f.normalize();expect(result).toBe(phase==='before'?'EXPIRED':'ALREADY_TERMINAL');await assertExpired(f);
});
pg('EX17 TV17/TV18 selección disjunta normaliza anterior con el mismo token de la nueva',async f=>{
  await f.boundary(0);const input=await nextSelection(f),trace=instrumentPool(f.pool);
  expect((await createReservationDispatcher(trace.pool,f.authorization,createReservationOfferingParticipant).dispatchNext(randomUUID())).state).toBe('CONFIRMED');await assertExpired(f);
  const newer=(await f.row(input.intentionId)).orderId;
  expect((await f.pool.query('SELECT a."expirationProcessedAt"=b."confirmedAt" AS same FROM "EnrollmentOrder" a,"EnrollmentOrder" b WHERE a.id=$1 AND b.id=$2',[f.original.id,newer])).rows[0].same).toBe(true);
  expect(trace.statements.filter(s=>/extract\(epoch FROM clock_timestamp\(\)/.test(s.sql))).toHaveLength(1);
  expect((await f.pool.query('SELECT state,count(*)::int AS n FROM "SeatReservation" GROUP BY state ORDER BY state')).rows).toEqual([{state:'CONFIRMED',n:1},{state:'EXPIRED',n:2}]);
});
pg('EX20 TV14 worker compone normalizador real, sin borrar intento/recibo',async f=>{
  await f.boundary(0);const worker=f.worker();try{expect(await worker.tick()).toEqual({examined:1,expired:1,failed:0});await assertExpired(f);expect((await f.pool.query('SELECT state FROM "ProviderReceipt"')).rows).toEqual([{state:'RECEIVED'}]);expect(await worker.tick()).toEqual({examined:0,expired:0,failed:0});}finally{await worker.beforeApplicationShutdown();}
});
pg('EX21 TV14 dos workers distintos no duplican auditoría ni liberación',async f=>{
  await f.boundary(0);const first=f.worker(),second=f.worker();try{await Promise.all([first.tick(),second.tick()]);await assertExpired(f);}finally{await first.beforeApplicationShutdown();await second.beforeApplicationShutdown();}
});
pg('EX22 TV12 reinicio real de Node recupera orden durable sin otro plazo',async f=>{
  await f.boundary(0);const worker=f.worker();await worker.beforeApplicationShutdown();
  const first=await expirationProcess(f,'tick');expect(first).toMatchObject({state:'DONE',result:{examined:1,expired:1,failed:0}});await assertExpired(f);const before=await financialFingerprint(f.pool);
  expect(await expirationProcess(f,'tick')).toMatchObject({state:'DONE',result:{examined:0,expired:0,failed:0}});expect(await financialFingerprint(f.pool)).toBe(before);
});
pg('EX23 TV21 cierre de worker conserva pool y detiene ticks futuros',async f=>{
  await f.boundary(0);const worker=f.worker();await worker.beforeApplicationShutdown();expect(await worker.tick()).toEqual({examined:0,expired:0,failed:0});expect((await f.pool.query('SELECT 1 AS n')).rows[0].n).toBe(1);expect((await counts(f)).reserved).toBe(2);
});
pg('EX24 TV25/PV05 worker gana locks antes de pago: incidencia sin resurrección',async f=>{
  await f.boundary(0);const entered=latch(),release=latch();let pid=0;
  const trace=instrumentPool(f.pool,{after:async(sql,backend)=>{if(/UPDATE "EnrollmentOrder"/.test(sql)){pid=backend;entered.release();await release.promise;}}}),worker=f.worker(undefined,trace.pool);
  const expiring=observe(worker.tick());let payment:ReturnType<typeof observe>|undefined;
  try{await milestone(entered.promise,expiring);payment=observe(f.processor().finalize(f.first));await waitForBlockedBy(f.pool,pid);release.release();await unwrap(expiring);expect(await unwrap(payment)).toMatchObject({state:'INCIDENT'});await assertExpired(f);await assertIncident(f,f.first);}finally{release.release();await expiring;await payment;await worker.beforeApplicationShutdown();}
});
pg('EX25 TV25/PV04 pago gana antes del límite; worker espera y no vence ENROLLED',async f=>{
  await f.boundary(-1);const worker=f.worker(),entered=latch(),release=latch();let pid=0;
  const trace=instrumentPool(f.pool,{after:async(sql,backend)=>{if(/UPDATE "EnrollmentOrder"/.test(sql)){pid=backend;entered.release();await release.promise;}}});
  const payment=observe(f.processor(trace.pool).finalize(f.first));let expiring:ReturnType<typeof observe>|undefined;
  try{await milestone(entered.promise,payment);await f.boundary(1);expiring=observe(worker.tick());await waitForBlockedBy(f.pool,pid);release.release();const applied=await unwrap(payment);await unwrap(expiring);await assertApplied(f,applied.paymentId);expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentAuditEvent" WHERE operation=\'ORDER_EXPIRED\'')).rows[0].n).toBe(0);}finally{release.release();await payment;await expiring;await worker.beforeApplicationShutdown();}
});
pg('EX26 TV13/TV25 lector espera materialización del worker y observa disponibilidad final',async f=>{
  await f.boundary(0);await f.refreshSessions();const entered=latch(),release=latch();let pid=0;
  const trace=instrumentPool(f.pool,{after:async(sql,backend)=>{if(/UPDATE "EnrollmentOrder"/.test(sql)){pid=backend;entered.release();await release.promise;}}}),worker=f.worker(undefined,trace.pool);
  const expiring=observe(worker.tick());let reading:ReturnType<typeof observe>|undefined;
  try{await milestone(entered.promise,expiring);const observed=observe(queriesTarget(f,f.pool).offerings(f.actor,{page:1,pageSize:20}));reading=observed;await waitForBlockedBy(f.pool,pid);release.release();await unwrap(expiring);const value=await unwrap(observed);expect(value.items.find(row=>row.groupId===f.groupId)).toMatchObject({reserved:0,occupied:0,available:1});await assertExpired(f);}finally{release.release();await expiring;await reading;await worker.beforeApplicationShutdown();}
});
pg('EX27 TV18 worker y normalización oportuna comparten identidad de efecto',async f=>{
  await f.boundary(0);const input=await nextSelection(f),entered=latch(),release=latch();let pid=0;
  const trace=instrumentPool(f.pool,{after:async(sql,backend)=>{if(/UPDATE "EnrollmentOrder"/.test(sql)){pid=backend;entered.release();await release.promise;}}}),worker=f.worker(undefined,trace.pool);
  const expiring=observe(worker.tick());let dispatch:ReturnType<typeof observe>|undefined;
  try{await milestone(entered.promise,expiring);dispatch=observe(createReservationDispatcher(f.pool,f.authorization,createReservationOfferingParticipant).dispatchNext(randomUUID()));await waitForBlockedBy(f.pool,pid);release.release();await unwrap(expiring);expect(await unwrap(dispatch)).toMatchObject({state:'CONFIRMED'});await assertExpired(f);expect((await f.row(input.intentionId)).state).toBe('CONFIRMED');}finally{release.release();await expiring;await dispatch;await worker.beforeApplicationShutdown();}
});
pg('EX28 TV20 horizonte finito y cursor por examinada revisitan fallida ante entradas nuevas',async f=>{
  const worker=f.worker({batchSize:1});
  async function seed(sequence:string){const student=await sessionFixture(f,'STUDENT');await seedCommitment({...f,student},'DEADLINE_PASSED',f.pool,sequence);return (await f.pool.query('SELECT id FROM "EnrollmentOrder" WHERE "studentId"=$1',[student.userId])).rows[0].id;}
  try{
    await f.set('2090-01-02T00:00:00.123456Z');const first=await seed('999'),second=await seed('1000');
    await f.isolated.ownerQuery(`CREATE FUNCTION fail_old_expiration() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='${f.original.id}'::uuid THEN RAISE EXCEPTION 'fixture-old-expiration'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_old_expiration BEFORE UPDATE ON "EnrollmentOrder" FOR EACH ROW EXECUTE FUNCTION fail_old_expiration()`);
    expect(await worker.tick()).toEqual({examined:1,expired:0,failed:1});await f.set('2090-01-04T00:00:00.123456Z');const arrival=await seed('1001');
    expect(await worker.tick()).toEqual({examined:1,expired:1,failed:0});expect(await worker.tick()).toEqual({examined:1,expired:1,failed:0});
    expect((await f.pool.query('SELECT state FROM "EnrollmentOrder" WHERE id=ANY($1::uuid[])',[ [first,second] ])).rows).toEqual([{state:'EXPIRED'},{state:'EXPIRED'}]);
    expect(await worker.tick()).toEqual({examined:1,expired:0,failed:1});expect((await f.pool.query('SELECT state FROM "EnrollmentOrder" WHERE id=$1',[arrival])).rows[0].state).toBe('RESERVED');
  }finally{await worker.beforeApplicationShutdown();}
});
pg('EX29 TV19/PV26 worker redescubre topología antes de capturar decisión',async f=>{
  await f.boundary(0);const teacher=await sessionFixture(f,'TEACHER');let changed=false;
  const trace=instrumentPool(f.pool,{after:async sql=>{if(!changed&&/SELECT/.test(sql)&&/AcademicGroup/.test(sql)&&!/FOR (UPDATE|SHARE)/.test(sql)){
    changed=true;await f.pool.query('UPDATE "AcademicGroup" SET state=\'WITHDRAWN\' WHERE id=$1',[f.groupId]);await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1',[f.groupId,teacher.userId]);
    await f.pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId","publishedTeacherEligibilityVersion"=(SELECT "eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"="teacherUserId") WHERE id=$1`,[f.groupId]);
  }}}),worker=f.worker(undefined,trace.pool);
  try{expect((await worker.tick()).expired).toBe(1);expect(changed).toBe(true);const rollback=trace.statements.findIndex(row=>row.sql==='ROLLBACK');expect(rollback).toBeGreaterThanOrEqual(0);expect(trace.statements.slice(trace.statements.findIndex(row=>row.sql==='BEGIN'),rollback).some(row=>/extract\(epoch FROM clock_timestamp\(\)/.test(row.sql))).toBe(false);await assertExpired(f);}finally{await worker.beforeApplicationShutdown();}
});
