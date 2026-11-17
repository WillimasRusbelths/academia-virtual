import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { reservationAdmissionFixture, expiredAdmissionFixture, seedAdmissionSource, commitmentRows, installAdmissionSerializationFault } from '../support/reservation-admission.js';
import type { ReservationAdmissionFixture } from '../support/reservation-admission.js';
import { instrumentPool, latch } from '../support/academic-foundation-contract.js';
import { waitForBlockedBy } from '../support/locks.js';
import { sessionFixture } from '../support/session-fixture.js';
import { financialFingerprint, seedCommitment } from '../support/enrollment-maintenance.js';
import type { ReservationAdmissionResult } from '../../src/modules/enrollment/application/reserve.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';

function admission(name:string,body:(f:ReservationAdmissionFixture)=>Promise<void>,http=false){
  test(name,async()=>{const f=await reservationAdmissionFixture(http);try{await body(f);}finally{await f.close();}},120000);
}
type Observed<T>={ok:true;value:T}|{ok:false;error:unknown};
const observe=<T>(work:Promise<T>):Promise<Observed<T>>=>work.then(value=>({ok:true,value}),error=>({ok:false,error}));
async function unwrap<T>(work:Promise<Observed<T>>):Promise<T>{const result=await work;if(!result.ok)throw result.error;return result.value;}
async function milestone<T>(signal:Promise<void>,work:Promise<Observed<T>>){
  await Promise.race([signal,work.then(result=>{if(!result.ok)throw result.error;throw new Error('No se alcanzó el punto de bloqueo esperado.');})]);
}
const requestRoute='/enrollment/reservation-requests';
async function responseError(response:Response,status:number,code:string){expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toBe('no-store');expect((await response.json()).error).toMatchObject({code,requestId:expect.stringMatching(/^[0-9a-f-]{36}$/)});}

