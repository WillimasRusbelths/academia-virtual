import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { preEnrollmentDatabase } from '../support/enrollment-migration.js';
import { financialFingerprint, seedCommitment } from '../support/enrollment-maintenance.js';
import { sessionFixture } from '../support/session-fixture.js';
import { us1Http } from '../support/us1-http.js';
import { waitForBlockedBy } from '../support/locks.js';

async function fixture() {
  const f=await preEnrollmentDatabase();
  try {
    await f.applyEnrollment();const http=await us1Http({context:f}),pool=f.database.pool;
    const route=(id:string=f.courseId)=>`/admin/enrollment/courses/${id}/price`;
    const command=(changes:Record<string,unknown>={})=>({commandId:randomUUID(),expectedRevision:null,amountMinor:'12500',currency:'PEN',...changes});
    const put=(body:unknown,secret:string|undefined=f.admin.secret,id:string=f.courseId,headers:Record<string,string>={})=>fetch(http.url+'/api/v1'+route(id),{method:'PUT',headers:{...http.headers(secret),...headers},body:JSON.stringify(body)});
    const counts=async()=>(await pool.query(`SELECT (SELECT count(*)::int FROM "CoursePrice") AS prices,
      (SELECT count(*)::int FROM "EnrollmentCommand") AS commands,(SELECT count(*)::int FROM "EnrollmentAuditEvent") AS audits`)).rows[0];
    return {...f,http,pool,route,command,put,counts,close:async()=>{try{await http.close();}finally{await f.cleanup();}}};
  }catch(e){await f.cleanup();throw e;}
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
function price(name:string,body:(f:Fixture)=>Promise<void>){test(name,async()=>{const f=await fixture();try{await body(f);}finally{await f.close();}},120000);}
async function error(response:Response,status:number,code:string){expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toBe('no-store');const body=await response.json();expect(body.error).toMatchObject({code,requestId:expect.stringMatching(/^[0-9a-f-]{36}$/)});expect(Object.keys(body)).toEqual(['error']);return body.error;}
async function data(response:Response){expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');const body=await response.json();expect(Object.keys(body)).toEqual(['data']);return body.data;}

price('EP01 GET distingue ausencia de cero sin escrituras',async f=>{
  const before=await financialFingerprint(f.pool);
  expect(await data(await f.http.get(f.route(),f.admin.secret))).toEqual({courseId:f.courseId,defined:false,amountMinor:null,currency:null,revision:null});
  expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const amount of ['0','1','9007199254740993','9223372036854775807'])price(`EP02 PEN exacto ${amount}`,async f=>{
  const input=f.command({amountMinor:amount}),result=await data(await f.put(input));
  expect(result.resource).toEqual({courseId:f.courseId,defined:true,amountMinor:amount,currency:'PEN',revision:'1'});
  expect(result.command).toEqual({id:input.commandId,replayed:false,outcomeCode:'APPLIED',resultingRevision:'1',appliedAt:expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/)});
  expect(await data(await f.http.get(f.route(),f.admin.secret))).toEqual(result.resource);
  expect(await f.counts()).toEqual({prices:1,commands:1,audits:1});
  const row=(await f.pool.query(`SELECT "amountMinor"::text AS amount,revision::text,"changedBy",to_char("changedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at FROM "CoursePrice"`)).rows[0];
  expect(row).toEqual({amount,revision:'1',changedBy:f.admin.userId,at:result.command.appliedAt});
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "Enrollment"')).rows[0].n).toBe(0);
});
price('EP03 actualización incrementa revisión y auditoría mínimas atómicas',async f=>{
  await data(await f.put(f.command()));const input=f.command({expectedRevision:'1',amountMinor:'20001'}),result=await data(await f.put(input));
  expect(result.resource).toMatchObject({amountMinor:'20001',revision:'2'});expect(result.command).toMatchObject({outcomeCode:'APPLIED',resultingRevision:'2'});
  expect(await f.counts()).toEqual({prices:1,commands:2,audits:2});
  const event=(await f.pool.query(`SELECT "actorKind","actorReference",operation,"targetKind","targetId","commandId","beforeRevision"::text,"afterRevision"::text,result FROM "EnrollmentAuditEvent" WHERE "commandId"=$1`,[input.commandId])).rows[0];
  expect(event).toEqual({actorKind:'ACCOUNT',actorReference:f.admin.userId,operation:'COURSE_PRICE_SET',targetKind:'COURSE',targetId:f.courseId,commandId:input.commandId,beforeRevision:'1',afterRevision:'2',result:'APPLIED'});
});
price('EP04 misma cantidad registra NO_CHANGE sin mover revisión ni changedAt',async f=>{
  await data(await f.put(f.command()));const before=(await f.pool.query('SELECT to_jsonb(p) AS row FROM "CoursePrice" p')).rows;
  const input=f.command({expectedRevision:'1'}),result=await data(await f.put(input));
  expect(result.command).toMatchObject({outcomeCode:'NO_CHANGE',resultingRevision:'1'});
  expect((await f.pool.query('SELECT to_jsonb(p) AS row FROM "CoursePrice" p')).rows).toEqual(before);expect(await f.counts()).toEqual({prices:1,commands:2,audits:2});
});
price('EP05 replay idéntico conserva recibo y proyecta precio actual tras otra escritura',async f=>{
  const input=f.command(),first=await data(await f.put(input));await data(await f.put(f.command({expectedRevision:'1',amountMinor:'14000'})));
  const replay=await data(await f.put({...input,commandId:input.commandId.toUpperCase()},f.admin.secret,f.courseId.toUpperCase()));
  expect(replay.command).toEqual({...first.command,replayed:true});expect(replay.resource).toMatchObject({amountMinor:'14000',revision:'2'});expect(await f.counts()).toEqual({prices:1,commands:2,audits:2});
});
for(const change of ['amount','currency','revision','course','missing-course'])price(`EP06 commandId diferente contenido ${change}`,async f=>{
  const input=f.command();await data(await f.put(input));const before=await financialFingerprint(f.pool);
  // Moneda inválida se rechaza como forma antes del ledger; no crea nueva decisión.
  await error(await f.put({...input,...(change==='amount'?{amountMinor:'12501'}:change==='currency'?{currency:'USD'}:change==='revision'?{expectedRevision:'1'}:{})},f.admin.secret,change==='course'?f.otherCourseId:change==='missing-course'?randomUUID():f.courseId),change==='currency'?400:409,change==='currency'?'VALIDATION_ERROR':'IDEMPOTENCY_CONFLICT');
  expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const revision of [null,'2'])price(`EP07 revisión obsoleta ${revision}`,async f=>{
  await data(await f.put(f.command()));const before=await financialFingerprint(f.pool);
  await error(await f.put(f.command({expectedRevision:revision})),409,'ENROLLMENT_VERSION_CONFLICT');expect(await financialFingerprint(f.pool)).toBe(before);
});
price('EP08 alta con revisión no nula no crea precio ni consume comando',async f=>{
  const input=f.command({expectedRevision:'1'});await error(await f.put(input),409,'ENROLLMENT_VERSION_CONFLICT');expect(await f.counts()).toEqual({prices:0,commands:0,audits:0});
  expect((await data(await f.put({...input,expectedRevision:null}))).resource.revision).toBe('1');
});
for(const [field,value] of [['amountMinor',-1],['amountMinor','-1'],['amountMinor','01'],['amountMinor','1.0'],['amountMinor','1e3'],['amountMinor',' 1'],['amountMinor','9223372036854775808'],['currency','USD'],['expectedRevision','0'],['expectedRevision','9223372036854775808'],['commandId','invalid'],['expectedRevision',1]] as const)price(`EP09 forma inválida ${field}=${typeof value}:${value}`,async f=>{
  const before=await financialFingerprint(f.pool);const result=await error(await f.put(f.command({[field]:value})),400,'VALIDATION_ERROR');
  expect(result.fields).toEqual([{field,message:'Campo inválido.'}]);expect(await financialFingerprint(f.pool)).toBe(before);
});
price('EP10 rechaza claves, query y UUID sin datos privados',async f=>{
  await error(await f.put(f.command({evidence:'SQL-private'})),400,'VALIDATION_ERROR');
  await error(await f.http.get(f.route()+'?page=1',f.admin.secret),400,'VALIDATION_ERROR');
  await error(await f.put(f.command(),f.admin.secret,'invalid'),400,'VALIDATION_ERROR');
  await error(await f.http.get(f.route('invalid'),f.admin.secret),400,'VALIDATION_ERROR');
  const r=await fetch(f.http.url+'/api/v1'+f.route()+'?extra=1',{method:'PUT',headers:f.http.headers(f.admin.secret),body:JSON.stringify(f.command())});await error(r,400,'VALIDATION_ERROR');
  expect(await f.counts()).toEqual({prices:0,commands:0,audits:0});
});
for(const role of ['STUDENT','TEACHER','VISITOR'] as const)price(`EP11 ${role} sin facultad financiera`,async f=>{
  const secret=role==='STUDENT'?f.student.secret:role==='TEACHER'?f.teacher.secret:undefined;
  const before=await financialFingerprint(f.pool),status=role==='VISITOR'?401:403,code=role==='VISITOR'?'AUTH_REQUIRED':'FORBIDDEN';
  await error(await f.http.get(f.route(),secret),status,code);
  // undefined omite cookie explícitamente; el helper de PUT tiene admin por defecto.
  const r=await fetch(f.http.url+'/api/v1'+f.route(),{method:'PUT',headers:f.http.headers(secret),body:JSON.stringify(f.command())});await error(r,status,code);
  expect(await financialFingerprint(f.pool)).toBe(before);
});
price('EP12 curso inexistente es 404 autenticado, nunca precio cero',async f=>{
  const missing=randomUUID();await error(await f.http.get(f.route(missing),f.admin.secret),404,'NOT_FOUND');
  for(const expectedRevision of [null,'1'])await error(await f.put(f.command({expectedRevision}),f.admin.secret,missing),404,'NOT_FOUND');
  expect(await f.counts()).toEqual({prices:0,commands:0,audits:0});
});
price('EP13 fallo SQL de auditoría revierte precio y ledger; recuperación manual',async f=>{
  await f.isolated.ownerQuery(`CREATE FUNCTION fail_price_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SQL-private-audit'; END $$;
    CREATE TRIGGER fail_price_audit BEFORE INSERT ON "EnrollmentAuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_price_audit()`);
  const input=f.command(),failure=await error(await f.put(input),503,'TEMPORARILY_UNAVAILABLE');expect(JSON.stringify(failure)).not.toContain('SQL-private-audit');
  expect(await f.counts()).toEqual({prices:0,commands:0,audits:0});
  await f.isolated.ownerQuery('DROP TRIGGER fail_price_audit ON "EnrollmentAuditEvent"; DROP FUNCTION fail_price_audit()');
  expect((await data(await f.put(input))).command.replayed).toBe(false);expect(await f.counts()).toEqual({prices:1,commands:1,audits:1});
});
for(const change of ['revoke','disable','role'] as const)price(`EP14 replay reautoriza ${change}`,async f=>{
  const input=f.command();await data(await f.put(input));const before=await financialFingerprint(f.pool);
  if(change==='revoke')await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[f.admin.sessionId]);
  else await f.pool.query(`UPDATE "User" SET ${change==='disable'?'status=\'DISABLED\',"disabledAt"=clock_timestamp()':'role=\'STUDENT\''} WHERE id=$1`,[f.admin.userId]);
  await error(await f.put(input),change==='role'?403:401,change==='role'?'FORBIDDEN':'AUTH_REQUIRED');expect(await financialFingerprint(f.pool)).toBe(before);
});
price('EP15 precios nuevos no alteran snapshots de orden/reserva/matrícula',async f=>{
  await seedCommitment(f,'ENROLLED');
  const snapshot=async()=>(await f.pool.query(`SELECT (SELECT jsonb_agg(to_jsonb(t)) FROM "EnrollmentOrder" t) AS orders,
    (SELECT jsonb_agg(to_jsonb(t)) FROM "EnrollmentOrderItem" t) AS items,(SELECT jsonb_agg(to_jsonb(t)) FROM "Enrollment" t) AS enrollments,
    (SELECT jsonb_agg(to_jsonb(t)) FROM "SeatReservation" t) AS seats`)).rows[0];
  const before=await snapshot();await data(await f.put(f.command({amountMinor:'0'})));await data(await f.put(f.command({expectedRevision:'1',amountMinor:'99999'})));
  expect(await snapshot()).toEqual(before);
});
price('EP16 dos administradores compiten por alta: una revisión y un conflicto',async f=>{
  const other=await sessionFixture(f,'ADMIN'),holder=await f.pool.connect();let released=false;
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicCourse" WHERE id=$1 FOR UPDATE',[f.courseId]);
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const a=f.put(f.command()),b=f.put(f.command({amountMinor:'25000'}),other.secret);
    try{await waitForBlockedBy(f.pool,pid);}finally{await holder.query('COMMIT');released=true;}
    const responses=await Promise.all([a,b]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
    for(const response of responses)if(response.status===409)await error(response,409,'ENROLLMENT_VERSION_CONFLICT');else expect((await data(response)).resource.revision).toBe('1');
    expect(await f.counts()).toEqual({prices:1,commands:1,audits:1});
  }finally{if(!released)await holder.query('ROLLBACK');holder.release();}
});
price('EP17 dos peticiones del mismo comando recuperan una sola decisión',async f=>{
  const input=f.command(),holder=await f.pool.connect();let released=false;
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicCourse" WHERE id=$1 FOR UPDATE',[f.courseId]);
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,a=f.put(input),b=f.put(input);
    try{await waitForBlockedBy(f.pool,pid);}finally{await holder.query('COMMIT');released=true;}
    const results=await Promise.all([a,b].map(async p=>data(await p)));
    expect(results.map(r=>r.command.replayed).sort()).toEqual([false,true]);expect(results[0].command.appliedAt).toBe(results[1].command.appliedAt);
    expect(await f.counts()).toEqual({prices:1,commands:1,audits:1});
  }finally{if(!released)await holder.query('ROLLBACK');holder.release();}
});
price('EP18 Origin/CSRF/16KiB conservados en PUT real',async f=>{
  await error(await f.put(f.command(),f.admin.secret,f.courseId,{origin:'https://foreign.example.test'}),403,'REQUEST_NOT_ALLOWED');
  await error(await f.put(f.command(),f.admin.secret,f.courseId,{'x-csrf-protection':''}),403,'REQUEST_NOT_ALLOWED');
  await error(await f.put(f.command({amountMinor:'1'.repeat(17000)})),413,'VALIDATION_ERROR');expect(await f.counts()).toEqual({prices:0,commands:0,audits:0});
});

price('EP19 revisión bigint conserva precisión al actualizar',async f=>{
  await data(await f.put(f.command()));
  await f.pool.query('UPDATE "CoursePrice" SET revision=9007199254740993 WHERE "courseId"=$1',[f.courseId]);
  const result=await data(await f.put(f.command({expectedRevision:'9007199254740993',amountMinor:'20000'})));
  expect(result.resource.revision).toBe('9007199254740994');expect(result.command.resultingRevision).toBe('9007199254740994');
  expect((await data(await f.http.get(f.route(),f.admin.secret))).revision).toBe('9007199254740994');
});
price('EP20 GET espera al escritor de precio y lee el commit posterior',async f=>{
  await data(await f.put(f.command()));const holder=await f.pool.connect();let released=false;
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicCourse" WHERE id=$1 FOR UPDATE',[f.courseId]);
    await holder.query('UPDATE "CoursePrice" SET "amountMinor"=18000,revision=2 WHERE "courseId"=$1',[f.courseId]);
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,pending=f.http.get(f.route(),f.admin.secret);
    try{await waitForBlockedBy(f.pool,pid);}finally{await holder.query('COMMIT');released=true;}
    expect(await data(await pending)).toEqual({courseId:f.courseId,defined:true,amountMinor:'18000',currency:'PEN',revision:'2'});
  }finally{if(!released)await holder.query('ROLLBACK');holder.release();}
});

for(const [name,suffix] of [['LF','\n'],['CRLF','\r\n'],['LS','\u2028']] as const)for(const field of ['commandId','expectedRevision','courseId'] as const){
  price(`EP21 ${field} rechaza terminador ${name} sin consumir comando`,async f=>{
    const input=f.command(),before=await financialFingerprint(f.pool);
    const response=field==='courseId'?await f.put(input,f.admin.secret,encodeURIComponent(f.courseId+suffix))
      :await f.put({...input,[field]:(field==='commandId'?input.commandId:'1')+suffix});
    const failure=await error(response,400,'VALIDATION_ERROR');
    if(field!=='courseId')expect(failure.fields).toEqual([{field,message:'Campo inválido.'}]);
    expect(await financialFingerprint(f.pool)).toBe(before);
    if(field==='courseId')await error(await f.http.get(f.route(encodeURIComponent(f.courseId+suffix)),f.admin.secret),400,'VALIDATION_ERROR');
  });
}
