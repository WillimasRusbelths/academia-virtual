import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createMaterialsFoundation } from '../../src/app.module.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { materialsFixture } from '../support/materials.js';
import type { MaterialsFixture } from '../support/materials.js';
import { materialFileCase } from '../support/materials-files.js';
import { barrier, within, instrumentMaterialsPool, materialsProcess } from '../support/materials-testing.js';
import { waitForBlockedBy } from '../support/locks.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { us1Http } from '../support/us1-http.js';
import { SessionCookie } from '../../src/http/session-cookie.js';

let f:MaterialsFixture,teacher:SessionActor,admin:SessionActor;
beforeAll(async()=>{f=await materialsFixture();const sessions=new PostgresSessionStore(f.pool);teacher=(await sessions.lookup(f.teacher.secret))!;admin=(await sessions.lookup(f.admin.secret))!;},120000);
afterAll(async()=>{await f?.cleanup();});
const file=materialFileCase('pdf-valid');
const input=()=>({intentionId:randomUUID(),title:'Carrera ficticia',description:null,downloadName:file.name,mediaType:file.mediaType,byteSize:file.byteSize,sha256:file.sha256});
const root=()=>createMaterialsFoundation(f.environment,f.pool);
async function assertOne(uploadId:string) {
  const row=(await f.pool.query(`SELECT u."materialId",m.state,m.revision::text,c.bytes,
    (SELECT count(*)::int FROM "MaterialAuditEvent" a WHERE a."materialId"=m.id) AS audits
    FROM "MaterialUpload" u JOIN "Material" m ON m.id=u."materialId" JOIN "MaterialContent" c ON c."materialId"=m.id WHERE u."uploadId"=$1`,[uploadId])).rows[0];
  expect(row).toMatchObject({materialId:expect.any(String),state:'PREPARED',revision:'1',audits:1});expect(row.bytes).toEqual(file.bytes);return row.materialId as string;
}
test('two completions serialize under observed PG lock and persist exactly one material/content/audit',async()=>{
  const a=root(),b=root(),upload=await a.uploads.register(teacher,f.groupId,input()),gate=barrier();let pid=0,held=false;
  const restore=instrumentMaterialsPool(f.pool,async(sql,execute,client)=>{
    if(!held&&/INSERT INTO "Material"/.test(sql)){held=true;pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;gate.enter();await gate.released;}return execute();
  });
  const first=a.uploads.complete(teacher,upload.uploadId,file.bytes);void first.catch(()=>undefined);let second:typeof first|undefined;
  try{await within(gate.entered);second=b.uploads.complete(teacher,upload.uploadId,file.bytes);void second.catch(()=>undefined);await waitForBlockedBy(f.pool,pid);gate.release();
    const results=await Promise.all([first,second]);expect(results.map(r=>r.replayed).sort()).toEqual([false,true]);expect(results[0].resource.id).toBe(results[1].resource.id);
  }finally{gate.release();await Promise.allSettled([first,...(second?[second]:[])]);restore();}
  await assertOne(upload.uploadId);
});
test('first completion rollback releases the blocked second; prior material bytes and finances remain intact',async()=>{
  const target=root(),upload=await target.uploads.register(teacher,f.groupId,input()),gate=barrier(),finance=await financialFingerprint(f.pool);let failed=false,pid=0;
  const before=(await f.pool.query('SELECT bytes FROM "MaterialContent" WHERE "materialId"=$1',[f.prepared.id])).rows[0].bytes;
  const restore=instrumentMaterialsPool(f.pool,async(sql,execute,client)=>{
    if(!failed&&/INSERT INTO "MaterialContent"/.test(sql)){failed=true;pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;gate.enter();await gate.released;throw Object.assign(new Error('Synthetic disk fault'),{code:'53100'});}return execute();
  });
  const first=target.uploads.complete(teacher,upload.uploadId,file.bytes);void first.catch(()=>undefined);let second:typeof first|undefined;
  try{await within(gate.entered);second=root().uploads.complete(teacher,upload.uploadId,file.bytes);void second.catch(()=>undefined);await waitForBlockedBy(f.pool,pid);gate.release();
    await expect(first).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect((await second).replayed).toBe(false);
  }finally{gate.release();await Promise.allSettled([first,...(second?[second]:[])]);restore();}
  await assertOne(upload.uploadId);expect((await f.pool.query('SELECT bytes FROM "MaterialContent" WHERE "materialId"=$1',[f.prepared.id])).rows[0].bytes).toEqual(before);
  expect(await financialFingerprint(f.pool)).toBe(finance);
});
test('real process restarts preserve PENDING then COMPLETED and replay without duplicate effects',async()=>{
  const headers={'content-type':'application/json',origin:f.environment.appOrigin,'x-csrf-protection':'1',cookie:`${new SessionCookie(f.environment).name}=${f.teacher.secret}`},payload=input();
  let process=await materialsProcess(f.environment);const firstPid=process.pid;let uploadId:string;
  try {
    const response=await fetch(`${process.url}/api/v1/materials/groups/${f.groupId}/uploads`,{method:'POST',headers,body:JSON.stringify(payload)});expect(response.status).toBe(201);uploadId=(await response.json()).data.uploadId;
    await process.close();process=await materialsProcess(f.environment);expect(process.pid).not.toBe(firstPid);
    const pending=await fetch(`${process.url}/api/v1/materials/uploads/${uploadId}`,{headers});expect(pending.status).toBe(200);expect((await pending.json()).data.state).toBe('PENDING');
    const sent=await fetch(`${process.url}/api/v1/materials/uploads/${uploadId}/content`,{method:'PUT',headers:{...headers,'content-type':'application/octet-stream'},body:new Uint8Array(file.bytes)});expect(sent.status).toBe(201);
    const id=(await sent.json()).data.resource.id;await process.close();process=await materialsProcess(f.environment);
    const status=await fetch(`${process.url}/api/v1/materials/uploads/${uploadId}`,{headers});expect(status.status).toBe(200);expect((await status.json()).data).toMatchObject({state:'COMPLETED',materialId:id});
    const replay=await fetch(`${process.url}/api/v1/materials/uploads/${uploadId}/content`,{method:'PUT',headers:{...headers,'content-type':'application/octet-stream'},body:new Uint8Array(file.bytes)});expect(replay.status).toBe(200);expect((await replay.json()).data).toMatchObject({replayed:true,resource:{id}});
  }finally{await process.close();}await assertOne(uploadId);
},45000);
test('identical download name and bytes in two groups create independent immutable resources',async()=>{
  const target=root(),payload=input(),finance=await financialFingerprint(f.pool);
  const a=await target.uploads.register(admin,f.groupId,payload),b=await target.uploads.register(admin,f.otherGroupId,{...payload,intentionId:randomUUID()});
  const [one,two]=await Promise.all([target.uploads.complete(admin,a.uploadId,file.bytes),target.uploads.complete(admin,b.uploadId,file.bytes)]);
  expect(one.resource.id).not.toBe(two.resource.id);expect(one.resource.groupId).toBe(f.groupId);expect(two.resource.groupId).toBe(f.otherGroupId);
  await assertOne(a.uploadId);await assertOne(b.uploadId);expect(await financialFingerprint(f.pool)).toBe(finance);
});
test('real HTTP response loss after commit is recovered by status; manual PUT replay has one durable effect',async()=>{
  const target=root(),upload=await target.uploads.register(teacher,f.groupId,input()),http=await us1Http({context:f}),path=`/api/v1/materials/uploads/${upload.uploadId}/content`,gate=barrier();
  const observe=(request:IncomingMessage,response:ServerResponse)=>{if(request.url===path&&request.method==='PUT')response.end=((..._args:unknown[])=>{void _args;gate.enter();response.destroy();return response;}) as typeof response.end;};
  const server=http.app.getHttpServer();server.prependListener('request',observe);
  try {
    await expect(fetch(http.url+path,{method:'PUT',headers:{...http.headers(f.teacher.secret),'content-type':'application/octet-stream'},body:new Uint8Array(file.bytes)})).rejects.toThrow();
    await within(gate.entered);await assertOne(upload.uploadId);server.off('request',observe);
    expect(await target.uploads.status(teacher,upload.uploadId)).toMatchObject({state:'COMPLETED'});
    const replay=await fetch(http.url+path,{method:'PUT',headers:{...http.headers(f.teacher.secret),'content-type':'application/octet-stream'},body:new Uint8Array(file.bytes)});expect(replay.status).toBe(200);
  }finally{server.off('request',observe);await http.close();}await assertOne(upload.uploadId);
});
