import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { auditEvent, AuditEventInvalid } from '../../src/modules/audit/domain/audit-event.js';
import { PostgresAuditWriter, AuditWriteUnavailable } from '../../src/modules/audit/infrastructure/audit-writer.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { SecurityEvents, newCorrelationId } from '../../src/infrastructure/logging/security-events.js';
import { SafeErrorFilter, TransportFailure } from '../../dist/src/http/error.filter.js';
import { AuthorizationFailure } from '../../dist/src/modules/authorization/public/session.js';
import type { ArgumentsHost } from '@nestjs/common';
import { identityDatabase } from '../support/identity-database.js';
import { sessionFixture } from '../support/session-fixture.js';
import type { IdentityTestDatabase } from '../support/session-fixture.js';
import { sessionHttp } from '../support/session-http.js';

let context: IdentityTestDatabase;
const directory=mkdtempSync(path.join(tmpdir(),'identity-audit-'));
const writer=new PostgresAuditWriter();
beforeAll(async () => { context=await identityDatabase('audit'); },120000);
afterEach(async () => {
  vi.useRealTimers();vi.restoreAllMocks();
  await context.database.pool.query('DELETE FROM "AuditEvent"; DELETE FROM "Session"; DELETE FROM "User"');
});
afterAll(async () => { await context?.cleanup();rmSync(directory,{recursive:true,force:true}); });
function logging() { const location=path.join(directory,randomUUID());return { location,logs:new SecurityEvents(location) }; }
function records(location: string): Record<string,unknown>[] {
  if (!existsSync(location)) return [];
  return readdirSync(location).filter(file => file.endsWith('.jsonl')).flatMap(file =>
    readFileSync(path.join(location,file),'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string,unknown>));
}
const base=() => ({actorKind:'ACCOUNT',actorUserId:randomUUID(),targetUserId:randomUUID(),
  action:'NAME_CHANGED',result:'APPLIED',requestId:newCorrelationId()});
const denial=() => ({category:'SECURITY',action:'ACCESS_DENIED',result:'DENIED',reasonCode:'FORBIDDEN',
  actorKind:'ANONYMOUS',targetKind:'USER_REFERENCE',requestedTargetId:randomUUID(),routeTemplate:'/admin/users/:id'});

test.each(['ACCOUNT_CREATED','BOOTSTRAP_ADMIN_CREATED','NAME_CHANGED','ROLE_CHANGED','STATUS_CHANGED'] as const)('persiste %s con actor/destino existentes y comparte commit con la mutación',async action => {
    const admin=await sessionFixture(context,'ADMIN');
    const creation=action==='ACCOUNT_CREATED'||action==='BOOTSTRAP_ADMIN_CREATED';
    const target=creation?{userId:randomUUID()}:await sessionFixture(context);
    const sessions=new PostgresSessionStore(context.database.pool);const actor=(await sessions.lookup(admin.secret))!;
    const client=await context.database.pool.connect();
    try {
      await client.query('BEGIN');await sessions.revalidateInTransaction(client,actor,'users:manage');
      const changes=action==='ROLE_CHANGED'?{oldRole:'STUDENT',newRole:'TEACHER'}
        :action==='STATUS_CHANGED'?{oldStatus:'ACTIVE',newStatus:'DISABLED'}:{};
      if (creation) {
        const email=`${randomUUID()}@example.test`;
        await client.query(`INSERT INTO "User" (id,name,email,"emailCanonical",role,"passwordHash")
          SELECT $1,'Alta de ensayo',$2,$2,$3,"passwordHash" FROM "User" WHERE id=$4`,
        [target.userId,email,action==='BOOTSTRAP_ADMIN_CREATED'?'ADMIN':'STUDENT',admin.userId]);
      } else if (action==='ROLE_CHANGED') await client.query('UPDATE "User" SET role=\'TEACHER\',"authVersion"="authVersion"+1 WHERE id=$1',[target.userId]);
      else if (action==='STATUS_CHANGED') await client.query('UPDATE "User" SET status=\'DISABLED\',"disabledAt"=clock_timestamp(),"authVersion"="authVersion"+1 WHERE id=$1',[target.userId]);
      else await client.query('UPDATE "User" SET name=\'Nombre de ensayo cambiado\' WHERE id=$1',[target.userId]);
      await writer.write(client,{...base(),action,actorKind:action==='BOOTSTRAP_ADMIN_CREATED'?'SYSTEM_BOOTSTRAP':'ACCOUNT',
        actorUserId:action==='BOOTSTRAP_ADMIN_CREATED'?null:admin.userId,targetUserId:target.userId,...changes});
      expect(Number((await context.database.pool.query<{ count: string }>('SELECT count(*) FROM "AuditEvent"')).rows[0].count)).toBe(0);
      await client.query('COMMIT');
      const row=(await context.database.pool.query<Record<string,unknown>>('SELECT * FROM "AuditEvent"')).rows[0];
      expect(row.action).toBe(action);expect(row.targetUserId===target.userId).toBe(true);
      expect(row.actorKind).toBe(action==='BOOTSTRAP_ADMIN_CREATED'?'SYSTEM_BOOTSTRAP':'ACCOUNT');
      expect(row.actorUserId===(action==='BOOTSTRAP_ADMIN_CREATED'?null:admin.userId)).toBe(true);
      expect(row.occurredAt instanceof Date).toBe(true);
      expect(Object.keys(row).sort()).toEqual(['id','actorKind','actorUserId','targetUserId','action','result','occurredAt','requestId','oldRole','newRole','oldStatus','newStatus'].sort());
    } finally { await client.query('ROLLBACK');client.release(); }
  });

test.each(['NAME_CHANGED','ROLE_CHANGED','STATUS_CHANGED'] as const)('NO_CHANGE aceptado para %s no guarda valores',async action => {
  const actor=await sessionFixture(context,'ADMIN');const target=await sessionFixture(context);
  const client=await context.database.pool.connect();
  try { await client.query('BEGIN');await writer.write(client,{...base(),action,result:'NO_CHANGE',actorUserId:actor.userId,targetUserId:target.userId});await client.query('COMMIT'); }
  finally { client.release(); }
  const row=(await context.database.pool.query<{ result: string; oldRole: string|null; newRole: string|null; oldStatus: string|null; newStatus: string|null }>('SELECT result,"oldRole","newRole","oldStatus","newStatus" FROM "AuditEvent"')).rows[0];
  expect(row.result).toBe('NO_CHANGE');expect([row.oldRole,row.newRole,row.oldStatus,row.newStatus]).toEqual([null,null,null,null]);
});

test.each(['target-fk','actor-fk','invalid-event'] as const)('fallo %s revierte mutación, incluso si el llamador intenta commit',async failure => {
  const actor=await sessionFixture(context,'ADMIN');const target=await sessionFixture(context);
  const before=(await context.database.pool.query<{ name: string }>('SELECT name FROM "User" WHERE id=$1',[target.userId])).rows[0].name;
  const client=await context.database.pool.connect();
  const input={...base(),actorUserId:failure==='actor-fk'?randomUUID():actor.userId,
    targetUserId:failure==='target-fk'?randomUUID():target.userId,...(failure==='invalid-event'?{password:randomUUID()}:{})};
  try {
    await client.query('BEGIN');await client.query('UPDATE "User" SET name=\'No debe confirmarse\' WHERE id=$1',[target.userId]);
    await expect(writer.write(client,input)).rejects.toThrow(AuditWriteUnavailable);
    await client.query('COMMIT');
  } finally { client.release(); }
  expect((await context.database.pool.query<{ name: string }>('SELECT name FROM "User" WHERE id=$1',[target.userId])).rows[0].name===before).toBe(true);
  expect(Number((await context.database.pool.query<{ count: string }>('SELECT count(*) FROM "AuditEvent"')).rows[0].count)).toBe(0);
});

test('sin BEGIN no persiste auditoría; un rollback externo tampoco confirma el evento',async () => {
  const actor=await sessionFixture(context,'ADMIN');const target=await sessionFixture(context);
  const input={...base(),actorUserId:actor.userId,targetUserId:target.userId};const client=await context.database.pool.connect();
  try { await expect(writer.write(client,input)).rejects.toThrow(AuditWriteUnavailable);
    await client.query('BEGIN');await writer.write(client,input);await client.query('ROLLBACK'); }
  finally { client.release(); }
  expect(Number((await context.database.pool.query<{ count: string }>('SELECT count(*) FROM "AuditEvent"')).rows[0].count)).toBe(0);
});

test('actor revocado se rechaza antes de la mutación y la denegación se registra tras rollback',async () => {
  const admin=await sessionFixture(context,'ADMIN');const target=await sessionFixture(context);
  const sessions=new PostgresSessionStore(context.database.pool);const actor=(await sessions.lookup(admin.secret))!;
  await context.database.pool.query('UPDATE "User" SET "authVersion"="authVersion"+1 WHERE id=$1',[admin.userId]);
  const client=await context.database.pool.connect();let rejected=false;
  try { await client.query('BEGIN');await sessions.revalidateInTransaction(client,actor,'users:manage'); }
  catch { rejected=true;await client.query('ROLLBACK'); }
  finally { client.release(); }
  expect(rejected).toBe(true);
  const log=logging();expect(log.logs.record({...denial(),actorKind:'ACCOUNT',actorUserId:admin.userId,requestedTargetId:target.userId},newCorrelationId())).toBe(true);
  expect(records(log.location).length).toBe(1);
  expect(Number((await context.database.pool.query<{ count: string }>('SELECT count(*) FROM "AuditEvent"')).rows[0].count)).toBe(0);
});

const sensitive=['password','provisionalPassword','passwordHash','token','tokenHash','sessionId','cookie','authorization',
  'mailPayloadKey','encryptedPayload','nonce','authTag','name','email','ip','body','sql','error'];
test.each(sensitive)('no acepta %s en auditoría ni en logs o errores',field => {
  const marker=randomUUID();const log=logging();const warn=vi.spyOn(console,'warn').mockImplementation(() => undefined);
  let error: unknown;try { auditEvent({...base(),[field]:marker}); } catch (caught) { error=caught; }
  expect(error instanceof AuditEventInvalid).toBe(true);expect(String(error).includes(marker)).toBe(false);
  expect(log.logs.record({...denial(),[field]:marker},newCorrelationId())).toBe(false);
  expect(records(log.location).length).toBe(0);expect(JSON.stringify(warn.mock.calls).includes(marker)).toBe(false);
});

test('rechaza actores, resultados y cambios que no cumplen U1, sin coerción de objetos',() => {
  const wrong=[{...base(),result:'DENIED'},{...base(),actorUserId:null},{...base(),actorKind:'SYSTEM_BOOTSTRAP'},
    {...base(),action:'BOOTSTRAP_ADMIN_CREATED'},{...base(),action:'ROLE_CHANGED',oldRole:'ADMIN',newRole:'ADMIN'},
    {...base(),action:'STATUS_CHANGED',oldStatus:'ACTIVE',newStatus:'ACTIVE'},
    {...base(),oldRole:'STUDENT',newRole:'TEACHER'}, {...base(),requestId:'not-an-id'},
    {...base(),action:{toString:() => 'NAME_CHANGED'}}, {...base(),result:{toString:() => 'APPLIED'}}];
  for (const input of wrong) expect(() => auditEvent(input)).toThrow(AuditEventInvalid);
});

test('lista completa de eventos operativos, actores locales y correlación de bootstrap sin User ficticio',async () => {
  const log=logging();const correlation=newCorrelationId();const target=await sessionFixture(context,'ADMIN');
  const entries=[denial(),{category:'SECURITY',action:'AUTHENTICATION_FAILED',result:'FAILED',reasonCode:'INVALID_CREDENTIALS',actorKind:'ANONYMOUS',targetKind:'NONE'},
    {...denial(),action:'ADMIN_COMMAND_REJECTED',actorKind:'ACCOUNT',actorUserId:target.userId,reasonCode:'ADMIN_INVARIANT'},
    {category:'OPERATION',action:'BOOTSTRAP_ATTEMPT',result:'SUCCEEDED',reasonCode:'NONE',actorKind:'LOCAL_OPERATOR',operatorRef:'operador_test',targetKind:'IDENTITY_SCOPE'},
    {category:'OPERATION',action:'RESTORED_STATE_INVALIDATION',result:'SUCCEEDED',reasonCode:'NONE',actorKind:'LOCAL_OPERATOR',operatorRef:'operador_test',targetKind:'IDENTITY_SCOPE',counts:{sessions:2,tokens:3,mail:1}},
    {category:'OPERATION',action:'MAIL_DELIVERY_FAILED',result:'FAILED',reasonCode:'SMTP_FAILURE',actorKind:'SYSTEM',targetKind:'IDENTITY_SCOPE'},
    {category:'OPERATION',action:'RUNTIME_FAILURE',result:'FAILED',reasonCode:'TEMPORARILY_UNAVAILABLE',actorKind:'SYSTEM',targetKind:'IDENTITY_SCOPE'}];
  for (const entry of entries) expect(log.logs.record(entry,correlation)).toBe(true);
  const client=await context.database.pool.connect();
  try { await client.query('BEGIN');await writer.write(client,{...base(),actorKind:'SYSTEM_BOOTSTRAP',actorUserId:null,
    action:'BOOTSTRAP_ADMIN_CREATED',targetUserId:target.userId,requestId:correlation});await client.query('COMMIT'); }
  finally { client.release(); }
  const rows=records(log.location);expect(rows.length).toBe(7);expect(new Set(rows.map(row => row.eventId)).size).toBe(7);
  expect(rows.every(row => row.correlationId===correlation && typeof row.occurredAt==='string' && row.occurredAt.endsWith('Z'))).toBe(true);
  const bootstrap=rows.find(row => row.action==='BOOTSTRAP_ATTEMPT')!;
  expect(bootstrap.operatorRef).toBe('operador_test');expect('actorUserId' in bootstrap).toBe(false);expect('requestedTargetId' in bootstrap).toBe(false);
  expect((await context.database.pool.query<{ requestId: string; actorUserId: string|null }>('SELECT "requestId","actorUserId" FROM "AuditEvent"')).rows[0]).toEqual({requestId:correlation,actorUserId:null});
});

test('denegaciones con UUID conocidos/desconocidos o mal formado no consultan User ni tienen FK',async () => {
  const f=await sessionFixture(context);const log=logging();const spy=vi.spyOn(context.database.pool,'query');
  for (const id of [f.userId,randomUUID(),'not-an-id']) expect(log.logs.record({...denial(),requestedTargetId:id},newCorrelationId())).toBe(true);
  expect(spy).not.toHaveBeenCalled();const rows=records(log.location);
  expect(Object.keys(rows[0]).sort()).toEqual(Object.keys(rows[1]).sort());expect(rows[0].reasonCode).toBe(rows[1].reasonCode);
  expect('requestedTargetId' in rows[2]).toBe(false);
});

test('rechaza alias implícitos, URLs recibidas, conteos libres y objetos con toString',() => {
  const log=logging();vi.spyOn(console,'warn').mockImplementation(() => undefined);
  const operator={category:'OPERATION',action:'BOOTSTRAP_ATTEMPT',result:'STARTED',reasonCode:'NONE',actorKind:'LOCAL_OPERATOR',targetKind:'IDENTITY_SCOPE'};
  const invalid=[operator,{...operator,operatorRef:'name@example.test'},{...operator,operatorRef:'a'.repeat(65)},
    {...denial(),routeTemplate:'/admin/users/'+randomUUID()+'?token='+randomUUID()},
    {...denial(),counts:{sessions:1,tokens:1,mail:1}},
    {...denial(),result:{secret:randomUUID(),toString:() => 'DENIED'}},
    {...denial(),actorKind:{toString:() => 'ANONYMOUS'}},
    {...denial(),actorUserId:randomUUID()}, {...denial(),reasonCode:'NOT_FOUND'}];
  for (const input of invalid) expect(log.logs.record(input,newCorrelationId())).toBe(false);
  expect(records(log.location).length).toBe(0);
});

test('archivo privado, rotación UTC y límite de 30 días aun sin nuevos eventos',async () => {
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-13T13:00:00Z'));
  const log=logging();mkdirSync(log.location,{recursive:true});
  const expired=path.join(log.location,'2026-09-13.jsonl');const retained=path.join(log.location,'2026-09-14.jsonl');
  writeFileSync(expired,'{}\n');writeFileSync(retained,'{}\n');
  expect(log.logs.record(denial(),newCorrelationId())).toBe(true);log.logs.onApplicationBootstrap();
  try {
    expect(existsSync(expired)).toBe(false);expect(existsSync(retained)).toBe(true);
    expect(statSync(log.location).mode & 0o777).toBe(0o700);
    expect(statSync(path.join(log.location,'2026-10-13.jsonl')).mode & 0o777).toBe(0o600);
    await vi.advanceTimersByTimeAsync(11*60*60_000);expect(existsSync(retained)).toBe(false);
  } finally { log.logs.onApplicationShutdown(); }
});

test.each([401,403] as const)('fallo real del archivo de log conserva HTTP %s, sin lookup de destino ni efectos',async status => {
  const blocked=path.join(directory,randomUUID());writeFileSync(blocked,'not-a-directory');
  const logs=new SecurityEvents(blocked);const warn=vi.spyOn(console,'warn').mockImplementation(() => undefined);
  const fixture=await sessionFixture(context,'STUDENT');const server=await sessionHttp(context,logs);
  try {
    const headers=status===401?server.headers():server.headers(fixture.secret);
    const responses=[];
    for (const id of [fixture.userId,randomUUID()]) {
      const response=await fetch(`${server.url}/__test/identity/admin/${id}`,{headers});expect(response.status).toBe(status);
      responses.push(await response.json() as {error:{code:string;message:string}});
    }
    expect(responses[0].error.code).toBe(responses[1].error.code);expect(responses[0].error.message).toBe(responses[1].error.message);
    expect(server.controls.reads).toBe(0);expect(await server.effects()).toBe(0);expect(warn).toHaveBeenCalled();
  } finally { await server.app.close();await context.isolated.ownerQuery('DROP TABLE "AuthorizedEffect"'); }
});

function filterHost(request: object) {
  let status=0;let body:unknown;
  const response={setHeader:() => undefined,status:(code:number) => {status=code;return response;},json:(data:unknown) => {body=data;}};
  const host={switchToHttp:() => ({getRequest:() => request,getResponse:() => response})} as unknown as ArgumentsHost;
  return {host,result:() => ({status,body})};
}
test('errores y fallo del aviso local no serializan mensajes, códigos, campos o correlación sensibles',() => {
  const marker=randomUUID();const blocked=path.join(directory,randomUUID());writeFileSync(blocked,'not-a-directory');
  const logs=new SecurityEvents(blocked);vi.spyOn(console,'warn').mockImplementation(() => {throw new Error(marker);});
  for (const error of [new AuthorizationFailure('FORBIDDEN'),new Error(marker),
    new TransportFailure(400,'VALIDATION_ERROR',[{field:'password',message:marker},{field:marker,message:marker}]),
    new TransportFailure(403,marker)]) {
    const holder=filterHost({headers:{cookie:marker},method:'GET',requestId:'invalid-'+marker,params:{id:'invalid-'+marker}});
    new SafeErrorFilter(logs).catch(error,holder.host);
    expect(JSON.stringify(holder.result()).includes(marker)).toBe(false);
    expect([400,403,503].includes(holder.result().status)).toBe(true);
  }
});
