import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { preEnrollmentDatabase } from '../support/enrollment-migration.js';
import { financialFingerprint, seedCommitment } from '../support/enrollment-maintenance.js';
import type { CommitmentFixture } from '../support/enrollment-maintenance.js';
import { us1Http } from '../support/us1-http.js';
import { sessionFixture } from '../support/session-fixture.js';
import { waitForBlockedBy } from '../support/locks.js';
import { instrumentPool, latch } from '../support/academic-foundation-contract.js';
import { existingCommands } from '../support/academic-maintenance.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { createSystemEnrollmentTransaction } from '../../src/infrastructure/database/enrollment-transaction.js';
import { createPreparationStore } from '../../src/modules/academic-offering/infrastructure/offering-store.js';
import { createGroupCommitmentPolicy } from '../../src/modules/enrollment/infrastructure/commitments.js';

async function fixture(kind:CommitmentFixture){
  const context=await preEnrollmentDatabase();let http:Awaited<ReturnType<typeof us1Http>>|undefined;
  try{
    await context.applyEnrollment();const pool=context.database.pool;
    await pool.query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`,[context.courseId]);
    await pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"periodStart"='2090-01-02',"periodEnd"='2090-03-31',"publishedTeacherUserId"="teacherUserId",
      "publishedTeacherEligibilityVersion"=(SELECT "eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"="teacherUserId") WHERE id=$1`,[context.groupId]);
    await pool.query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`,[context.groupId]);
    await seedCommitment(context,kind);http=await us1Http({context});const server=http;
    const path=`/admin/academic/groups/${context.groupId}`;
    async function request(method:string,suffix:string,body:Record<string,unknown>={},revision='1'){
      return fetch(`${server.url}/api/v1${path}${suffix}`,{method,headers:server.headers(context.admin.secret),body:JSON.stringify({commandId:randomUUID(),expectedRevision:revision,...body})});
    }
    async function group(){return (await pool.query('SELECT to_jsonb(g) AS row FROM "AcademicGroup" g WHERE id=$1',[context.groupId])).rows[0].row;}
    return {context,pool,http:server,path,request,group,async cleanup(){try{await server.close();}finally{await context.cleanup();}}};
  }catch(e){try{await http?.close();}finally{await context.cleanup();}throw e;}
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
function maintenance(name:string,kind:CommitmentFixture,body:(f:Fixture)=>Promise<void>){test(name,async()=>{const f=await fixture(kind);try{await body(f);}finally{await f.cleanup();}},120000);}
type Change='period'|'capacity'|'schedule'|'cancel';
function mutate(f:Fixture,change:Change){
  return change==='cancel'?f.request('POST','/cancel',{cancellationReason:'Motivo ficticio'}):change==='schedule'?f.request('PUT','/schedule',{schedule:[{dayOfWeek:2,startTime:'18:00',endTime:'19:00'}]}):f.request('PATCH','',change==='capacity'?{capacity:3}:{periodEnd:'2090-04-30'});
}
for(const kind of ['RESERVED','ENROLLED','INCIDENT'] as const)for(const change of ['period','capacity','schedule','cancel'] as const){
  maintenance(`EMT01 ${kind} bloquea ${change}`,kind,async f=>{
    const before=await f.group(),financial=await financialFingerprint(f.pool);
    const response=await mutate(f,change);expect(response.status).toBe(409);
    const body=await response.json();expect(body.error.code).toBe('GROUP_COMMITMENTS_BLOCK_OPERATION');
    expect(JSON.stringify(body)).not.toMatch(/studentId|paymentId|12500|LATE_PAYMENT/);
    expect(await f.group()).toEqual(before);expect(await financialFingerprint(f.pool)).toBe(financial);
  });
}
for(const kind of ['NONE','EXPIRED','FINISHED','DEADLINE_PASSED'] as const)for(const change of ['period','cancel'] as const){
  maintenance(`EMT02 historial ${kind} permite ${change}`,kind,async f=>{
    const before=await financialFingerprint(f.pool);expect((await mutate(f,change)).status).toBe(200);expect(await financialFingerprint(f.pool)).toBe(before);
    if(change==='cancel'){
      const response=await f.request('POST','/publish',{},'2');expect(response.status).toBe(409);expect((await response.json()).error.code).toBe('OFFERING_STATE_CONFLICT');
    }
  });
}
maintenance('EMT03 texto/docente preservan snapshots y publicación es explícita','RESERVED',async f=>{
  const before=await financialFingerprint(f.pool),replacement=await sessionFixture(f.context,'TEACHER');
  expect((await f.request('PATCH','',{name:'Nombre actual ficticio',teacherUserId:replacement.userId})).status).toBe(200);
  expect(await financialFingerprint(f.pool)).toBe(before);
  expect((await f.http.get(`/academic/courses/${f.context.courseId}/groups/${f.context.groupId}`,f.context.student.secret)).status).toBe(404);
  const response=await f.request('POST','/publish',{},'2');expect(response.status).toBe(200);
  expect((await response.json()).data.resource).toMatchObject({revision:'3',state:'PUBLISHED',studentVisible:true});
  expect(await financialFingerprint(f.pool)).toBe(before);
});
maintenance('EMT04 curso inmutable incluso sin compromisos','NONE',async f=>{
  const before=await f.group();const response=await f.request('PATCH','',{courseId:f.context.otherCourseId});expect(response.status).toBe(400);expect(await f.group()).toEqual(before);
  await expect(f.pool.query('UPDATE "AcademicGroup" SET "courseId"=$2 WHERE id=$1',[f.context.groupId,f.context.otherCourseId])).rejects.toMatchObject({code:'23514'});
});
maintenance('EMT05 descripción opcional: null inicial, texto normalizado y null explícito','RESERVED',async f=>{
  const response=await f.http.get(f.path,f.context.admin.secret);expect(response.status).toBe(200);expect((await response.json()).data).toHaveProperty('description',null);
  const before=await financialFingerprint(f.pool),text=await f.request('PATCH','',{description:'  Descripción ficticia  '});expect(text.status).toBe(200);
  expect((await text.json()).data.resource.description).toBe('Descripción ficticia');
  const cleared=await f.request('PATCH','',{description:null},'2');expect(cleared.status).toBe(200);expect((await cleared.json()).data.resource.description).toBeNull();
  expect(await financialFingerprint(f.pool)).toBe(before);
});
maintenance('EMT06 retirar no libera compromisos y revisión obsoleta no publica','ENROLLED',async f=>{
  expect((await f.request('POST','/publish')).status).toBe(200);const before=await financialFingerprint(f.pool);
  expect((await f.request('POST','/withdraw',{},'2')).status).toBe(200);
  expect(await financialFingerprint(f.pool)).toBe(before);const stale=await f.request('POST','/publish',{},'2');expect(stale.status).toBe(409);
  expect((await f.request('POST','/publish',{},'3')).status).toBe(200);expect(await financialFingerprint(f.pool)).toBe(before);
});
maintenance('EMT07 recuperar habilitación docente exige revisión y republicación explícitas','NONE',async f=>{
  expect((await f.request('POST','/publish')).status).toBe(200);
  await f.pool.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`,[f.context.teacher.userId]);
  await f.pool.query(`UPDATE "User" SET status='ACTIVE',"disabledAt"=NULL WHERE id=$1`,[f.context.teacher.userId]);
  const get=()=>f.http.get(`/academic/courses/${f.context.courseId}/groups/${f.context.groupId}`,f.context.student.secret);
  expect((await get()).status).toBe(404);expect((await f.request('POST','/withdraw',{},'2')).status).toBe(200);
  expect((await f.request('POST','/publish',{},'3')).status).toBe(200);expect((await get()).status).toBe(200);
});
maintenance('EMT08 carrera: compromiso confirma primero y escritor HTTP espera/relee','NONE',async f=>{
  const holder=await f.pool.connect();let pending:Promise<Response>|undefined;
  try{
    await holder.query('BEGIN');const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM "User" WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[f.context.student.userId,f.context.teacher.userId]]);
    await holder.query('SELECT id FROM "AcademicCourse" WHERE id=$1 FOR UPDATE',[f.context.courseId]);
    await holder.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.context.groupId]);
    await seedCommitment(f.context,'RESERVED',holder);pending=mutate(f,'cancel');
    await waitForBlockedBy(f.pool,pid);await holder.query('COMMIT');
    const response=await pending;expect(response.status).toBe(409);expect((await response.json()).error.code).toBe('GROUP_COMMITMENTS_BLOCK_OPERATION');
    expect((await f.group()).state).toBe('WITHDRAWN');
  }finally{await holder.query('ROLLBACK');holder.release();await pending?.catch(()=>undefined);}
});
maintenance('EMT09 carrera: cancelación confirma primero y participante posterior observa terminal','NONE',async f=>{
  const entered=latch(),release=latch();let held=false;
  const trace=instrumentPool(f.pool,{before:async sql=>{if(sql==='COMMIT'&&!held){held=true;entered.release();await release.promise;}}});
  const sessions=new PostgresSessionStore(f.pool),actor=(await sessions.lookup(f.context.admin.secret))!;
  const cancel=existingCommands(trace.pool,sessions).execute(actor,{operation:'GROUP_CANCEL',groupId:f.context.groupId,commandId:randomUUID(),expectedRevision:'1',cancellationReason:'Motivo ficticio'},{requestId:randomUUID()});
  let read:Promise<string>|undefined;
  try{
    await entered.promise;const topology={accountIds:[f.context.teacher.userId],courseIds:[f.context.courseId],groupIds:[f.context.groupId],orderIds:[],attemptIds:[],receiptIds:[],paymentIds:[],enrollmentIds:[],incidentIds:[]};
    read=createSystemEnrollmentTransaction(f.pool)({discover:async()=>topology,recheck:async()=>topology,apply:async c=>(await c.client.query('SELECT state FROM "AcademicGroup" WHERE id=$1',[f.context.groupId])).rows[0].state});
    await waitForBlockedBy(f.pool,trace.pids[0]);release.release();await cancel;expect(await read).toBe('CANCELLED');
  }finally{release.release();await cancel.catch(()=>undefined);await read?.catch(()=>undefined);}
});
maintenance('EMT10 guard ausente falla cerrado sin efecto ni resultado','NONE',async f=>{
  const sessions=new PostgresSessionStore(f.pool),actor=(await sessions.lookup(f.context.admin.secret))!;
  const before=await f.group(),financial=await financialFingerprint(f.pool);
  const store=createPreparationStore(f.pool,{revalidateInTransaction:sessions.revalidateInTransaction.bind(sessions)});
  await expect(store.execute(actor,{operation:'GROUP_EDIT',groupId:f.context.groupId,commandId:randomUUID(),expectedRevision:'1',changes:{capacity:3}},{requestId:randomUUID()})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(await f.group()).toEqual(before);expect(await financialFingerprint(f.pool)).toBe(financial);
});
maintenance('EMT11 replay anterior no se invalida por compromisos posteriores','NONE',async f=>{
  const commandId=randomUUID(),input={commandId,expectedRevision:'1',capacity:3};
  const send=()=>fetch(`${f.http.url}/api/v1${f.path}`,{method:'PATCH',headers:f.http.headers(f.context.admin.secret),body:JSON.stringify(input)});
  expect((await send()).status).toBe(200);await seedCommitment(f.context,'RESERVED');const before=await financialFingerprint(f.pool);
  const response=await send();expect(response.status).toBe(200);expect((await response.json()).data.command).toMatchObject({id:commandId,replayed:true,appliedRevision:'2'});
  expect(await financialFingerprint(f.pool)).toBe(before);expect((await f.group()).revision).toBe(2);
});
for(const kind of ['RESERVED','ENROLLED'] as const)maintenance(`EMT12 precisión y frontera exclusiva ${kind}`,kind,async f=>{
  const topology={accountIds:[f.context.teacher.userId],courseIds:[f.context.courseId],groupIds:[f.context.groupId],orderIds:[],attemptIds:[],receiptIds:[],paymentIds:[],enrollmentIds:[],incidentIds:[]};
  const run=createSystemEnrollmentTransaction(f.pool);
  await run({discover:async()=>topology,recheck:async()=>topology,apply:async c=>{
    const table=kind==='RESERVED'?'EnrollmentOrder':'Enrollment',end=kind==='RESERVED'?'expiresAt':'validUntil';
    const row=(await c.client.query(`SELECT (extract(epoch FROM "confirmedAt")*1000000)::numeric(30,0)::text AS start,
      (extract(epoch FROM "${end}")*1000000)::numeric(30,0)::text AS finish FROM "${table}" LIMIT 1`)).rows[0];
    const start=BigInt(row.start),finish=BigInt(row.finish),policy=createGroupCommitmentPolicy(c.client,c.locked.groupIds,c.assertActive);
    for(const [evaluatedAt,allowed] of [[start-1n,true],[start,false],[finish-1n,false],[finish,true]] as const){
      expect(await policy.check({groupId:f.context.groupId,change:{operation:'GROUP_CANCEL'},evaluatedAt})).toEqual(allowed?{allowed:true}:{allowed:false,reason:'GROUP_HAS_COMMITMENTS'});
    }
    await expect(policy.check({groupId:f.context.otherCourseId,change:{operation:'GROUP_CANCEL'},evaluatedAt:finish})).rejects.toThrow('cobertura');
  }});
});
maintenance('EMT13 seguimiento no resuelve incidente fiable','NONE',async f=>{
  // Usar un incidente fiable y agregar seguimiento no elimina el bloqueo económico.
  await seedCommitment(f.context,'INCIDENT');
  const incident=(await f.pool.query('SELECT id FROM "PaymentIncident" LIMIT 1')).rows[0].id;
  await f.pool.query('INSERT INTO "IncidentFollowUp" ("incidentId","adminUserId","commandId","recordedAt",content) VALUES ($1,$2,$3,clock_timestamp(),$4)',[incident,f.context.admin.userId,randomUUID(),'Anotación ficticia']);
  const response=await mutate(f,'cancel');expect(response.status).toBe(409);expect((await response.json()).error.code).toBe('GROUP_COMMITMENTS_BLOCK_OPERATION');
});
maintenance('EMT15 referencia desconocida sin grupos no bloquea cancelación','NONE',async f=>{
  const payment=randomUUID();
  await f.pool.query(`INSERT INTO "VerifiedPayment" (id,"providerScope","providerPaymentId","orderId","amountUnits","amountScale",currency,"merchantReference","verificationFinishedAt","reconciliationState","normalizedEvidenceReference")
    VALUES ($1,'fixture/provider/merchant/sandbox',$2,NULL,12500,2,'PEN','unknown-fixture',clock_timestamp(),'INCIDENT','fixture-unknown')`,[payment,randomUUID()]);
  await f.pool.query(`INSERT INTO "PaymentIncident" ("orderId","verifiedPaymentId",reason,"affectedGroupIds","openedAt") VALUES (NULL,$1,'UNKNOWN_REFERENCE','{}',clock_timestamp())`,[payment]);
  const before=await financialFingerprint(f.pool);expect((await mutate(f,'cancel')).status).toBe(200);expect(await financialFingerprint(f.pool)).toBe(before);
});
maintenance('EMT16 cancelación de grupo publicado también pasa por el guard','RESERVED',async f=>{
  expect((await f.request('POST','/publish')).status).toBe(200);
  const before=await f.group(),response=await f.request('POST','/cancel',{cancellationReason:'Motivo ficticio'},'2');
  expect(response.status).toBe(409);expect((await response.json()).error.code).toBe('GROUP_COMMITMENTS_BLOCK_OPERATION');expect(await f.group()).toEqual(before);
});
maintenance('EMT17 reenvío de condiciones idénticas permite texto y NO_CHANGE','RESERVED',async f=>{
  const before=await financialFingerprint(f.pool);
  const changed=await f.request('PATCH','',{name:'Texto actualizado',timeZone:'America/Lima',periodStart:'2090-01-02',periodEnd:'2090-03-31',capacity:2});
  expect(changed.status).toBe(200);expect((await changed.json()).data.resource.name).toBe('Texto actualizado');
  const same=await f.request('PATCH','',{capacity:2},'2');expect(same.status).toBe(200);expect((await same.json()).data.command).toMatchObject({result:'NO_CHANGE',appliedRevision:'2'});
  const slots=await f.request('PUT','/schedule',{schedule:[{dayOfWeek:1,startTime:'18:00',endTime:'19:00'}]},'2');expect(slots.status).toBe(200);expect((await slots.json()).data.command.result).toBe('NO_CHANGE');
  expect(await financialFingerprint(f.pool)).toBe(before);
});
maintenance('EMT14 descripción: blanco normaliza null, omisión conserva y tipo inválido no cambia','RESERVED',async f=>{
  expect((await f.request('PATCH','',{description:'Texto ficticio'})).status).toBe(200);
  expect((await f.request('PATCH','',{name:'Otro texto'},'2')).status).toBe(200);expect((await f.group()).description).toBe('Texto ficticio');
  const invalid=await f.request('PATCH','',{description:42},'3');expect(invalid.status).toBe(400);
  const blank=await f.request('PATCH','',{description:' \t\n '},'3');expect(blank.status).toBe(200);expect((await blank.json()).data.resource.description).toBeNull();
  expect((await f.request('POST','/publish',{},'4')).status).toBe(200);
  expect((await f.request('PATCH','',{description:'No permitido publicado'},'5')).status).toBe(409);
});
