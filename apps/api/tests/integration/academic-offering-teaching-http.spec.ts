import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createTeachingQueries } from '../../src/modules/academic-offering/infrastructure/offering-queries.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { us4Seed, assertSafeDenied, academicRequest } from '../support/academic-us4.js';
import { academicFingerprint } from '../support/academic-preparation.js';
import { sessionFixture } from '../support/session-fixture.js';
import { latch } from '../support/academic-foundation-contract.js';

let data:AcademicOfferingDataset,http:Us1Http,seed:Awaited<ReturnType<typeof us4Seed>>,sessions:PostgresSessionStore;
const db=()=>data.context.database.pool,secret=()=>data.account('TEACHER').sessions[0].secret;
beforeAll(async()=>{data=await academicOfferingDataset('teaching_http');http=await us1Http(data);sessions=new PostgresSessionStore(data.observerPool);},120000);
beforeEach(async()=>{seed=await us4Seed(data);});
afterAll(async()=>{try{await http?.close();}finally{await data?.cleanup();}});
async function denied(path:string,status=400,method='GET'){
  const before=await academicFingerprint(data.observerPool),response=await academicRequest(http,method,path,secret());
  expect(response.status).toBe(status);const body=await response.json();assertSafeDenied(body,data);
  expect(body.error.code).toBe(status===400?'VALIDATION_ERROR':'NOT_FOUND');
  expect(await academicFingerprint(data.observerPool)).toBe(before);
}
for(const query of ['page=0','page=-1','page=1.5','page=01','page=9007199254740992','page=1&page=2',
  'pageSize=0','pageSize=51','pageSize=1.5','q=Turno','state=PUBLISHED','teacherUserId=otro'])
  test(`H01 listado rechaza ${query} sin datos ni efectos`,async()=>{await denied(`/teaching/groups?${query}`);});
for(const query of ['page=1','pageSize=1','q=Turno','state=PUBLISHED','teacherUserId=otro'])
  test(`H02 detalle no admite query ${query}`,async()=>{await denied(`/teaching/groups/${seed.groupId}?${query}`);});
for(const size of [1,50])test(`H03 tamaño límite ${size}: conteo propio antes de paginar`,async()=>{
  const response=await http.get(`/teaching/groups?pageSize=${size}`,secret());expect(response.status).toBe(200);
  const {data:value}=await response.json();expect(value).toMatchObject({total:2,page:1,pageSize:size});expect(value.items).toHaveLength(Math.min(size,2));
});
test('H04 docente sin asignaciones recibe vacío real y defaults, no grupos ajenos',async()=>{
  const account=await sessionFixture(data.context,'TEACHER'),response=await http.get('/teaching/groups',account.secret);expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual({items:[],page:1,pageSize:20,total:0});
});
test('H05 UUID de detalle se valida y normaliza, sin aceptar fragmentos arbitrarios',async()=>{
  await denied('/teaching/groups/no-es-uuid');const response=await http.get(`/teaching/groups/${seed.groupId.toUpperCase()}`,secret());
  expect(response.status).toBe(200);expect((await response.json()).data.id).toBe(seed.groupId);
});
test('H06 no hay consulta docente general de curso',async()=>{await denied(`/teaching/courses/${seed.courseId}`,404);});
for(const method of ['POST','PATCH'])test(`H07 ${method} no crea operación de gestión docente`,async()=>{await denied(`/teaching/groups/${seed.groupId}`,404,method);});
test('H08 fallo SQL real devuelve 503 seguro, no vacío, y recuperación conserva datos',async()=>{
  const before=await academicFingerprint(data.observerPool),role=new URL(data.context.environment.databaseUrl).username;
  if(!/^[a-z][a-z0-9_]+$/.test(role))throw new Error('Rol de ensayo inválido');
  await data.context.isolated.ownerQuery(`REVOKE SELECT ON "AcademicGroup" FROM "${role}"`);
  try{const response=await http.get('/teaching/groups',secret());expect(response.status).toBe(503);const body=await response.json();assertSafeDenied(body,data);expect(body.error.code).toBe('TEMPORARILY_UNAVAILABLE');}
  finally{await data.context.isolated.ownerQuery(`GRANT SELECT ON "AcademicGroup" TO "${role}"`);}
  const response=await http.get('/teaching/groups',secret());expect(response.status).toBe(200);expect((await response.json()).data.total).toBe(2);
  expect(await academicFingerprint(data.observerPool)).toBe(before);
});
for(const kind of ['list','detail'] as const)test(`Q01 ${kind}: una sentencia académica, sesión real aceptada por conexión separada`,async()=>{
  const actor=(await sessions.lookup(secret()))!,query=createTeachingQueries(db(),sessions),before=await academicFingerprint(data.observerPool);
  const spy=vi.spyOn(db(),'query');
  try{
    if(kind==='list')expect((await query.teachingGroups(actor,{page:1,pageSize:1})).total).toBe(2);
    else expect((await query.teachingGroup(actor,seed.groupId))?.id).toBe(seed.groupId);
    expect(spy).toHaveBeenCalledTimes(1);const sql=String(spy.mock.calls[0][0]);
    expect(sql).toContain('"teacherUserId"=');expect(sql).toContain('AcademicTeacherDirectory');expect(sql).not.toMatch(/\b(?:UPDATE|INSERT|DELETE)\b|FROM "User"|eligibilityVersion|teacherReviewRequired/);
  }finally{spy.mockRestore();}
  expect(await academicFingerprint(data.observerPool)).toBe(before);
});
for(const role of ['ADMIN','STUDENT'] as const)test(`Q02 ${role}: aplicación deniega lectura propia antes de SQL`,async()=>{
  const actor=(await sessions.lookup(data.account(role).sessions[0].secret))!,query=createTeachingQueries(db(),sessions),spy=vi.spyOn(db(),'query');
  try{
    await expect(query.teachingGroups(actor,{page:1,pageSize:20})).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(query.teachingGroup(actor,seed.groupId)).rejects.toMatchObject({code:'FORBIDDEN'});expect(spy).not.toHaveBeenCalled();
  }finally{spy.mockRestore();}
});
for(const kind of ['list','detail'] as const)test(`Q03 ${kind}: revocación tras SELECT y antes de aceptación no entrega la lectura`,async()=>{
  const account=await sessionFixture(data.context,'TEACHER');await db().query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1',[seed.competitorId,account.userId]);
  const actor=(await sessions.lookup(account.secret))!,reached=latch(),resume=latch();
  // Barrera en el puerto público; no sustituye el resultado de accept ni de SQL.
  const query=createTeachingQueries(db(),{async accept(who){reached.release();await resume.promise;return sessions.accept(who);}});
  const before=await academicFingerprint(data.observerPool),reading=(kind==='list'?query.teachingGroups(actor,{page:1,pageSize:20}):query.teachingGroup(actor,seed.competitorId))
    .then(value=>({value}),error=>({error}));
  try{
    await reached.promise;await db().query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[account.sessionId]);resume.release();
    expect(await reading).toMatchObject({error:{code:'AUTH_REQUIRED'}});expect(await reading).not.toHaveProperty('value');
    expect(await academicFingerprint(data.observerPool)).toBe(before);
  }finally{resume.release();await reading;}
});
