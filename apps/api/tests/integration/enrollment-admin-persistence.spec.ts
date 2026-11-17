import { randomUUID } from 'node:crypto';
import { expect,test } from 'vitest';
import { adminFixture,unknownIncident,economicFingerprint } from '../support/enrollment-admin.js';
import type { AdminFixture } from '../support/enrollment-admin.js';
import { financialFingerprint,seedCommitment } from '../support/enrollment-maintenance.js';
import { createEnrollmentQueries } from '../../src/modules/enrollment/infrastructure/queries.js';
import { createIncidentFollowUpStore } from '../../src/modules/enrollment/infrastructure/enrollment-store.js';
import { createEnrollmentPriceStore } from '../../src/modules/enrollment/infrastructure/enrollment-store.js';
import { createReservationOfferingParticipant,createCourseReferenceParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import { EnrollmentFollowUps } from '../../src/modules/enrollment/application/follow-up.js';
import { instrumentPool,latch } from '../support/academic-foundation-contract.js';
import { observe,milestone,unwrap } from '../support/reservation-processing.js';

const page={page:1,pageSize:20};
const queries=(f:AdminFixture,pool=f.pool)=>createEnrollmentQueries(pool,f.authorization,createReservationOfferingParticipant);
const service=(f:AdminFixture,pool=f.pool)=>new EnrollmentFollowUps(createIncidentFollowUpStore(pool,f.authorization,createReservationOfferingParticipant));
function check(name:string,work:(f:AdminFixture)=>Promise<void>){test(name,async()=>{const f=await adminFixture();try{await work(f);}finally{await f.close();}},120000);}
check('AP01 US4.06 órdenes paginadas y filtro titular conservan snapshots y economía',async f=>{
  await seedCommitment({...f,student:f.other},'RESERVED',f.pool,'2');const q=queries(f),before=await financialFingerprint(f.pool);
  expect(await q.adminOrders(f.adminActor,{page:2,pageSize:1})).toMatchObject({total:2,page:2,pageSize:1,items:[expect.any(Object)]});
  expect(await q.adminOrders(f.adminActor,{...page,studentId:f.student.userId})).toMatchObject({total:1,items:[{id:f.orderId,studentId:f.student.userId,totalMinor:'12500',state:'EXPIRED'}]});
  expect(await q.adminOrders(f.adminActor,{...page,studentId:randomUUID()})).toMatchObject({total:0,items:[]});
  expect((await q.adminOrder(f.adminActor,f.orderId!))!.items[0]).toMatchObject({courseId:f.courseId,groupId:f.groupId,priceMinor:'12500'});
  expect(await financialFingerprint(f.pool)).toBe(before);
});
check('AP02 US4.06 incidencia desconocida conserva hechos normalizados sin dueño ni evidencia privada',async f=>{
  const id=await unknownIncident(f),q=queries(f),before=await financialFingerprint(f.pool),view=await q.incident(f.adminActor,id);
  expect(view).toMatchObject({id,orderId:null,affectedGroupIds:[],followUps:[],reason:'UNKNOWN_REFERENCE',payment:{amountUnits:'12500',amountScale:2,currency:'PEN'}});
  expect(Object.keys(view!).sort()).toEqual(['id','orderId','reason','openedAt','affectedGroupIds','followUps','payment'].sort());
  expect(Object.keys(view!.payment).sort()).toEqual(['amountUnits','amountScale','currency','verifiedAt'].sort());
  expect(JSON.stringify(view)).not.toMatch(/fixture\/unknown-private|providerScope|providerPaymentId|merchantReference|authVersion|sessionId/);
  expect(await q.incidents(f.adminActor,{page:2,pageSize:1})).toMatchObject({total:2,items:[expect.any(Object)]});expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const role of ['STUDENT','TEACHER'] as const)for(const operation of ['adminOrders','adminOrder','incidents','incident'] as const)check('AP03 US4.07 '+role+' denegado en lector '+operation,async f=>{
  const actor=(await f.sessions.lookup(role==='STUDENT'?f.student.secret:f.teacher.secret))!,q=queries(f),before=await financialFingerprint(f.pool);
  const call=()=>operation==='adminOrders'?q.adminOrders(actor,page):operation==='adminOrder'?q.adminOrder(actor,f.orderId!):operation==='incidents'?q.incidents(actor,page):q.incident(actor,f.incidentId);
  await expect(call()).rejects.toMatchObject({code:'FORBIDDEN'});expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const role of ['STUDENT','TEACHER'] as const)check('AP04 US4.07 '+role+' denegado en escritor sin efectos',async f=>{
  const actor=(await f.sessions.lookup(role==='STUDENT'?f.student.secret:f.teacher.secret))!,before=await financialFingerprint(f.pool);
  await expect(service(f).append(actor,f.incidentId,f.command(),randomUUID())).rejects.toMatchObject({code:'FORBIDDEN'});expect(await financialFingerprint(f.pool)).toBe(before);
});
check('AP05 US4.06 nota y recibo canónicos, actor/hora servidor, historial sin resolución',async f=>{
  const q=queries(f),s=service(f),input=f.command(),before=await economicFingerprint(f.pool),result=await s.append(f.adminActor,f.incidentId,input,randomUUID());
  expect(result.resource).toMatchObject({incidentId:f.incidentId,commandId:input.commandId,adminUserId:f.admin.userId,content:input.content,recordedAt:expect.stringMatching(/\.\d{6}Z$/)});
  expect(result.command).toMatchObject({id:input.commandId,replayed:false,outcomeCode:'APPLIED',resultingRevision:'1',appliedAt:result.resource.recordedAt});
  const replay=await s.append(f.adminActor,f.incidentId,input,randomUUID());expect(replay).toEqual({...result,command:{...result.command,replayed:true}});
  expect((await q.incident(f.adminActor,f.incidentId))!.followUps).toEqual([result.resource]);expect(await f.counts()).toEqual({notes:1,commands:1,audits:1});expect(await economicFingerprint(f.pool)).toBe(before);
  const ownActor=(await f.sessions.lookup(f.student.secret))!,own=await q.order(ownActor,f.orderId!);expect(own!.incidentSummary).toBe('Pago en conciliación, sin matrícula.');expect(JSON.stringify(own)).not.toContain(input.content);
});
check('AP06 US4.06 mismo comando concurrente produce exactamente nota/ledger/auditoría únicos',async f=>{
  const s=service(f),input=f.command(),before=await economicFingerprint(f.pool),results=await Promise.all([s.append(f.adminActor,f.incidentId,input,randomUUID()),s.append(f.adminActor,f.incidentId,input,randomUUID())]);
  expect(results[0].resource).toEqual(results[1].resource);expect(results.map(r=>r.command.replayed).sort()).toEqual([false,true]);expect(await f.counts()).toEqual({notes:1,commands:1,audits:1});expect(await economicFingerprint(f.pool)).toBe(before);
});
check('AP07 US4.06 comandos distintos concurrentes conservan ambas notas',async f=>{
  const s=service(f),before=await economicFingerprint(f.pool);await Promise.all([s.append(f.adminActor,f.incidentId,f.command(),randomUUID()),s.append(f.adminActor,f.incidentId,f.command(),randomUUID())]);
  expect(await f.counts()).toEqual({notes:2,commands:2,audits:2});expect((await queries(f).incident(f.adminActor,f.incidentId))!.followUps).toHaveLength(2);expect(await economicFingerprint(f.pool)).toBe(before);
});
for(const changed of ['content','target','operation'] as const)check('AP08 US4.06 comando repetido con otro '+changed+' da conflicto sin efectos',async f=>{
  const s=service(f),input=f.command();await s.append(f.adminActor,f.incidentId,input,randomUUID());const other=changed==='target'?await unknownIncident(f):f.incidentId,before=await financialFingerprint(f.pool);
  const call=changed==='operation'?createEnrollmentPriceStore(f.pool,f.authorization,createCourseReferenceParticipant).set(f.adminActor,f.courseId,{commandId:input.commandId,expectedRevision:null,amountMinor:'100',currency:'PEN'},randomUUID()):s.append(f.adminActor,other,{...input,content:changed==='content'?input.content+' distinto':input.content},randomUUID());
  await expect(call).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});expect(await financialFingerprint(f.pool)).toBe(before);
});
check('AP09 US4.06 referencia desconocida permite nota administrativa sin asignar grupos',async f=>{
  const id=await unknownIncident(f),before=await economicFingerprint(f.pool);await service(f).append(f.adminActor,id,f.command(),randomUUID());
  expect(await queries(f).incident(f.adminActor,id)).toMatchObject({orderId:null,affectedGroupIds:[],followUps:[expect.any(Object)]});expect(await economicFingerprint(f.pool)).toBe(before);
});
check('AP10 US4.06 ausencias no fabrican recursos ni consumen comando',async f=>{
  const id=randomUUID(),q=queries(f),before=await financialFingerprint(f.pool);expect(await q.adminOrder(f.adminActor,id)).toBeNull();expect(await q.incident(f.adminActor,id)).toBeNull();
  await expect(service(f).append(f.adminActor,id,f.command(),randomUUID())).rejects.toMatchObject({code:'NOT_FOUND'});expect(await financialFingerprint(f.pool)).toBe(before);
});
check('AP11 US4.07 replay reautoriza sesión revocada antes de publicar la nota',async f=>{
  const input=f.command(),s=service(f);await s.append(f.adminActor,f.incidentId,input,randomUUID());await f.sessions.revoke(f.admin.secret);const before=await financialFingerprint(f.pool);
  await expect(s.append(f.adminActor,f.incidentId,input,randomUUID())).rejects.toMatchObject({code:'AUTH_REQUIRED'});await expect(queries(f).incidents(f.adminActor,page)).rejects.toMatchObject({code:'AUTH_REQUIRED'});expect(await financialFingerprint(f.pool)).toBe(before);
});
check('AP12 US4.06 trigger de auditoría falla y revierte nota y ledger',async f=>{
  await f.isolated.ownerQuery(`CREATE FUNCTION reject_admin_note_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit failure' USING ERRCODE='23514'; END $$; CREATE TRIGGER reject_admin_note_audit BEFORE INSERT ON "EnrollmentAuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_admin_note_audit();`);
  const before=await financialFingerprint(f.pool);await expect(service(f).append(f.adminActor,f.incidentId,f.command(),randomUUID())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(await f.counts()).toEqual({notes:0,commands:0,audits:0});expect(await financialFingerprint(f.pool)).toBe(before);
});
check('AP13 US4.06 lector reautoriza antes de descubrir y no bloquea cuentas ajenas',async f=>{
  const trace=instrumentPool(f.pool);await queries(f,trace.pool).incidents(f.adminActor,page);
  const discovery=trace.statements.findIndex(s=>/WITH filtered/.test(s.sql)),authorization=trace.statements.findIndex(s=>/FROM "Session"/.test(s.sql));expect(authorization).toBeGreaterThanOrEqual(0);expect(discovery).toBeGreaterThan(authorization);
  expect(trace.statements.filter(s=>/FROM "User"/.test(s.sql)&&/FOR UPDATE/.test(s.sql))).toHaveLength(2);
  expect(trace.statements.some(s=>/FOR UPDATE/.test(s.sql)&&/AcademicCourse|AcademicGroup|EnrollmentOrder/.test(s.sql))).toBe(false);
});
check('AP14 US4.06 seguimiento no se publica hasta COMMIT',async f=>{
  const entered=latch(),release=latch(),trace=instrumentPool(f.pool,{before:async sql=>{if(sql==='COMMIT'){entered.release();await release.promise;}}});
  let settled=false;const pending=observe(service(f,trace.pool).append(f.adminActor,f.incidentId,f.command(),randomUUID()).then(result=>{settled=true;return result;}));
  try{await milestone(entered.promise,pending);expect(settled).toBe(false);expect(await f.counts()).toEqual({notes:0,commands:0,audits:0});release.release();await unwrap(pending);expect(await f.counts()).toEqual({notes:1,commands:1,audits:1});}finally{release.release();await pending;}
});
for(const field of ['resolved','expectedRevision','adminUserId','recordedAt'])check('AP15 US4.06 campo '+field+' rechazado por servicio sin escribir',async f=>{
  const before=await financialFingerprint(f.pool);await expect(service(f).append(f.adminActor,f.incidentId,{...f.command(),[field]:'forjado'},randomUUID())).rejects.toMatchObject({code:'VALIDATION_ERROR'});expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const input of [{page:0,pageSize:20},{page:1,pageSize:51},{page:1,pageSize:20,studentId:'inválido'},{page:1,pageSize:20,unknown:1}])check('AP16 US4.06 query inválida '+JSON.stringify(input)+' no altera datos',async f=>{
  const before=await financialFingerprint(f.pool);await expect(async()=>queries(f).adminOrders(f.adminActor,input)).rejects.toMatchObject({code:'VALIDATION_ERROR'});expect(await financialFingerprint(f.pool)).toBe(before);
});
