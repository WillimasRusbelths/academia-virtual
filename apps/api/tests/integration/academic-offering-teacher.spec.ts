import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,beforeEach,expect,test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { changeTeacher,setGroupState,us4Seed } from '../support/academic-us4.js';
import { existingCommands,commandCounts } from '../support/academic-maintenance.js';
import { academicFingerprint } from '../support/academic-preparation.js';
import { teacherState } from '../support/academic-migration.js';
import { instrumentPool,latch } from '../support/academic-foundation-contract.js';
import { waitForBlockedBy } from '../support/locks.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { PostgresPasswordResetStore } from '../../src/modules/identity/infrastructure/password-reset-store.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import { canConsumeAction } from '../../src/modules/identity/domain/access.js';
import type { OfferingCommand } from '../../src/modules/academic-offering/application/offering-store.js';
import type { Pool } from 'pg';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';

let data:AcademicOfferingDataset,http:Us1Http,seed:Awaited<ReturnType<typeof us4Seed>>;
const db=()=>data.context.database.pool;
const state=()=>teacherState(data.observerPool,data.account('TEACHER').id);
beforeAll(async()=>{data=await academicOfferingDataset('us4_teacher');http=await us1Http(data);},120000);
beforeEach(async()=>{seed=await us4Seed(data);});
afterAll(async()=>{try{await http?.close();}finally{await data?.cleanup();}});
async function execute(command:OfferingCommand,pool:Pool=db()){
 const sessions=new PostgresSessionStore(pool),actor=await sessions.lookup(data.account('ADMIN').sessions[0].secret);
 expect(actor).not.toBeNull();return existingCommands(pool,sessions).execute(actor!,command,{requestId:randomUUID()});
}
const publish=(id=seed.groupId,course=false,revision='1'):OfferingCommand=>course
 ?{operation:'COURSE_PUBLISH',courseId:id,commandId:randomUUID(),expectedRevision:revision}
 :{operation:'GROUP_PUBLISH',groupId:id,commandId:randomUUID(),expectedRevision:revision};
async function snapshot(){return (await data.observerPool.query('SELECT state,revision::text,"publishedTeacherUserId","publishedTeacherEligibilityVersion"::text FROM "AcademicGroup" WHERE id=$1',[seed.groupId])).rows[0];}
async function hidden(){
 const before=await academicFingerprint(data.observerPool),generation=(await state()).generation;
 const admin=await http.get(`/admin/academic/groups/${seed.groupId}`,data.account('ADMIN').sessions[0].secret);expect(admin.status).toBe(200);
 expect((await admin.json()).data).toMatchObject({teacherReviewRequired:true,studentVisible:false});
 expect((await http.get(`/academic/courses/${seed.courseId}/groups/${seed.groupId}`,data.account('STUDENT').sessions[0].secret)).status).toBe(404);
 expect((await http.get(`/academic/courses/${seed.courseId}/groups/${seed.otherGroupId}`,data.account('STUDENT').sessions[0].secret)).status).toBe(200);
 expect(await academicFingerprint(data.observerPool)).toBe(before);expect((await state()).generation).toBe(generation);
}
for(const kind of ['role','status'] as const)for(const first of ['publication','identity'] as const)
 test(`R ${kind}/${first} primero: barrera real, pérdida oculta y snapshot no se recupera`,async()=>{
  await setGroupState(data,seed.groupId,'WITHDRAWN');const old=await snapshot(),generation=BigInt((await state()).generation!);
  const ready=latch(),release=latch();let held=false,holderPid=0;
  const a=instrumentPool(db(),{after:async(sql,pid)=>{if(!held&&sql.includes('"User"')&&/FOR UPDATE/i.test(sql)){held=true;holderPid=pid;ready.release();await release.promise;}}});
  const b=instrumentPool(db()),publication=publish();
  const lose=(pool:Pool)=>changeTeacher(data,kind,kind==='role'?'STUDENT':'DISABLED',pool);
  let runA:Promise<unknown>|undefined,runB:Promise<unknown>|undefined;
  try{
   runA=first==='publication'?execute(publication,a.pool):lose(a.pool);const resultA=runA.then(value=>({value}),error=>({error}));
   await expect.poll(()=>held,{timeout:2000}).toBe(true);await ready.promise;
   runB=first==='publication'?lose(b.pool):execute(publication,b.pool);const resultB=runB.then(value=>({value}),error=>({error}));
   await waitForBlockedBy(data.observerPool,holderPid);release.release();
   expect(await resultA).toHaveProperty('value');
   if(first==='publication')expect(await resultB).toHaveProperty('value');
   else expect(await resultB).toMatchObject({error:{code:'TEACHER_NOT_ELIGIBLE'}});
   expect(a.pids[0]).not.toBe(b.pids[0]);
   const trace=first==='publication'?a:b,index=trace.statements.findIndex(s=>s.sql.includes('"User"')&&/FOR UPDATE/i.test(s.sql));
   expect(trace.statements.slice(index+1).some(s=>s.sql.includes('AcademicTeacherDirectory'))).toBe(true);
  }finally{release.release();await Promise.allSettled([runA,runB].filter((v):v is Promise<unknown>=>v!==undefined));}
  expect((await state()).generation).toBe(String(generation+1n));
  expect(await snapshot()).toEqual({...old,state:first==='publication'?'PUBLISHED':'WITHDRAWN',revision:first==='publication'?'2':'1'});
  expect(await commandCounts(data,publication.commandId)).toEqual(first==='publication'?{ledger:1,audit:1}:{ledger:0,audit:0});
  expect((await data.observerPool.query('SELECT count(*)::int AS n FROM "Session" WHERE "userId"=$1 AND "revokedAt" IS NULL',[seed.teacherId])).rows[0].n).toBe(0);
  await hidden();
 });
