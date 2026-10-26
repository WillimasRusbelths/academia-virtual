import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,beforeEach,expect,test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { groupStates,courseStates } from '../support/academic-us4.js';
import type { GroupState,CourseState } from '../support/academic-us4.js';
import { resetAcademicFixture } from '../support/academic-maintenance-fixture.js';
import { academicFingerprint } from '../support/academic-preparation.js';
import { sessionFixture } from '../support/session-fixture.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';

let data:AcademicOfferingDataset,http:Us1Http;
let courses:{id:string;name:string;state:CourseState;description:string|null}[],groups:{id:string;courseId:string;name:string;state:GroupState;teacherId:string;capacity:number|null}[];
const db=()=>data.context.database.pool,own=()=>data.account('TEACHER').id;
const actor=(who:'ADMIN'|'STUDENT'|'OWN'|'OTHER')=>who==='OTHER'?data.otherTeacher.secret:data.account(who==='OWN'?'TEACHER':who).sessions[0].secret;
const keys=(value:object,fields:readonly string[])=>expect(Object.keys(value).sort()).toEqual([...fields].sort());
const adminCourse=['id','name','description','state','revision','studentVisible','createdAt','updatedAt'];
const adminGroup=['id','courseId','name','state','revision','periodStart','periodEnd','timeZone','capacity','occupancy','availability','capacityStatus','schedule','teacher','teacherReviewRequired','studentVisible','cancellationReason','cancelledAt','lastPublishedTeacherId','createdAt','updatedAt'];
const publicGroup=['id','courseId','name','periodStart','periodEnd','timeZone','capacity','occupancy','availability','capacityStatus','schedule','teacher'];
const teachingGroup=['id','course','name','state','periodStart','periodEnd','timeZone','capacity','occupancy','availability','capacityStatus','schedule','teacher'];
beforeAll(async()=>{data=await academicOfferingDataset('us4_privacy');http=await us1Http(data);},120000);
beforeEach(async()=>{
 await db().query(`UPDATE "User" SET role='TEACHER',status='ACTIVE',"disabledAt"=NULL,"emailVerifiedAt"=COALESCE("emailVerifiedAt",clock_timestamp()) WHERE id=$1`,[own()]);
 await resetAcademicFixture(data);courses=[];groups=[];
 for(const [index,state] of [...courseStates,'PUBLISHED' as const].entries()){
  const course={id:randomUUID(),name:`US4 Curso ${index}`,state,description:index===0?null:'Descripción de ensayo'};courses.push(course);
  await db().query('INSERT INTO "AcademicCourse" (id,name,description,state) VALUES ($1,$2,$3,$4)',[course.id,course.name,course.description,state]);
  for(const groupState of groupStates){
   const group={id:randomUUID(),courseId:course.id,name:`US4 Grupo ${index} ${groupState}`,state:groupState,teacherId:index===3?data.otherTeacher.userId:own(),capacity:50};groups.push(group);
   await db().query(`INSERT INTO "AcademicGroup" (id,"courseId",name,state,capacity,"periodStart","periodEnd","teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion","cancellationReason","cancelledAt")
    SELECT $1,$2,$3,$4::"AcademicGroupState",50,'2026-10-19','2026-10-25',"userId",CASE WHEN $4::text='DRAFT' THEN NULL ELSE "userId" END,
     CASE WHEN $4::text='DRAFT' THEN NULL ELSE "eligibilityVersion" END,CASE WHEN $4::text='CANCELLED' THEN 'PRIVATE_US4_REASON' ELSE NULL END,
     CASE WHEN $4::text='CANCELLED' THEN clock_timestamp() ELSE NULL END FROM "AcademicTeacherDirectory" WHERE "userId"=$5`,[group.id,group.courseId,group.name,groupState,group.teacherId]);
   await db().query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1080,1140)',[group.id]);
  }
 }
 const incomplete={id:randomUUID(),courseId:courses[0].id,name:'US4 Sin configurar',state:'DRAFT' as const,teacherId:own(),capacity:null};groups.push(incomplete);
 await db().query('INSERT INTO "AcademicGroup" (id,"courseId",name,"teacherUserId") VALUES ($1,$2,$3,$4)',[incomplete.id,incomplete.courseId,incomplete.name,incomplete.teacherId]);
});
afterAll(async()=>{try{await http?.close();}finally{await data?.cleanup();}});
function clean(value:unknown){
 const text=JSON.stringify(value);expect(text).not.toMatch(/PRIVATE_US4_REASON|"(?:email|emailCanonical|passwordHash|authVersion|role|status|eligibilityVersion|teacherEligibilityVersion|revision|teacherReviewRequired|studentVisible|cancellationReason|cancelledAt|lastPublishedTeacherId)"|publishedTeacher/);
 for(const who of ['ADMIN','STUDENT','TEACHER'] as const){expect(text).not.toContain(data.account(who).email);expect(text).not.toContain(data.account(who).sessions[0].secret);}
}
async function get(route:string,who:'ADMIN'|'STUDENT'|'OWN'|'OTHER',status=200){
 const before=await academicFingerprint(data.observerPool),generation=(await data.observerPool.query('SELECT "teacherEligibilityVersion"::text FROM "User" ORDER BY id')).rows;
 const response=await http.get(route,actor(who));expect(response.status,route.startsWith('/teaching/')?'T060/T061 pendientes: consulta HTTP docente propia real requerida':'DTO/filtro por audiencia').toBe(status);
 const result=await response.json();expect(await academicFingerprint(data.observerPool)).toBe(before);
 expect((await data.observerPool.query('SELECT "teacherEligibilityVersion"::text FROM "User" ORDER BY id')).rows).toEqual(generation);
 if(status===200)return result.data;
 expect(result).not.toHaveProperty('data');expect(result.error.code).toBe('NOT_FOUND');clean(result);return result;
}
const visible=()=>groups.filter(g=>g.state==='PUBLISHED'&&courses.find(c=>c.id===g.courseId)!.state==='PUBLISHED');
function common(value:{occupancy:unknown;availability:unknown;capacityStatus:unknown;schedule:object[]}){
 expect(value).toMatchObject({occupancy:null,availability:null,capacityStatus:'NOT_CALCULATED'});
 for(const slot of value.schedule)keys(slot,['dayOfWeek','startTime','endTime']);
}
for(const state of courseStates)test(`D curso ${state}: DTO admin cerrado sin credenciales ni expansión de hermanos`,async()=>{
 const course=courses.find(c=>c.state===state)!,value=await get(`/admin/academic/courses/${course.id}`,'ADMIN');keys(value,adminCourse);expect(value.id).toBe(course.id);
 expect(value).not.toHaveProperty('groups');expect(JSON.stringify(value)).not.toMatch(/email|authVersion|eligibilityVersion/);
});
for(const state of groupStates)test(`D grupo ${state}: diagnóstico solo admin y ninguna generación/cuenta completa`,async()=>{
 const group=groups.find(g=>g.state===state)!,value=await get(`/admin/academic/groups/${group.id}`,'ADMIN');keys(value,adminGroup);keys(value.teacher,['id','name','eligible']);common(value);
 expect(value.id).toBe(group.id);expect(JSON.stringify(value)).not.toMatch(/"email"|authVersion|eligibilityVersion|teacherEligibilityVersion|passwordHash/);
 expect(value.cancellationReason).toBe(state==='CANCELLED'?'PRIVATE_US4_REASON':null);
});
for(const who of ['ADMIN','STUDENT'] as const)for(const page of [1,2,3])test(`C cursos ${who}/página ${page}: filtro visible antes de conteo y paginación`,async()=>{
 const allowed=courses.filter(c=>visible().some(g=>g.courseId===c.id)),value=await get(`/academic/courses?q=US4&page=${page}&pageSize=1`,who);
 keys(value,['items','page','pageSize','total']);expect(value).toMatchObject({page,pageSize:1,total:allowed.length});expect(value.items.map((c:{id:string})=>c.id)).toEqual(allowed.slice(page-1,page).map(c=>c.id));
 for(const course of value.items)keys(course,['id','name','description']);clean(value);
});
for(const who of ['ADMIN','STUDENT'] as const)for(const index of [0,1,2,3])test(`C grupos ${who}/curso ${index}: ocultos fuera de página/conteo`,async()=>{
 const courseId=()=>courses[index].id,allowed=visible().filter(g=>g.courseId===courseId());
 if(!allowed.length){await get(`/academic/courses/${courseId()}/groups`,who,404);return;}
 const value=await get(`/academic/courses/${courseId()}/groups?pageSize=1`,who);expect(value.total).toBe(allowed.length);expect(value.items.map((g:{id:string})=>g.id)).toEqual(allowed.slice(0,1).map(g=>g.id));
 for(const group of value.items){keys(group,publicGroup);keys(group.teacher,['name']);common(group);}clean(value);
});
for(const who of ['ADMIN','STUDENT'] as const)for(const state of groupStates)test(`C detalle ${who}/${state}: campos públicos o 404 indistinguible`,async()=>{
 const group=groups.find(g=>g.courseId===courses[1].id&&g.state===state)!,route=`/academic/courses/${group.courseId}/groups/${group.id}`;
 const value=await get(route,who,state==='PUBLISHED'?200:404);
 if(state==='PUBLISHED'){keys(value,publicGroup);keys(value.teacher,['name']);common(value);clean(value);expect(value.id).toBe(group.id);}
});
for(const who of ['ADMIN','STUDENT'] as const)for(const defect of ['wrong-parent','missing'] as const)test(`C ${who}/${defect}: 404 sin causa privada`,async()=>{
 const group=visible()[0];await get(`/academic/courses/${defect==='wrong-parent'?courses[3].id:group.courseId}/groups/${defect==='missing'?randomUUID():group.id}`,who,404);
});
for(const who of ['OWN','OTHER'] as const)for(const page of [1,2,3,4,5])test(`T lista ${who}/página ${page}: asignación actual antes de conteo/página, GET no muta`,async()=>{
 const id=who==='OWN'?own():data.otherTeacher.userId,allowed=groups.filter(g=>g.teacherId===id).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:a.id.localeCompare(b.id));
 const value=await get(`/teaching/groups?page=${page}&pageSize=3`,who);keys(value,['items','page','pageSize','total']);expect(value).toMatchObject({page,pageSize:3,total:allowed.length});
 expect(value.items.map((g:{id:string})=>g.id)).toEqual(allowed.slice((page-1)*3,page*3).map(g=>g.id));
 for(const group of value.items){keys(group,teachingGroup);keys(group.course,['id','name','description']);keys(group.teacher,['name']);common(group);}clean(value);
});
for(const index of [0,1,2,3])for(const state of groupStates)test(`T detalle curso ${index}/${state}: contexto cerrado, sin grupos hermanos o motivo`,async()=>{
 const group=groups.find(g=>g.courseId===courses[index].id&&g.state===state)!,value=await get(`/teaching/groups/${group.id}`,index===3?'OTHER':'OWN');
 keys(value,teachingGroup);keys(value.course,['id','name','description']);keys(value.teacher,['name']);common(value);clean(value);
 expect(value).toMatchObject({id:group.id,state,course:{id:courses[index].id,name:courses[index].name,description:courses[index].description}});
 for(const sibling of groups.filter(g=>g.id!==group.id))expect(JSON.stringify(value)).not.toContain(sibling.id);
});
test('T incompleto: null y horario vacío son sin configurar, no disponibilidad ficticia',async()=>{
 const group=groups.at(-1)!,value=await get(`/teaching/groups/${group.id}`,'OWN');keys(value,teachingGroup);common(value);clean(value);
 expect(value).toMatchObject({capacity:null,periodStart:null,periodEnd:null,schedule:[],course:{description:null}});
});
for(const defect of ['foreign','missing','course-route'] as const)test(`T ${defect}: control positivo propio antes de denegación`,async()=>{
 const group=groups[0];await get(`/teaching/groups/${group.id}`,'OWN');
 await get(defect==='course-route'?`/teaching/courses/${group.courseId}`:`/teaching/groups/${defect==='missing'?randomUUID():group.id}`,defect==='foreign'?'OTHER':'OWN',404);
});
test('T reasignación actual: anterior captura no concede acceso; otro docente obtiene solo su grupo',async()=>{
 const group=groups.find(g=>g.state==='WITHDRAWN'&&g.teacherId===own())!;await get(`/teaching/groups/${group.id}`,'OWN');
 const response=await fetch(`${http.url}/api/v1/admin/academic/groups/${group.id}`,{method:'PATCH',headers:http.headers(actor('ADMIN')),
  body:JSON.stringify({commandId:randomUUID(),expectedRevision:'1',teacherUserId:data.otherTeacher.userId})});expect(response.status).toBe(200);
 await get(`/teaching/groups/${group.id}`,'OWN',404);const value=await get(`/teaching/groups/${group.id}`,'OTHER');keys(value,teachingGroup);clean(value);
 expect((await data.observerPool.query('SELECT "publishedTeacherUserId" FROM "AcademicGroup" WHERE id=$1',[group.id])).rows[0].publishedTeacherUserId).toBe(own());
});
test('S selector con homónimos: solo id/nombre elegibles, sin email/estado de cuenta',async()=>{
 const a=await sessionFixture(data.context,'TEACHER'),b=await sessionFixture(data.context,'TEACHER'),disabled=await sessionFixture(data.context,'TEACHER');
 await db().query(`UPDATE "User" SET name='Homónimo US4' WHERE id=ANY($1::uuid[])`,[[a.userId,b.userId,disabled.userId]]);
 await db().query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`,[disabled.userId]);
 const value=await get('/admin/academic/teachers?q=Hom%C3%B3nimo%20US4','ADMIN');expect(value.total).toBe(2);expect(value.items.map((t:{id:string})=>t.id).sort()).toEqual([a.userId,b.userId].sort());for(const candidate of value.items)keys(candidate,['id','name']);clean(value);
});
for(const who of ['ADMIN','STUDENT'] as const)for(const loss of ['role','status','verification'] as const)test(`V ${who}/${loss}: recuperación sin GET intermedio no filtra diagnóstico ni renueva snapshot`,async()=>{
 if(loss==='role'){await db().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`,[own()]);await db().query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`,[own()]);}
 else if(loss==='status'){await db().query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`,[own()]);await db().query(`UPDATE "User" SET status='ACTIVE',"disabledAt"=NULL WHERE id=$1`,[own()]);}
 else{await db().query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1',[own()]);await db().query('UPDATE "User" SET "emailVerifiedAt"=clock_timestamp() WHERE id=$1',[own()]);}
 const value=await get('/academic/courses',who);expect(value.total).toBe(1);expect(value.items.map((c:{id:string})=>c.id)).toEqual([courses[3].id]);clean(value);
 const admin=await get(`/admin/academic/groups/${groups.find(g=>g.courseId===courses[1].id&&g.state==='PUBLISHED')!.id}`,'ADMIN');expect(admin).toMatchObject({teacherReviewRequired:true,studentVisible:false});
});
