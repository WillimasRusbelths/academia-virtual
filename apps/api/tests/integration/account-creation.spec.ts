import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, test, expect } from 'vitest';
import { us2Dataset, type Us2Dataset } from '../support/us2.js';
import { adminSnapshot, projection } from '../support/us4.js';
import { waitForBlockedBy } from '../support/locks.js';
import { CreateAccount, AccountConflict } from '../../src/modules/identity/application/create-account.js';
import { PostgresAccountCreationStore } from '../../src/modules/identity/infrastructure/account-creation-store.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { createPasswordCredentials, accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import type { PasswordCredentials } from '../../src/modules/identity/application/credentials.js';
import { IssueActionLink, ActionLinkUnavailable } from '../../src/modules/identity/application/issue-action-link.js';
import { PostgresActionTokenStore } from '../../src/modules/identity/infrastructure/action-token-store.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';
import { PostgresAuditWriter } from '../../src/modules/audit/infrastructure/audit-writer.js';
import { AuthorizationFailure } from '../../src/modules/authorization/public/session.js';
import { AccountValidationError } from '../../src/modules/users/public/account.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';

let data:Us2Dataset;let credentials:PasswordCredentials;let actor:SessionActor;
beforeAll(async()=>{data=await us2Dataset('us4_creation');credentials=await createPasswordCredentials();},120000);
beforeEach(async()=>{await data.reset();actor=(await new PostgresSessionStore(data.context.database.pool).lookup(data.account('ADMIN').sessions[0].secret))!;});
afterAll(async()=>{await data?.cleanup();});
function services(audit=new PostgresAuditWriter(),hashing=credentials) {
  const pool=data.context.database.pool;const sessions=new PostgresSessionStore(pool);
  const rates=new PostgresRateStore(pool,data.context.environment.rateHmacKey);const cipher=createPayloadCipher(data.context.environment);
  const links=new IssueActionLink(new PostgresActionTokenStore(pool),rates,accessSecrets,cipher,data.context.environment.appOrigin);
  const create=new CreateAccount(new PostgresAccountCreationStore(pool,{authorization:sessions,audit}),hashing,links);
  return {create,rates,cipher,links};
}
const input=()=>({name:'Alta sintética',email:`${randomUUID()}@example.test`,role:'TEACHER',provisionalPassword:accessSecrets.issue().secret,origin:'127.0.0.1',requestId:randomUUID()});
const row=async(id:string)=>(await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[id])).rows[0];
for(const role of ['STUDENT','TEACHER','ADMIN'])test(`alta ${role}: hash, provisional 24 h, token/correo y auditoría atómicos sin sesión`,async()=>{
  const f={...input(),role};const {create,cipher}=services();
  const stateBefore=JSON.stringify((await data.context.database.pool.query('SELECT * FROM "SystemState"')).rows);
  const view=await create.execute(actor,f);projection(view);
  expect(view.role===role&&view.status==='ACTIVE'&&!view.emailVerified&&view.mustSetPassword).toBe(true);
  const account=await row(view.id);expect(account.passwordHash===null&&account.authVersion==='0'&&account.emailVerifiedAt===null).toBe(true);
  expect(account.provisionalExpiresAt.getTime()-account.createdAt.getTime()).toBe(86400000);
  expect(await credentials.verify(f.provisionalPassword,account.provisionalPasswordHash)).toBe(true);
  const token=(await data.context.database.pool.query('SELECT * FROM "ActionToken" WHERE "userId"=$1',[view.id])).rows[0];
  expect(token.purpose==='VERIFY_EMAIL'&&token.expiresAt.getTime()-token.createdAt.getTime()===86400000&&token.emailCanonicalSnapshot===account.emailCanonical).toBe(true);
  const delivery=(await data.context.database.pool.query('SELECT * FROM "MailDelivery" WHERE "tokenId"=$1',[token.id])).rows[0];
  expect(delivery.status==='PENDING'&&cipher.decrypt(delivery).recipient===f.email).toBe(true);
  const audit=(await data.context.database.pool.query('SELECT * FROM "AuditEvent" WHERE "targetUserId"=$1',[view.id])).rows[0];
  expect(audit.action==='ACCOUNT_CREATED'&&audit.actorKind==='ACCOUNT'&&audit.actorUserId===actor.userId&&audit.requestId===f.requestId).toBe(true);
  expect((await data.context.database.pool.query('SELECT id FROM "Session" WHERE "userId"=$1',[view.id])).rowCount).toBe(0);
  expect(JSON.stringify((await data.context.database.pool.query('SELECT * FROM "SystemState"')).rows)===stateBefore).toBe(true);
  expect(!JSON.stringify(view).includes(f.provisionalPassword)).toBe(true);
});
for(const length of [1,100])test(`Unicode: nombre ${length}, provisional ${length===1?12:128} sin trim`,async()=>{
  const f={...input(),name:' '+'😀'.repeat(length)+' ',provisionalPassword:' '+'🔒'.repeat(length===1?10:126)+' '};
  const view=await services().create.execute(actor,f);expect(view.name==='😀'.repeat(length)).toBe(true);
  const account=await row(view.id);expect(await credentials.verify(f.provisionalPassword,account.provisionalPasswordHash)).toBe(true);
  expect(await credentials.verify(f.provisionalPassword.trim(),account.provisionalPasswordHash)).toBe(false);
});
test('cuota agotada conserva cuenta y auditoría sin token/entrega; reenvío existente puede emitir después',async()=>{
  const f=input();const {create,rates,links}=services();expect((await rates.admitMail(f.email,'VERIFY_EMAIL',f.origin,'ADMISSION')).allowed).toBe(true);
  const view=await create.execute(actor,f);expect(view.mustSetPassword&&!view.emailVerified).toBe(true);
  expect((await data.context.database.pool.query('SELECT * FROM "ActionToken" WHERE "userId"=$1',[view.id])).rowCount).toBe(0);
  expect((await data.context.database.pool.query('SELECT * FROM "MailDelivery"')).rowCount).toBe(0);
  expect((await data.context.database.pool.query('SELECT * FROM "AuditEvent" WHERE "targetUserId"=$1',[view.id])).rowCount).toBe(1);
  await data.clock!.advance(60000);expect((await links.execute({email:f.email,purpose:'VERIFY_EMAIL',origin:f.origin})).queued).toBe(true);
  expect((await data.context.database.pool.query('SELECT * FROM "ActionToken" WHERE "userId"=$1',[view.id])).rowCount).toBe(1);
});
test('duplicado canónico 409 tipado no sobrescribe ninguna cuenta ni emite enlace',async()=>{
  const f={...input(),email:' '+data.account().email.toUpperCase()+' '};const before=await adminSnapshot(data);
  await expect(services().create.execute(actor,f)).rejects.toBeInstanceOf(AccountConflict);expect(await adminSnapshot(data)===before).toBe(true);
});
test('doble alta concurrente: una cuenta, un token, una entrega, un evento y conflicto del perdedor',async()=>{
  const f=input();const create=services().create;const results=await Promise.allSettled([create.execute(actor,f),create.execute(actor,{...f,email:f.email.toUpperCase(),requestId:randomUUID()})]);
  expect(results.filter(result=>result.status==='fulfilled').length).toBe(1);
  expect(results.filter(result=>result.status==='rejected').every(result=>result.reason instanceof AccountConflict)).toBe(true);
  for(const table of ['ActionToken','MailDelivery','AuditEvent'])expect((await data.context.database.pool.query(`SELECT id FROM "${table}"`)).rowCount).toBe(1);
  expect((await data.context.database.pool.query('SELECT id FROM "User" WHERE "emailCanonical"=$1',[f.email])).rowCount).toBe(1);
});
for(const patch of [{role:'OWNER'},{role:['ADMIN']},{name:' '},{name:'😀'.repeat(101)},{email:'sin-correo'},
  {provisionalPassword:'x'.repeat(11)},{provisionalPassword:'x'.repeat(129)},{provisionalPassword:[]}])test(`entrada inválida ${Object.keys(patch)[0]}: sin efectos ni cuotas`,async()=>{
  const before=await adminSnapshot(data);const ratesBefore=(await data.context.database.pool.query('SELECT count(*)::int AS n FROM "RateEvent"')).rows[0].n;
  await expect(services().create.execute(actor,{...input(),...patch})).rejects.toBeInstanceOf(AccountValidationError);
  expect(await adminSnapshot(data)===before).toBe(true);expect((await data.context.database.pool.query('SELECT count(*)::int AS n FROM "RateEvent"')).rows[0].n).toBe(ratesBefore);
});
test('rol insuficiente no calcula hash ni consume cuota ni revela existencia',async()=>{
  const before=await adminSnapshot(data);const other=(await new PostgresSessionStore(data.context.database.pool).lookup(data.account().sessions[0].secret))!;
  let hashes=0;const hashing={...credentials,async hash(password:string){hashes++;return credentials.hash(password);},verify:credentials.verify.bind(credentials)};
  await expect(services(undefined,hashing).create.execute(other,{...input(),email:data.account().email})).rejects.toBeInstanceOf(AuthorizationFailure);
  expect(hashes).toBe(0);expect(await adminSnapshot(data)===before).toBe(true);
});
test('actor revocado durante hash: autorización bajo lock rechaza y no crea cuenta',async()=>{
  let entered!:()=>void;let release!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve);const gate=new Promise<void>(resolve=>release=resolve);
  const hashing={async hash(password:string){const hash=await credentials.hash(password);entered();await gate;return hash;},verify:credentials.verify.bind(credentials)};
  const pending=services(undefined,hashing).create.execute(actor,input());
  const rejected=expect(pending).rejects.toBeInstanceOf(AuthorizationFailure);
  try{await ready;await data.context.database.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[actor.sessionId]);}
  finally{release();}
  await rejected;
  // La revocación preparada es el único cambio de cuenta/sesión; no comparar secretos en una aserción.
  const count=(await data.context.database.pool.query('SELECT count(*)::int AS n FROM "User"')).rows[0].n;
  expect(count).toBe(data.manifest.accounts.length);for(const table of ['ActionToken','MailDelivery','AuditEvent'])expect((await data.context.database.pool.query(`SELECT id FROM "${table}"`)).rowCount).toBe(0);
});
test('alta ADMIN espera gobierno y revalida actor al liberarse SystemState',async()=>{
  const db=data.context.database.pool;const holder=await db.connect();
  let result:Promise<{error:unknown}|{view:unknown}>|undefined;
  try {
    await holder.query('BEGIN');await holder.query('SELECT id FROM "SystemState" WHERE id=1 FOR UPDATE');
    const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    result=services().create.execute(actor,{...input(),role:'ADMIN'}).then(view=>({view}),error=>({error}));
    await waitForBlockedBy(db,pid);
    await db.query(`UPDATE "User" SET role='TEACHER',"authVersion"="authVersion"+1 WHERE id=$1`,[actor.userId]);
    const before=await adminSnapshot(data);await holder.query('COMMIT');
    const outcome=await result;expect('error'in outcome&&outcome.error instanceof AuthorizationFailure).toBe(true);
    expect(await adminSnapshot(data)===before).toBe(true);
  }finally{await holder.query('ROLLBACK').catch(()=>undefined);holder.release();await result;}
});
for(const persistent of [false,true])test(`abortos transitorios: ${persistent?'máximo dos reintentos y rollback':'dos reintentos, un solo commit'}`,async()=>{
  let attempts=0;const actual=new PostgresAuditWriter();
  const audit={async write(client:Parameters<PostgresAuditWriter['write']>[0],event:unknown){
    await actual.write(client,event);attempts++;
    if(persistent||attempts<3)await client.query("DO $$ BEGIN RAISE EXCEPTION 'Aborto controlado' USING ERRCODE='40001'; END $$");
  }};
  const before=await adminSnapshot(data);const operation=services(audit).create.execute(actor,input());
  if(persistent){await expect(operation).rejects.toBeInstanceOf(ActionLinkUnavailable);expect(await adminSnapshot(data)===before).toBe(true);}
  else{projection(await operation);for(const table of ['ActionToken','MailDelivery','AuditEvent'])expect((await data.context.database.pool.query(`SELECT id FROM "${table}"`)).rowCount).toBe(1);}
  expect(attempts).toBe(3);
});
test('fallo real en inserción AuditEvent revierte cuenta/token/entrega',async()=>{
  await data.context.isolated.ownerQuery(`CREATE FUNCTION reject_admin_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo controlado'; END $$;
    CREATE TRIGGER reject_admin_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_admin_audit();`);
  const before=await adminSnapshot(data);
  try {await expect(services().create.execute(actor,input())).rejects.toBeInstanceOf(ActionLinkUnavailable);expect(await adminSnapshot(data)===before).toBe(true);}
  finally{await data.context.isolated.ownerQuery('DROP TRIGGER reject_admin_audit ON "AuditEvent"; DROP FUNCTION reject_admin_audit()');}
});
test('dos abortos dentro de AuditEvent conservan su señal y permiten un único commit',async()=>{
  await data.context.isolated.ownerQuery(`CREATE SEQUENCE audit_conflict_attempts;
    CREATE FUNCTION abort_admin_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF nextval('audit_conflict_attempts')<=2 THEN RAISE EXCEPTION 'Aborto controlado' USING ERRCODE='40001'; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER abort_admin_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION abort_admin_audit();`);
  try {
    projection(await services().create.execute(actor,input()));
    expect(Number((await data.context.database.pool.query('SELECT last_value FROM audit_conflict_attempts')).rows[0].last_value)).toBe(3);
    for(const table of ['ActionToken','MailDelivery','AuditEvent'])expect((await data.context.database.pool.query(`SELECT id FROM "${table}"`)).rowCount).toBe(1);
  }finally{await data.context.isolated.ownerQuery('DROP TRIGGER abort_admin_audit ON "AuditEvent"; DROP FUNCTION abort_admin_audit(); DROP SEQUENCE audit_conflict_attempts');}
});
test('fallo de cifrado no deja cuenta/token/auditoría parcial ni errores sensibles',async()=>{
  const pool=data.context.database.pool;const rates=new PostgresRateStore(pool,data.context.environment.rateHmacKey);
  const links=new IssueActionLink(new PostgresActionTokenStore(pool),rates,accessSecrets,{encrypt(){throw new Error('Fallo cifrado controlado, valores omitidos.');}},data.context.environment.appOrigin);
  const create=new CreateAccount(new PostgresAccountCreationStore(pool,{authorization:new PostgresSessionStore(pool),audit:new PostgresAuditWriter()}),credentials,links);
  const before=await adminSnapshot(data);await expect(create.execute(actor,input())).rejects.toBeInstanceOf(ActionLinkUnavailable);expect(await adminSnapshot(data)===before).toBe(true);
});
