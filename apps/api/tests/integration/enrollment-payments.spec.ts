import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { paymentFixture, paymentRows, counts, assertApplied, assertIncident, paymentProcess, unconfirmed } from '../support/enrollment-payment.js';
import type { PaymentFixture } from '../support/enrollment-payment.js';
import { instrumentPool, latch } from '../support/academic-foundation-contract.js';
import { waitForBlockedBy } from '../support/locks.js';
import { observe, milestone, unwrap } from '../support/reservation-processing.js';
import { queriesTarget } from '../support/reservation-processing.js';
import { sessionFixture } from '../support/session-fixture.js';
import { seedCommitment } from '../support/enrollment-maintenance.js';
import { insertEnrollmentRow } from '../support/enrollment-migration.js';

function payment(name:string,work:(f:PaymentFixture)=>Promise<void>){test(name,async()=>{const f=await paymentFixture();try{await work(f);}finally{await f.close();}},120000);}

payment('PP00a control: reserva multigrupo real, intento/recibo ficticios y cero pago final',async f=>{
  expect(f.original.total).toBe('25000');expect(f.original.revision).toBe('1');
  expect(await counts(f)).toEqual({payments:0,enrollments:0,incidents:0,reserved:2,converted:0,expired:0});
  expect((await f.pool.query('SELECT state,"terminalPaymentId" FROM "ProviderReceipt"')).rows).toEqual([{state:'RECEIVED',terminalPaymentId:null}]);
  expect((await f.pool.query(`SELECT (extract(epoch FROM ("expiresAt"-"confirmedAt"))*1000000)::bigint::text AS duration FROM "EnrollmentOrder"`)).rows).toEqual([{duration:'86400000000'}]);
});
payment('PP00b control: reloj SQL distingue exactamente −1/igual/+1 microsegundo',async f=>{
  const times=[];for(const delta of [-1,0,1]){await f.boundary(delta);times.push(await f.time());}
  expect(times).toEqual(['2089-12-31T00:00:00.123455Z','2089-12-31T00:00:00.123456Z','2089-12-31T00:00:00.123457Z']);
  expect(await counts(f)).toMatchObject({payments:0,enrollments:0,reserved:2});
});
payment('PP00c control: barrera de grupo se observa desde una conexión PG diferente',async f=>{
  const holder=await f.pool.connect(),waiter=await f.pool.connect();let pending:Promise<unknown>|undefined;
  try{await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.groupId]);const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending=waiter.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR SHARE',[f.groupId]);await waitForBlockedBy(f.pool,pid);await holder.query('ROLLBACK');await pending;
  }finally{await holder.query('ROLLBACK');await pending?.catch(()=>undefined);holder.release();waiter.release();}
});
payment('PP00d control: vencimiento real no borra recibo ni fabrica verificación',async f=>{
  await f.boundary(0);expect(await f.expire()).toBe('EXPIRED');expect(await counts(f)).toMatchObject({payments:0,enrollments:0,reserved:0,expired:2});
  expect((await f.pool.query('SELECT state,"processedAt","terminalPaymentId" FROM "ProviderReceipt"')).rows).toEqual([{state:'RECEIVED',processedAt:null,terminalPaymentId:null}]);
});
payment('PP00g control: otro proceso Node conecta al mismo schema PG y termina',async f=>{
  expect(await paymentProcess(f,'probe')).toEqual({state:'READY'});expect(await counts(f)).toMatchObject({payments:0,enrollments:0,reserved:2});
});
payment('PP00h control: último cupo vencido se reasigna por US1 real al otro alumno',async f=>{
  await f.boundary(1);await f.expire();const actor=await f.reassign();expect(await counts(f)).toMatchObject({payments:0,enrollments:0,reserved:1,expired:2});
  const projection=await queriesTarget(f,f.pool).offerings(actor,{page:1,pageSize:20});expect(projection.items.find(i=>i.groupId===f.groupId)).toMatchObject({reserved:1,occupied:0,available:0});
});
payment('PP00i control: escritor real permite cancelar tras vencimiento sin incidencia',async f=>{
  await f.boundary(1);await f.expire();await f.refreshSessions();expect((await f.cancelGroup()).resource.state).toBe('CANCELLED');expect(await counts(f)).toMatchObject({payments:0,enrollments:0,incidents:0,expired:2});
});
payment('PP00e control: evidencia incompatible y referencia desconocida caben sin FK falsa',async f=>{
  const client=await f.pool.connect();try{
    await client.query('BEGIN');const id=randomUUID();
    await client.query(`INSERT INTO "VerifiedPayment" (id,"providerScope","providerPaymentId","orderId","amountUnits","amountScale",currency,"merchantReference","verificationFinishedAt","reconciliationState","normalizedEvidenceReference") VALUES ($1,'fixture/other/sandbox','unknown',NULL,123,3,'USD','unknown',clock_timestamp(),'INCIDENT','fixture/minimal')`,[id]);
    await client.query(`INSERT INTO "PaymentIncident" ("verifiedPaymentId",reason,"affectedGroupIds") VALUES ($1,'UNKNOWN_REFERENCE',ARRAY[]::uuid[])`,[id]);
    expect((await client.query('SELECT "orderId",currency,"amountUnits"::text AS amount FROM "VerifiedPayment" WHERE id=$1',[id])).rows).toEqual([{orderId:null,currency:'USD',amount:'123'}]);
  }finally{await client.query('ROLLBACK');client.release();}
  expect(await counts(f)).toMatchObject({payments:0,incidents:0});
});
for(const table of ['Enrollment','EnrollmentAuditEvent'])payment(`PP00f control: trigger real falla en ${table} y rollback conserva recibo`,async f=>{
  await f.isolated.ownerQuery(`CREATE FUNCTION payment_control_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture-write-failure'; END $$; CREATE TRIGGER payment_control_failure BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION payment_control_failure()`);
  const client=await f.pool.connect();try{
    await client.query('BEGIN');
    // seedCommitment escribe solo hechos de prueba; NO acredita al finalizador.
    const insert=table==='Enrollment'?seedCommitment(f,'ENROLLED',client,'2'):client.query(`INSERT INTO "EnrollmentAuditEvent" ("actorKind","actorReference",operation,"targetKind","targetId","requestId",result) VALUES ('SYSTEM','fixture/control','FIXTURE_CONTROL','ORDER',$1,$2,'APPLIED')`,[f.original.id,randomUUID()]);
    await expect(insert).rejects.toThrow('fixture-write-failure');
  }finally{await client.query('ROLLBACK');client.release();}
  expect(await counts(f)).toMatchObject({payments:0,enrollments:0,incidents:0,reserved:2});
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "ProviderReceipt"')).rows[0].n).toBe(1);
});
payment('PP00j control: fallo de la segunda matrícula revierte también la primera inserción',async f=>{
  await f.isolated.ownerQuery(`CREATE SEQUENCE payment_control_counter;
    CREATE FUNCTION fail_second_enrollment_control() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF nextval('payment_control_counter')=2 THEN RAISE EXCEPTION 'fixture-second-enrollment'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_second_enrollment_control BEFORE INSERT ON "Enrollment" FOR EACH ROW EXECUTE FUNCTION fail_second_enrollment_control()`);
  const client=await f.pool.connect();try{
    await client.query('BEGIN');await seedCommitment(f,'ENROLLED',client,'2');expect((await client.query('SELECT count(*)::int AS n FROM "Enrollment"')).rows[0].n).toBe(1);
    await expect(seedCommitment({...f,courseId:f.otherCourseId,groupId:f.otherGroupId},'ENROLLED',client,'3')).rejects.toThrow('fixture-second-enrollment');
  }finally{await client.query('ROLLBACK');client.release();}
  expect(await counts(f)).toMatchObject({payments:0,enrollments:0,reserved:2});expect((await f.pool.query('SELECT last_value::text AS n FROM payment_control_counter')).rows[0].n).toBe('2');
});

