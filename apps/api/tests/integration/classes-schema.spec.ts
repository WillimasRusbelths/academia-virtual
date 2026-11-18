import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import { assertAcademicFixtureInputs } from '../support/academic-offering.js';
import { createIsolatedTestEnvironment } from '../support/test-environment.js';
import { repositoryRoot } from '../../src/infrastructure/config/environment.js';

let context: Awaited<ReturnType<typeof identityDatabase>>;
let actorId: string, otherActorId: string, courseId: string;
type Sql = Pick<PoolClient, 'query'>;
const at = '2026-11-17T12:00:00.123456Z';
const later = '2026-11-17T12:01:00.123457Z';
const last = '2026-11-17T12:02:00.123458Z';
const tables = ['ClassSession', 'ClassMessage', 'ClassStudentRestriction', 'ClassCommand', 'ClassChange', 'ClassAuditEvent', 'ClassVideoReference'];
beforeAll(async () => {
  assertAcademicFixtureInputs();
  context = await identityDatabase('classes_schema');
  actorId = await account(); otherActorId = await account(); courseId = randomUUID();
  await context.database.pool.query('INSERT INTO "AcademicCourse" (id,name) VALUES ($1,\'Curso ficticio\')', [courseId]);
}, 120000);
afterAll(async () => { await context?.cleanup(); });
async function account(role: 'ADMIN' | 'STUDENT' = 'ADMIN') {
  const id = randomUUID(), email = `${id}@example.test`;
  await context.database.pool.query(`INSERT INTO "User" (id,name,email,"emailCanonical",role,"mustSetPassword")
    VALUES ($1,'Responsable ficticio',$2,$2,$3,true)`, [id,email,role]);
  return id;
}
async function insert(table: string, row: Record<string, unknown>, client: Sql = context.database.pool) {
  const columns = Object.keys(row);
  await client.query(`INSERT INTO "${table}" (${columns.map(k=>`"${k}"`).join(',')}) VALUES (${columns.map((_,i)=>`$${i+1}`).join(',')})`, Object.values(row));
}
async function group(client: Sql = context.database.pool) {
  const id = randomUUID(); await insert('AcademicGroup', {id,courseId,name:'Grupo ficticio'},client); return id;
}
async function session(values: Record<string, unknown> = {}, client: Sql = context.database.pool) {
  const row = {id:randomUUID(),groupId:await group(client),title:'Clase ficticia',createdBy:actorId,updatedBy:actorId,createdAt:at,updatedAt:at,...values};
  await insert('ClassSession',row,client); return row.id;
}
async function message(classId: string, values: Record<string,unknown> = {}, client: Sql = context.database.pool) {
  const row={id:randomUUID(),classId,authorId:actorId,messageSeq:'1',text:'Pregunta ficticia',acceptedAt:at,...values};
  await insert('ClassMessage',row,client); return row.id;
}
async function start(id: string, time = later) {
  await context.database.pool.query(`UPDATE "ClassSession" SET state='LIVE',"startedAt"=$1,"updatedAt"=$1,revision=revision+1 WHERE id=$2`,[time,id]);
}
async function transaction<T>(work: (client: PoolClient)=>Promise<T>) {
  const client=await context.database.pool.connect();
  try {await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
test('instala siete tablas privadas y runtime no obtiene CREATE',async()=>{
  for(const name of tables) expect((await context.database.pool.query('SELECT to_regclass($1)::text AS name',[`"${name}"`])).rows[0].name).not.toBeNull();
  expect((await context.database.pool.query("SELECT has_schema_privilege(current_user,current_schema(),'CREATE') AS allowed")).rows[0].allowed).toBe(false);
  expect(await context.database.prisma.classSession.count()).toBe(0);
  expect(await context.database.prisma.classVideoReference.count()).toBe(0);
});
test('estado inicial, revisión, contador y precisión de seis microsegundos',async()=>{
  const id=await session();
  expect((await context.database.pool.query(`SELECT state,revision::text,"lastEventSeq"::text,"startedAt","finishedAt","cancelledAt",
    to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at FROM "ClassSession" WHERE id=$1`,[id])).rows[0])
    .toEqual({state:'PREPARED',revision:'1',lastEventSeq:'0',startedAt:null,finishedAt:null,cancelledAt:null,at});
  for(const values of [{revision:0},{revision:2},{lastEventSeq:-1},{state:'LIVE',startedAt:at},{updatedAt:'2026-01-01Z'}])
    await expect(session(values)).rejects.toMatchObject({code:'23514'});
});
test.each(['',' ',' sin trim','\u00a0título','x'.repeat(161)])('rechaza título inválido %j',async title=>{
  await expect(session({title})).rejects.toMatchObject({code:'23514'});
});
test('texto Unicode, trim común, descripción opcional e inerte',async()=>{
  const id=await session({title:'🎓'.repeat(160),description:'ñ'.repeat(2000)});
  expect((await context.database.pool.query('SELECT char_length(title)::int AS n FROM "ClassSession" WHERE id=$1',[id])).rows[0].n).toBe(160);
  await expect(session({description:'x'.repeat(2001)})).rejects.toMatchObject({code:'23514'});
  const empty=await session({description:'\u00a0 \n\t'});
  expect((await context.database.pool.query('SELECT description FROM "ClassSession" WHERE id=$1',[empty])).rows[0].description).toBeNull();
  await session({title:'<script>inerte</script>',description:'<b>texto</b>'});
});
test('identidad/grupo/creador/fecha inicial inmutables y revisión solo por gestión',async()=>{
  const id=await session();
  for(const [key,value] of Object.entries({id:randomUUID(),groupId:await group(),createdBy:otherActorId,createdAt:later}))
    await expect(context.database.pool.query(`UPDATE "ClassSession" SET "${key}"=$1 WHERE id=$2`,[value,id])).rejects.toMatchObject({code:'23514'});
  await expect(context.database.pool.query('UPDATE "ClassSession" SET title=\'Otro\' WHERE id=$1',[id])).rejects.toMatchObject({code:'23514'});
  await expect(context.database.pool.query('UPDATE "ClassSession" SET revision=revision+1 WHERE id=$1',[id])).rejects.toMatchObject({code:'23514'});
  await context.database.pool.query('UPDATE "ClassSession" SET "lastEventSeq"=5 WHERE id=$1',[id]);
  expect((await context.database.pool.query('SELECT revision::text FROM "ClassSession" WHERE id=$1',[id])).rows[0].revision).toBe('1');
  await expect(context.database.pool.query('UPDATE "ClassSession" SET "lastEventSeq"=4 WHERE id=$1',[id])).rejects.toMatchObject({code:'23514'});
});
test('transiciones manuales y terminales, tiempos ordenados y textos corregibles',async()=>{
  const id=await session();
  await expect(context.database.pool.query(`UPDATE "ClassSession" SET state='FINISHED',"startedAt"=$1,"finishedAt"=$1,"updatedAt"=$1,revision=2 WHERE id=$2`,[later,id])).rejects.toMatchObject({code:'23514'});
  await start(id);
  await expect(context.database.pool.query(`UPDATE "ClassSession" SET state='FINISHED',"finishedAt"=$1,"updatedAt"=$2,revision=3 WHERE id=$3`,[at,last,id])).rejects.toMatchObject({code:'23514'});
  await context.database.pool.query(`UPDATE "ClassSession" SET state='FINISHED',"finishedAt"=$1,"updatedAt"=$1,revision=3 WHERE id=$2`,[last,id]);
  await expect(context.database.pool.query(`UPDATE "ClassSession" SET state='LIVE',"finishedAt"=NULL,revision=4 WHERE id=$1`,[id])).rejects.toMatchObject({code:'23514'});
  await context.database.pool.query('UPDATE "ClassSession" SET title=\'Corregido\',revision=4 WHERE id=$1',[id]);
  const cancelled=await session();
  await context.database.pool.query(`UPDATE "ClassSession" SET state='CANCELLED',"cancelledAt"=$1,"updatedAt"=$1,revision=2 WHERE id=$2`,[later,cancelled]);
  await expect(context.database.pool.query(`UPDATE "ClassSession" SET state='PREPARED',"cancelledAt"=NULL,revision=3 WHERE id=$1`,[cancelled])).rejects.toMatchObject({code:'23514'});
});
test('índice LIVE único por grupo admite otra clase tras finalizar y otros grupos',async()=>{
  const groupId=await group(), a=await session({groupId}),b=await session({groupId}),c=await session();
  await start(a); await start(c);
  await expect(start(b)).rejects.toMatchObject({code:'23505'});
  await context.database.pool.query(`UPDATE "ClassSession" SET state='FINISHED',"finishedAt"=$1,"updatedAt"=$1,revision=3 WHERE id=$2`,[last,a]);
  await start(b);
});
test('FK RESTRICT impiden padres inexistentes, borrar grupo/autor y actualizar sus IDs',async()=>{
  const fresh=await account(), groupId=await group();await session({groupId,createdBy:fresh,updatedBy:fresh});
  await expect(context.database.pool.query('DELETE FROM "AcademicGroup" WHERE id=$1',[groupId])).rejects.toMatchObject({code:'23503'});
  await expect(context.database.pool.query('DELETE FROM "User" WHERE id=$1',[fresh])).rejects.toMatchObject({code:'23503'});
  await expect(session({groupId:randomUUID()})).rejects.toMatchObject({code:'23503'});
  await expect(session({createdBy:randomUUID()})).rejects.toMatchObject({code:'23503'});
  const fks=await context.database.pool.query(`SELECT c.confdeltype,c.confupdtype FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname=ANY($1::text[]) AND c.contype='f'`,[tables]);
  expect(fks.rows.length).toBeGreaterThan(15);expect(fks.rows.every(r=>r.confdeltype==='r'&&r.confupdtype==='r')).toBe(true);
});
test('mensajes preservan texto/autor/clase/orden/fecha y solo permiten ocultación irreversible completa',async()=>{
  const classId=await session(),id=await message(classId);
  for(const [key,value] of Object.entries({id:randomUUID(),classId:await session(),authorId:otherActorId,messageSeq:2,text:'Otro',acceptedAt:later}))
    await expect(context.database.pool.query(`UPDATE "ClassMessage" SET "${key}"=$1 WHERE id=$2`,[value,id])).rejects.toMatchObject({code:'23514'});
  await expect(context.database.pool.query('UPDATE "ClassMessage" SET "hiddenAt"=$1 WHERE id=$2',[later,id])).rejects.toMatchObject({code:'23514'});
  await context.database.pool.query('UPDATE "ClassMessage" SET "hiddenAt"=$1,"hiddenBy"=$2,"hiddenEventSeq"=2 WHERE id=$3',[later,actorId,id]);
  await expect(context.database.pool.query('UPDATE "ClassMessage" SET "hiddenAt"=NULL,"hiddenBy"=NULL,"hiddenEventSeq"=NULL WHERE id=$1',[id])).rejects.toMatchObject({code:'23514'});
  await expect(context.database.pool.query('DELETE FROM "ClassMessage" WHERE id=$1',[id])).rejects.toMatchObject({code:'23514'});
  expect((await context.database.pool.query('SELECT text FROM "ClassMessage" WHERE id=$1',[id])).rows[0].text).toBe('Pregunta ficticia');
});
test.each(['',' ',' sin trim','x'.repeat(1001)])('texto de mensaje inválido %j',async text=>{
  await expect(message(await session(),{text})).rejects.toMatchObject({code:'23514'});
});
test('mensajes únicos por clase/sequence, bigint preciso y huecos válidos',async()=>{
  const id=await session();await message(id,{messageSeq:'9007199254740993',text:'🎓'.repeat(1000)});
  await expect(message(id,{messageSeq:'9007199254740993'})).rejects.toMatchObject({code:'23505'});
  await expect(message(id,{messageSeq:0})).rejects.toMatchObject({code:'23514'});
  await message(id,{messageSeq:'9007199254740995'});
  expect((await context.database.pool.query('SELECT "messageSeq"::text FROM "ClassMessage" WHERE "classId"=$1 ORDER BY "messageSeq"',[id])).rows.map(r=>r.messageSeq)).toEqual(['9007199254740993','9007199254740995']);
});
test('restricción por clase/alumno, revisión positiva, identidad y orden durables',async()=>{
  const classId=await session();const row={classId,studentId:otherActorId,muted:true,revision:1,updatedBy:actorId,updatedAt:at,lastEventSeq:1};
  await insert('ClassStudentRestriction',row);
  await expect(insert('ClassStudentRestriction',row)).rejects.toMatchObject({code:'23505'});
  await expect(insert('ClassStudentRestriction',{...row,classId:await session(),revision:0})).rejects.toMatchObject({code:'23514'});
  await expect(context.database.pool.query('UPDATE "ClassStudentRestriction" SET "studentId"=$1 WHERE "classId"=$2',[actorId,classId])).rejects.toMatchObject({code:'23514'});
  await context.database.pool.query('UPDATE "ClassStudentRestriction" SET muted=false,revision=2,"lastEventSeq"=2,"updatedAt"=$1 WHERE "classId"=$2',[later,classId]);
  await expect(context.database.pool.query('UPDATE "ClassStudentRestriction" SET revision=1 WHERE "classId"=$1',[classId])).rejects.toMatchObject({code:'23514'});
});
async function command(classId:string,values:Record<string,unknown>={},client:Sql=context.database.pool){
  const groupId=(await client.query('SELECT "groupId" FROM "ClassSession" WHERE id=$1',[classId])).rows[0].groupId;
  const row={actorId,commandId:randomUUID(),classId,groupId,operation:'EDIT',payloadDigest:randomBytes(32),result:'APPLIED',appliedRevision:1,appliedEventSeq:1,appliedAt:at,...values};
  await insert('ClassCommand',row,client);return row.commandId;
}
test('ledger único por actor/intención, digest SHA256, sin cuerpos ni resultados inciertos persistidos',async()=>{
  const classId=await session(),commandId=await command(classId);
  await expect(command(classId,{commandId})).rejects.toMatchObject({code:'23505'});
  await command(classId,{commandId,actorId:otherActorId});
  await expect(command(classId,{payloadDigest:randomBytes(31)})).rejects.toMatchObject({code:'23514'});
  await expect(command(classId,{groupId:await group()})).rejects.toMatchObject({code:'23503'});
  await expect(command(classId,{result:'NOT_CONFIRMED'})).rejects.toMatchObject({code:'22P02'});
  for(const table of ['ClassCommand','ClassChange','ClassAuditEvent']){
    const columns=(await context.database.pool.query('SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1',[table])).rows;
    expect(columns.some(c=>['text','title','payload','streamKey','videoId'].includes(c.column_name)||['json','jsonb'].includes(c.data_type))).toBe(false);
  }
});
test.each(['UNMUTE','VIDEO_REFERENCE_SET'] as const)('NO_CHANGE sin recurso persistido: %s',async operation=>{
  const classId=await session(),studentId=await account('STUDENT');
  const input={operation,targetStudentId:operation==='UNMUTE'?studentId:null,result:'NO_CHANGE',appliedRevision:null,appliedEventSeq:null};
  const commandId=await command(classId,input);
  const receipt=(await context.database.pool.query('SELECT result,"appliedRevision","appliedEventSeq" FROM "ClassCommand" WHERE "actorId"=$1 AND "commandId"=$2',[actorId,commandId])).rows[0];
  expect(receipt).toEqual({result:'NO_CHANGE',appliedRevision:null,appliedEventSeq:null});
  for(const table of ['ClassStudentRestriction','ClassVideoReference','ClassChange'])
    expect((await context.database.pool.query(`SELECT 1 FROM "${table}" WHERE "classId"=$1`,[classId])).rowCount).toBe(0);
  await expect(command(classId,{...input,commandId})).rejects.toMatchObject({code:'23505'});
  await expect(command(classId,{...input,result:'APPLIED'})).rejects.toMatchObject({code:'23514'});
  await expect(command(classId,{...input,appliedEventSeq:1})).rejects.toMatchObject({code:'23514'});
});
test('eventos y referencias de mensaje pertenecen a su misma clase',async()=>{
  const classId=await session(),otherClass=await session(),messageId=await message(otherClass);
  const event={classId,eventSeq:1,type:'MESSAGE_SENT',actorId,occurredAt:at,messageId};
  await expect(insert('ClassChange',event)).rejects.toMatchObject({code:'23503'});
  await expect(command(classId,{operation:'SEND',messageId,appliedRevision:null})).rejects.toMatchObject({code:'23503'});
  await insert('ClassChange',{...event,classId:otherClass});
  await expect(insert('ClassChange',{...event,classId:otherClass})).rejects.toMatchObject({code:'23505'});
  await expect(insert('ClassChange',{classId,eventSeq:0,type:'CREATED',actorId,occurredAt:at,revision:1})).rejects.toMatchObject({code:'23514'});
});
test('ledger, cambios y auditoría son append-only también para runtime',async()=>{
  const classId=await session();await command(classId);
  await insert('ClassChange',{classId,eventSeq:1,type:'CREATED',actorId,occurredAt:at,revision:1});
  const groupId=(await context.database.pool.query('SELECT "groupId" FROM "ClassSession" WHERE id=$1',[classId])).rows[0].groupId;
  await insert('ClassAuditEvent',{id:randomUUID(),actorId,classId,groupId,operation:'CREATE',result:'APPLIED',occurredAt:at});
  for(const [table,column] of [['ClassCommand','appliedAt'],['ClassChange','occurredAt'],['ClassAuditEvent','occurredAt']]){
    await expect(context.database.pool.query(`UPDATE "${table}" SET "${column}"=$1 WHERE "classId"=$2`,[later,classId])).rejects.toMatchObject({code:'23514'});
    await expect(context.database.pool.query(`DELETE FROM "${table}" WHERE "classId"=$1`,[classId])).rejects.toMatchObject({code:'23514'});
  }
});
test.each(['https://youtu.be/abcdefghijk','<iframe/>','abcdefghij!','abcdefghij\n',' abdefghijk','x'.repeat(12)])('referencia rechaza ID/URL inválido %j',async videoId=>{
  await expect(insert('ClassVideoReference',{classId:await session(),provider:'YOUTUBE_DEMO',videoId,revision:1,updatedBy:actorId,updatedAt:at})).rejects.toMatchObject({code:'23514'});
});
test('referencia validada/null, FK, versión independiente y retirada sin borrar fila',async()=>{
  const classId=await session(),row={classId,provider:'YOUTUBE_DEMO',videoId:'aB_-1234567',revision:1,updatedBy:actorId,updatedAt:at};
  await insert('ClassVideoReference',row);
  await expect(insert('ClassVideoReference',row)).rejects.toMatchObject({code:'23505'});
  await expect(insert('ClassVideoReference',{...row,classId:await session(),provider:'OTHER'})).rejects.toMatchObject({code:'23514'});
  await expect(insert('ClassVideoReference',{...row,classId:await session(),revision:0})).rejects.toMatchObject({code:'23514'});
  await expect(insert('ClassVideoReference',{...row,classId:randomUUID()})).rejects.toMatchObject({code:'23503'});
  await context.database.pool.query('UPDATE "ClassVideoReference" SET "videoId"=NULL,revision=2,"updatedAt"=$1 WHERE "classId"=$2',[later,classId]);
  expect((await context.database.pool.query('SELECT "videoId",revision::text FROM "ClassVideoReference" WHERE "classId"=$1',[classId])).rows[0]).toEqual({videoId:null,revision:'2'});
  expect((await context.database.pool.query('SELECT revision::text FROM "ClassSession" WHERE id=$1',[classId])).rows[0].revision).toBe('1');
  await expect(context.database.pool.query('DELETE FROM "ClassVideoReference" WHERE "classId"=$1',[classId])).rejects.toMatchObject({code:'23514'});
});
test('fallo revierte clase/mensaje/evento/receipt juntos, sin filas parciales',async()=>{
  const classId=randomUUID();
  await expect(transaction(async client=>{
    await session({id:classId},client);await message(classId,{},client);
    await insert('ClassChange',{classId,eventSeq:1,type:'CREATED',actorId,occurredAt:at,revision:1},client);
    await command(classId,{},client);
    await message(classId,{messageSeq:1},client);
  })).rejects.toMatchObject({code:'23505'});
  for(const [table,key] of [['ClassSession','id'],['ClassMessage','classId'],['ClassChange','classId'],['ClassCommand','classId']])
    expect((await context.database.pool.query(`SELECT 1 FROM "${table}" WHERE "${key}"=$1`,[classId])).rowCount).toBe(0);
});
test('upgrade desde 0009 conserva filas anteriores y agrega las siete tablas vacías',async()=>{
  const copy=await createIsolatedTestEnvironment('classes_upgrade');
  const directory=path.join(repositoryRoot(),'apps/api/prisma/migrations');
  try {
    const names=readdirSync(directory).filter(name=>/^000[1-9]_/.test(name)).sort();
    expect(names).toHaveLength(9);
    for(const name of names) await copy.ownerQuery(readFileSync(path.join(directory,name,'migration.sql'),'utf8'));
    await copy.ownerQuery(`INSERT INTO "User" (name,email,"emailCanonical",role,"mustSetPassword")
      VALUES ('Anterior ficticio','legacy-classes@example.test','legacy-classes@example.test','ADMIN',true);
      INSERT INTO "AcademicCourse" (name) VALUES ('Anterior ficticio');
      INSERT INTO "AcademicGroup" ("courseId",name) SELECT id,'Grupo anterior' FROM "AcademicCourse";`);
    const snapshot=`SELECT (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM "User" u) AS users,
      (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM "AcademicCourse" c) AS courses,
      (SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM "AcademicGroup" g) AS groups`;
    const before=(await copy.runtimeQuery(snapshot)).rows;
    await copy.ownerQuery(readFileSync(path.join(directory,'0010_classes_chat/migration.sql'),'utf8'));
    expect((await copy.runtimeQuery(snapshot)).rows).toEqual(before);
    for(const table of tables) expect((await copy.runtimeQuery<{n:string}>(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n).toBe('0');
    await expect(copy.runtimeQuery('CREATE TABLE forbidden_classes_ddl(id int)')).rejects.toMatchObject({code:'42501'});
  } finally {await copy.cleanup();}
},120000);
