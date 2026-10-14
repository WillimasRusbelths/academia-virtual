import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterEach, afterAll, test, expect } from 'vitest';
import { us2Dataset, type Us2Dataset } from '../support/us2.js';
import { us1Http, type Us1Http } from '../support/us1-http.js';
import { adminRequest, adminData, adminError, adminSnapshot, projection } from '../support/us4.js';
import { PostgresNameStore } from '../../src/modules/users/infrastructure/name-store.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { PostgresAuditWriter } from '../../src/modules/audit/infrastructure/audit-writer.js';
import { ChangeName } from '../../src/modules/users/application/change-name.js';
import { UserReadUnavailable } from '../../src/modules/users/application/get-me.js';

let data:Us2Dataset;let http:Us1Http;
beforeAll(async()=>{data=await us2Dataset('us4_queries_name');},120000);
beforeEach(async()=>{await data.reset();http=await us1Http(data);
  await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();});
afterEach(async()=>{await http?.close();});afterAll(async()=>{await data?.cleanup();});
const request=(method:'GET'|'PATCH',path:string,body?:unknown,secret=data.account('ADMIN').sessions[0].secret)=>adminRequest(http,method,path,secret,body);

for(const role of ['STUDENT','TEACHER'] as const)test(`${role}: 403 antes de consultar destino existente, inexistente o inválido`,async()=>{
  const before=await adminSnapshot(data);const secret=data.account(role).sessions[0].secret;const errors=[];
  for(const id of [data.account().id,randomUUID(),'no-uuid']) {
    errors.push(await adminError(await request('GET',`/admin/users/${id}`,undefined,secret),403,'FORBIDDEN'));
    errors.push(await adminError(await request('PATCH',`/admin/users/${id}/name`,{name:'Otro'},secret),403,'FORBIDDEN'));
  }
  await adminError(await request('GET','/admin/users',undefined,secret),403,'FORBIDDEN');
  expect(errors.every(error=>error.message===errors[0].message)).toBe(true);expect(await adminSnapshot(data)===before).toBe(true);
});
test('sin sesión: listado, detalle y nombre requieren acceso; no hay efectos',async()=>{
  const before=await adminSnapshot(data);
  for(const [method,path,body] of [['GET','/admin/users',undefined],['GET',`/admin/users/${randomUUID()}`,undefined],['PATCH',`/admin/users/${randomUUID()}/name`,{name:'Otro'}]] as const)
    await adminError(await adminRequest(http,method,path,undefined,body),401,'AUTH_REQUIRED');
  expect(await adminSnapshot(data)===before).toBe(true);
});
test('destino inexistente: 404 en detalle y nombre solo tras autorizar',async()=>{
  const id=randomUUID();const before=await adminSnapshot(data);
  await adminError(await request('GET',`/admin/users/${id}`),404,'NOT_FOUND');
  await adminError(await request('PATCH',`/admin/users/${id}/name`,{name:'Otro'}),404,'NOT_FOUND');
  expect(await adminSnapshot(data)===before).toBe(true);
});
test('ADMIN corrige su propio nombre sin alterar acceso; auditoría atribuible',async()=>{
  const actor=data.account('ADMIN');const view=await adminData(await request('PATCH',`/admin/users/${actor.id}/name`,{name:'  Nuevo 😀  '}));projection(view);
  expect(view.name==='Nuevo 😀'&&view.role==='ADMIN').toBe(true);
  for(const session of actor.sessions)expect((await http.get('/me',session.secret)).status).toBe(200);
  const event=(await data.context.database.pool.query('SELECT * FROM "AuditEvent"')).rows[0];
  expect(event.action==='NAME_CHANGED'&&event.actorUserId===actor.id&&event.targetUserId===actor.id).toBe(true);
});
test('fallo después de insertar auditoría: rollback del nombre y del evento',async()=>{
  const pool=data.context.database.pool;const actor=data.account('ADMIN');const target=data.account();const before=await adminSnapshot(data);
  const sessions=new PostgresSessionStore(pool);const actual=new PostgresAuditWriter();
  const change=new ChangeName(new PostgresNameStore(pool,{authorization:sessions,audit:{async write(client,event){
    await actual.write(client,event);throw new Error('Fallo controlado, valores omitidos.');
  }}}));
  const session=await sessions.lookup(actor.sessions[0].secret);
  await expect(change.execute(session!,{id:target.id,name:'No confirmado',requestId:randomUUID()})).rejects.toBeInstanceOf(UserReadUnavailable);
  expect(await adminSnapshot(data)===before).toBe(true);
});
test('actor cambia de rol después de autorizar: el store revalida permisos sin modificar destino',async()=>{
  const db=data.context.database.pool;const sessions=new PostgresSessionStore(db);
  const actor=(await sessions.lookup(data.account('ADMIN').sessions[0].secret))!;
  await db.query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`,[actor.userId]);
  const before=await adminSnapshot(data);
  const change=new ChangeName(new PostgresNameStore(db,{authorization:sessions,audit:new PostgresAuditWriter()}));
  await expect(change.execute(actor,{id:data.account().id,name:'No permitido',requestId:randomUUID()})).rejects.toMatchObject({code:'FORBIDDEN'});
  expect(await adminSnapshot(data)===before).toBe(true);
});
test('dos ADMIN corrigen los nombres del otro sin invertir locks',async()=>{
  const first=data.account('ADMIN');const second=data.account('TEACHER');
  await data.context.database.pool.query(`UPDATE "User" SET role='ADMIN' WHERE id=$1`,[second.id]);
  const responses=await Promise.all([request('PATCH',`/admin/users/${second.id}/name`,{name:'Segundo'}),
    request('PATCH',`/admin/users/${first.id}/name`,{name:'Primero'},second.sessions[0].secret)]);
  for(const response of responses)projection(await adminData(response));
  expect((await data.context.database.pool.query('SELECT id FROM "AuditEvent"')).rowCount).toBe(2);
});
for(const kind of ['rol','estado'] as const)test(`actor pierde ${kind} antes de la solicitud: 401 sin escritura`,async()=>{
  const actor=data.account('ADMIN');const db=data.context.database.pool;
  if(kind==='rol')await db.query(`UPDATE "User" SET role='TEACHER',"authVersion"="authVersion"+1 WHERE id=$1`,[actor.id]);
  else await db.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp(),"authVersion"="authVersion"+1 WHERE id=$1`,[actor.id]);
  const before=await adminSnapshot(data);
  await adminError(await request('PATCH',`/admin/users/${data.account().id}/name`,{name:'No permitido'}),401,'AUTH_REQUIRED');
  expect(await adminSnapshot(data)===before).toBe(true);
});
test('actor pierde sesión mientras nombre espera destino: 401 y cero cambios',async()=>{
  const actor=data.account('ADMIN');const target=data.account();const db=data.context.database.pool;
  const targetBefore=JSON.stringify((await db.query('SELECT * FROM "User" WHERE id=$1',[target.id])).rows[0]);
  const auditBefore=(await db.query('SELECT count(*)::int AS n FROM "AuditEvent"')).rows[0].n;
  const holder=await db.connect();let pending:Promise<Response>|undefined;
  try {
    await holder.query('BEGIN');await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',[target.id]);
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending=request('PATCH',`/admin/users/${target.id}/name`,{name:'No permitido'});
    await expect.poll(async()=>Number((await holder.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows[0].n)>0,{timeout:3000}).toBe(true);
    // El actor podría estar ya bloqueado por orden UUID: revocar la sesión no invierte locks User.
    await db.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[actor.sessions[0].id]);
    await holder.query('COMMIT');await adminError(await pending,401,'AUTH_REQUIRED');
    expect(JSON.stringify((await db.query('SELECT * FROM "User" WHERE id=$1',[target.id])).rows[0])===targetBefore).toBe(true);
    expect((await db.query('SELECT count(*)::int AS n FROM "AuditEvent"')).rows[0].n).toBe(auditBefore);
  }finally{await holder.query('ROLLBACK').catch(()=>undefined);holder.release();await pending;}
});