payment('PP01 PV01 conversión multigrupo atómica y sin otra plaza',async f=>{
  const target=f.processor(),result=await target.finalize(f.first);expect(result.state).toBe('APPLIED');await assertApplied(f,result.paymentId);
});
for(const delta of [-1,0,1])payment(`PP02 PV02 finalización al límite ${delta}µs`,async f=>{
  const target=f.processor();await f.boundary(delta);const before=await f.time(),result=await target.finalize(f.first);expect(result.state).toBe(delta<0?'APPLIED':'INCIDENT');
  expect(result.verificationFinishedAt).toBe(before);
  if(delta<0)await assertApplied(f,result.paymentId);else{await assertIncident(f,f.first);expect(await counts(f)).toMatchObject({expired:2,reserved:0,converted:0});}
});
payment('PP03 PV03 evidencia anterior espera locks y se verifica después del límite',async f=>{
  const entered=latch(),trace=instrumentPool(f.pool,{before:sql=>{if(/AcademicGroup/.test(sql)&&/FOR UPDATE/.test(sql))entered.release();}}),target=f.processor(trace.pool),holder=await f.pool.connect();
  let pending:ReturnType<typeof observe<Awaited<ReturnType<typeof target.finalize>>>>|undefined;
  try{await f.boundary(-1);await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.groupId]);const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending=observe(target.finalize(f.first));await milestone(entered.promise,pending);await waitForBlockedBy(f.pool,pid);await f.boundary(1);await holder.query('COMMIT');expect((await unwrap(pending)).state).toBe('INCIDENT');await assertIncident(f,f.first);
    expect((await f.pool.query(`SELECT "verificationFinishedAt">"receivedAt" AS later FROM "VerifiedPayment" p CROSS JOIN "ProviderReceipt" r WHERE p.id=r."terminalPaymentId"`)).rows).toEqual([{later:true}]);
  }finally{await holder.query('ROLLBACK');await pending;holder.release();}
});
payment('PP04 PV04 pago decide antes; vencimiento espera y observa ENROLLED',async f=>{
  const reached=latch(),release=latch();let paused=false;
  const trace=instrumentPool(f.pool,{before:async sql=>{if(!paused&&sql==='COMMIT'){paused=true;reached.release();await release.promise;}}}),target=f.processor(trace.pool);
  await f.boundary(-1);const pending=observe(target.finalize(f.first));let expiration:ReturnType<typeof observe<Awaited<ReturnType<typeof f.expire>>>>|undefined;
  try{await milestone(reached.promise,pending);await f.boundary(1);expiration=observe(f.expire());await waitForBlockedBy(f.pool,trace.pids[0]);
    release.release();const result=await unwrap(pending);expect(result.state).toBe('APPLIED');expect(await unwrap(expiration)).toBe('ALREADY_TERMINAL');await assertApplied(f,result.paymentId);
  }finally{release.release();await pending;await expiration;}
});
payment('PP05 PV05 vencimiento confirma antes; no resurrección',async f=>{
  const target=f.processor();await f.boundary(1);await f.expire();expect((await target.finalize(f.first)).state).toBe('INCIDENT');await assertIncident(f,f.first);
  expect(await counts(f)).toMatchObject({reserved:0,converted:0,expired:2});
});
payment('PP06 PV06 cupo reasignado no vuelve al pago anterior',async f=>{
  const target=f.processor();await f.boundary(1);await f.expire();const actor=await f.reassign();
  expect((await target.finalize(f.first)).state).toBe('INCIDENT');await assertIncident(f,f.first);
  expect(await counts(f)).toMatchObject({reserved:1,converted:0,expired:2,enrollments:0});
  const projection=await queriesTarget(f,f.pool).offerings(actor,{page:1,pageSize:20});expect(projection.items.find(i=>i.groupId===f.groupId)).toMatchObject({reserved:1,occupied:0,available:0});
});
payment('PP07 PV07 recibo durable sobrevive cierre/reapertura del procesador y vencimiento',async f=>{
  f.processor();await f.boundary(1);await f.expire();
  expect((await f.pool.query('SELECT state FROM "ProviderReceipt" WHERE id=$1',[f.first.receiptId])).rows[0].state).toBe('RECEIVED');
  const final=await paymentProcess(f,f.first);expect(final.state).toBe('DONE');if(final.state==='DONE')expect(final.result.state).toBe('INCIDENT');await assertIncident(f,f.first);
});
for(const table of ['Enrollment','EnrollmentAuditEvent'])payment(`PP08 PV08 fallo real de ${table} revierte pago, todas las matrículas y conserva recibo`,async f=>{
  const target=f.processor(),before=await paymentRows(f);
  await f.isolated.ownerQuery(`CREATE SEQUENCE payment_write_counter;
    CREATE FUNCTION abort_payment_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${table==='Enrollment'?"nextval('payment_write_counter')=2":'true'} THEN RAISE EXCEPTION 'fixture-final-write-failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER abort_payment_write BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION abort_payment_write()`);
  await expect(target.finalize(f.first)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(await paymentRows(f)).toEqual(before);
  expect((await f.pool.query('SELECT state,"terminalPaymentId" FROM "ProviderReceipt" WHERE id=$1',[f.first.receiptId])).rows).toEqual([{state:'RECEIVED',terminalPaymentId:null}]);
});
for(const phase of ['before','after'] as const)payment(`PP09 PV09 COMMIT ${phase}: recupera identidad económica sin repetir efectos`,async f=>{
  let lost=false;const fail=(sql:string)=>{if(sql==='COMMIT'&&!lost){lost=true;throw Object.assign(new Error('fixture-ack-lost'),{code:'ECONNRESET'});}},trace=instrumentPool(f.pool,{[phase]:fail}),target=f.processor(trace.pool);
  await observe(target.finalize(f.first));expect(lost).toBe(true);const before=await paymentRows(f);
  if(phase==='before'){expect(await counts(f)).toMatchObject({payments:0,enrollments:0});await f.boundary(-1);}
  const result=await f.processor().finalize(f.first);expect(result.state).toBe('APPLIED');await assertApplied(f,result.paymentId);
  if(phase==='after')expect(await paymentRows(f)).toEqual(before);else expect(result.verificationFinishedAt).toBe(await f.time());
});
payment('PP10 PV10 dos entregas concurrentes del mismo pago tienen un resultado canónico',async f=>{
  const a=f.processor(),b=f.processor(),second=await f.receipt(),results=await Promise.all([a.finalize(f.first),b.finalize(second)]);
  expect(results.map(r=>r.state)).toEqual(['APPLIED','APPLIED']);expect(results[0].paymentId).toBe(results[1].paymentId);expect(results[0].verificationFinishedAt).toBe(results[1].verificationFinishedAt);await assertApplied(f,results[0].paymentId);
});
for(const state of ['APPLIED','INCIDENT'])payment(`PP11 PV11 entrega posterior conserva ${state} y fecha originales`,async f=>{
  const target=f.processor();if(state==='INCIDENT')await f.boundary(1);const original=await target.finalize(f.first);expect(original.state).toBe(state);const before=await paymentRows(f),second=await f.receipt();
  await f.boundary(2);const result=await f.processor().finalize(second);expect(result).toMatchObject({state,paymentId:original.paymentId,verificationFinishedAt:original.verificationFinishedAt});expect(await paymentRows(f)).toEqual(before);
});
payment('PP12 PV12 otro pago auténtico de la orden ya matriculada abre incidencia sin duplicar matrícula',async f=>{
  const target=f.processor(),first=await target.finalize(f.first);await assertApplied(f,first.paymentId);const second=await f.receipt({providerPaymentId:randomUUID()});
  expect((await target.finalize(second)).state).toBe('INCIDENT');await assertIncident(f,second,{enrollments:2});expect(await counts(f)).toMatchObject({payments:2,incidents:1,enrollments:2,converted:2});
});
for(const change of ['merchantReference','amountUnits','currency'] as const)payment(`PP13 PV13 misma identidad con otro ${change} no se apropia del pago`,async f=>{
  const target=f.processor(),first=await target.finalize(f.first);await assertApplied(f,first.paymentId);const before=await paymentRows(f);
  const second=await f.receipt(change==='amountUnits'?{amountUnits:1n}:change==='currency'?{currency:'USD'}:{merchantReference:'fixture-unknown-order'});
  expect((await target.finalize(second)).state).toBe('INTEGRITY_CONFLICT');expect(await paymentRows(f)).toEqual(before);
});
payment('PP13b PV13 IDs iguales en scopes distintos no se confunden',async f=>{
  const target=f.processor(),first=await target.finalize(f.first);await assertApplied(f,first.paymentId);
  const second=await f.receipt({providerScope:'fixture/provider/other-merchant/sandbox'});expect((await target.finalize(second)).state).toBe('INCIDENT');await assertIncident(f,second,{unknown:true,enrollments:2});
  expect((await f.pool.query('SELECT "providerScope" FROM "VerifiedPayment" WHERE "providerPaymentId"=$1 ORDER BY "providerScope"',[f.evidence.providerPaymentId])).rows).toHaveLength(2);
});
for(const changes of [{amountUnits:24999n},{amountUnits:25001n},{currency:'USD'},{amountUnits:25000n,amountScale:3}])payment(`PP14 PV14 hecho auténtico incompatible ${JSON.stringify(changes,(_,v)=>typeof v==='bigint'?v.toString():v)}`,async f=>{
  const target=f.processor(),call=await f.receipt(changes);expect((await target.finalize(call)).state).toBe('INCIDENT');await assertIncident(f,call);expect(await counts(f)).toMatchObject({reserved:2,converted:0});
  expect((await f.pool.query('SELECT "expiresAt"="confirmedAt"+interval \'24 hours\' AS original FROM "EnrollmentOrder" WHERE id=$1',[f.original.id])).rows[0].original).toBe(true);
});
payment('PP15 PV15 referencia desconocida no adjudica titular ni bloquea grupos',async f=>{
  const target=f.processor(),call=await f.receipt({merchantReference:'fixture-invented-reference'});expect((await target.finalize(call)).state).toBe('INCIDENT');await assertIncident(f,call,{unknown:true});
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "PaymentIncident" WHERE cardinality("affectedGroupIds")>0')).rows[0].n).toBe(0);
  const writer=await f.pool.connect();try{await writer.query('BEGIN');await writer.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE NOWAIT',[f.groupId]);}finally{await writer.query('ROLLBACK');writer.release();}
});
for(const state of ['UNRESOLVED','FAILED_NO_CHARGE'] as const)payment(`PP16 PV16 sin hecho económico ${state} no crea pago, incidente o matrícula`,async f=>{
  const target=f.processor(),before=await paymentRows(f);expect((await target.finalize(unconfirmed(f.first,state))).state).toBe('UNCONFIRMED');expect(await paymentRows(f)).toEqual(before);expect(await counts(f)).toMatchObject({payments:0,incidents:0,enrollments:0});
});
for(const change of ['withdraw','teacher-disabled','teacher-version'] as const)payment(`PP17 PV17 condición ${change} confirma antes de finalizar`,async f=>{
  const target=f.processor();if(change==='withdraw')await f.pool.query('UPDATE "AcademicCourse" SET state=\'WITHDRAWN\' WHERE id=$1',[f.courseId]);
  else if(change==='teacher-disabled')await f.pool.query('UPDATE "User" SET status=\'DISABLED\',"disabledAt"=clock_timestamp() WHERE id=$1',[f.teacher.userId]);
  else{
    const before=(await f.pool.query('SELECT "eligibilityVersion"::text AS v FROM "AcademicTeacherDirectory" WHERE "userId"=$1',[f.teacher.userId])).rows[0].v;
    await f.pool.query('UPDATE "User" SET status=\'DISABLED\',"disabledAt"=clock_timestamp() WHERE id=$1',[f.teacher.userId]);
    await f.pool.query('UPDATE "User" SET status=\'ACTIVE\',"disabledAt"=NULL WHERE id=$1',[f.teacher.userId]);
    expect((await f.pool.query('SELECT "eligibilityVersion"::text AS v FROM "AcademicTeacherDirectory" WHERE "userId"=$1',[f.teacher.userId])).rows[0].v).not.toBe(before);
  }
  expect((await target.finalize(f.first)).state).toBe('INCIDENT');await assertIncident(f,f.first);expect(await counts(f)).toMatchObject({reserved:2,converted:0});
});
payment('PP18 PV18 ocultar después de aplicar conserva matrículas e historial',async f=>{
  const target=f.processor(),result=await target.finalize(f.first);await assertApplied(f,result.paymentId);const before=(await paymentRows(f)).Enrollment;
  await f.pool.query('UPDATE "AcademicCourse" SET state=\'WITHDRAWN\' WHERE id=$1',[f.courseId]);expect((await paymentRows(f)).Enrollment).toEqual(before);expect((await target.finalize(f.first)).state).toBe('APPLIED');await assertApplied(f,result.paymentId);
});
for(const first of ['cancellation','incident'] as const)payment(`PP19 PV19 ${first} primero conserva terminalidad/guard`,async f=>{
  const reached=latch(),release=latch();let paused=false;
  const trace=instrumentPool(f.pool,{before:async sql=>{if(!paused&&sql==='COMMIT'){paused=true;reached.release();await release.promise;}}}),target=f.processor(first==='incident'?trace.pool:f.pool);
  await f.boundary(1);await f.expire();await f.refreshSessions();
  const firstWork:Promise<unknown>=first==='incident'?target.finalize(f.first):f.cancelGroup(trace.pool),pending=observe(firstWork);
  let second:ReturnType<typeof observe<unknown>>|undefined;
  try{
    await milestone(reached.promise,pending);const secondWork:Promise<unknown>=first==='incident'?f.cancelGroup():target.finalize(f.first);second=observe(secondWork);await waitForBlockedBy(f.pool,trace.pids[0]);release.release();await unwrap(pending);
    if(first==='incident'){const result=await second;expect(result.ok).toBe(false);if(!result.ok)expect(result.error).toMatchObject({code:'GROUP_COMMITMENTS_BLOCK_OPERATION'});}
    else expect(await unwrap(second)).toMatchObject({state:'INCIDENT'});
    await assertIncident(f,f.first);expect((await f.pool.query('SELECT state FROM "AcademicGroup" WHERE id=$1',[f.groupId])).rows[0].state).toBe(first==='incident'?'PUBLISHED':'CANCELLED');
  }finally{release.release();await pending;await second;}
});
for(const change of ['texts-price','teacher'] as const)payment(`PP20 PV20 cambio ${change} no sustituye condiciones originales`,async f=>{
  const target=f.processor();
  if(change==='texts-price'){await f.pool.query('UPDATE "AcademicCourse" SET state=\'WITHDRAWN\' WHERE id=$1',[f.courseId]);await f.pool.query('UPDATE "AcademicCourse" SET name=\'Texto nuevo\' WHERE id=$1',[f.courseId]);await f.pool.query('UPDATE "AcademicCourse" SET state=\'PUBLISHED\' WHERE id=$1',[f.courseId]);await f.pool.query('UPDATE "CoursePrice" SET "amountMinor"=19000,revision=revision+1 WHERE "courseId"=$1',[f.courseId]);}
  else{const teacher=await sessionFixture(f,'TEACHER');await f.pool.query('UPDATE "AcademicGroup" SET state=\'WITHDRAWN\' WHERE id=$1',[f.groupId]);await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1',[f.groupId,teacher.userId]);await f.pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId","publishedTeacherEligibilityVersion"=(SELECT "eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"="teacherUserId") WHERE id=$1`,[f.groupId]);}
  const result=await target.finalize(f.first);expect(result.state).toBe('APPLIED');await assertApplied(f,result.paymentId);
  expect((await f.pool.query('SELECT "courseName","priceMinor"::text AS price FROM "EnrollmentOrderItem" WHERE "courseId"=$1',[f.courseId])).rows[0]).toEqual({courseName:'Curso previo ficticio',price:'12500'});
});
payment('PP25 PV25 conversión pausada cruza vencimiento; lector espera y proyecta matrícula',async f=>{
  const reached=latch(),release=latch();let paused=false;const trace=instrumentPool(f.pool,{before:async sql=>{if(!paused&&sql==='COMMIT'){paused=true;reached.release();await release.promise;}}}),target=f.processor(trace.pool);
  await f.boundary(-1);const conversion=observe(target.finalize(f.first));let reading:ReturnType<typeof observe<Awaited<ReturnType<ReturnType<typeof queriesTarget>['offerings']>>>>|undefined;
  try{await milestone(reached.promise,conversion);await f.boundary(1);await f.refreshSessions();reading=observe(queriesTarget(f,f.pool).offerings(f.actor,{page:1,pageSize:20}));await waitForBlockedBy(f.pool,trace.pids[0]);release.release();const result=await unwrap(conversion);await assertApplied(f,result.paymentId);
    const projection=await unwrap(reading);expect(projection.items.find(i=>i.groupId===f.groupId)).toMatchObject({reserved:0,occupied:1,available:0});expect(projection.evaluatedAt>=await f.time()).toBe(true);
  }finally{release.release();await conversion;await reading;}
});
payment('PP26 PV26 nueva topología provoca rollback antes de adquirir locks tardíos',async f=>{
  let changed=false;const teacher=await sessionFixture(f,'TEACHER');const trace=instrumentPool(f.pool,{after:async sql=>{
    if(!changed&&/SELECT/.test(sql)&&/AcademicGroup/.test(sql)&&!/FOR (UPDATE|SHARE)/.test(sql)){changed=true;await f.pool.query('UPDATE "AcademicGroup" SET state=\'WITHDRAWN\' WHERE id=$1',[f.groupId]);await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1',[f.groupId,teacher.userId]);await f.pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId","publishedTeacherEligibilityVersion"=(SELECT "eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"="teacherUserId") WHERE id=$1`,[f.groupId]);}
  }}),target=f.processor(trace.pool);const result=await target.finalize(f.first);expect(result.state).toBe('APPLIED');await assertApplied(f,result.paymentId);expect(changed).toBe(true);const rollback=trace.statements.findIndex(s=>s.sql==='ROLLBACK');expect(rollback).toBeGreaterThanOrEqual(0);
  expect(trace.statements.slice(0,rollback).some(s=>/extract\(epoch FROM clock_timestamp\(\)/.test(s.sql))).toBe(false);
});
payment('PP28 PV28 republicar y registrar seguimiento no resuelven la incidencia',async f=>{
  const target=f.processor();await f.pool.query('UPDATE "AcademicCourse" SET state=\'WITHDRAWN\' WHERE id=$1',[f.courseId]);expect((await target.finalize(f.first)).state).toBe('INCIDENT');const paymentId=await assertIncident(f,f.first),before=await counts(f);
  await f.pool.query('UPDATE "AcademicCourse" SET state=\'PUBLISHED\' WHERE id=$1',[f.courseId]);const incident=(await f.pool.query('SELECT id FROM "PaymentIncident" WHERE "verifiedPaymentId"=$1',[paymentId])).rows[0];
  await insertEnrollmentRow(f.pool,'IncidentFollowUp',{incidentId:incident.id,adminUserId:f.admin.userId,commandId:randomUUID(),content:'Seguimiento ficticio, sin resolución económica'});
  expect((await target.finalize(f.first)).state).toBe('INCIDENT');expect(await counts(f)).toEqual(before);await assertIncident(f,f.first);
});
payment('PP30 PV30 conjunto persistido, sesión revocada y recuperación canónica sin otro cobro',async f=>{
  f.processor();await f.sessions.revoke(f.student.secret);const applied=await paymentProcess(f,f.first);expect(applied.state).toBe('DONE');if(applied.state!=='DONE')throw new Error('No se finalizó el proceso de prueba.');const original=applied.result;expect(original.state).toBe('APPLIED');await assertApplied(f,original.paymentId);const before=await paymentRows(f);
  const recovered=await paymentProcess(f,f.first);expect(recovered.state).toBe('DONE');if(recovered.state==='DONE')expect(recovered.result).toMatchObject({state:'APPLIED',paymentId:original.paymentId,verificationFinishedAt:original.verificationFinishedAt});expect(await paymentRows(f)).toEqual(before);
});
test('PP31 PV20 US2.10 republicar y pagar tras inicio conserva plazo y condiciones originales',async()=>{
  const f=await paymentFixture({reservedAt:'2090-01-02T04:00:00.123456Z'});
  try{
    await f.pool.query(`UPDATE "AcademicCourse" SET state='WITHDRAWN' WHERE id=$1`,[f.courseId]);
    await f.set('2090-01-02T05:00:00.123456Z');await f.refreshSessions();
    await f.pool.query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`,[f.courseId]);
    expect(await counts(f)).toEqual({payments:0,enrollments:0,incidents:0,reserved:2,converted:0,expired:0});
    const result=await f.processor().finalize(f.first);expect(result.state).toBe('APPLIED');await assertApplied(f,result.paymentId);
    expect((await f.pool.query(`SELECT bool_and(p."verificationFinishedAt">=i."groupStartAt" AND p."verificationFinishedAt"<o."expiresAt") AS within
      FROM "VerifiedPayment" p JOIN "EnrollmentOrder" o ON o.id=p."orderId" JOIN "EnrollmentOrderItem" i ON i."orderId"=o.id WHERE p.id=$1`,[result.paymentId])).rows[0].within).toBe(true);
    expect(f.original.confirmedAt).toBe('2090-01-02T04:00:00.123456Z');expect(f.original.expiresAt).toBe('2090-01-03T04:00:00.123456Z');
  }finally{await f.close();}
},120000);
payment('PP32 PV01 US2.12 matrícula previa oculta del mismo curso impide toda conversión',async f=>{
  const hiddenGroup=randomUUID();
  await f.pool.query('INSERT INTO "AcademicGroup" (id,"courseId",name) VALUES ($1,$2,$3)',[hiddenGroup,f.courseId,'Antecedente oculto ficticio']);
  await seedCommitment({...f,groupId:hiddenGroup},'ENROLLED',f.pool,'999');
  const previous=(await f.pool.query('SELECT to_jsonb(e) AS row FROM "Enrollment" e')).rows;
  const result=await f.processor().finalize(f.first);expect(result.state).toBe('INCIDENT');const paymentId=await assertIncident(f,f.first,{enrollments:1});
  expect(await counts(f)).toEqual({payments:2,enrollments:1,incidents:1,reserved:2,converted:1,expired:0});
  expect((await f.pool.query('SELECT to_jsonb(e) AS row FROM "Enrollment" e')).rows).toEqual(previous);
  expect((await f.pool.query('SELECT reason FROM "PaymentIncident" WHERE "verifiedPaymentId"=$1',[paymentId])).rows[0].reason).toBe('COURSE_COMMITMENT_EXISTS');
  expect((await f.pool.query('SELECT state,revision::text FROM "EnrollmentOrder" WHERE id=$1',[f.original.id])).rows[0]).toEqual({state:'RESERVED',revision:'1'});
});
