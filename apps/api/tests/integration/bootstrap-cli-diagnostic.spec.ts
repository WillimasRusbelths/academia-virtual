import { randomUUID } from 'node:crypto';
import { beforeAll,afterAll,test,expect } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import { runBootstrapDialogue } from '../support/us6-cli.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import { repositoryRoot } from '../../src/infrastructure/config/environment.js';
import { existsSync,readFileSync,readdirSync } from 'node:fs';
import path from 'node:path';

let context:Awaited<ReturnType<typeof identityDatabase>>;
beforeAll(async()=>{context=await identityDatabase('us5_cli_diagnostic');},120000);
afterAll(async()=>{await context?.cleanup();});
for(let attempt=1;attempt<=8;attempt++)test(`diagnóstico CLI acotado ${attempt}: entrada, repetición y privacidad`,async()=>{
  // Exclusivamente el esquema nuevo t_* de esta suite; sin tocar la marca del ensayo manual.
  await context.isolated.ownerQuery(`TRUNCATE "SystemState","AuditEvent","MailDelivery","ActionToken","Session","User","RateEvent","RateBucket";
    INSERT INTO "SystemState" (id) VALUES (1);`);
  const input={name:'Persona-'+randomUUID(),email:randomUUID()+'@example.test',
    operatorRef:'op_'+randomUUID().replaceAll('-',''),provisional:accessSecrets.issue().secret};
  const result=await runBootstrapDialogue(context.environment,input);
  expect(result.code,JSON.stringify(result.diagnostics)).toBe(0);
  expect(result.diagnostics.answered).toEqual(['operator','name','email','credential']);
  const state=(await context.database.pool.query(`SELECT
    (SELECT count(*)::int FROM "User") AS users,(SELECT count(*)::int FROM "AuditEvent") AS audit,
    (SELECT count(*)::int FROM "Session") AS sessions,
    EXISTS(SELECT 1 FROM "SystemState" WHERE "bootstrapCompletedAt" IS NOT NULL) AS marked`)).rows[0];
  expect(state).toEqual({users:1,audit:1,sessions:0,marked:true});
  const before=JSON.stringify((await context.database.pool.query('SELECT * FROM "User"')).rows);
  const hash=(await context.database.pool.query('SELECT "provisionalPasswordHash" FROM "User"')).rows[0].provisionalPasswordHash as string;
  const retry=await runBootstrapDialogue(context.environment,{...input,provisional:accessSecrets.issue().secret});
  expect(retry.code===0,JSON.stringify(retry.diagnostics)).toBe(false);
  expect(JSON.stringify((await context.database.pool.query('SELECT * FROM "User"')).rows)===before).toBe(true);
  expect([input.provisional,hash,context.environment.databaseUrl].every(value=>!result.output.includes(value)&&!retry.output.includes(value))).toBe(true);
  const location=path.join(repositoryRoot(),'apps/api/logs/security');
  const records=existsSync(location)?readdirSync(location).filter(file=>file.endsWith('.jsonl'))
    .flatMap(file=>readFileSync(path.join(location,file),'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line)))
    .filter(record=>record.operatorRef===input.operatorRef):[];
  const audit=(await context.database.pool.query('SELECT * FROM "AuditEvent"')).rows[0];
  expect(records.map(record=>record.result)).toEqual(['STARTED','SUCCEEDED','STARTED','DENIED']);
  expect(records[0].correlationId===audit.requestId&&records[1].correlationId===audit.requestId).toBe(true);
  expect(records.every(record=>record.actorKind==='LOCAL_OPERATOR'&&record.targetKind==='IDENTITY_SCOPE')).toBe(true);
  expect([input.provisional,hash,input.email,input.name].every(value=>!JSON.stringify(records).includes(value))).toBe(true);
});
