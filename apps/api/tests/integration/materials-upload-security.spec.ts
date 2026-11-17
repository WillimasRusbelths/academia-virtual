import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { PoolClient } from 'pg';
import { createMaterialsFoundation } from '../../src/app.module.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { materialsFixture } from '../support/materials.js';
import type { MaterialsFixture } from '../support/materials.js';
import { materialFileCase } from '../support/materials-files.js';
import { sessionFixture } from '../support/session-fixture.js';
import { firstMaterialChunk, within, rawMaterialUpload, instrumentMaterialsPool, materialsProcess } from '../support/materials-testing.js';
import { us1Http } from '../support/us1-http.js';
import { waitForBlockedBy } from '../support/locks.js';

let f:MaterialsFixture,http:Awaited<ReturnType<typeof us1Http>>,teacher:SessionActor;
const file=materialFileCase('pdf-valid'),input=()=>({intentionId:randomUUID(),title:'Seguridad ficticia',description:null,
  downloadName:file.name,mediaType:file.mediaType,byteSize:file.byteSize,sha256:file.sha256});
const root=()=>createMaterialsFoundation(f.environment,f.pool);
beforeAll(async()=>{f=await materialsFixture();http=await us1Http({context:f});teacher=(await new PostgresSessionStore(f.pool).lookup(f.teacher.secret))!;},120000);
afterAll(async()=>{try{await http?.close();}finally{await f?.cleanup();}});
async function group() {
  const id=randomUUID();await f.pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,"teacherUserId") VALUES ($1,$2,'Grupo de seguridad',$3)`,[id,f.courseId,teacher.userId]);return id;
}
type Change='revocation'|'role'|'disabled'|'assignment'|'cancellation';
const changes=['revocation','role','disabled','assignment','cancellation'] as const;
const expected=(kind:Change)=>kind==='revocation'||kind==='disabled'?'AUTH_REQUIRED':kind==='role'?'FORBIDDEN':'NOT_FOUND';
async function change(client:Pick<PoolClient,'query'>,kind:Change,groupId:string) {
  if(kind==='revocation')await client.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[teacher.sessionId]);
  if(kind==='role')await client.query('UPDATE "User" SET role=\'STUDENT\' WHERE id=$1',[teacher.userId]);
  if(kind==='disabled')await client.query('UPDATE "User" SET status=\'DISABLED\',"disabledAt"=clock_timestamp() WHERE id=$1',[teacher.userId]);
  if(kind==='assignment')await client.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2',[f.otherTeacher.userId,groupId]);
  if(kind==='cancellation')await client.query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Ensayo',"cancelledAt"=clock_timestamp() WHERE id=$1`,[groupId]);
}
async function restoreActor() {
  await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1',[teacher.sessionId]);
  await f.pool.query('UPDATE "User" SET role=\'TEACHER\',status=\'ACTIVE\',"disabledAt"=NULL WHERE id=$1',[teacher.userId]);
}
async function unchanged(uploadId:string,groupId:string) {
  expect((await f.pool.query('SELECT "materialId" FROM "MaterialUpload" WHERE "uploadId"=$1',[uploadId])).rows[0].materialId).toBeNull();
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "Material" WHERE "groupId"=$1',[groupId])).rows[0].n).toBe(0);
  expect((await f.pool.query('SELECT bytes FROM "MaterialContent" WHERE "materialId"=$1',[f.prepared.id])).rows[0].bytes).toEqual(materialFileCase(f.prepared.fileId).bytes);
}
test.each(changes)('%s after observed first chunk denies commit and releases transfer admission',async kind=>{
  const groupId=await group(),upload=await root().uploads.register(teacher,groupId,input()),path=`/api/v1/materials/uploads/${upload.uploadId}/content`;
  const observed=firstMaterialChunk(path),server=http.app.getHttpServer();server.prependListener('request',observed.observe);
  const transfer=rawMaterialUpload(http.url+path,http.headers(f.teacher.secret));
  try {
    transfer.request.write(file.bytes.subarray(0,10));await within(observed.entered);await change(f.pool,kind,groupId);transfer.request.end(file.bytes.subarray(10));
    const response=await transfer.response;expect(response.status).toBe(expected(kind)==='AUTH_REQUIRED'?401:expected(kind)==='FORBIDDEN'?403:404);
    expect(JSON.parse(response.text).error.code).toBe(expected(kind));
  }finally{server.off('request',observed.observe);transfer.request.destroy();await transfer.response.catch(()=>undefined);await restoreActor();}
  await unchanged(upload.uploadId,groupId);const lease=root().transfers.acquire(teacher.userId);lease.release();
});
test.each(changes)('%s between validation and final write locks is revalidated before insertion',async kind=>{
  const groupId=await group(),target=root(),upload=await target.uploads.register(teacher,groupId,input()),writer=await f.pool.connect();let locks=0,changed=false;
  const restore=instrumentMaterialsPool(f.pool,async(sql,execute)=>{
    if(/FROM "User"/.test(sql)&&sql.includes('id=ANY')&&/FOR UPDATE/.test(sql)&&++locks===2){changed=true;await change(writer,kind,groupId);}return execute();
  });
  try{await expect(target.uploads.complete(teacher,upload.uploadId,file.bytes)).rejects.toMatchObject({code:expected(kind)});expect(changed).toBe(true);}
  finally{restore();writer.release();await restoreActor();}
  await unchanged(upload.uploadId,groupId);
});
test('completed replay reauthorizes assignment and intention ownership without changing the original author',async()=>{
  const groupId=await group(),target=root(),upload=await target.uploads.register(teacher,groupId,input()),completed=await target.uploads.complete(teacher,upload.uploadId,file.bytes);
  await change(f.pool,'assignment',groupId);
  await expect(target.uploads.complete(teacher,upload.uploadId,file.bytes)).rejects.toMatchObject({code:'NOT_FOUND'});
  const other=(await new PostgresSessionStore(f.pool).lookup(f.otherTeacher.secret))!;
  const resource=await target.queries.item(other,completed.resource.id);
  expect('createdBy' in resource && resource.createdBy).toBe(teacher.userId);
  await expect(target.uploads.complete(other,upload.uploadId,file.bytes)).rejects.toMatchObject({code:'NOT_FOUND'});
});
test('quota HTTP: thirty new intentions then 429; replay/status/content still work and other actor is independent',async()=>{
  const account=await sessionFixture(f,'ADMIN'),payloads=Array.from({length:30},input),ids:string[]=[];
  for(const payload of payloads){const response=await http.post(`/materials/groups/${f.groupId}/uploads`,payload,account.secret);expect(response.status).toBe(201);ids.push((await response.json()).data.uploadId);}
  const denied=await http.post(`/materials/groups/${f.groupId}/uploads`,input(),account.secret);expect(denied.status).toBe(429);
  expect((await denied.json()).error.code).toBe('RATE_LIMITED');expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0);expect(Number(denied.headers.get('retry-after'))).toBeLessThanOrEqual(60);
  expect((await http.post(`/materials/groups/${f.groupId}/uploads`,payloads[0],account.secret)).status).toBe(200);
  expect((await http.post(`/materials/groups/${f.groupId}/uploads`,{...payloads[0],title:'Distinto'},account.secret)).status).toBe(409);
  expect((await http.get(`/materials/uploads/${ids[0]}`,account.secret)).status).toBe(200);
  const sent=await fetch(http.url+`/api/v1/materials/uploads/${ids[0]}/content`,{method:'PUT',headers:{...http.headers(account.secret),'content-type':'application/octet-stream'},body:new Uint8Array(file.bytes)});expect(sent.status).toBe(201);
  const other=await sessionFixture(f,'ADMIN');expect((await http.post(`/materials/groups/${f.groupId}/uploads`,input(),other.secret)).status).toBe(201);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialUpload" WHERE "actorId"=$1',[account.userId])).rows[0].n).toBe(30);
});
test('quota: two real processes racing for the last actor slot admit only one',async()=>{
  const account=await sessionFixture(f,'ADMIN'),actor=(await new PostgresSessionStore(f.pool).lookup(account.secret))!;
  for(let n=0;n<29;n++)await root().uploads.register(actor,f.groupId,input());
  const one=await materialsProcess(f.environment),two=await materialsProcess(f.environment),holder=await f.pool.connect();let settled:Promise<Response[]>|undefined;
  try {
    await holder.query('BEGIN');await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',[actor.userId]);const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    settled=Promise.all([one,two].map(process=>fetch(process.url+`/api/v1/materials/groups/${f.groupId}/uploads`,{method:'POST',headers:http.headers(account.secret),body:JSON.stringify(input())})));void settled.catch(()=>undefined);
    await waitForBlockedBy(f.pool,pid);await holder.query('COMMIT');
    const results=await settled;expect(results.map(response=>response.status).sort()).toEqual([201,429]);
    expect(one.pid).not.toBe(two.pid);
  }finally{await holder.query('ROLLBACK');holder.release();await settled;await one.close();await two.close();}
},45000);
test('quota: expired rows do not consume the moving window; future rows count conservatively',async()=>{
  const account=await sessionFixture(f,'ADMIN'),actor=(await new PostgresSessionStore(f.pool).lookup(account.secret))!;
  await f.pool.query(`INSERT INTO "MaterialUpload" ("actorId","intentionId","groupId",title,"downloadName","mediaType","byteSize",sha256,"payloadDigest","createdAt")
    SELECT $1,gen_random_uuid(),$2,'Antigua',$3,$4,$5,$6,$7,clock_timestamp()-interval '2 minutes' FROM generate_series(1,30)`,[actor.userId,f.groupId,file.name,file.mediaType,file.byteSize,file.sha256,randomBytes(32)]);
  expect((await root().uploads.register(actor,f.groupId,input())).state).toBe('PENDING');
  await f.pool.query(`INSERT INTO "MaterialUpload" ("actorId","intentionId","groupId",title,"downloadName","mediaType","byteSize",sha256,"payloadDigest","createdAt")
    SELECT $1,gen_random_uuid(),$2,'Futura',$3,$4,$5,$6,$7,clock_timestamp()+interval '1 day' FROM generate_series(1,30)`,[actor.userId,f.groupId,file.name,file.mediaType,file.byteSize,file.sha256,randomBytes(32)]);
  await expect(root().uploads.register(actor,f.groupId,input())).rejects.toMatchObject({code:'RATE_LIMITED'});
});
test('quota: failed registration rolls back its counted row and leaves the last slot available',async()=>{
  const account=await sessionFixture(f,'ADMIN'),actor=(await new PostgresSessionStore(f.pool).lookup(account.secret))!;
  for(let n=0;n<29;n++)await root().uploads.register(actor,f.groupId,input());let failed=false;
  const restore=instrumentMaterialsPool(f.pool,async(sql,execute)=>{const result=await execute();
    if(!failed&&/INSERT INTO "MaterialUpload"/.test(sql)){failed=true;throw Object.assign(new Error('Synthetic registration disk fault'),{code:'53100'});}return result;});
  try{await expect(root().uploads.register(actor,f.groupId,input())).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(failed).toBe(true);}finally{restore();}
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialUpload" WHERE "actorId"=$1',[actor.userId])).rows[0].n).toBe(29);
  expect((await root().uploads.register(actor,f.groupId,input())).state).toBe('PENDING');
  await expect(root().uploads.register(actor,f.groupId,input())).rejects.toMatchObject({code:'RATE_LIMITED'});
  expect((await f.pool.query(`SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname=current_schema() AND indexname='MaterialUpload_actorId_createdAt_idx'`)).rows[0].n).toBe(1);
});
test.each(['53100','53200'])('resource fault %s during HTTP persistence rolls back, releases admission and preserves prior bytes',async code=>{
  const groupId=await group(),upload=await root().uploads.register(teacher,groupId,input());let failed=false;
  const restore=instrumentMaterialsPool(http.database.pool,async(sql,execute)=>{if(!failed&&/INSERT INTO "MaterialContent"/.test(sql)){failed=true;throw Object.assign(new Error('Synthetic resource failure'),{code});}return execute();});
  try {const response=await fetch(http.url+`/api/v1/materials/uploads/${upload.uploadId}/content`,{method:'PUT',headers:{...http.headers(f.teacher.secret),'content-type':'application/octet-stream'},body:new Uint8Array(file.bytes)});expect(response.status).toBe(503);expect((await response.json()).error.code).toBe('TEMPORARILY_UNAVAILABLE');expect(failed).toBe(true);}
  finally{restore();}await unchanged(upload.uploadId,groupId);
  const retry=await fetch(http.url+`/api/v1/materials/uploads/${upload.uploadId}/content`,{method:'PUT',headers:{...http.headers(f.teacher.secret),'content-type':'application/octet-stream'},body:new Uint8Array(file.bytes)});expect(retry.status).toBe(201);
});
