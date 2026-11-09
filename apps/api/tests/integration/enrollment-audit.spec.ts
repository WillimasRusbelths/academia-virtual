import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { preEnrollmentDatabase, seedEnrollmentGraph } from '../support/enrollment-migration.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { createEnrollmentAudit, createEnrollmentCommandWriter } from '../../src/modules/enrollment/infrastructure/audit.js';
import type { EnrollmentCommandWork } from '../../src/modules/enrollment/infrastructure/audit.js';
import { createSystemEnrollmentTransaction } from '../../src/infrastructure/database/enrollment-transaction.js';
import { postgresInstantParameter } from '../../src/modules/enrollment/infrastructure/temporal.js';
import { instrumentPool, latch } from '../support/academic-foundation-contract.js';
import { waitForBlockedBy } from '../support/locks.js';
import { sessionFixture } from '../support/session-fixture.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';

async function fixture() {
  const f=await preEnrollmentDatabase();
  try {
    await f.applyEnrollment();const graph=await seedEnrollmentGraph(f),pool=f.database.pool;
    const sessions=new PostgresSessionStore(pool),actor=(await sessions.lookup(f.admin.secret))!;
    const authorization={revalidateInTransaction:sessions.revalidateInTransaction.bind(sessions)};
    const topology={accountIds:[],courseIds:[f.courseId],groupIds:[],orderIds:[],attemptIds:[],receiptIds:[],paymentIds:[],enrollmentIds:[],incidentIds:[]};
    function work(id=randomUUID()):EnrollmentCommandWork<{amount:string;revision:string}> {
      return {actor,operation:'COURSE_PRICE_SET',targetId:f.courseId,commandId:id,requestId:randomUUID(),expectedRevision:'1',payload:{amountMinor:'20000',currency:'PEN'},
        discover:async()=>topology,recheck:async()=>topology,
        async apply(c){await c.client.query('UPDATE "CoursePrice" SET "amountMinor"=20000,revision=revision+1,"changedAt"=$2 WHERE "courseId"=$1',[f.courseId,postgresInstantParameter(c.decision.at)]);
          return {outcomeCode:'APPLIED',resultingRevision:'2',resourceReferences:{courseId:f.courseId}};},
        async project(c){const row=(await c.client.query('SELECT "amountMinor"::text AS amount,revision::text FROM "CoursePrice" WHERE "courseId"=$1',[f.courseId])).rows[0];return row;}};
    }
    async function counts(){return (await pool.query(`SELECT (SELECT count(*)::int FROM "EnrollmentCommand" WHERE "commandId"<>$1) AS commands,(SELECT count(*)::int FROM "EnrollmentAuditEvent" WHERE id<>$2) AS audits,(SELECT "amountMinor"::text FROM "CoursePrice" LIMIT 1) AS amount`,[graph.rows.EnrollmentCommand!.commandId,graph.rows.EnrollmentAuditEvent!.id])).rows[0];}
    return {...f,pool,graph,actor,authorization,topology,work,counts,run:createEnrollmentCommandWriter(pool,authorization)};
  }catch(e){await f.cleanup();throw e;}
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
function audit(name:string,body:(f:Fixture)=>Promise<void>){test(name,async()=>{const f=await fixture();try{await body(f);}finally{await f.cleanup();}},120000);}

audit('EA01 repetición conserva instante y revisión; proyecta recurso actual sin repetir efecto',async f=>{
  const w=f.work(),first=await f.run(w);
  await f.pool.query('UPDATE "CoursePrice" SET "amountMinor"=21000,revision=3 WHERE "courseId"=$1',[f.courseId]);
  const second=await f.run({...w,payload:{currency:'PEN',amountMinor:'20000'},requestId:randomUUID(),apply:async()=>{throw new Error('No repetir');}});
  expect(first.command).toMatchObject({id:w.commandId,replayed:false,resultingRevision:'2'});
  expect(second.command).toEqual({...first.command,replayed:true});expect(second.resource).toEqual({amount:'21000',revision:'3'});
  expect(await f.counts()).toEqual({commands:1,audits:1,amount:'21000'});
  const event=(await f.pool.query('SELECT "actorKind","actorReference",operation,"targetKind","beforeRevision"::text,"afterRevision"::text FROM "EnrollmentAuditEvent" WHERE "commandId"=$1',[w.commandId])).rows[0];
  expect(event).toEqual({actorKind:'ACCOUNT',actorReference:f.actor.userId,operation:'COURSE_PRICE_SET',targetKind:'COURSE',beforeRevision:'1',afterRevision:'2'});
});
for(const change of ['payload','operation','target','revision'] as const)audit('EA02 identidad conflictiva '+change,async f=>{
  const w=f.work();await f.run(w);
  const changed={...w,...(change==='payload'?{payload:{amountMinor:'20001'}}:change==='operation'?{operation:'INCIDENT_FOLLOW_UP' as const}:change==='target'?{targetId:f.otherCourseId}:{expectedRevision:'2'})};
  await expect(f.run(changed)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});expect(await f.counts()).toEqual({commands:1,audits:1,amount:'20000'});
});
audit('EA03 revisión obsoleta impide ejecutar mutación',async f=>{
  await expect(f.run({...f.work(),expectedRevision:null})).rejects.toMatchObject({code:'ENROLLMENT_VERSION_CONFLICT'});
  expect(await f.counts()).toEqual({commands:0,audits:0,amount:'12500'});
});
audit('EA04 fallo de auditoría revierte efecto y resultado',async f=>{
  const run=createEnrollmentCommandWriter(f.pool,f.authorization,{audit:{create:c=>({async write(e){await createEnrollmentAudit(c).write(e);throw new Error('Audit unavailable');}})}});
  await expect(run(f.work())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(await f.counts()).toEqual({commands:0,audits:0,amount:'12500'});
});
audit('EA05 replay reautoriza sesión revocada',async f=>{
  const w=f.work();await f.run(w);await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[f.actor.sessionId]);
  await expect(f.run(w)).rejects.toMatchObject({code:'AUTH_REQUIRED'});expect(await f.counts()).toEqual({commands:1,audits:1,amount:'20000'});
});
audit('EA06 dos conexiones simultáneas aplican una sola vez',async f=>{
  const gate=latch(),entered=latch();const w=f.work();let calls=0;
  const first=f.run({...w,apply:async c=>{calls++;entered.release();await gate.promise;return w.apply(c);}});
  await entered.promise;
  const pid=(await f.pool.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND query LIKE 'UPDATE "CoursePrice"%' AND state='idle in transaction'`)).rows[0]?.pid;
  // El titular todavía está antes del UPDATE: localizar por el bloqueo de curso real.
  const holder=pid??(await f.pool.query(`SELECT l.pid FROM pg_locks l JOIN pg_class c ON c.oid=l.relation JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname='AcademicCourse' AND l.mode='RowShareLock' LIMIT 1`)).rows[0].pid;
  const second=f.run(w);const settled=second.catch(e=>{throw e;});
  try{await waitForBlockedBy(f.pool,holder);}finally{gate.release();}
  const results=await Promise.all([first,settled]);expect(results.map(r=>r.command.replayed)).toEqual([false,true]);expect(calls).toBe(1);expect(await f.counts()).toEqual({commands:1,audits:1,amount:'20000'});
});
audit('EA07 NO_CHANGE mantiene revisión y registra decisión una vez',async f=>{
  const w={...f.work(),payload:{amountMinor:'12500'},apply:async()=>({outcomeCode:'NO_CHANGE' as const,resultingRevision:'1',resourceReferences:{courseId:f.courseId}})};
  const first=await f.run(w);await f.run(w);expect(first.command).toMatchObject({outcomeCode:'NO_CHANGE',resultingRevision:'1'});expect(await f.counts()).toEqual({commands:1,audits:1,amount:'12500'});
});
audit('EA08 SQLSTATE reintenta y no duplica auditoría',async f=>{
  const w=f.work();let calls=0;
  await f.run({...w,apply:async c=>{const result=await w.apply(c);if(++calls===1)await c.client.query("DO $$ BEGIN RAISE SQLSTATE '40001'; END $$");return result;}});
  expect(calls).toBe(2);expect(await f.counts()).toEqual({commands:1,audits:1,amount:'20000'});
});
audit('EA09 COMMIT confirmado con acuse perdido se recupera por comando',async f=>{
  let lost=false;const trace=instrumentPool(f.pool,{after:async sql=>{if(sql==='COMMIT'&&!lost){lost=true;throw new Error('ack lost');}}});
  const w=f.work();await expect(createEnrollmentCommandWriter(trace.pool,f.authorization)(w)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect((await f.run(w)).command.replayed).toBe(true);expect(await f.counts()).toEqual({commands:1,audits:1,amount:'20000'});
});
audit('EA10 referencias cerradas: no persiste payload privado como resultado',async f=>{
  const w=f.work();await expect(f.run({...w,apply:async c=>({...await w.apply(c),resourceReferences:{courseId:f.courseId,privateReason:'secret'}})})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(await f.counts()).toEqual({commands:0,audits:0,amount:'12500'});
});
audit('EA11 expiración SYSTEM única conserva primer instante; puerto no vive fuera de transacción',async f=>{
  const run=createSystemEnrollmentTransaction(f.pool),id=String(f.graph.rows.EnrollmentOrder!.id);
  const t={...f.topology,accountIds:[f.student.userId,f.teacher.userId],groupIds:[f.groupId],orderIds:[id]};
  let port:ReturnType<typeof createEnrollmentAudit>|undefined;
  const event={operation:'ORDER_EXPIRED' as const,targetId:id,requestId:randomUUID(),beforeRevision:'1',afterRevision:'2',result:'EXPIRED' as const};
  const execute=()=>run({discover:async()=>t,recheck:async()=>t,apply:async c=>{port=createEnrollmentAudit(c);return port.write(event);}});
  const a=await execute(),b=await execute();expect(a.recorded).toBe(true);expect(b).toEqual({...a,recorded:false});
  await expect(port!.write(event)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(await f.counts()).toEqual({commands:0,audits:1,amount:'12500'});
  expect((await f.pool.query('SELECT "actorKind","actorReference","effectKey" FROM "EnrollmentAuditEvent" WHERE operation=\'ORDER_EXPIRED\'')).rows[0]).toEqual({actorKind:'SYSTEM',actorReference:'enrollment-system',effectKey:`ORDER_EXPIRED/${id}`});
});
audit('EA12 seguimiento mínimo sin mutación económica',async f=>{
  const incidentId=String(f.graph.rows.PaymentIncident!.id),followUpId=randomUUID(),commandId=randomUUID();
  const topology={...f.topology,paymentIds:[String(f.graph.incidentPayment.id)],incidentIds:[incidentId]};
  const before=(await f.pool.query('SELECT to_jsonb(p) AS value FROM "VerifiedPayment" p ORDER BY id')).rows;
  const w:EnrollmentCommandWork<{id:string}>={actor:f.actor,operation:'INCIDENT_FOLLOW_UP',targetId:incidentId,commandId,requestId:randomUUID(),expectedRevision:null,payload:{content:'Contenido privado ficticio'},discover:async()=>topology,recheck:async()=>topology,
    async apply(c){await c.client.query('INSERT INTO "IncidentFollowUp" (id,"incidentId","adminUserId","commandId","recordedAt",content) VALUES ($1,$2,$3,$4,$5,$6)',[followUpId,incidentId,f.actor.userId,commandId,postgresInstantParameter(c.decision.at),'Contenido privado ficticio']);return {outcomeCode:'APPLIED',resultingRevision:'1',resourceReferences:{incidentId,followUpId}};},
    async project(_c,refs){if(!('followUpId' in refs))throw new Error('Referencia incorrecta');return {id:refs.followUpId};}};
  const first=await f.run(w),second=await f.run(w);expect(second).toEqual({...first,command:{...first.command,replayed:true}});
  expect((await f.pool.query('SELECT "resourceReferences" FROM "EnrollmentCommand" WHERE "commandId"=$1',[commandId])).rows[0].resourceReferences).toEqual({incidentId,followUpId});
  const event=(await f.pool.query('SELECT to_jsonb(e) AS value FROM "EnrollmentAuditEvent" e WHERE "commandId"=$1',[commandId])).rows[0].value;
  expect(event).toMatchObject({operation:'INCIDENT_FOLLOW_UP',targetKind:'INCIDENT',beforeRevision:null,afterRevision:null});expect(JSON.stringify(event)).not.toContain('Contenido privado');
  expect((await f.pool.query('SELECT to_jsonb(p) AS value FROM "VerifiedPayment" p ORDER BY id')).rows).toEqual(before);
  expect(await f.counts()).toEqual({commands:1,audits:1,amount:'12500'});
});
audit('EA13 clave separa actorReference y actorKind',async f=>{
  const w=f.work();await f.run(w);const other=await sessionFixture(f,'ADMIN'),sessions=new PostgresSessionStore(f.pool),actor=(await sessions.lookup(other.secret))!;
  await f.run({...w,actor,expectedRevision:'2',payload:{amountMinor:'12500'},apply:async()=>({outcomeCode:'NO_CHANGE',resultingRevision:'2',resourceReferences:{courseId:f.courseId}})});
  await f.pool.query(`INSERT INTO "EnrollmentCommand" ("actorKind","actorReference","commandId",operation,"payloadDigest","outcomeCode","resourceReferences","resultingRevision","appliedAt")
    SELECT 'SYSTEM',"actorReference","commandId",operation,"payloadDigest","outcomeCode","resourceReferences","resultingRevision","appliedAt" FROM "EnrollmentCommand" WHERE "actorKind"='ACCOUNT' AND "actorReference"=$1 AND "commandId"=$2`,[f.actor.userId,w.commandId]);
  expect((await f.run(w)).command.replayed).toBe(true);expect(await f.counts()).toEqual({commands:3,audits:2,amount:'20000'});
});
audit('EA14 error de proyección revierte cambio, ledger y evento',async f=>{
  const before=await financialFingerprint(f.pool);await expect(f.run({...f.work(),project:async()=>{throw new Error('Reader failed');}})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(await financialFingerprint(f.pool)).toBe(before);
});
audit('EA15 lectura no puede escribir auditoría',async f=>{
  const before=await financialFingerprint(f.pool);
  const {createEnrollmentTransaction}=await import('../../src/infrastructure/database/enrollment-transaction.js');
  await expect(createEnrollmentTransaction(f.pool,f.authorization)({actor:f.actor,permission:'enrollment:price-manage',mode:'READ',discover:async()=>f.topology,recheck:async()=>f.topology,
    apply:c=>createEnrollmentAudit(c).write({operation:'COURSE_PRICE_SET',targetId:f.courseId,commandId:randomUUID(),requestId:randomUUID(),beforeRevision:'1',afterRevision:'1',result:'NO_CHANGE'})})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(await financialFingerprint(f.pool)).toBe(before);
});
