import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { expect, test } from 'vitest';
import { processingFixture, queriesTarget, queueRequest, observe, milestone, unwrap } from '../support/reservation-processing.js';
import type { ReservationAdmissionFixture } from '../support/reservation-admission.js';
import { financialFingerprint, seedCommitment } from '../support/enrollment-maintenance.js';
import { instrumentPool, latch } from '../support/academic-foundation-contract.js';
import { waitForBlockedBy } from '../support/locks.js';
import { sessionFixture } from '../support/session-fixture.js';

function query(name:string,body:(f:ReservationAdmissionFixture)=>Promise<void>,http=false){
  test(name,async()=>{const f=await processingFixture(http);try{await body(f);}finally{await f.close();}},120000);
}
const page={page:1,pageSize:20};
const exactTime=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/;
/** Conversión ficticia con token previo al vencimiento. No es finalizador de pago. */
async function conversionFacts(holder:PoolClient){
  const paymentId=randomUUID();
  await holder.query(`INSERT INTO "VerifiedPayment" (id,"providerScope","providerPaymentId","orderId","amountUnits","amountScale",currency,"merchantReference","verificationFinishedAt","reconciliationState","normalizedEvidenceReference")
    SELECT $1::uuid,'fixture/provider/merchant/sandbox',$2::text,id,12500,2,'PEN','fixture-conversion',"expiresAt"-interval '1 microsecond','APPLIED','fixture-conversion' FROM "EnrollmentOrder"`,[paymentId,paymentId]);
  await holder.query(`UPDATE "SeatReservation" SET state='CONVERTED'`);
  await holder.query(`INSERT INTO "Enrollment" ("orderItemId","studentId","courseId","groupId","paymentId","confirmedAt","originalPeriodStart","originalPeriodEnd","timeZone","scheduleSnapshot","validUntil")
    SELECT i.id,o."studentId",i."courseId",i."groupId",$1,o."expiresAt"-interval '1 microsecond',i."periodStart",i."periodEnd",i."timeZone",i."scheduleSnapshot",i."enrollmentValidUntil" FROM "EnrollmentOrderItem" i JOIN "EnrollmentOrder" o ON o.id=i."orderId"`,[paymentId]);
  await holder.query(`UPDATE "EnrollmentOrder" SET state='ENROLLED',revision=revision+1`);
}
query('RQ00a auxiliar: fixture de compromiso vencido mantiene hechos históricos',async f=>{
  await seedCommitment(f,'DEADLINE_PASSED');
  expect((await f.pool.query('SELECT state,"expiresAt"<clock_timestamp() AS expired FROM "EnrollmentOrder"')).rows).toEqual([{state:'RESERVED',expired:true}]);
});
query('RQ00b auxiliar: hechos de conversión son válidos y lector SQL espera FOR SHARE',async f=>{
  await seedCommitment(f,'DEADLINE_PASSED');const holder=await f.pool.connect(),waiter=await f.pool.connect();let pending:Promise<unknown>|undefined;
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.groupId]);await conversionFacts(holder);
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending=waiter.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR SHARE',[f.groupId]);
    try{await waitForBlockedBy(f.pool,pid);}finally{await holder.query('COMMIT');}await pending;
    expect((await f.pool.query('SELECT count(*)::int AS n FROM "Enrollment"')).rows[0].n).toBe(1);
  }finally{await holder.query('ROLLBACK');await pending?.catch(()=>undefined);holder.release();waiter.release();}
});
query('RQ00c auxiliar: sobreocupación física posible entre dos alumnos',async f=>{
  await seedCommitment(f,'RESERVED');const other=await sessionFixture(f,'STUDENT');await seedCommitment({...f,student:other},'ENROLLED',f.pool,'2');
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "SeatReservation"')).rows[0].n).toBe(2);
});
query('RQ00d legado 002 conserva contador no calculado, null/null',async f=>{
  const response=await f.http!.get(`/academic/courses/${f.courseId}/groups/${f.groupId}`,f.student.secret);
  expect(response.status).toBe(200);expect((await response.json()).data).toMatchObject({capacityStatus:'NOT_CALCULATED',occupancy:null,availability:null});
},true);
query('RQ01 oferta sin compromisos calcula capacidad real y evaluatedAt sin escribir',async f=>{
  const before=await financialFingerprint(f.pool),result=await queriesTarget(f).offerings(f.actor,page);
  expect(result.items).toHaveLength(2);expect(result.evaluatedAt).toMatch(exactTime);
  for(const item of result.items)expect(item).toMatchObject({capacity:1,reserved:0,occupied:0,available:1,priceMinor:'12500'});
  expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const [kind,reserved,occupied]of [['RESERVED',1,0],['ENROLLED',0,1],['EXPIRED',0,0],['DEADLINE_PASSED',0,0],['FINISHED',0,0]] as const){
  query(`RQ02 inventario efectivo ${kind}: no cuenta dos veces ni exige worker`,async f=>{
    await seedCommitment(f,kind);const before=await financialFingerprint(f.pool),result=await queriesTarget(f).offerings(f.actor,page);
    expect(result.items.find(i=>i.groupId===f.groupId)).toMatchObject({reserved,occupied,available:1-reserved-occupied});
    expect(await financialFingerprint(f.pool)).toBe(before);
  });
}
query('RQ03 precio sin definir se conserva como ausencia; cero explícito es diferente',async f=>{
  await f.pool.query('DELETE FROM "CoursePrice" WHERE "courseId"=$1',[f.courseId]);
  await f.pool.query('UPDATE "CoursePrice" SET "amountMinor"=0,revision=revision+1 WHERE "courseId"=$1',[f.otherCourseId]);
  const result=await queriesTarget(f).offerings(f.actor,page);
  expect(result.items.find(i=>i.groupId===f.groupId)?.priceMinor).toBeNull();
  expect(result.items.find(i=>i.groupId===f.otherGroupId)?.priceMinor).toBe('0');
});
query('RQ04 preview multigrupo totaliza en servidor sin admisión, plazo o retención',async f=>{
  const before=await financialFingerprint(f.pool),result=await queriesTarget(f).preview(f.actor,[f.otherGroupId,f.groupId]);
  expect(result.totalMinor).toBe('25000');expect(result.items).toHaveLength(2);expect(result.evaluatedAt).toMatch(exactTime);
  expect(await financialFingerprint(f.pool)).toBe(before);expect((await f.counts()).requests).toBe(0);
});
query('RQ05 histórico original oculto sigue propio, sin habilitar pago',async f=>{
  await seedCommitment(f,'RESERVED');const order=(await f.pool.query('SELECT id FROM "EnrollmentOrder"')).rows[0];
  await f.pool.query('UPDATE "AcademicGroup" SET state=\'WITHDRAWN\' WHERE id=$1',[f.groupId]);
  const result=await queriesTarget(f).order(f.actor,order.id);
  expect(result).toMatchObject({id:order.id,state:'RESERVED',paymentAllowed:false});expect(result?.serverNow).toMatch(exactTime);
  expect(JSON.stringify(result?.items)).toContain('Curso original ficticio');
  expect((await queriesTarget(f).offerings(f.actor,page)).items.some(i=>i.groupId===f.groupId)).toBe(false);
  expect(JSON.stringify(result)).not.toMatch(/actorSessionReference|authVersion|teacherEligibilityVersion|providerPaymentId|normalizedEvidenceReference/);
});
query('RQ06 orden ajena y UUID inexistente producen la misma ausencia',async f=>{
  await seedCommitment(f,'RESERVED');const id=(await f.pool.query('SELECT id FROM "EnrollmentOrder"')).rows[0].id;
  const other=await sessionFixture(f,'STUDENT'),actor=(await f.sessions.lookup(other.secret))!;
  expect(await queriesTarget(f).order(actor,id)).toBeNull();expect(await queriesTarget(f).order(actor,randomUUID())).toBeNull();
});
for(const kind of ['EXPIRED','ENROLLED','DEADLINE_PASSED'] as const)query(`RQ07 current no confunde histórico ${kind} con reserva vigente`,async f=>{
  await seedCommitment(f,kind);expect(await queriesTarget(f).currentOrder(f.actor)).toBeNull();
});
query('RQ08 P06/PV25 lector espera conversión y evalúa en sentencia posterior al bloqueo',async f=>{
  // Un tercero evita que la FK de Enrollment retenga la cuenta del lector antes
  // del grupo. La autorización del actor sigue siendo real y no se debilita.
  const other=await sessionFixture(f,'STUDENT');await seedCommitment({...f,student:other},'DEADLINE_PASSED');
  const entered=latch(),trace=instrumentPool(f.pool,{before:sql=>{if(/AcademicGroup/.test(sql)&&/FOR SHARE/.test(sql))entered.release();}});
  const target=queriesTarget(f,trace.pool),holder=await f.pool.connect();let pending:ReturnType<typeof observe<Awaited<ReturnType<typeof target.offerings>>>>|undefined;
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.groupId]);
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    // Hechos ficticios de una conversión que capturó su token antes del vencimiento
    // y aún no confirmó. No ejecuta ni acredita al finalizador de pagos.
    await conversionFacts(holder);
    pending=observe(target.offerings(f.actor,page));await milestone(entered.promise,pending);await waitForBlockedBy(f.pool,pid);
    const beforeCommit=(await holder.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`)).rows[0].at;
    await holder.query('COMMIT');const result=await unwrap(pending);
    expect(result.items.find(i=>i.groupId===f.groupId)).toMatchObject({reserved:0,occupied:1,available:0});expect(result.evaluatedAt>=beforeCommit).toBe(true);
    const lock=trace.statements.findIndex(s=>/AcademicGroup/.test(s.sql)&&/FOR SHARE/.test(s.sql));
    expect(trace.statements.findIndex((s,i)=>i>lock&&/clock_timestamp\(\)/.test(s.sql))).toBeGreaterThan(lock);
    expect(trace.statements.some(s=>/DispatchState|AdmissionSequence|SKIP LOCKED/.test(s.sql))).toBe(false);
  }finally{await holder.query('ROLLBACK');await pending;holder.release();}
});
query('RQ08b P06 conversión propia espera primero cuenta, luego observa matrícula confirmada',async f=>{
  await seedCommitment(f,'DEADLINE_PASSED');const entered=latch(),trace=instrumentPool(f.pool,{before:sql=>{
    if(/FROM "User"/.test(sql)&&/FOR UPDATE/.test(sql))entered.release();
  }}),target=queriesTarget(f,trace.pool),holder=await f.pool.connect();
  let pending:ReturnType<typeof observe<Awaited<ReturnType<typeof target.offerings>>>>|undefined;
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.groupId]);
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;await conversionFacts(holder);
    pending=observe(target.offerings(f.actor,page));await milestone(entered.promise,pending);await waitForBlockedBy(f.pool,pid);
    expect(trace.statements.some(s=>/AcademicGroup/.test(s.sql))).toBe(false);
    const beforeCommit=(await holder.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`)).rows[0].at;
    await holder.query('COMMIT');const result=await unwrap(pending);
    expect(result.items.find(i=>i.groupId===f.groupId)).toMatchObject({reserved:0,occupied:1,available:0});
    expect(result.evaluatedAt>=beforeCommit).toBe(true);
  }finally{await holder.query('ROLLBACK');await pending;holder.release();}
});
query('RQ09 inventario anómalo produce temporal, sin ceros ni clamp',async f=>{
  await seedCommitment(f,'RESERVED');
  // Una segunda matrícula de otro titular es físicamente válida y excede capacity=1.
  const other=await sessionFixture(f,'STUDENT');await seedCommitment({...f,student:other},'ENROLLED',f.pool,'2');
  await expect(queriesTarget(f).offerings(f.actor,page)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
query('RQ10 timeout de lock 55P03 se traduce a temporal sin DTO parcial',async f=>{
  let injected=0;const trace=instrumentPool(f.pool,{before:sql=>{if(/AcademicGroup/.test(sql)&&/FOR SHARE/.test(sql)){injected++;throw Object.assign(new Error('fixture lock timeout'),{code:'55P03'});}}});
  await expect(queriesTarget(f,trace.pool).offerings(f.actor,page)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(injected).toBe(1);
});
query('RQ11 PV26 topología nueva obliga redescubrir antes de proyectar toda la página',async f=>{
  let added=false;const newGroup=randomUUID();
  const trace=instrumentPool(f.pool,{after:async sql=>{
    if(!added&&/AcademicGroup/.test(sql)&&/SELECT/i.test(sql)&&!/FOR (UPDATE|SHARE)/.test(sql)){
      added=true;
      await f.pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,capacity,"periodStart","periodEnd","teacherUserId") VALUES ($1,$2,'Grupo nuevo ficticio',1,'2090-01-02','2090-03-31',$3)`,[newGroup,f.otherCourseId,f.teacher.userId]);
      await f.pool.query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,3,1080,1140)',[newGroup]);
      await f.pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId","publishedTeacherEligibilityVersion"=(SELECT "eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"="teacherUserId") WHERE id=$1`,[newGroup]);
    }
  }});
  const result=await queriesTarget(f,trace.pool).offerings(f.actor,page);
  expect(added).toBe(true);
  // P06 permite proyectar solo el conjunto ya cubierto. Si incorpora la nueva
  // referencia, debe abortar y redescubrir; no tomar locks tardíos sobre esa fila.
  if(result.items.some(i=>i.groupId===newGroup))expect(trace.statements.some(s=>s.sql==='ROLLBACK')).toBe(true);
  else expect(result.items.map(i=>i.groupId).sort()).toEqual([f.groupId,f.otherGroupId].sort());
  expect(trace.statements.some(s=>/AcademicGroup/.test(s.sql)&&/FOR UPDATE/.test(s.sql))).toBe(false);
});
query('RQ12 HTTP oferta devuelve DTO financiero y no-store',async f=>{
  const response=await f.http!.get('/enrollment/offerings',f.student.secret);
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify(await response.json())).toMatch(/evaluatedAt/);
},true);
for(const route of ['/enrollment/offerings','/enrollment/orders','/enrollment/orders/current','/enrollment/reservation-requests'])query(`RQ13 HTTP ${route} exige sesión`,async f=>{
  const response=await f.http!.get(route);expect(response.status).toBe(401);expect((await response.json()).error.code).toBe('AUTH_REQUIRED');
},true);
for(const suffix of ['?page=0','?pageSize=51','?studentId='+randomUUID()])query(`RQ14 HTTP query cerrada ${suffix.split('=')[0]}`,async f=>{
  const response=await f.http!.get('/enrollment/offerings'+suffix,f.student.secret);expect(response.status).toBe(400);expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
},true);
query('RQ15 HTTP preview no crea solicitud ni retención',async f=>{
  const before=await financialFingerprint(f.pool),response=await f.http!.post('/enrollment/selection-preview',{groupIds:[f.groupId,f.otherGroupId]},f.student.secret);
  expect(response.status).toBe(200);expect(JSON.stringify(await response.json())).toContain('25000');expect(await financialFingerprint(f.pool)).toBe(before);
},true);
query('RQ16 recuperación HTTP enumera solicitud propia sin posición de terceros',async f=>{
  const request=await queueRequest(f),response=await f.http!.get('/enrollment/reservation-requests/'+request.intentionId,f.student.secret);
  expect(response.status).toBe(200);const body=await response.json();expect(JSON.stringify(body)).toContain('ADMITTED');expect(JSON.stringify(body)).not.toMatch(/admissionSequence|actorSessionReference|authVersion/);
},true);
query('RQ17 HTTP timeout de grupo devuelve 503 sin cifras ficticias',async f=>{
  const holder=await f.pool.connect();
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.groupId]);
    const response=await f.http!.get('/enrollment/offerings',f.student.secret);
    expect(response.status).toBe(503);const body=await response.json();expect(body.error.code).toBe('TEMPORARILY_UNAVAILABLE');expect(body.data).toBeUndefined();
  }finally{await holder.query('ROLLBACK');holder.release();}
},true);
