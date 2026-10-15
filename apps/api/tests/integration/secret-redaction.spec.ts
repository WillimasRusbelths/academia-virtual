import { randomUUID } from 'node:crypto';
import { mkdtempSync,readFileSync,readdirSync,existsSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll,beforeEach,afterAll,afterEach,expect,test,vi } from 'vitest';
import { us2Dataset } from '../support/us2.js';
import type { Us2Dataset } from '../support/us2.js';
import { us1Http,restrictRead } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { adminRequest,adminSnapshot,projection } from '../support/us4.js';
import { identityDatabase } from '../support/identity-database.js';
import { runBootstrapDialogue } from '../support/us6-cli.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';
import { SecurityEvents } from '../../src/infrastructure/logging/security-events.js';
import { repositoryRoot } from '../../src/infrastructure/config/environment.js';
import { DeliverPending } from '../../src/modules/mail/application/deliver-pending.js';
import { PostgresDeliveryStore } from '../../src/modules/mail/infrastructure/delivery-store.js';
import { PostgresDeliveryEligibility } from '../../src/modules/identity/infrastructure/delivery-eligibility.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';

let data:Us2Dataset;let http:Us1Http;let directory:string;let logs:SecurityEvents;let broken=false;
let secrets:string[]=[];let personal:string[]=[];
let consoleSpies:ReturnType<typeof vi.spyOn>[]=[];
const rootLogs=path.join(repositoryRoot(),'apps/api/logs/security');
const uuid=/^[a-f0-9-]{36}$/;
const auditFields=['id','actorKind','actorUserId','targetUserId','action','result','occurredAt','requestId','oldRole','newRole','oldStatus','newStatus'];
const logFields=['eventId','correlationId','occurredAt','category','action','result','reasonCode','actorKind','actorUserId','operatorRef','targetKind','requestedTargetId','routeTemplate','counts'];
function records(location:string):Record<string,unknown>[] {
  if(!existsSync(location))return [];
  return readdirSync(location).filter(file=>file.endsWith('.jsonl')).flatMap(file=>readFileSync(path.join(location,file),'utf8')
    .split('\n').filter(Boolean).map(line=>JSON.parse(line) as Record<string,unknown>));
}
function secret(value:string){secrets.push(value);return value;}
function profile(){return {name:`Persona-${randomUUID()}`,email:`${randomUUID()}@example.test`,password:secret(accessSecrets.issue().secret)};}
function audit(rows:Record<string,unknown>[]){
  for(const row of rows){
    expect(Object.keys(row).sort()).toEqual([...auditFields].sort());
    expect(['ACCOUNT_CREATED','BOOTSTRAP_ADMIN_CREATED','NAME_CHANGED','ROLE_CHANGED','STATUS_CHANGED'].includes(String(row.action))).toBe(true);
    expect(['APPLIED','NO_CHANGE'].includes(String(row.result))&&uuid.test(String(row.id))&&uuid.test(String(row.requestId))&&uuid.test(String(row.targetUserId))).toBe(true);
    expect(row.actorKind==='SYSTEM_BOOTSTRAP'?row.actorUserId===null&&row.action==='BOOTSTRAP_ADMIN_CREATED':row.actorKind==='ACCOUNT'&&uuid.test(String(row.actorUserId))).toBe(true);
    expect([...secrets,...personal].every(value=>!JSON.stringify(row).includes(value))).toBe(true);
  }
}
beforeAll(async()=>{data=await us2Dataset('us5_secrets');},120000);
beforeEach(async()=>{
  await data.reset();directory=mkdtempSync(path.join(tmpdir(),'us5-private-'));logs=new SecurityEvents(directory);broken=false;
  secrets=[data.context.environment.mailPayloadKey.toString('base64'),data.context.environment.rateHmacKey.toString('base64'),data.context.environment.databaseUrl];
  personal=['127.0.0.1'];
  for(const f of data.manifest.accounts){secrets.push(f.password,...f.sessions.map(session=>session.secret));personal.push(f.email,f.name);}
  for(const row of (await data.context.database.pool.query('SELECT "passwordHash","provisionalPasswordHash" FROM "User"')).rows)
    secrets.push(...[row.passwordHash,row.provisionalPasswordHash].filter((value):value is string=>typeof value==='string'));
  http=await us1Http(data,data.context.environment.appOrigin,{record(input,id){if(broken)throw new Error(secrets[0]);return logs.record(input,id);}});
  await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();
  consoleSpies=['log','info','debug','warn','error'].map(method=>vi.spyOn(console,method as 'log').mockImplementation(()=>undefined));
});
afterEach(async()=>{
  try{
    await http?.close();
    for(const row of (await data.context.database.pool.query('SELECT "passwordHash","provisionalPasswordHash" FROM "User"')).rows)
      secrets.push(...[row.passwordHash,row.provisionalPasswordHash].filter((value):value is string=>typeof value==='string'));
    for(const table of ['Session','ActionToken'])for(const row of (await data.context.database.pool.query(`SELECT "tokenHash" FROM "${table}"`)).rows)
      secrets.push(row.tokenHash.toString('hex'),row.tokenHash.toString('base64'));
    audit((await data.context.database.pool.query('SELECT * FROM "AuditEvent"')).rows);
    const entries=[...records(directory),...records(rootLogs)];
    for(const entry of entries){
      expect(Object.keys(entry).every(key=>logFields.includes(key))).toBe(true);
      expect(['eventId','correlationId','occurredAt','category','action','result','reasonCode','actorKind','targetKind'].every(key=>Object.hasOwn(entry,key))).toBe(true);
      expect(uuid.test(String(entry.eventId))&&uuid.test(String(entry.correlationId))&&Number.isFinite(Date.parse(String(entry.occurredAt)))).toBe(true);
      expect(['ACCESS_DENIED','AUTHENTICATION_FAILED','ADMIN_COMMAND_REJECTED','BOOTSTRAP_ATTEMPT','RESTORED_STATE_INVALIDATION','MAIL_DELIVERY_FAILED','RUNTIME_FAILURE'].includes(String(entry.action))).toBe(true);
      expect(['SECURITY','OPERATION'].includes(String(entry.category))&&['STARTED','SUCCEEDED','DENIED','FAILED'].includes(String(entry.result))).toBe(true);
      expect(['ACCOUNT','ANONYMOUS','SYSTEM','LOCAL_OPERATOR'].includes(String(entry.actorKind))&&['USER_REFERENCE','IDENTITY_SCOPE','NONE'].includes(String(entry.targetKind))).toBe(true);
      expect(['AUTH_REQUIRED','INVALID_CREDENTIALS','FORBIDDEN','REQUEST_NOT_ALLOWED','VALIDATION_ERROR','NOT_FOUND','ACCOUNT_CONFLICT','ADMIN_INVARIANT','RATE_LIMITED','ALREADY_INITIALIZED','TEMPORARILY_UNAVAILABLE','SMTP_FAILURE','NONE'].includes(String(entry.reasonCode))).toBe(true);
      expect(entry.actorKind==='ACCOUNT'?uuid.test(String(entry.actorUserId))&&!('operatorRef'in entry):!('actorUserId'in entry)).toBe(true);
      if(entry.requestedTargetId!==undefined)expect(entry.targetKind==='USER_REFERENCE'&&uuid.test(String(entry.requestedTargetId))).toBe(true);
      if(entry.actorKind==='LOCAL_OPERATOR')expect(typeof entry.operatorRef==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(entry.operatorRef)&&entry.targetKind==='IDENTITY_SCOPE').toBe(true);
      if(entry.routeTemplate!==undefined)expect(!String(entry.routeTemplate).includes('?')&&!String(entry.routeTemplate).includes('#')).toBe(true);
    }
    const captured=JSON.stringify([entries,consoleSpies.flatMap(spy=>spy.mock.calls)]);
    expect([...secrets,...personal].every(value=>!captured.includes(value))).toBe(true);
  }finally{for(const spy of consoleSpies)spy.mockRestore();logs?.onApplicationShutdown();if(directory)rmSync(directory,{recursive:true,force:true});}
});
afterAll(async()=>{await data?.cleanup();});
async function response(result:Response,status:number,cookie:'none'|'login'|'clear'='none'){
  expect(result.status).toBe(status);const raw=await result.text();
  expect(result.headers.get('cache-control')).toBe('no-store');expect(result.headers.get('referrer-policy')).toBe('no-referrer');
  const header=result.headers.get('set-cookie');let session:string|undefined;
  if(cookie==='none')expect(header).toBeNull();
  else if(cookie==='clear')expect(header).toBe('av_session_dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  else{
    const match=header?.match(/^av_session_dev=([A-Za-z0-9_-]{43}); Path=\/; HttpOnly; SameSite=Lax; Max-Age=28800$/);
    expect(!!match).toBe(true);session=secret(match![1]);
  }
  expect(secrets.every(value=>!raw.includes(value))&&!/passwordHash|provisionalPasswordHash|tokenHash|authVersion|encryptedPayload|nonce|authTag|keyId/.test(raw)).toBe(true);
  if(status===204){expect(raw).toBe('');return {body:undefined,session};}
  const body=JSON.parse(raw);
  if(status>=400){
    expect(Object.keys(body)).toEqual(['error']);expect(Object.keys(body.error).every(key=>['code','message','requestId','fields'].includes(key))).toBe(true);
    expect(uuid.test(body.error.requestId)&&personal.every(value=>!raw.includes(value))).toBe(true);
    if(body.error.fields)expect(body.error.fields.every((field:Record<string,unknown>)=>Object.keys(field).sort().join(',')==='field,message'&&field.message==='Campo inválido.')).toBe(true);
  }else{
    expect(Object.keys(body)).toEqual(['data']);
    if(status===202){expect(Object.keys(body.data)).toEqual(['message']);expect(personal.every(value=>!raw.includes(value))).toBe(true);}
    else if(Array.isArray(body.data.items)){
      expect(Object.keys(body.data).sort()).toEqual(['items','page','pageSize','total']);body.data.items.forEach(projection);
    }else projection(body.data);
  }
  return {body,session};
}
async function action(userId:string,purpose:'VERIFY_EMAIL'|'RESET_PASSWORD'){
  const row=(await data.context.database.pool.query(`SELECT t."tokenHash",d.* FROM "ActionToken" t JOIN "MailDelivery" d ON d."tokenId"=t.id
    WHERE t."userId"=$1 AND t.purpose=$2 AND t."consumedAt" IS NULL AND t."revokedAt" IS NULL`,[userId,purpose])).rows[0];
  expect(!!row).toBe(true);const payload=createPayloadCipher(data.context.environment).decrypt(row);
  secrets.push(payload.link,row.tokenHash.toString('hex'),row.encryptedPayload.toString('base64'));
  return secret(payload.link.split('#')[1]);
}
test('registro, ambos enlaces, reset y acceso/cierre: cuerpos públicos y errores sin secretos ni datos de existencia',async()=>{
  const f=profile();personal.push(f.name,f.email);
  await response(await http.post('/auth/register',f),202);
  const user=(await data.context.database.pool.query('SELECT * FROM "User" WHERE "emailCanonical"=$1',[f.email])).rows[0];secret(user.passwordHash);
  const verification=await action(user.id,'VERIFY_EMAIL');
  await response(await http.post('/auth/verification/confirm',{token:verification,newPassword:secret(accessSecrets.issue().secret)}),400);
  await response(await http.post('/auth/verification/confirm',{token:verification}),204);
  await data.clock!.advance(60000); // La cuota pública se aplica también a una cuenta ya verificada.
  await response(await http.post('/auth/verification/request',{email:f.email}),202);
  await response(await http.post('/auth/password/forgot',{email:f.email}),202);const reset=await action(user.id,'RESET_PASSWORD');
  const password=secret(accessSecrets.issue().secret);
  await response(await http.post('/auth/password/reset',{token:reset,newPassword:'corta'}),400);
  await response(await http.post('/auth/password/reset',{token:reset,newPassword:password}),204,'clear');
  await response(await http.post('/auth/password/reset',{token:reset,newPassword:password}),400);
  await response(await http.post('/auth/login',{email:f.email,password:f.password}),401);
  const login=await response(await http.post('/auth/login',{email:f.email,password}),200,'login');projection(login.body.data);
  projection((await response(await http.get('/me',login.session),200)).body.data);
  await response(await http.post('/auth/logout',{},login.session),204,'clear');await response(await http.get('/me',login.session),401);
  expect(records(directory).some(row=>row.action==='AUTHENTICATION_FAILED'&&row.actorKind==='ANONYMOUS')).toBe(true);
  expect((await data.context.database.pool.query('SELECT count(*)::int AS n FROM "AuditEvent"')).rows[0].n).toBe(0);
});
test('alta administrativa y sustitución inicial: provisional/hash nunca en proyección, error ni auditoría',async()=>{
  const f=profile();personal.push(f.name,f.email);const actor=data.account('ADMIN');
  const created=await response(await http.post('/admin/users',{name:f.name,email:f.email,role:'TEACHER',provisionalPassword:f.password},actor.sessions[0].secret),201);
  projection(created.body.data);const id=created.body.data.id;
  secret((await data.context.database.pool.query('SELECT "provisionalPasswordHash" FROM "User" WHERE id=$1',[id])).rows[0].provisionalPasswordHash);
  const password=secret(accessSecrets.issue().secret);
  await response(await http.post('/auth/password/initial',{email:f.email,provisionalPassword:secret(accessSecrets.issue().secret),newPassword:password}),401);
  await response(await http.post('/auth/password/initial',{email:f.email,provisionalPassword:f.password,newPassword:password}),204);
  await response(await http.post('/auth/verification/confirm',{token:await action(id,'VERIFY_EMAIL')}),204);
  const login=await response(await http.post('/auth/login',{email:f.email,password}),200,'login');
  await response(await http.post('/auth/logout',{},login.session),204,'clear');
  expect((await data.context.database.pool.query('SELECT action FROM "AuditEvent"')).rows.map(row=>row.action)).toEqual(['ACCOUNT_CREATED']);
});
test('gestión y destinos conocidos/desconocidos: atribución permitida, sin PII, y logger fallido no cambia denegación',async()=>{
  const actor=data.account('ADMIN');const target=data.account();const secretCookie=actor.sessions[0].secret;
  projection((await response(await http.get(`/admin/users/${target.id}`,secretCookie),200)).body.data);
  await response(await http.get('/admin/users',secretCookie),200);
  const changed=`Nombre-${randomUUID()}`;personal.push(changed);
  await response(await adminRequest(http,'PATCH',`/admin/users/${target.id}/name`,secretCookie,{name:changed}),200);
  await response(await adminRequest(http,'PUT',`/admin/users/${target.id}/role`,secretCookie,{role:'TEACHER'}),200);
  await response(await adminRequest(http,'PUT',`/admin/users/${target.id}/status`,secretCookie,{status:'DISABLED'}),200);
  await response(await adminRequest(http,'PUT',`/admin/users/${target.id}/status`,secretCookie,{status:'DISABLED'}),200);
  const accepted=(await data.context.database.pool.query('SELECT * FROM "AuditEvent"')).rows;
  expect(accepted.length===4&&accepted.every(row=>row.actorUserId===actor.id&&row.targetUserId===target.id)).toBe(true);
  const before=await adminSnapshot(data);const teacher=data.account('TEACHER');const absent=randomUUID();
  for(const fail of [false,true]){
    broken=fail;
    for(const id of [target.id,absent])await response(await http.get(`/admin/users/${id}`,teacher.sessions[0].secret),403);
    await response(await http.get(`/admin/users/${secret(accessSecrets.issue().secret)}`,teacher.sessions[0].secret),403);
    await response(await adminRequest(http,'PUT',`/admin/users/${actor.id}/role`,secretCookie,{role:'STUDENT'}),409);
  }
  expect(await adminSnapshot(data)===before).toBe(true);
  const denied=records(directory).filter(row=>row.reasonCode==='FORBIDDEN');expect(denied.length).toBe(3);
  expect(denied[0].requestedTargetId===target.id&&denied[1].requestedTargetId===absent&&denied[2].requestedTargetId===undefined).toBe(true);
  expect(Object.keys(denied[0]).sort()).toEqual(Object.keys(denied[1]).sort());
});
test('expiración, cuotas y errores de transporte/BD: solo códigos permitidos, sin causas remotas ni claves',async()=>{
  const f=data.account();const password=secret(accessSecrets.issue().secret);
  const login=await response(await http.post('/auth/login',{email:f.email,password:f.password}),200,'login');
  await data.clock!.advance(1800000);await response(await http.get('/me',login.session),401);
  await response(await http.post('/auth/logout',{},login.session),204,'clear');
  await response(await http.post('/auth/password/forgot',{email:f.email}),202);
  await response(await http.post('/auth/password/forgot',{email:f.email}),429);
  await action(f.id,'RESET_PASSWORD');const pool=data.context.database.pool;
  const worker=new DeliverPending(new PostgresDeliveryStore(pool,new PostgresRateStore(pool,data.context.environment.rateHmacKey)),
    new PostgresDeliveryEligibility(pool),createPayloadCipher(data.context.environment),{async send(){throw new Error(password+secrets[0]);}});
  await worker.tick();expect(records(rootLogs).some(row=>row.action==='MAIL_DELIVERY_FAILED'&&row.reasonCode==='SMTP_FAILURE')).toBe(true);
  await restrictRead(data,'User',false);
  try{await response(await http.post('/auth/password/forgot',{email:data.account('TEACHER').email}),503);}
  finally{await restrictRead(data,'User',true);}
  expect(records(directory).some(row=>row.action==='RUNTIME_FAILURE')).toBe(true);
  await response(await http.post('/auth/login',{email:f.email,password,credentials:secrets[0]}),400);
  const headerMarker=secret(accessSecrets.issue().secret);
  await response(await http.get(`/admin/users/${headerMarker}`,undefined,{authorization:`Bearer ${headerMarker}`,
    referer:`${data.context.environment.appOrigin}/restablecer#${headerMarker}`,'x-request-id':headerMarker,'x-forwarded-for':'198.51.100.17'}),401);
});
test('bootstrap real: operador local correlacionado, sin usuario ficticio ni secretos en logs/argv/salida',async()=>{
  const cli=await identityDatabase('us5_bootstrap_private');
  try{
    const f=profile();personal.push(f.name,f.email);const input={name:f.name,email:f.email,provisional:f.password,operatorRef:'op_'+randomUUID().replaceAll('-','')};
    const result=await runBootstrapDialogue(cli.environment,input);expect(result.code).toBe(0);
    const user=(await cli.database.pool.query('SELECT * FROM "User"')).rows[0];secret(user.provisionalPasswordHash);
    const row=(await cli.database.pool.query('SELECT * FROM "MailDelivery"')).rows[0];
    const payload=createPayloadCipher(cli.environment).decrypt(row);secrets.push(payload.link,payload.link.split('#')[1],row.encryptedPayload.toString('base64'));
    expect(secrets.every(value=>!result.output.includes(value)&&!result.args.some(argument=>argument.includes(value)))).toBe(true);
    const events=(await cli.database.pool.query('SELECT * FROM "AuditEvent"')).rows;audit(events);
    expect(events.length===1&&events[0].actorKind==='SYSTEM_BOOTSTRAP'&&events[0].actorUserId===null&&events[0].targetUserId===user.id).toBe(true);
    const output=records(rootLogs).filter(record=>record.operatorRef===input.operatorRef);
    expect(output.length===2&&output.every(record=>record.actorKind==='LOCAL_OPERATOR'&&record.targetKind==='IDENTITY_SCOPE'&&record.correlationId===events[0].requestId)).toBe(true);
    const retry=await runBootstrapDialogue(cli.environment,{...input,provisional:secret(accessSecrets.issue().secret)});
    expect(retry.code===0).toBe(false);expect(secrets.every(value=>!retry.output.includes(value))).toBe(true);
    expect((await cli.database.pool.query('SELECT count(*)::int AS n FROM "User"')).rows[0].n).toBe(1);
  }finally{await cli.cleanup();}
});
