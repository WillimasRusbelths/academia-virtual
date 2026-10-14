import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync,readdirSync } from 'node:fs';
import path from 'node:path';
import { beforeAll,afterAll,afterEach,test,expect } from 'vitest';
import { repositoryRoot } from '../../src/infrastructure/config/environment.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';
import { identityDatabase } from '../support/identity-database.js';
import type { IdentityTestDatabase } from '../support/session-fixture.js';
import { runBootstrapDialogue } from '../support/us6-cli.js';

let context:IdentityTestDatabase;
beforeAll(async()=>{context=await identityDatabase('us6_cli_guards');},120000);
afterEach(async()=>{
  await context.isolated.ownerQuery(`TRUNCATE "SystemState","AuditEvent","MailDelivery","ActionToken","Session","User","RateEvent","RateBucket";
    INSERT INTO "SystemState" (id) VALUES (1);`);
});
afterAll(async()=>{await context?.cleanup();});
function input(){return {name:'Administrador de ensayo',email:`${randomUUID()}@example.test`,
  provisional:accessSecrets.issue().secret,operatorRef:'op_'+randomUUID().replaceAll('-','')};}
async function unchanged(){
  expect((await context.database.pool.query('SELECT count(*)::int AS n FROM "User"')).rows[0].n).toBe(0);
  expect((await context.database.pool.query('SELECT "bootstrapCompletedAt" FROM "SystemState"')).rows[0].bootstrapCompletedAt).toBeNull();
}
test('CLI correlaciona LOCAL_OPERATOR con SYSTEM_BOOTSTRAP, conserva 24 h y entrega cifrada',async()=>{
  const f=input();expect((await runBootstrapDialogue(context.environment,f)).code).toBe(0);
  const account=(await context.database.pool.query('SELECT * FROM "User"')).rows[0];
  expect(account.provisionalExpiresAt.getTime()-account.createdAt.getTime()).toBe(24*60*60_000);
  const audit=(await context.database.pool.query('SELECT * FROM "AuditEvent"')).rows[0];
  const location=path.join(repositoryRoot(),'apps/api/logs/security');
  const raw=readdirSync(location).filter(file=>file.endsWith('.jsonl')).map(file=>readFileSync(path.join(location,file),'utf8')).join('\n');
  const records=raw.split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(event=>event.operatorRef===f.operatorRef);
  expect(records.map(event=>event.result)).toEqual(['STARTED','SUCCEEDED']);
  expect(records.every(event=>event.correlationId===audit.requestId&&event.actorKind==='LOCAL_OPERATOR'&&event.targetKind==='IDENTITY_SCOPE')).toBe(true);
  expect(audit.actorKind==='SYSTEM_BOOTSTRAP'&&audit.actorUserId===null&&audit.targetUserId===account.id).toBe(true);
  const mail=(await context.database.pool.query('SELECT * FROM "MailDelivery"')).rows[0];
  const payload=createPayloadCipher(context.environment).decrypt(mail);
  const url=new URL(payload.link);const digest=accessSecrets.digest(url.hash.slice(1));
  const token=(await context.database.pool.query('SELECT * FROM "ActionToken"')).rows[0];
  expect(url.origin===context.environment.appOrigin&&url.pathname==='/verificar-correo'&&digest!==null&&Buffer.from(digest).equals(token.tokenHash)).toBe(true);
  expect(payload.recipient===f.email&&mail.tokenId===token.id&&token.userId===account.id).toBe(true);
  expect([f.provisional,account.provisionalPasswordHash,payload.link,f.email].some(secret=>raw.includes(secret))).toBe(false);
});
test.each(['alias no valido','a'.repeat(65)])('CLI rechaza operatorRef invalido antes de crear cuenta (%#)',async operatorRef=>{
  expect((await runBootstrapDialogue(context.environment,{...input(),operatorRef})).code===0).toBe(false);
  await unchanged();
});
test('CLI rechaza argumentos y entrada sin terminal, con errores seguros y sin estado parcial',async()=>{
  const executable=path.join(repositoryRoot(),'apps/api/dist/src/cli/bootstrap-admin.js');
  for(const args of [[],['--email']]){
    const result=spawnSync(process.execPath,[executable,...args],{cwd:repositoryRoot(),encoding:'utf8',env:{...process.env,
      APP_ENV:'test',TEST_DATABASE_URL:context.environment.databaseUrl,TEST_MIGRATION_DATABASE_URL:context.environment.migrationUrl}});
    expect(result.status===0||result.error!==undefined).toBe(false);
    expect(result.stdout.trim()===''&&result.stderr.includes('Detalles omitidos.')&&!result.stderr.includes(context.environment.databaseUrl)).toBe(true);
    await unchanged();
  }
});
