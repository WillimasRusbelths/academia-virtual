import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeAll,expect,test } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import type { IdentityTestDatabase } from '../support/session-fixture.js';
import { us1Http } from '../support/us1-http.js';
import { bootstrapCliAvailable,runBootstrapDialogue } from '../support/us6-cli.js';
import { PostgresBootstrapStore } from '../../src/modules/identity/infrastructure/bootstrap-store.js';
import { PostgresAuditWriter } from '../../src/modules/audit/infrastructure/audit-writer.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';
import { accessSecrets,createPasswordCredentials } from '../../src/modules/identity/infrastructure/credentials.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';

let context:IdentityTestDatabase;
beforeAll(async()=>{context=await identityDatabase('us6_cli');},120000);
afterEach(async()=>{
  // Solo el esquema t_* creado por esta suite; nunca se restablece una marca real.
  await context.isolated.ownerQuery(`TRUNCATE "SystemState","AuditEvent","MailDelivery","ActionToken","Session","User","RateEvent","RateBucket";
    INSERT INTO "SystemState" (id) VALUES (1);`);
});
afterAll(async()=>{await context?.cleanup();});
function input(){return {name:'Primer administrador ficticio',email:`bootstrap-${randomUUID()}@example.test`,
  provisional:accessSecrets.issue().secret,operatorRef:'operador_test'};}
function requireCli(){expect(bootstrapCliAvailable(),'US6_PENDING_CLI: falta la entrada operativa T053–T054').toBe(true);}
async function state(){return (await context.database.pool.query(`SELECT
  (SELECT count(*)::int FROM "User" WHERE role='ADMIN') AS admins,
  (SELECT count(*)::int FROM "AuditEvent") AS audit,
  (SELECT count(*)::int FROM "Session") AS sessions,
  EXISTS(SELECT 1 FROM "SystemState" WHERE "bootstrapCompletedAt" IS NOT NULL) AS marked`)).rows[0];}

test('control: PTY real detecta echo visible y permite entrada oculta sin argv secreto',async()=>{
  const f=input();const hidden=await runBootstrapDialogue(context.environment,f,'hidden');
  expect(hidden.code).toBe(0);expect(hidden.output.includes('PTY_READY')&&hidden.output.includes('PROBE_COMPLETE')).toBe(true);
  expect(hidden.output.includes(f.provisional)||hidden.args.some(arg=>arg.includes(f.provisional))).toBe(false);
  const visible=await runBootstrapDialogue(context.environment,f,'visible');
  expect(visible.code).toBe(0);expect(visible.output.includes(f.provisional)).toBe(true);
});
test('control: bootstrap T028 concurrente persiste un ADMIN y marca permanente, sin CLI',async()=>{
  const credentials=await createPasswordCredentials();const f=input();const issued=accessSecrets.issue();
  const store=new PostgresBootstrapStore(context.database.pool,new PostgresRateStore(context.database.pool,context.environment.rateHmacKey),new PostgresAuditWriter());
  const prepared={name:f.name,email:f.email,provisionalPasswordHash:await credentials.hash(f.provisional),requestId:randomUUID(),origin:'127.0.0.1',
    verification:{tokenHash:issued.digest,payload:createPayloadCipher(context.environment).encrypt({recipient:f.email,template:'VERIFY_EMAIL',
      link:`${context.environment.appOrigin}/verificar-correo#${issued.secret}`})}};
  const results=await Promise.allSettled([store.bootstrap(prepared),store.bootstrap({...prepared,requestId:randomUUID()})]);
  expect(results.filter(result=>result.status==='fulfilled').length).toBe(1);
  expect(await state()).toEqual({admins:1,audit:1,sessions:0,marked:true});
});
test('sin bootstrap público: visitante no crea ADMIN por HTTP y SystemState queda intacto',async()=>{
  const http=await us1Http({context,clock:undefined});
  try{for(const route of ['/bootstrap','/auth/bootstrap']){
    const response=await http.post(route,{});expect(response.status).toBe(404);
  }}finally{await http.close();}
  expect(await state()).toEqual({admins:0,audit:0,sessions:0,marked:false});
});
test('CLI: crea ADMIN pendiente, entrada oculta, salida mínima y auditoría',async()=>{
  requireCli();const f=input();const result=await runBootstrapDialogue(context.environment,f);
  expect(result.code).toBe(0);expect(result.args.some(arg=>arg.includes(f.provisional))).toBe(false);
  const rows=(await context.database.pool.query('SELECT * FROM "User"')).rows;expect(rows.length).toBe(1);const account=rows[0];
  expect(account.role==='ADMIN'&&account.status==='ACTIVE'&&account.mustSetPassword&&account.emailVerifiedAt===null&&account.passwordHash===null).toBe(true);
  expect(await (await createPasswordCredentials()).verify(f.provisional,account.provisionalPasswordHash)).toBe(true);
  expect(result.output.includes(f.provisional)||result.output.includes(account.provisionalPasswordHash)).toBe(false);
  expect(result.output.includes(account.id)&&result.output.includes(f.email)).toBe(true);
  expect(await state()).toEqual({admins:1,audit:1,sessions:0,marked:true});
});
test('CLI: dos procesos simultáneos producen máximo un ADMIN y no sobrescriben credenciales',async()=>{
  requireCli();const a=input();const b=input();
  const results=await Promise.all([runBootstrapDialogue(context.environment,a),runBootstrapDialogue(context.environment,b)]);
  expect(results.filter(result=>result.code===0).length).toBe(1);
  expect(await state()).toEqual({admins:1,audit:1,sessions:0,marked:true});
  const account=(await context.database.pool.query('SELECT * FROM "User"')).rows[0];const winner=account.email===a.email?a:b;
  expect(await (await createPasswordCredentials()).verify(winner.provisional,account.provisionalPasswordHash)).toBe(true);
  expect(results.every(result=>![a.provisional,b.provisional,account.provisionalPasswordHash].some(secret=>result.output.includes(secret)))).toBe(true);
});
test('CLI: repetir después de desactivar no crea ni sobrescribe; marca permanece',async()=>{
  requireCli();const f=input();expect((await runBootstrapDialogue(context.environment,f)).code).toBe(0);
  await context.database.pool.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp()`);
  const before=JSON.stringify((await context.database.pool.query('SELECT * FROM "User"')).rows);
  const retry=await runBootstrapDialogue(context.environment,input());expect(retry.code===0).toBe(false);
  expect(JSON.stringify((await context.database.pool.query('SELECT * FROM "User"')).rows)===before).toBe(true);
  expect(await state()).toEqual({admins:1,audit:1,sessions:0,marked:true});
});