for(const kind of ['role','status','verification'] as const)test(`G ${kind}: pérdida y recuperación sin lecturas conserva generación y exige republicación`,async()=>{
 const old=await snapshot(),generation=BigInt((await state()).generation!);
 if(kind==='verification'){
  await db().query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1',[seed.teacherId]);
  await db().query('UPDATE "User" SET "emailVerifiedAt"=clock_timestamp() WHERE id=$1',[seed.teacherId]);
 }else{
  await changeTeacher(data,kind,kind==='role'?'STUDENT':'DISABLED');
  await changeTeacher(data,kind,kind==='role'?'TEACHER':'ACTIVE');
 }
 // Ninguna lectura académica ni de generación entre la pérdida y la recuperación.
 expect((await state()).generation).toBe(String(generation+1n));expect(await snapshot()).toEqual(old);await hidden();
});
test('P reset real revoca credenciales sin incrementar generación ni ocultar publicación',async()=>{
 const before=await state(),old=await snapshot(),issued=accessSecrets.issue();
 await db().query(`INSERT INTO "ActionToken" ("userId",purpose,"tokenHash","emailCanonicalSnapshot","createdAt","expiresAt")
  SELECT id,'RESET_PASSWORD',$2,"emailCanonical",clock_timestamp(),clock_timestamp()+interval '30 minutes' FROM "User" WHERE id=$1`,[seed.teacherId,Buffer.from(issued.digest)]);
 const hash=(await db().query<{passwordHash:string}>('SELECT "passwordHash" FROM "User" WHERE id=$1',[seed.teacherId])).rows[0].passwordHash;
 expect(await new PostgresPasswordResetStore(db()).consume(issued.digest,hash,(account,action,now)=>canConsumeAction(account,action,'RESET_PASSWORD',now))).toBe(true);
 expect((await state()).generation).toBe(before.generation);expect((await state()).authVersion).toBe(String(BigInt(before.authVersion)+1n));expect(await snapshot()).toEqual(old);
 expect((await http.get(`/academic/courses/${seed.courseId}/groups/${seed.groupId}`,data.account('STUDENT').sessions[0].secret)).status).toBe(200);
});
for(const kind of ['role','status'] as const)test(`C ${kind}: recuperar habilitación no recupera cancelado`,async()=>{
 await execute({operation:'GROUP_CANCEL',groupId:seed.groupId,expectedRevision:'1',commandId:randomUUID(),cancellationReason:'PRIVATE_US4_REASON'});
 const before=await academicFingerprint(data.observerPool),old=await snapshot();
 await changeTeacher(data,kind,kind==='role'?'STUDENT':'DISABLED');await changeTeacher(data,kind,kind==='role'?'TEACHER':'ACTIVE');
 await expect(execute(publish(seed.groupId,false,'2'))).rejects.toMatchObject({code:'OFFERING_STATE_CONFLICT'});
 await expect(execute({operation:'GROUP_EDIT',groupId:seed.groupId,expectedRevision:'2',commandId:randomUUID(),changes:{name:'No recuperar'}})).rejects.toMatchObject({code:'OFFERING_STATE_CONFLICT'});
 expect(await snapshot()).toEqual(old);expect(await academicFingerprint(data.observerPool)).toBe(before);
 expect((await http.get(`/academic/courses/${seed.courseId}/groups/${seed.groupId}`,data.account('STUDENT').sessions[0].secret)).status).toBe(404);
});
test('V publicar curso no limpia revisión; retirar hijo y republicar explícitamente sí captura generación vigente',async()=>{
 const original=await snapshot();await changeTeacher(data,'status','DISABLED');await changeTeacher(data,'status','ACTIVE');
 await execute({operation:'COURSE_WITHDRAW',courseId:seed.courseId,expectedRevision:'1',commandId:randomUUID()});
 const before=await academicFingerprint(data.observerPool);
 await expect(execute(publish(seed.courseId,true,'2'))).rejects.toMatchObject({code:'COURSE_PUBLICATION_BLOCKED',failure:{conflictingGroupIds:[seed.groupId]}});
 expect(await academicFingerprint(data.observerPool)).toBe(before);expect(await snapshot()).toEqual(original);
 await execute({operation:'GROUP_WITHDRAW',groupId:seed.groupId,expectedRevision:'1',commandId:randomUUID()});
 await execute(publish(seed.courseId,true,'2'));expect((await snapshot()).publishedTeacherEligibilityVersion).toBe(original.publishedTeacherEligibilityVersion);
 const value=await execute(publish(seed.groupId,false,'2'));expect(value.resource).toMatchObject({studentVisible:true,teacherReviewRequired:false});
 expect((await snapshot()).publishedTeacherEligibilityVersion).toBe((await state()).generation);
 expect((await http.get(`/academic/courses/${seed.courseId}/groups/${seed.groupId}`,data.account('STUDENT').sessions[0].secret)).status).toBe(200);
});
