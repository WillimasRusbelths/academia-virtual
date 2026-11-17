import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { createMaterialsFoundation } from '../../src/app.module.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { SecurityEvents } from '../../src/infrastructure/logging/security-events.js';
import { materialsFixture, type MaterialsFixture } from '../support/materials.js';
import { materialFileCase } from '../support/materials-files.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { instrumentMaterialsPool } from '../support/materials-testing.js';
import { us1Http } from '../support/us1-http.js';

let f:MaterialsFixture,teacher:SessionActor,admin:SessionActor,foreign:SessionActor,student:SessionActor;
let http:Awaited<ReturnType<typeof us1Http>>,financial:string,offering:string;
const directory=mkdtempSync(path.join(tmpdir(),'materials-audit-'));
const title='Titulo privado de auditoria 004',description='Descripcion privada que no pertenece al registro';
const file=materialFileCase('pdf-valid'),command=(expectedRevision='1')=>({commandId:randomUUID(),expectedRevision});
const root=()=>createMaterialsFoundation(f.environment,f.pool);
async function offeringFingerprint() {
  const digest=createHash('sha256');
  for(const table of ['AcademicCourse','AcademicGroup','AcademicSlot','AcademicCommand','AcademicAuditEvent'])
    digest.update(table).update((await f.pool.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text AS data FROM "${table}" t`)).rows[0].data);
  return digest.digest('hex');
}
beforeAll(async()=>{
  f=await materialsFixture();const sessions=new PostgresSessionStore(f.pool);
  teacher=(await sessions.lookup(f.teacher.secret))!;admin=(await sessions.lookup(f.admin.secret))!;
  foreign=(await sessions.lookup(f.otherTeacher.secret))!;student=(await sessions.lookup(f.student.secret))!;
  http=await us1Http({context:f},f.environment.appOrigin,new SecurityEvents(directory));
},120000);
afterAll(async()=>{try{await http?.close();}finally{await f?.cleanup();rmSync(directory,{recursive:true,force:true});}});
beforeEach(async()=>{financial=await financialFingerprint(f.pool);offering=await offeringFingerprint();});
afterEach(async()=>{expect(await financialFingerprint(f.pool)).toBe(financial);expect(await offeringFingerprint()).toBe(offering);});
async function history(id:string) {
  const audit=(await f.pool.query('SELECT * FROM "MaterialAuditEvent" WHERE "materialId"=$1 ORDER BY id',[id])).rows;
  const ledger=(await f.pool.query('SELECT * FROM "MaterialCommand" WHERE "materialId"=$1 ORDER BY "actorId","commandId"',[id])).rows;
  return {audit,ledger};
}
async function resourceFacts(id:string) {
  return (await f.pool.query('SELECT to_jsonb(m) AS material,to_jsonb(c) AS content FROM "Material" m JOIN "MaterialContent" c ON c."materialId"=m.id WHERE m.id=$1',[id])).rows[0];
}
async function upload(fileId='pdf-valid') {
  const selected=materialFileCase(fileId),api=root(),input={intentionId:randomUUID(),title,description,downloadName:selected.name,
    mediaType:selected.mediaType,byteSize:selected.byteSize,sha256:selected.sha256};
  const intention=await api.uploads.register(teacher,f.groupId,input);
  return {resource:(await api.uploads.complete(teacher,intention.uploadId,selected.bytes)).resource,intention,input};
}
test('complete/edit/publish/withdraw persist only closed safe audit/ledger fields and exact receipt/event decisions',async()=>{
  const api=root(),created=await upload(),id=created.resource.id;
  const edit=command(),publish=command('2'),publishAgain=command('3'),withdraw=command('3'),withdrawAgain=command('4');
  await api.commands.edit(teacher,id,{...edit,title:title+' corregido',description});
  await api.commands.publish(teacher,id,publish);await api.commands.publish(teacher,id,publishAgain);
  await api.commands.withdraw(teacher,id,withdraw);await api.commands.withdraw(teacher,id,withdrawAgain);
  const rows=await history(id);expect(rows.audit).toHaveLength(6);expect(rows.ledger).toHaveLength(5);
  for(const row of rows.audit)expect(Object.keys(row).sort()).toEqual(['id','actorId','groupId','materialId','intentionId','commandId','operation','result','revision','occurredAt'].sort());
  for(const row of rows.ledger){
    expect(Object.keys(row).sort()).toEqual(['actorId','commandId','materialId','operation','payloadDigest','appliedRevision','result','appliedAt'].sort());
    expect(Buffer.isBuffer(row.payloadDigest)).toBe(true);expect(row.payloadDigest.length).toBe(32);
  }
  const serialized=JSON.stringify(rows);
  for(const privateValue of [title,description,file.name,file.sha256,f.teacher.secret,f.teacher.sessionId,'/private/materials','password'])expect(serialized).not.toContain(privateValue);
  const matches=(await f.pool.query(`SELECT c.operation,c.result,c."appliedRevision"::text AS revision,
    c."appliedAt"=a."occurredAt" AS "sameTime",c."appliedRevision"=a.revision AS "sameRevision",a.result=c.result AS "sameResult",
    to_char(c."appliedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
    FROM "MaterialCommand" c JOIN "MaterialAuditEvent" a ON a."actorId"=c."actorId" AND a."commandId"=c."commandId"
    WHERE c."materialId"=$1 ORDER BY c."appliedAt",c."commandId"`,[id])).rows;
  expect(matches.map(row=>[row.operation,row.result,row.revision])).toEqual([
    ['EDIT','APPLIED','2'],['PUBLISH','APPLIED','3'],['PUBLISH','NO_CHANGE','3'],['WITHDRAW','APPLIED','4'],['WITHDRAW','NO_CHANGE','4']]);
  for(const row of matches){expect(row).toMatchObject({sameTime:true,sameRevision:true,sameResult:true});expect(row.at).toMatch(/\.\d{6}Z$/);}
  expect(rows.audit.find(row=>row.operation==='UPLOAD_COMPLETE')).toMatchObject({actorId:teacher.userId,groupId:f.groupId,
    materialId:id,intentionId:created.input.intentionId,commandId:null,result:'APPLIED'});
});
test('replay returns the old receipt and current resource without changing any ledger/audit row',async()=>{
  const item=await f.seedMaterial('PREPARED'),api=root(),body={...command(),title,description};
  const applied=await api.commands.edit(teacher,item.id,body);await api.commands.withdraw(teacher,item.id,command('2'));
  const before=await history(item.id),replay=await api.commands.edit(teacher,item.id,body);
  expect(replay).toMatchObject({resource:{state:'WITHDRAWN',revision:'3'},command:{...applied.command,replayed:true}});
  expect(await history(item.id)).toEqual(before);
});
test.each(['MaterialCommand','MaterialAuditEvent'])('%s business history cannot be rewritten or deleted by runtime',async table=>{
  const item=await f.seedMaterial('PREPARED'),body=command();await root().commands.publish(teacher,item.id,body);const before=await history(item.id);
  await expect(f.pool.query(`UPDATE "${table}" SET result='NO_CHANGE' WHERE "commandId"=$1`,[body.commandId])).rejects.toMatchObject({code:'23514'});
  await expect(f.pool.query(`DELETE FROM "${table}" WHERE "commandId"=$1`,[body.commandId])).rejects.toMatchObject({code:'23514'});
  expect(await history(item.id)).toEqual(before);
});
test.each(['stale','digest','foreign','student','cancelled'] as const)('%s rejection never invents a business event or receipt',async kind=>{
  const api=root(),item=kind==='cancelled'?f.cancelledPublished:await f.seedMaterial('PREPARED'),body={...command(),title,description};
  if(kind==='digest')await api.commands.edit(teacher,item.id,body);
  const before=await history(item.id),facts=await resourceFacts(item.id);
  const operation=kind==='cancelled'?api.commands.publish(admin,item.id,command('2')):
    api.commands.edit(kind==='foreign'?foreign:kind==='student'?student:teacher,item.id,
      {...body,...(kind==='stale'?{expectedRevision:'2'}:kind==='digest'?{title:'Otro texto privado'}:{})});
  await expect(operation).rejects.toMatchObject({code:{stale:'MATERIAL_VERSION_CONFLICT',digest:'IDEMPOTENCY_CONFLICT',foreign:'NOT_FOUND',student:'FORBIDDEN',cancelled:'MATERIAL_STATE_CONFLICT'}[kind]});
  expect(await history(item.id)).toEqual(before);expect(await resourceFacts(item.id)).toEqual(facts);
});
test.each(['edit','publish','withdraw'] as const)('%s failed ledger or audit INSERT rolls back all business effects and preserves earlier history',async action=>{
  for(const table of ['MaterialCommand','MaterialAuditEvent']){
    const api=root(),item=await f.seedMaterial('PREPARED'),body=command(),before=await history(item.id),facts=await resourceFacts(item.id);
    const restore=instrumentMaterialsPool(f.pool,async(sql,run)=>{
      if(sql.includes('INSERT INTO "'+table+'"'))throw Object.assign(new Error('PRIVATE_SQL_bytes_cookie_'+f.teacher.secret),{code:'53100'});return run();
    });
    try{await expect(action==='edit'?api.commands.edit(teacher,item.id,{...body,title,description}):api.commands[action](teacher,item.id,body))
      .rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});}finally{restore();}
    expect(await history(item.id)).toEqual(before);expect(await resourceFacts(item.id)).toEqual(facts);
  }
});
test('withdrawal leaves current enrollment, reservations, unresolved incident and academic offering unchanged',async()=>{
  const item=await f.seedMaterial('PUBLISHED');
  const enrollment=(await f.pool.query('SELECT to_jsonb(e) AS row FROM "Enrollment" e WHERE "studentId"=$1',[f.student.userId])).rows;
  const incident=(await f.pool.query(`SELECT to_jsonb(i) AS row FROM "PaymentIncident" i JOIN "EnrollmentOrder" o ON o.id=i."orderId" WHERE o."studentId"=$1`,[f.incidentStudent.userId])).rows;
  expect(enrollment).toHaveLength(1);expect(incident).toHaveLength(1);
  await root().commands.withdraw(teacher,item.id,command('2'));
  expect((await f.pool.query('SELECT to_jsonb(e) AS row FROM "Enrollment" e WHERE "studentId"=$1',[f.student.userId])).rows).toEqual(enrollment);
  expect((await f.pool.query(`SELECT to_jsonb(i) AS row FROM "PaymentIncident" i JOIN "EnrollmentOrder" o ON o.id=i."orderId" WHERE o."studentId"=$1`,[f.incidentStudent.userId])).rows).toEqual(incident);
  expect((await http.get('/materials/items/'+item.id+'/content',f.student.secret)).status).toBe(404);
});
test('new file has a separate material/intention/history; withdrawing the old one never substitutes its bytes',async()=>{
  const old=await upload(),before=await resourceFacts(old.resource.id),replacement=await upload('png-valid');
  expect(old.resource.id).not.toBe(replacement.resource.id);expect(old.input.intentionId).not.toBe(replacement.input.intentionId);
  await root().commands.withdraw(teacher,old.resource.id,command());
  const retired=await resourceFacts(old.resource.id),fresh=await resourceFacts(replacement.resource.id);
  expect(retired.content).toEqual(before.content);expect(retired.material).toMatchObject({state:'WITHDRAWN',createdBy:teacher.userId,groupId:f.groupId});
  expect(fresh.material).toMatchObject({state:'PREPARED',createdBy:teacher.userId,groupId:f.groupId});
  expect(fresh.content.sha256).not.toBe(retired.content.sha256);
  expect((await history(replacement.resource.id)).audit).toHaveLength(1);
});
test('real HTTP conflict/fault/denial logs contain only safe references, never body, session, bytes, digest or SQL cause',async()=>{
  const item=await f.seedMaterial('PREPARED'),body={...command('2'),title,description};
  async function patch(secret:string){return fetch(http.url+'/api/v1/materials/items/'+item.id,{method:'PATCH',headers:http.headers(secret),body:JSON.stringify(body)});}
  const conflict=await patch(f.teacher.secret);expect(conflict.status).toBe(409);expect(JSON.stringify(await conflict.json())).not.toContain(title);
  body.expectedRevision='1';const restore=instrumentMaterialsPool(http.database.pool,async(sql,run)=>{
    if(sql.includes('INSERT INTO "MaterialAuditEvent"'))throw new Error('PRIVATE_SQL_CAUSE_'+description);return run();
  });
  try{const failed=await patch(f.teacher.secret);expect(failed.status).toBe(503);expect(JSON.stringify(await failed.json())).not.toContain(description);}finally{restore();}
  expect((await patch(f.student.secret)).status).toBe(403);
  const text=readdirSync(directory).filter(name=>name.endsWith('.jsonl')).map(name=>readFileSync(path.join(directory,name),'utf8')).join('\n');
  const events=text.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line) as Record<string,unknown>);
  expect(events.map(event=>event.reasonCode)).toEqual(expect.arrayContaining(['MATERIAL_VERSION_CONFLICT','TEMPORARILY_UNAVAILABLE','FORBIDDEN']));
  const allowed=['eventId','correlationId','occurredAt','category','action','result','reasonCode','actorKind','actorUserId','targetKind','requestedTargetId','routeTemplate','commandId'];
  for(const event of events)expect(Object.keys(event).every(key=>allowed.includes(key))).toBe(true);
  for(const privateValue of [title,description,file.name,file.sha256,f.teacher.secret,f.student.secret,f.teacher.sessionId,'PRIVATE_SQL_CAUSE'])expect(text).not.toContain(privateValue);
  expect((await history(item.id)).ledger).toHaveLength(0);expect((await history(item.id)).audit).toHaveLength(1);
});
