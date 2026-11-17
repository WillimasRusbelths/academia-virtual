import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,expect,test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { academicFingerprint } from '../support/academic-preparation.js';
import { academicRequest,accessChanger,assertSafeDenied,courseStates,groupStates,us4Seed } from '../support/academic-us4.js';
import { sessionFixture } from '../support/session-fixture.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';

let data:AcademicOfferingDataset,http:Us1Http,seed:Awaited<ReturnType<typeof us4Seed>>;
type Actor='ADMIN'|'STUDENT'|'OWN'|'OTHER'|'VISITOR';
type Route={id:string;method:string;path:string;family:'admin'|'catalog'|'teaching';scope:'course'|'group'|'directory';operation?:string};
// Las 21 combinaciones método/ruta del contrato; no se omiten las rutas futuras.
export const authorizationRoutes:readonly Route[]=[
 {id:'A01',method:'GET',path:'/admin/academic/courses',family:'admin',scope:'course'},
 {id:'A02',method:'POST',path:'/admin/academic/courses',family:'admin',scope:'course',operation:'COURSE_CREATE'},
 {id:'A03',method:'GET',path:'/admin/academic/courses/:course',family:'admin',scope:'course'},
 {id:'A04',method:'PATCH',path:'/admin/academic/courses/:course',family:'admin',scope:'course',operation:'COURSE_EDIT'},
 {id:'A05',method:'POST',path:'/admin/academic/courses/:course/publish',family:'admin',scope:'course',operation:'COURSE_PUBLISH'},
 {id:'A06',method:'POST',path:'/admin/academic/courses/:course/withdraw',family:'admin',scope:'course',operation:'COURSE_WITHDRAW'},
 {id:'A07',method:'GET',path:'/admin/academic/courses/:course/groups',family:'admin',scope:'course'},
 {id:'A08',method:'POST',path:'/admin/academic/courses/:course/groups',family:'admin',scope:'course',operation:'GROUP_CREATE'},
 {id:'A09',method:'GET',path:'/admin/academic/groups/:group',family:'admin',scope:'group'},
 {id:'A10',method:'PATCH',path:'/admin/academic/groups/:group',family:'admin',scope:'group',operation:'GROUP_EDIT'},
 {id:'A11',method:'PUT',path:'/admin/academic/groups/:group/schedule',family:'admin',scope:'group',operation:'GROUP_SCHEDULE'},
 {id:'A12',method:'POST',path:'/admin/academic/groups/:group/publish',family:'admin',scope:'group',operation:'GROUP_PUBLISH'},
 {id:'A13',method:'POST',path:'/admin/academic/groups/:group/withdraw',family:'admin',scope:'group',operation:'GROUP_WITHDRAW'},
 {id:'A14',method:'POST',path:'/admin/academic/groups/:group/cancel',family:'admin',scope:'group',operation:'GROUP_CANCEL'},
 {id:'A15',method:'GET',path:'/admin/academic/teachers',family:'admin',scope:'directory'},
 {id:'C01',method:'GET',path:'/academic/courses',family:'catalog',scope:'course'},
 {id:'C02',method:'GET',path:'/academic/courses/:course',family:'catalog',scope:'course'},
 {id:'C03',method:'GET',path:'/academic/courses/:course/groups',family:'catalog',scope:'course'},
 {id:'C04',method:'GET',path:'/academic/courses/:course/groups/:group',family:'catalog',scope:'group'},
 {id:'T01',method:'GET',path:'/teaching/groups',family:'teaching',scope:'group'},
 {id:'T02',method:'GET',path:'/teaching/groups/:group',family:'teaching',scope:'group'},
];
beforeAll(async()=>{data=await academicOfferingDataset('us4_authorization');http=await us1Http(data);},120000);
afterAll(async()=>{try{await http?.close();}finally{await data?.cleanup();}});
const path=(route:Route)=>route.path.replace(':course',seed.courseId).replace(':group',seed.groupId);
const secret=(actor:Actor)=>actor==='VISITOR'?'':actor==='OTHER'?data.otherTeacher.secret:data.account(actor==='OWN'?'TEACHER':actor).sessions[0].secret;
function input(operation?:string){
 if(!operation)return undefined;
 return {commandId:randomUUID(),...(operation.endsWith('CREATE')?{}:{expectedRevision:'1'}),
  ...(operation==='COURSE_CREATE'?{name:'Curso ficticio US4',description:'Descripción'}:{}),
  ...(operation==='GROUP_CREATE'?{name:'Grupo ficticio US4',capacity:50}:{}),
  ...(operation.endsWith('EDIT')?{name:'Edición ficticia US4'}:{}),
  ...(operation==='GROUP_SCHEDULE'?{schedule:[{dayOfWeek:3,startTime:'18:00',endTime:'19:00'}]}:{}),
  ...(operation==='GROUP_CANCEL'?{cancellationReason:'PRIVATE_US4_REASON'}:{})};
}
function expected(route:Route,actor:Actor,state:string){
 if(actor==='VISITOR')return 401;
 if(route.family==='admin'){
  if(actor!=='ADMIN')return 403;
  if(!route.operation)return 200;
  if(route.operation.endsWith('CREATE'))return 201;
  if(route.operation.endsWith('WITHDRAW'))return state==='PUBLISHED'?200:409;
  if(route.operation==='GROUP_CANCEL')return state==='CANCELLED'?409:200;
  return ['DRAFT','WITHDRAWN'].includes(state)?200:409;
 }
 if(route.family==='catalog'){
  if(!['ADMIN','STUDENT'].includes(actor))return 403;
  return route.id==='C01'||state==='PUBLISHED'?200:404;
 }
 if(!['OWN','OTHER'].includes(actor))return 403;
 return route.id==='T02'&&actor==='OTHER'?404:200;
}
const actors:readonly Actor[]=['ADMIN','STUDENT','OWN','OTHER','VISITOR'];
async function teachingAvailable(route:Route){
 if(route.family!=='teaching')return;
 const positive=await http.get(`/teaching/groups/${seed.groupId}`,secret('OWN'));
 expect(positive.status,'T061 pendiente: control positivo HTTP docente propio, no aceptar 404 de ruta ausente como privacidad').toBe(200);
}
for(const route of authorizationRoutes)for(const state of route.scope==='course'?courseStates:route.scope==='group'?groupStates:['NA'])for(const actor of actors)
 test(`M ${route.id} ${route.method} ${route.path} / ${state} / ${actor}`,async()=>{
  seed=await us4Seed(data,{...(route.scope==='course'?{courseState:state as typeof courseStates[number]}:{}),...(route.scope==='group'?{groupState:state as typeof groupStates[number]}:{})});
  await teachingAvailable(route);
  const before=await academicFingerprint(data.observerPool),body=input(route.operation),status=expected(route,actor,state);
  const response=await academicRequest(http,route.method,path(route),secret(actor),body);
  expect(response.status,`${route.id}: contrato de permiso/estado; rutas teaching requieren T061`).toBe(status);
  const value=await response.json();
  if(status>=400){assertSafeDenied(value,data);expect(value.error.code).toBe(status===401?'AUTH_REQUIRED':status===403?'FORBIDDEN':status===404?'NOT_FOUND':'OFFERING_STATE_CONFLICT');}
  if(route.method==='GET'||status>=400)expect(await academicFingerprint(data.observerPool)).toBe(before);
  if(status<400&&route.operation){
   expect(value.data.command).toMatchObject({id:body!.commandId,replayed:false,result:'APPLIED'});
   expect((await data.observerPool.query('SELECT count(*)::int AS n FROM "AcademicCommand" WHERE "commandId"=$1',[body!.commandId])).rows[0].n).toBe(1);
  }
  if(status===200&&route.family==='teaching'){
   const owner=actor==='OWN'?data.account('TEACHER').id:data.otherTeacher.userId;
   const ids=(await data.observerPool.query('SELECT id FROM "AcademicGroup" WHERE "teacherUserId"=$1 ORDER BY name,id',[owner])).rows.map(r=>r.id);
   if(route.id==='T01'){expect(value.data.total).toBe(ids.length);expect(value.data.items.map((g:{id:string})=>g.id)).toEqual(ids);}
   else expect(value.data.id).toBe(seed.groupId);
  }
 });