admission('RA00a auxiliar: PG real, autoridad y migración; no aceptación de admisión',async f=>{
  expect((await f.pool.query('SHOW server_version')).rows[0].server_version).toMatch(/^16\./);
  expect(f.environment.appEnv).toBe('test');expect(f.isolated.schema).toMatch(/^t_/);
  expect(await f.counts()).toEqual({requests:0,orders:0,seats:0,commands:0,next:'1'});
  const client=await f.pool.connect();try{await client.query('BEGIN');await f.authorization.revalidateInTransaction(client,f.actor,'enrollment:reserve-own');}finally{await client.query('ROLLBACK');client.release();}
});
admission('RA00b auxiliar: fixture histórica válida sin llamar al objetivo',async f=>{
  const source=await seedAdmissionSource(f),past=await expiredAdmissionFixture(f,source.id),row=await f.row(past.intentionId);
  expect(row).toMatchObject({state:'CONFIRMED',sequence:'2',orderId:past.orderId});
  expect((await f.pool.query('SELECT state,"expiresAt"<clock_timestamp() AS expired FROM "EnrollmentOrder" WHERE id=$1',[past.orderId])).rows[0]).toEqual({state:'EXPIRED',expired:true});
  expect(await f.counts()).toEqual({requests:2,orders:1,seats:1,commands:0,next:'3'});
});
admission('RA00c auxiliar: barrera de AdmissionSequence observada por segunda conexión',async f=>{
  const holder=await f.pool.connect(),waiting=await f.pool.connect();let pending:Promise<unknown>|undefined;
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "AdmissionSequence" WHERE id=1 FOR UPDATE');
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending=waiting.query('SELECT id FROM "AdmissionSequence" WHERE id=1 FOR UPDATE');
    try{await waitForBlockedBy(f.pool,pid);}finally{await holder.query('ROLLBACK');}await pending;
  }finally{await pending?.catch(()=>undefined);holder.release();waiting.release();}
});
admission('RA00d auxiliar: inyección SQL 40001 real antes de ejecutar admisión',async f=>{
  await installAdmissionSerializationFault(f);
  await expect(seedAdmissionSource(f)).rejects.toMatchObject({code:'40001'});
  expect(await f.counts()).toEqual({requests:0,orders:0,seats:0,commands:0,next:'1'});
  await seedAdmissionSource(f);expect(await f.counts()).toEqual({requests:1,orders:0,seats:0,commands:0,next:'2'});
  expect((await f.pool.query('SELECT last_value::text AS n FROM admission_fault_counter')).rows[0].n).toBe('2');
});
admission('RA01 ADMITTED y contador confirman juntos; no orden, plaza ni plazo',async f=>{
  const input=f.selection(),trace=instrumentPool(f.pool),before=await commitmentRows(f.pool);
  const result=await f.target(trace.pool).admit(f.actor,input,randomUUID()),row=await f.row(input.intentionId);
  expect(result).toMatchObject({state:'ADMITTED',intentionId:input.intentionId,admittedAt:row.admittedAt});
  expect(row).toMatchObject({studentId:f.student.userId,state:'ADMITTED',groupIds:[f.groupId],sequence:'1',decisionCode:null,orderId:null});
  expect(await f.counts()).toEqual({requests:1,orders:0,seats:0,commands:0,next:'2'});expect(await commitmentRows(f.pool)).toEqual(before);
  const locks=trace.statements.filter(s=>/FOR (UPDATE|SHARE)/.test(s.sql)).map(s=>s.sql);
  for(const [earlier,later]of [['AdmissionSequence','User'],['User','Session']] as const)expect(locks.findIndex(sql=>sql.includes('"'+earlier+'"'))).toBeLessThan(locks.findIndex(sql=>sql.includes('"'+later+'"')));
  expect(trace.statements.some(s=>/DispatchState|AcademicCourse|AcademicGroup|nextval|SKIP LOCKED/.test(s.sql))).toBe(false);
  expect(new Set(trace.pids).size).toBe(1);expect(trace.statements.at(-1)?.sql).toBe('COMMIT');
});
admission('RA02 prioridad durable pese a respuesta de segundo alumno primero',async f=>{
  const other=await sessionFixture(f,'STUDENT'),actor=(await f.sessions.lookup(other.secret))!;
  const inserted=latch(),allowCommit=latch(),allowResponse=latch();let holderPid=0;
  const trace=instrumentPool(f.pool,{after:async(sql,pid)=>{
    if(/INSERT INTO "ReservationRequest"/.test(sql)){holderPid=pid;inserted.release();await allowCommit.promise;}
    if(sql==='COMMIT')await allowResponse.promise;
  }});
  const aInput=f.selection(),bInput=f.selection(),first=observe(f.target(trace.pool).admit(f.actor,aInput,randomUUID()));let second:Promise<Observed<ReservationAdmissionResult>>|undefined;
  try{
    await milestone(inserted.promise,first);
    const pending=observe(f.target().admit(actor,bInput,randomUUID()));second=pending;
    try{await waitForBlockedBy(f.pool,holderPid);}finally{allowCommit.release();}
    const b=await unwrap(pending);expect(b.state).toBe('ADMITTED');allowResponse.release();expect((await unwrap(first)).state).toBe('ADMITTED');
    const rows=(await f.pool.query('SELECT "studentId","admissionSequence"::text AS sequence FROM "ReservationRequest" ORDER BY "admissionSequence"')).rows;
    expect(rows).toEqual([{studentId:f.student.userId,sequence:'1'},{studentId:other.userId,sequence:'2'}]);
    expect(await f.counts()).toEqual({requests:2,orders:0,seats:0,commands:0,next:'3'});
  }finally{allowCommit.release();allowResponse.release();await first;await second;}
});
admission('RA03 mismo contenido canónico recupera identidad y no consume secuencia',async f=>{
  const input=f.selection([f.otherGroupId,f.groupId]),first=await f.target().admit(f.actor,input,randomUUID()),before=await financialFingerprint(f.pool);
  const replay=await f.target().admit(f.actor,{intentionId:input.intentionId.toUpperCase(),groupIds:[f.groupId.toUpperCase(),f.otherGroupId.toUpperCase()]},randomUUID());
  expect(replay).toEqual(first);expect((await f.row(input.intentionId)).groupIds).toEqual([f.groupId,f.otherGroupId].sort());
  expect(await financialFingerprint(f.pool)).toBe(before);expect(await f.counts()).toEqual({requests:1,orders:0,seats:0,commands:0,next:'2'});
});
admission('RA04 misma intención con otra selección es conflicto, no nuevo ticket',async f=>{
  const input=f.selection();await f.target().admit(f.actor,input,randomUUID());const before=await financialFingerprint(f.pool);
  await expect(f.target().admit(f.actor,{...input,groupIds:[f.otherGroupId]},randomUUID())).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});expect(await financialFingerprint(f.pool)).toBe(before);
});
admission('RA05 duplicado concurrente aplica una sola admisión',async f=>{
  const gate=latch(),entered=latch();let holderPid=0;
  const trace=instrumentPool(f.pool,{after:async(sql,pid)=>{if(/INSERT INTO "ReservationRequest"/.test(sql)){holderPid=pid;entered.release();await gate.promise;}}});
  const input=f.selection(),first=observe(f.target(trace.pool).admit(f.actor,input,randomUUID()));let second:Promise<Observed<ReservationAdmissionResult>>|undefined;
  try{
    await milestone(entered.promise,first);second=observe(f.target().admit(f.actor,input,randomUUID()));
    try{await waitForBlockedBy(f.pool,holderPid);}finally{gate.release();}
    expect(await unwrap(second)).toEqual(await unwrap(first));expect(await f.counts()).toEqual({requests:1,orders:0,seats:0,commands:0,next:'2'});
  }finally{gate.release();await first;await second;}
});
for(const phase of ['before','after'] as const)admission(`RA06 COMMIT ${phase}: acuse adverso consulta ledger antes de repetir`,async f=>{
  let injected=false;const trace=instrumentPool(f.pool,{[phase]:async(sql:string)=>{if(sql==='COMMIT'&&!injected){injected=true;throw new Error('Ack adverso ficticio');}}});
  const input=f.selection();await expect(f.target(trace.pool).admit(f.actor,input,randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(injected).toBe(true);
  expect(await f.counts()).toEqual({requests:phase==='after'?1:0,orders:0,seats:0,commands:0,next:phase==='after'?'2':'1'});
  const persisted=await f.row(input.intentionId);if(phase==='before')expect(persisted).toBeUndefined();else expect(persisted).toMatchObject({state:'ADMITTED',sequence:'1'});
  const result=await f.target().admit(f.actor,input,randomUUID());expect(result.state).toBe('ADMITTED');expect(result.id).toBe((await f.row(input.intentionId)).id);
  if(persisted)expect(result.id).toBe(persisted.id);expect(await f.counts()).toEqual({requests:1,orders:0,seats:0,commands:0,next:'2'});
});
admission('RA07 aborto SQL real revierte contador e intención, no REJECTED',async f=>{
  await f.isolated.ownerQuery(`CREATE FUNCTION fail_admission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Privado SQL admission'; END $$;
    CREATE TRIGGER fail_admission BEFORE INSERT ON "ReservationRequest" FOR EACH ROW EXECUTE FUNCTION fail_admission()`);
  const input=f.selection(),before=await financialFingerprint(f.pool);
  await expect(f.target().admit(f.actor,input,randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(await financialFingerprint(f.pool)).toBe(before);
  expect(await f.row(input.intentionId)).toBeUndefined();await f.isolated.ownerQuery('DROP TRIGGER fail_admission ON "ReservationRequest"; DROP FUNCTION fail_admission()');
  expect((await f.target().admit(f.actor,input,randomUUID())).state).toBe('ADMITTED');
});
admission('RA08 40001 real reintenta dentro del presupuesto, sin hueco de secuencia',async f=>{
  await installAdmissionSerializationFault(f);
  const trace=instrumentPool(f.pool),input=f.selection();expect((await f.target(trace.pool).admit(f.actor,input,randomUUID())).state).toBe('ADMITTED');
  expect(trace.statements.filter(s=>s.sql==='ROLLBACK')).toHaveLength(1);expect(trace.statements.filter(s=>s.sql==='COMMIT')).toHaveLength(1);
  expect((await f.row(input.intentionId)).sequence).toBe('1');expect((await f.counts()).next).toBe('2');
});
for(const change of ['session','disabled','role','authVersion'] as const)admission(`RA09 revalida ${change} en nueva admisión`,async f=>{
  if(change==='session')await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[f.actor.sessionId]);
  else await f.pool.query(`UPDATE "User" SET ${change==='disabled'?'status=\'DISABLED\',"disabledAt"=clock_timestamp()':change==='role'?'role=\'TEACHER\'':'"authVersion"="authVersion"+1'} WHERE id=$1`,[f.actor.userId]);
  const before=await financialFingerprint(f.pool);await expect(f.target().admit(f.actor,f.selection(),randomUUID())).rejects.toMatchObject({code:change==='role'?'FORBIDDEN':'AUTH_REQUIRED'});expect(await financialFingerprint(f.pool)).toBe(before);
});
admission('RA10 replay exige sesión vigente de nuevo login, antigua revocada no recupera',async f=>{
  const input=f.selection(),first=await f.target().admit(f.actor,input,randomUUID());await f.sessions.revoke(f.student.secret);
  await expect(f.target().admit(f.actor,input,randomUUID())).rejects.toMatchObject({code:'AUTH_REQUIRED'});
  const fresh=accessSecrets.issue();
  await f.pool.query(`WITH t AS (SELECT clock_timestamp() AS at) INSERT INTO "Session" ("tokenHash","userId","authVersion","createdAt","lastAcceptedAt","absoluteExpiresAt")
    SELECT $1,$2,0,at,at,at+interval '8 hours' FROM t`,[Buffer.from(fresh.digest),f.student.userId]);
  const actor=(await f.sessions.lookup(fresh.secret))!;expect(actor).not.toBeNull();expect(await f.target().admit(actor,input,randomUUID())).toEqual(first);
});
admission('RA11 replay CONFIRMED recupera orden histórica vencida sin renovar',async f=>{
  const sourceInput=f.selection();await f.target().admit(f.actor,sourceInput,randomUUID());
  const past=await expiredAdmissionFixture(f,(await f.row(sourceInput.intentionId)).id),before=await financialFingerprint(f.pool);
  expect(await f.target().admit(f.actor,{intentionId:past.intentionId,groupIds:sourceInput.groupIds},randomUUID())).toMatchObject({state:'CONFIRMED',intentionId:past.intentionId,orderId:past.orderId});
  expect(await financialFingerprint(f.pool)).toBe(before);expect((await f.counts()).next).toBe('3');
});
admission('RA12 REJECTED previo conserva decisión y no obtiene nueva secuencia',async f=>{
  const input=f.selection();await f.target().admit(f.actor,input,randomUUID());
  await f.pool.query(`UPDATE "ReservationRequest" SET state='REJECTED',"decisionCode"='CAPACITY_UNAVAILABLE',"decidedAt"=clock_timestamp() WHERE "intentionId"=$1`,[input.intentionId]);
  const before=await financialFingerprint(f.pool);expect(await f.target().admit(f.actor,input,randomUUID())).toMatchObject({state:'REJECTED',decisionCode:'CAPACITY_UNAVAILABLE'});expect(await financialFingerprint(f.pool)).toBe(before);
});
admission('RA13 una orden activa permanece intacta: admisión no crea segunda orden',async f=>{
  await seedCommitment(f,'RESERVED');await f.pool.query('UPDATE "AdmissionSequence" SET "nextSequence"=2 WHERE id=1');
  const before=await commitmentRows(f.pool);expect((await f.target().admit(f.actor,f.selection([f.otherGroupId]),randomUUID())).state).toBe('ADMITTED');
  expect(await commitmentRows(f.pool)).toEqual(before);expect(await f.counts()).toEqual({requests:2,orders:1,seats:1,commands:0,next:'3'});
});
for(const role of ['ADMIN','TEACHER'] as const)admission(`RA14 ${role} no admite como alumno`,async f=>{
  const secret=role==='ADMIN'?f.admin.secret:f.teacher.secret,actor=(await f.sessions.lookup(secret))!;
  await expect(f.target().admit(actor,f.selection(),randomUUID())).rejects.toMatchObject({code:'FORBIDDEN'});expect((await f.counts()).requests).toBe(0);
});
admission('RA15 HTTP 200 ADMITTED mínimo y persistido, no 202 ni ticket privado',async f=>{
  const input=f.selection(),response=await f.http!.post(requestRoute,input,f.student.secret);expect(response.status).toBe(200);
  const body=await response.json();expect(Object.keys(body)).toEqual(['data']);expect(body.data).toMatchObject({state:'ADMITTED',intentionId:input.intentionId});
  expect(Object.keys(body.data).sort()).toEqual(['id','intentionId','state','admittedAt'].sort());
  expect(body.data).toEqual({id:(await f.row(input.intentionId)).id,intentionId:input.intentionId,state:'ADMITTED',admittedAt:(await f.row(input.intentionId)).admittedAt});
  expect(await f.counts()).toEqual({requests:1,orders:0,seats:0,commands:0,next:'2'});
},true);
for(const role of ['ADMIN','TEACHER','VISITOR'] as const)admission(`RA16 HTTP deniega ${role}`,async f=>{
  const secret=role==='ADMIN'?f.admin.secret:role==='TEACHER'?f.teacher.secret:undefined,before=await financialFingerprint(f.pool);
  await responseError(await f.http!.post(requestRoute,f.selection(),secret),role==='VISITOR'?401:403,role==='VISITOR'?'AUTH_REQUIRED':'FORBIDDEN');expect(await financialFingerprint(f.pool)).toBe(before);
},true);
for(const [name,change]of [['vacío',{groupIds:[]}],['duplicado',{groupIds:['DUPLICATE']}],['UUID',{intentionId:'invalid'}],['sesión cliente',{sessionId:'private'}],['titular cliente',{studentId:'private'}],['total cliente',{totalMinor:'0'}],['plazo cliente',{expiresAt:'2090-01-01'}],['secuencia cliente',{admissionSequence:'1'}],['reloj cliente',{admittedAt:'2020-01-01'}]] as const){
  admission(`RA17 HTTP selección/DTO ${name} no se admite`,async f=>{
    const input=f.selection(),before=await financialFingerprint(f.pool),body={...input,...change,...(name==='duplicado'?{groupIds:[f.groupId,f.groupId]}:{})};
    await responseError(await f.http!.post(requestRoute,body,f.student.secret),400,'VALIDATION_ERROR');expect(await financialFingerprint(f.pool)).toBe(before);
  },true);
}
admission('RA18 HTTP conserva Origin/CSRF/16KiB sin intención durable',async f=>{
  for(const [headers,body,status,code]of [[{origin:'https://foreign.example.test'},f.selection(),403,'REQUEST_NOT_ALLOWED'],[{'x-csrf-protection':''},f.selection(),403,'REQUEST_NOT_ALLOWED'],[{},f.selection(['x'.repeat(17000)]),413,'VALIDATION_ERROR']] as const){
    const response=await fetch(f.http!.url+'/api/v1'+requestRoute,{method:'POST',headers:{...f.http!.headers(f.student.secret),...headers},body:JSON.stringify(body)});await responseError(response,status,code);
  }
  expect(await f.counts()).toEqual({requests:0,orders:0,seats:0,commands:0,next:'1'});
},true);
admission('RA19 la identidad de intención está acotada al alumno, no es global',async f=>{
  const other=await sessionFixture(f,'STUDENT'),actor=(await f.sessions.lookup(other.secret))!,input=f.selection();
  const a=await f.target().admit(f.actor,input,randomUUID()),b=await f.target().admit(actor,input,randomUUID());
  expect(a.state).toBe('ADMITTED');expect(b.state).toBe('ADMITTED');expect(a.id).not.toBe(b.id);
  expect((await f.row(input.intentionId)).studentId).toBe(f.student.userId);expect((await f.row(input.intentionId,other.userId)).studentId).toBe(other.userId);
  expect(await f.counts()).toEqual({requests:2,orders:0,seats:0,commands:0,next:'3'});
});
