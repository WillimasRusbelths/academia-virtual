import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import type { Pool } from 'pg';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { processingFixture, processingClock, dispatchTarget, queueRequest, observe, milestone, unwrap } from '../support/reservation-processing.js';
import type { ReservationAdmissionFixture } from '../support/reservation-admission.js';
import { instrumentPool, latch } from '../support/academic-foundation-contract.js';
import { waitForBlockedBy } from '../support/locks.js';
import { sessionFixture } from '../support/session-fixture.js';
import { financialFingerprint, seedCommitment } from '../support/enrollment-maintenance.js';

function dispatch(name:string,body:(f:ReservationAdmissionFixture)=>Promise<void>){
  test(name,async()=>{const f=await processingFixture();try{await body(f);}finally{await f.close();}},120000);
}
const rows=async(pool:Pool)=>(await pool.query('SELECT id,state,"decisionCode","admissionSequence"::text AS sequence FROM "ReservationRequest" ORDER BY "admissionSequence"')).rows;
async function processAt(f:ReservationAdmissionFixture,phase:string){
  const child=fork(fileURLToPath(new URL('../support/reservation-dispatch-process.mjs',import.meta.url)),[],{stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,
    TEST_DATABASE_URL:f.environment.databaseUrl,TEST_MIGRATION_DATABASE_URL:f.environment.migrationUrl,DISPATCH_PROCESS_PHASE:phase}});
  const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));
  const reached=new Promise<void>((resolve,reject)=>{
    child.on('message',message=>{const value=message as {phase:string};if(value.phase===phase||(phase==='probe'&&value.phase==='ready'))resolve();if(value.phase==='failed')reject(new Error('Subproceso no alcanzó barrera de despacho.'));});
    child.once('error',()=>reject(new Error('No se pudo iniciar subproceso de ensayo.')));
    child.once('exit',()=>reject(new Error('Subproceso terminó antes de barrera.')));
  });
  try{await reached;}catch(error){child.kill('SIGKILL');await exited;throw error;}
  return {async kill(){child.kill('SIGKILL');await exited;}};
}
async function assertNoPartialOrder(f:ReservationAdmissionFixture){
  expect((await f.pool.query(`SELECT (SELECT count(*)::int FROM "EnrollmentOrder") AS orders,(SELECT count(*)::int FROM "EnrollmentOrderItem") AS items,(SELECT count(*)::int FROM "SeatReservation") AS seats`)).rows[0]).toEqual({orders:0,items:0,seats:0});
}
dispatch('RD00a auxiliar: oferta, precios y secuencias ficticias válidas',async f=>{
  const first=await queueRequest(f),second=await queueRequest(f,[f.otherGroupId],await sessionFixture(f,'STUDENT'));
  expect([first.sequence,second.sequence]).toEqual(['1','2']);
  expect((await f.pool.query('SELECT state,capacity FROM "AcademicGroup" ORDER BY id')).rows).toEqual([{state:'PUBLISHED',capacity:1},{state:'PUBLISHED',capacity:1}]);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "CoursePrice" WHERE "amountMinor"=12500')).rows[0].n).toBe(2);
  await assertNoPartialOrder(f);
});
dispatch('RD00b auxiliar: bloqueo real de DispatchState entre conexiones distintas',async f=>{
  const holder=await f.pool.connect(),waiter=await f.pool.connect();let pending:Promise<unknown>|undefined;
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "DispatchState" WHERE id=1 FOR UPDATE');
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending=waiter.query('SELECT id FROM "DispatchState" WHERE id=1 FOR UPDATE');
    try{await waitForBlockedBy(f.pool,pid);}finally{await holder.query('ROLLBACK');}await pending;
  }finally{await pending?.catch(()=>undefined);holder.release();waiter.release();}
});
dispatch('RD00c auxiliar: proceso Node separado conecta a su schema PG real',async f=>{
  const process=await processAt(f,'probe');await process.kill();
});
dispatch('RD00d auxiliar: reloj SQL cruza corte Lima exactamente un microsegundo',async f=>{
  const clock=await processingClock(f),client=await clock.pool.connect();
  try{
    const read=async()=>(await client.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`)).rows[0].at;
    expect(await read()).toBe('2090-01-02T04:59:59.999999Z');await clock.advance();expect(await read()).toBe('2090-01-02T05:00:00.000000Z');
  }finally{client.release();}
});
for(const phase of ['beforeCommit','afterCommit'])dispatch(`RD13 TV12 reinicio de proceso real ${phase}: decisión durable única`,async f=>{
  await queueRequest(f);dispatchTarget(f); // Ausencia de T031 se identifica antes de iniciar un hijo de negocio.
  const process=await processAt(f,phase);await process.kill();
  const before=await financialFingerprint(f.pool);
  const result=await dispatchTarget(f).dispatchNext(randomUUID());
  expect(result.state).toBe(phase==='beforeCommit'?'CONFIRMED':'IDLE');
  expect(await rows(f.pool)).toMatchObject([{state:'CONFIRMED'}]);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentOrder"')).rows[0].n).toBe(1);
  if(phase==='afterCommit')expect(await financialFingerprint(f.pool)).toBe(before);
});
dispatch('RD01 sin cola no crea efectos ni consulta AdmissionSequence',async f=>{
  const trace=instrumentPool(f.pool),before=await financialFingerprint(f.pool);
  expect(await dispatchTarget(f,trace.pool).dispatchNext(randomUUID())).toMatchObject({state:'IDLE'});
  expect(await financialFingerprint(f.pool)).toBe(before);
  expect(trace.statements.some(s=>/AdmissionSequence|SKIP LOCKED/.test(s.sql))).toBe(false);
});
dispatch('RD02 confirmación multigrupo: total original y exactamente 24h con un token',async f=>{
  const request=await queueRequest(f,[f.groupId,f.otherGroupId]),trace=instrumentPool(f.pool);
  expect(await dispatchTarget(f,trace.pool).dispatchNext(randomUUID())).toMatchObject({state:'CONFIRMED',requestId:request.id});
  expect((await f.pool.query(`SELECT state,"totalMinor"::text AS total,(extract(epoch FROM ("expiresAt"-"confirmedAt"))*1000000)::bigint::text AS duration FROM "EnrollmentOrder"`)).rows).toEqual([{state:'RESERVED',total:'25000',duration:'86400000000'}]);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "SeatReservation" WHERE state=\'CONFIRMED\'')).rows[0].n).toBe(2);
  const clock=trace.statements.filter(s=>/extract\(epoch FROM clock_timestamp\(\)/.test(s.sql));expect(clock).toHaveLength(1);
  expect(trace.statements.at(-1)?.sql).toBe('COMMIT');expect(new Set(trace.pids).size).toBe(1);
});
dispatch('RD03 RA-02 dos despachadores disputan última plaza sin saltar cabeza bloqueada',async f=>{
  const first=await queueRequest(f),second=await queueRequest(f,[f.groupId],await sessionFixture(f,'STUDENT'));
  const entered=latch();let pending:ReturnType<typeof observe>|undefined;
  const trace=instrumentPool(f.pool,{before:sql=>{if(/DispatchState/.test(sql)&&/FOR UPDATE/.test(sql))entered.release();}});
  const target=dispatchTarget(f,trace.pool),other=dispatchTarget(f),holder=await f.pool.connect();
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "ReservationRequest" WHERE id=$1 FOR UPDATE',[first.id]);
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending=observe(Promise.all([target.dispatchNext(randomUUID()),other.dispatchNext(randomUUID())]));
    await milestone(entered.promise,pending);await waitForBlockedBy(f.pool,pid);
    expect(await rows(f.pool)).toMatchObject([{id:first.id,state:'ADMITTED'},{id:second.id,state:'ADMITTED'}]);
    await holder.query('COMMIT');await unwrap(pending);
    expect(await rows(f.pool)).toMatchObject([{id:first.id,state:'CONFIRMED'},{id:second.id,state:'REJECTED',decisionCode:'CAPACITY_UNAVAILABLE'}]);
    expect(trace.statements.some(s=>/SKIP LOCKED|AdmissionSequence/.test(s.sql))).toBe(false);
    expect((await f.pool.query('SELECT count(*)::int AS n FROM "SeatReservation"')).rows[0].n).toBe(1);
  }finally{await holder.query('ROLLBACK');await pending;holder.release();}
});
dispatch('RD04 multigrupo rechaza todo cuando uno no tiene precio',async f=>{
  await f.pool.query('DELETE FROM "CoursePrice" WHERE "courseId"=$1',[f.otherCourseId]);
  const request=await queueRequest(f,[f.groupId,f.otherGroupId]);
  expect(await dispatchTarget(f).dispatchNext(randomUUID())).toMatchObject({state:'REJECTED',requestId:request.id});
  expect(await rows(f.pool)).toMatchObject([{state:'REJECTED',decisionCode:'OFFERING_NOT_RESERVABLE'}]);await assertNoPartialOrder(f);
});
dispatch('RD05 precio concurrente: espera curso y congela importe posterior al commit',async f=>{
  await queueRequest(f);const entered=latch(),trace=instrumentPool(f.pool,{before:sql=>{if(/AcademicCourse/.test(sql)&&/FOR (UPDATE|SHARE)/.test(sql))entered.release();}});
  const target=dispatchTarget(f,trace.pool),holder=await f.pool.connect();let pending:ReturnType<typeof observe>|undefined;
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicCourse" WHERE id=$1 FOR UPDATE',[f.courseId]);
    await holder.query('UPDATE "CoursePrice" SET "amountMinor"=17000,revision=revision+1 WHERE "courseId"=$1',[f.courseId]);
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending=observe(target.dispatchNext(randomUUID()));await milestone(entered.promise,pending);await waitForBlockedBy(f.pool,pid);
    await holder.query('COMMIT');await unwrap(pending);
    expect((await f.pool.query('SELECT "priceMinor"::text AS amount FROM "EnrollmentOrderItem"')).rows).toEqual([{amount:'17000'}]);
  }finally{await holder.query('ROLLBACK');await pending;holder.release();}
});
dispatch('RD06 TV15 fallo real del INSERT de auditoría revierte orden, ítems y plazas',async f=>{
  await queueRequest(f,[f.groupId,f.otherGroupId]);const before=await financialFingerprint(f.pool);
  await f.isolated.ownerQuery(`CREATE FUNCTION fail_dispatch_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit failure'; END $$;
    CREATE TRIGGER fail_dispatch_audit BEFORE INSERT ON "EnrollmentAuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_dispatch_audit()`);
  await expect(dispatchTarget(f).dispatchNext(randomUUID())).rejects.toBeDefined();
  expect(await financialFingerprint(f.pool)).toBe(before);await assertNoPartialOrder(f);expect(await rows(f.pool)).toMatchObject([{state:'ADMITTED'}]);
});
for(const code of ['40001','40P01'] as const)dispatch(`RD07 TV10/19 ${code}: aborto después de reloj exige rollback y token nuevo`,async f=>{
  await queueRequest(f);let failed=false;const trace=instrumentPool(f.pool,{after:sql=>{if(!failed&&/extract\(epoch FROM clock_timestamp\(\)/.test(sql)){failed=true;throw Object.assign(new Error('fixture known abort'),{code});}}});
  expect(await dispatchTarget(f,trace.pool).dispatchNext(randomUUID())).toMatchObject({state:'CONFIRMED'});
  expect(failed).toBe(true);expect(trace.statements.filter(s=>s.sql==='ROLLBACK')).toHaveLength(1);
  expect(trace.statements.filter(s=>/extract\(epoch FROM clock_timestamp\(\)/.test(s.sql))).toHaveLength(2);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentOrder"')).rows[0].n).toBe(1);
});
dispatch('RD08 TV11 COMMIT con acuse perdido se recupera sin duplicar orden ni timestamps',async f=>{
  await queueRequest(f);let lost=false;const trace=instrumentPool(f.pool,{after:sql=>{if(sql==='COMMIT'&&!lost){lost=true;throw Object.assign(new Error('fixture lost acknowledgement'),{code:'ECONNRESET'});}}});
  await observe(dispatchTarget(f,trace.pool).dispatchNext(randomUUID()));expect(lost).toBe(true);
  const before=await financialFingerprint(f.pool);
  expect(await dispatchTarget(f).dispatchNext(randomUUID())).toMatchObject({state:'IDLE'});
  expect(await financialFingerprint(f.pool)).toBe(before);expect(await rows(f.pool)).toMatchObject([{state:'CONFIRMED'}]);
});
dispatch('RD09 TV12 reinicio del despachador tras aborto libera mutex y conserva cabeza durable',async f=>{
  const request=await queueRequest(f);let failed=false;
  const trace=instrumentPool(f.pool,{before:sql=>{if(sql==='COMMIT'&&!failed){failed=true;throw new Error('fixture shutdown before commit');}}});
  await observe(dispatchTarget(f,trace.pool).dispatchNext(randomUUID()));expect(failed).toBe(true);
  expect(await rows(f.pool)).toMatchObject([{state:'ADMITTED'}]);await assertNoPartialOrder(f);
  expect(await dispatchTarget(f).dispatchNext(randomUUID())).toMatchObject({state:'CONFIRMED',requestId:request.id});
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentOrder"')).rows[0].n).toBe(1);
});
dispatch('RD10 TV17/18 normaliza orden vencida fuera de selección con el mismo token final',async f=>{
  await seedCommitment(f,'DEADLINE_PASSED');await f.pool.query('UPDATE "AdmissionSequence" SET "nextSequence"=2 WHERE id=1');
  const old=(await f.pool.query('SELECT id FROM "EnrollmentOrder"')).rows[0].id;
  await queueRequest(f,[f.otherGroupId]);const trace=instrumentPool(f.pool);
  expect(await dispatchTarget(f,trace.pool).dispatchNext(randomUUID())).toMatchObject({state:'CONFIRMED'});
  const facts=(await f.pool.query(`SELECT o.id,o.state,o."expirationProcessedAt"=(SELECT "confirmedAt" FROM "EnrollmentOrder" WHERE id<>$1) AS "sameToken" FROM "EnrollmentOrder" o ORDER BY o."confirmedAt"`,[old])).rows;
  expect(facts).toMatchObject([{id:old,state:'EXPIRED',sameToken:true},{state:'RESERVED'}]);
  const locked=trace.statements.filter(s=>/AcademicGroup/.test(s.sql)&&/FOR UPDATE/.test(s.sql));expect(locked.length).toBeGreaterThan(0);
  expect(trace.statements.filter(s=>/extract\(epoch FROM clock_timestamp\(\)/.test(s.sql))).toHaveLength(1);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentAuditEvent" WHERE "targetId"=$1 AND "effectKey" IS NOT NULL',[old])).rows[0].n).toBe(1);
});
dispatch('RD11 TV06 espera grupo y cruza exactamente corte Lima antes de confirmar',async f=>{
  await queueRequest(f);const clock=await processingClock(f),entered=latch(),trace=instrumentPool(clock.pool,{before:sql=>{if(/AcademicGroup/.test(sql)&&/FOR UPDATE/.test(sql))entered.release();}});
  const target=dispatchTarget(f,trace.pool),holder=await f.pool.connect();let pending:ReturnType<typeof observe>|undefined;
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.groupId]);
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending=observe(target.dispatchNext(randomUUID()));await milestone(entered.promise,pending);await waitForBlockedBy(f.pool,pid);
    await clock.advance();await holder.query('COMMIT');expect(await unwrap(pending)).toMatchObject({state:'REJECTED'});await assertNoPartialOrder(f);
  }finally{await holder.query('ROLLBACK');await pending;holder.release();}
});
dispatch('RD12 55P03 no bucle inmediato; error temporal conserva ADMITTED',async f=>{
  await queueRequest(f);let failures=0;const trace=instrumentPool(f.pool,{before:sql=>{if(/AcademicGroup/.test(sql)&&/FOR UPDATE/.test(sql)){failures++;throw Object.assign(new Error('fixture lock timeout'),{code:'55P03'});}}});
  await expect(dispatchTarget(f,trace.pool).dispatchNext(randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(failures).toBe(1);expect(await rows(f.pool)).toMatchObject([{state:'ADMITTED'}]);await assertNoPartialOrder(f);
});
dispatch('RD14 TV17 bloquea también grupo de orden anterior fuera de la nueva selección',async f=>{
  await seedCommitment(f,'DEADLINE_PASSED');await f.pool.query('UPDATE "AdmissionSequence" SET "nextSequence"=2 WHERE id=1');await queueRequest(f,[f.otherGroupId]);
  const entered=latch(),trace=instrumentPool(f.pool,{before:sql=>{if(/AcademicGroup/.test(sql)&&/FOR UPDATE/.test(sql))entered.release();}});
  const target=dispatchTarget(f,trace.pool),holder=await f.pool.connect();let pending:ReturnType<typeof observe>|undefined;
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.groupId]);
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending=observe(target.dispatchNext(randomUUID()));await milestone(entered.promise,pending);await waitForBlockedBy(f.pool,pid);
    expect((await f.pool.query('SELECT state FROM "EnrollmentOrder"')).rows).toEqual([{state:'RESERVED'}]);
    await holder.query('COMMIT');expect(await unwrap(pending)).toMatchObject({state:'CONFIRMED'});
    expect((await f.pool.query('SELECT state FROM "EnrollmentOrder" ORDER BY "confirmedAt"')).rows).toEqual([{state:'EXPIRED'},{state:'RESERVED'}]);
  }finally{await holder.query('ROLLBACK');await pending;holder.release();}
});
dispatch('RD15 TV19 cambia docente en descubrimiento: rollback y nueva cobertura antes del token',async f=>{
  await queueRequest(f);const teacher=await sessionFixture(f,'TEACHER');let changed=false;
  const trace=instrumentPool(f.pool,{after:async sql=>{
    if(!changed&&/SELECT/i.test(sql)&&/AcademicGroup/.test(sql)&&!/FOR (SHARE|UPDATE)/.test(sql)){
      changed=true;
      await f.pool.query('UPDATE "AcademicGroup" SET state=\'WITHDRAWN\' WHERE id=$1',[f.groupId]);
      await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1',[f.groupId,teacher.userId]);
      await f.pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId","publishedTeacherEligibilityVersion"=(SELECT "eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"="teacherUserId") WHERE id=$1`,[f.groupId]);
    }
  }});
  expect(await dispatchTarget(f,trace.pool).dispatchNext(randomUUID())).toMatchObject({state:'CONFIRMED'});
  expect(changed).toBe(true);const rollback=trace.statements.findIndex(s=>s.sql==='ROLLBACK');expect(rollback).toBeGreaterThanOrEqual(0);
  expect(trace.statements.slice(0,rollback).some(s=>/extract\(epoch FROM clock_timestamp\(\)/.test(s.sql))).toBe(false);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "EnrollmentOrder"')).rows[0].n).toBe(1);
});
dispatch('RD16 TV19 tres abortos PG 40001 agotan presupuesto y conservan ADMITTED',async f=>{
  await queueRequest(f);
  await f.isolated.ownerQuery(`CREATE SEQUENCE dispatch_fault_counter;
    CREATE FUNCTION fail_dispatch_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM nextval('dispatch_fault_counter'); RAISE SQLSTATE '40001'; END $$;
    CREATE TRIGGER fail_dispatch_order BEFORE INSERT ON "EnrollmentOrder" FOR EACH ROW EXECUTE FUNCTION fail_dispatch_order()`);
  await expect(dispatchTarget(f).dispatchNext(randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect((await f.pool.query('SELECT last_value::text AS n FROM dispatch_fault_counter')).rows[0].n).toBe('3');
  expect(await rows(f.pool)).toMatchObject([{state:'ADMITTED'}]);await assertNoPartialOrder(f);
});