for(const route of authorizationRoutes)for(const loss of ['revoked','expired','role','disabled'] as const)
 test(`L ${route.id} ${route.method} / sesión ${loss}`,async()=>{
  seed=await us4Seed(data);
  await teachingAvailable(route);
  const account=await sessionFixture(data.context,'ADMIN'),db=data.context.database.pool;
  if(loss==='revoked')await db.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[account.sessionId]);
  else if(loss==='expired')await db.query(`WITH instant AS (SELECT clock_timestamp() AS at) UPDATE "Session"
   SET "createdAt"=at-interval '9 hours',"lastAcceptedAt"=at-interval '2 hours',"absoluteExpiresAt"=at-interval '1 hour' FROM instant WHERE id=$1`,[account.sessionId]);
  else {
   const sessions=new PostgresSessionStore(db),admin=await sessions.lookup(data.account('ADMIN').sessions[0].secret);
   await accessChanger(db,sessions).execute(admin!,{id:account.userId,kind:loss==='role'?'role':'status',value:loss==='role'?'STUDENT':'DISABLED',requestId:randomUUID()});
  }
  const before=await academicFingerprint(data.observerPool),response=await academicRequest(http,route.method,path(route),account.secret,input(route.operation));
  expect(response.status,'Sesión inválida antes de entregar datos o mutar; T061 pendiente si falta ruta').toBe(401);
  const value=await response.json();assertSafeDenied(value,data);expect(value.error.code).toBe('AUTH_REQUIRED');
  expect(await academicFingerprint(data.observerPool)).toBe(before);
 });
