import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { beforeAll, beforeEach, afterEach, afterAll, test, expect } from 'vitest';
import { us2Dataset, seedAction, type Us2Dataset } from '../support/us2.js';
import { us1Http, type Us1Http } from '../support/us1-http.js';
import { adminRequest, adminData, adminError, adminSnapshot } from '../support/us4.js';
import { ChangeAccess, AccessChangeUnavailable } from '../../src/modules/identity/application/change-access.js';
import { PostgresAccessChangeStore } from '../../src/modules/identity/infrastructure/access-change-store.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { PostgresAuditWriter } from '../../src/modules/audit/infrastructure/audit-writer.js';

let data:Us2Dataset;let http:Us1Http;
beforeAll(async()=>{data=await us2Dataset('us4_access_changes');},120000);
beforeEach(async()=>{await data.reset();http=await us1Http(data);await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();});
afterEach(async()=>{await http?.close();});afterAll(async()=>{await data?.cleanup();});
const command=(id:string,field:'role'|'status',value:string)=>adminRequest(http,'PUT',`/admin/users/${id}/${field}`,data.account('ADMIN').sessions[0].secret,{[field]:value});
const row=async(id:string)=>(await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[id])).rows[0];
for(const field of ['role','status'] as const)test(`${field}: UUID inválido, campos ausentes y filtros extra son 400; inexistente autorizado 404`,async()=>{
  const before=await adminSnapshot(data);const secret=data.account('ADMIN').sessions[0].secret;
  await adminError(await command('no-uuid',field,field==='role'?'TEACHER':'DISABLED'),400,'VALIDATION_ERROR');
  await adminError(await command(randomUUID(),field,field==='role'?'TEACHER':'DISABLED'),404,'NOT_FOUND');
  await adminError(await adminRequest(http,'PUT',`/admin/users/${data.account().id}/${field}`,secret,{}),400,'VALIDATION_ERROR');
  await adminError(await adminRequest(http,'PUT',`/admin/users/${data.account().id}/${field}?extra=1`,secret,{[field]:field==='role'?'TEACHER':'DISABLED'}),400,'VALIDATION_ERROR');
  expect(await adminSnapshot(data)===before).toBe(true);
});
test('rol revoca sesiones pero conserva tokens y entregas; auditoría contiene solo roles',async()=>{
  const f=await seedAction(data,'VERIFY_EMAIL',true);const db=data.context.database.pool;
  const tokens=JSON.stringify((await db.query('SELECT * FROM "ActionToken"')).rows);const mail=JSON.stringify((await db.query('SELECT * FROM "MailDelivery"')).rows);
  const before=await row(f.account.id);await adminData(await command(f.account.id,'role','TEACHER'));
  const after=await row(f.account.id);expect(after.role==='TEACHER'&&BigInt(after.authVersion)===BigInt(before.authVersion)+1n).toBe(true);
  expect(JSON.stringify((await db.query('SELECT * FROM "ActionToken"')).rows)===tokens&&JSON.stringify((await db.query('SELECT * FROM "MailDelivery"')).rows)===mail).toBe(true);
  const audit=(await db.query('SELECT * FROM "AuditEvent"')).rows[0];expect(audit.action==='ROLE_CHANGED'&&audit.result==='APPLIED'&&audit.oldRole==='STUDENT'&&audit.newRole==='TEACHER'&&audit.oldStatus===null&&audit.newStatus===null).toBe(true);
});
test('desactivación conserva tokens consumidos/marca revocada previa y cancela entrega SENDING con payload borrado',async()=>{
  const db=data.context.database.pool;const old=await seedAction(data);
  const oldAt=new Date((await data.clock!.now()).getTime()-1000);
  await db.query('UPDATE "ActionToken" SET "revokedAt"=$2 WHERE id=$1',[old.id,oldAt]);
  const consumed=await seedAction(data);await db.query('UPDATE "ActionToken" SET "consumedAt"=clock_timestamp() WHERE id=$1',[consumed.id]);
  const current=await seedAction(data,'VERIFY_EMAIL',true);
  await db.query(`UPDATE "MailDelivery" SET status='SENDING',attempts=1,"claimId"=$2,"leaseUntil"=clock_timestamp()+interval '20 seconds' WHERE id=$1`,[current.deliveryId,randomUUID()]);
  await adminData(await command(current.account.id,'status','DISABLED'));
  const tokens=(await db.query('SELECT * FROM "ActionToken" ORDER BY id')).rows;
  expect(tokens.find(value=>value.id===old.id).revokedAt.getTime()).toBe(oldAt.getTime());
  expect(tokens.find(value=>value.id===consumed.id).consumedAt!==null&&tokens.find(value=>value.id===consumed.id).revokedAt===null).toBe(true);
  const delivery=(await db.query('SELECT * FROM "MailDelivery" WHERE id=$1',[current.deliveryId])).rows[0];
  expect(delivery.status==='CANCELLED'&&delivery.finishedAt!==null&&['encryptedPayload','nonce','authTag','keyId','leaseUntil','claimId'].every(key=>delivery[key]===null)).toBe(true);
  const audit=(await db.query('SELECT * FROM "AuditEvent"')).rows[0];expect(audit.action==='STATUS_CHANGED'&&audit.oldStatus==='ACTIVE'&&audit.newStatus==='DISABLED'&&audit.oldRole===null&&audit.newRole===null).toBe(true);
});
test('reactivar conserva versión, verificación pendiente y provisional; no habilita acceso por sí sola',async()=>{
  const f=data.account('STUDENT','PROVISIONAL');const before=await row(f.id);
  await adminData(await command(f.id,'status','DISABLED'));const disabled=await row(f.id);
  await adminData(await command(f.id,'status','ACTIVE'));const active=await row(f.id);
  expect(active.authVersion===disabled.authVersion&&active.emailVerifiedAt===before.emailVerifiedAt&&active.passwordHash===before.passwordHash
    &&active.provisionalPasswordHash===before.provisionalPasswordHash&&active.provisionalExpiresAt.getTime()===before.provisionalExpiresAt.getTime()&&active.mustSetPassword===before.mustSetPassword&&active.disabledAt===null).toBe(true);
  expect((await http.post('/auth/login',{email:f.email,password:f.password})).status).toBe(401);
});
test('cambiar rol de cuenta desactivada conserva disabledAt',async()=>{
  const f=data.account('STUDENT','DISABLED');const before=await row(f.id);await data.clock!.advance(1000);
  await adminData(await command(f.id,'role','TEACHER'));const after=await row(f.id);
  expect(after.disabledAt.getTime()===before.disabledAt.getTime()&&after.status==='DISABLED').toBe(true);
});
for(const field of ['role','status'] as const)test(`no-op ${field}: no altera cuenta, tokens o correo; audita NO_CHANGE sin metadatos de transición`,async()=>{
  const f=await seedAction(data,'VERIFY_EMAIL',true);const db=data.context.database.pool;
  const before=JSON.stringify(await row(f.account.id));const tokens=JSON.stringify((await db.query('SELECT * FROM "ActionToken"')).rows);const mail=JSON.stringify((await db.query('SELECT * FROM "MailDelivery"')).rows);
  await adminData(await command(f.account.id,field,field==='role'?'STUDENT':'ACTIVE'));
  expect(JSON.stringify(await row(f.account.id))===before&&JSON.stringify((await db.query('SELECT * FROM "ActionToken"')).rows)===tokens&&JSON.stringify((await db.query('SELECT * FROM "MailDelivery"')).rows)===mail).toBe(true);
  const audit=(await db.query('SELECT * FROM "AuditEvent"')).rows[0];expect(audit.result==='NO_CHANGE'&&['oldRole','newRole','oldStatus','newStatus'].every(key=>audit[key]===null)).toBe(true);
});
test('fallo AuditEvent por HTTP: 503 seguro y rollback de cuenta/sesiones/tokens/entregas',async()=>{
  const f=await seedAction(data,'VERIFY_EMAIL',true);
  await data.context.isolated.ownerQuery(`CREATE FUNCTION fail_access_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo controlado'; END $$;
    CREATE TRIGGER fail_access_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_access_audit();`);
  try{const before=await adminSnapshot(data);await adminError(await command(f.account.id,'status','DISABLED'),503,'TEMPORARILY_UNAVAILABLE');expect(await adminSnapshot(data)===before).toBe(true);}
  finally{await data.context.isolated.ownerQuery('DROP TRIGGER fail_access_audit ON "AuditEvent"; DROP FUNCTION fail_access_audit()');}
});
for(const persistent of [false,true])test(`aborto de auditoría: ${persistent?'dos reintentos y rollback total':'dos reintentos y un cambio de versión/evento'}`,async()=>{
  const db=data.context.database.pool;const sessions=new PostgresSessionStore(db);const actual=new PostgresAuditWriter();let attempts=0;
  const audit={async write(client:PoolClient,event:unknown){await actual.write(client,event);attempts++;
    if(persistent||attempts<3)await client.query("DO $$ BEGIN RAISE EXCEPTION 'Aborto controlado' USING ERRCODE='40001'; END $$");}};
  const useCase=new ChangeAccess(new PostgresAccessChangeStore(db,{authorization:sessions,audit}));
  const actor=(await sessions.lookup(data.account('ADMIN').sessions[0].secret))!;const f=data.account();const before=await adminSnapshot(data);const version=(await row(f.id)).authVersion;
  const operation=useCase.execute(actor,{id:f.id,kind:'role',value:'TEACHER',requestId:randomUUID()});
  if(persistent){await expect(operation).rejects.toBeInstanceOf(AccessChangeUnavailable);expect(await adminSnapshot(data)===before).toBe(true);}
  else{await operation;expect(BigInt((await row(f.id)).authVersion)===BigInt(version)+1n).toBe(true);expect((await db.query('SELECT id FROM "AuditEvent"')).rowCount).toBe(1);}
  expect(attempts).toBe(3);
});
test('aborto en revalidación real conserva señal segura y permite dos reintentos',async()=>{
  const db=data.context.database.pool;const sessions=new PostgresSessionStore(db);let attempts=0;
  const authorization={async revalidateInTransaction(client:PoolClient,actor:Parameters<PostgresSessionStore['revalidateInTransaction']>[1],permission:Parameters<PostgresSessionStore['revalidateInTransaction']>[2]){
    const proxy=new Proxy(client,{get(target,key){if(key==='query')return async(text:string,...args:unknown[])=>{
      if(text==='SAVEPOINT identity_authorization'){attempts++;if(attempts<3)await client.query("DO $$ BEGIN RAISE EXCEPTION 'Aborto controlado' USING ERRCODE='40P01'; END $$");}
      return Reflect.apply(target.query,target,[text,...args]);
    };return Reflect.get(target,key,target);}});
    await sessions.revalidateInTransaction(proxy,actor,permission);
  }};
  const actor=(await sessions.lookup(data.account('ADMIN').sessions[0].secret))!;
  const useCase=new ChangeAccess(new PostgresAccessChangeStore(db,{authorization,audit:new PostgresAuditWriter()}));
  const f=data.account();const version=(await row(f.id)).authVersion;
  await useCase.execute(actor,{id:f.id,kind:'role',value:'TEACHER',requestId:randomUUID()});
  expect(attempts).toBe(3);expect(BigInt((await row(f.id)).authVersion)===BigInt(version)+1n).toBe(true);
  expect((await db.query('SELECT id FROM "AuditEvent"')).rowCount).toBe(1);
});
