import { randomUUID } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import type { Environment } from '../config/environment.js';
import { repositoryRoot } from '../config/environment.js';
import { createPasswordCredentials, accessSecrets } from '../../modules/identity/infrastructure/credentials.js';
import { hashNewPassword } from '../../modules/identity/application/credentials.js';
import { ABSOLUTE_SESSION_MS, provisionalExpiresAt } from '../../modules/identity/domain/access.js';
import type { Role, AccountStatus } from '../../modules/users/public/account.js';

export class FixtureSafetyError extends Error {
  constructor() { super('Fixtures no disponibles: revisar entorno de prueba y manifiesto privado. Valores omitidos.'); }
}
export type FixtureVariant = 'ENABLED' | 'DISABLED' | 'UNVERIFIED' | 'PROVISIONAL';
export interface FixtureAccount {
  id: string; name: string; email: string; role: Role; status: AccountStatus; variant: FixtureVariant;
  password: string; sessions: { id: string; secret: string }[];
}
export interface FixtureManifest {
  version: 1; runId: string; database: string; schema: string; accounts: FixtureAccount[];
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const roles: Role[] = ['STUDENT','TEACHER','ADMIN'];
const variants: FixtureVariant[] = ['ENABLED','DISABLED','UNVERIFIED','PROVISIONAL'];
export const fixtureDirectory = () => path.join(repositoryRoot(),'apps/api/.secrets/identity-fixtures');

/** Defensa previa a cualquier conexión/escritura, también cuando se recibe un objeto Environment. */
export function assertFixtureEnvironment(environment: Environment): void {
  try {
    const db = new URL(environment.databaseUrl);const origin = new URL(environment.appOrigin);
    if (environment.appEnv !== 'test' || db.protocol !== 'postgresql:' || db.hostname !== 'db' || db.port !== '5432'
      || !/^\/[a-z][a-z0-9_]*_test$/.test(db.pathname) || environment.databaseTls
      || origin.protocol !== 'http:' || origin.hostname !== 'localhost' || origin.origin !== environment.appOrigin
      || environment.mailMode !== 'capture' || environment.smtp.host !== 'mailpit' || environment.smtp.port !== 1025
      || environment.smtp.secure || environment.smtp.requireTls || environment.smtp.user || environment.smtp.password
      || !environment.smtp.from.endsWith('@example.test')) throw new FixtureSafetyError();
  } catch { throw new FixtureSafetyError(); }
}

async function assertTarget(pool: Pool, environment: Environment) {
  assertFixtureEnvironment(environment);
  const row = (await pool.query<{ database:string; schema:string }>('SELECT current_database() AS database,current_schema() AS schema')).rows[0];
  if (!row || row.database !== new URL(environment.databaseUrl).pathname.slice(1) || row.schema !== environment.databaseSchema) {
    throw new FixtureSafetyError();
  }
}
function emailFor(runId: string, role: Role, variant: FixtureVariant) {
  return `fixture-${runId}-${role.toLowerCase()}-${variant.toLowerCase()}@example.test`;
}
function nameFor(runId: string, role: Role, variant: FixtureVariant) { return `Ensayo ${runId} ${role} ${variant}`; }
function privateDirectory(directory: string) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(directory)!==path.resolve(directory)
    || (stat.mode & 0o077) !== 0) throw new FixtureSafetyError();
}
function manifestPath(directory: string, runId: string) {
  if (!uuid.test(runId)) throw new FixtureSafetyError();
  return path.join(directory,`${runId}.json`);
}

/** Solo datos sintéticos para tests. No usa ni cambia la marca de bootstrap del entorno. */
export async function createIdentityFixtures(environment: Environment, pool: Pool, directory = fixtureDirectory()) {
  await assertTarget(pool,environment);
  privateDirectory(directory);
  const manifest: FixtureManifest = { version:1,runId:randomUUID(),database:new URL(environment.databaseUrl).pathname.slice(1),
    schema:environment.databaseSchema,accounts:[] };
  const credentials = await createPasswordCredentials();
  const prepared: { account:FixtureAccount; hash:string }[] = [];
  for (const role of roles) for (const variant of variants) {
    const password = accessSecrets.issue().secret;
    const account: FixtureAccount = { id:randomUUID(),name:nameFor(manifest.runId,role,variant),
      email:emailFor(manifest.runId,role,variant),role,status:variant==='DISABLED'?'DISABLED':'ACTIVE',variant,password,sessions:[] };
    if (variant === 'ENABLED') account.sessions = Array.from({length:2},() => ({id:randomUUID(),secret:accessSecrets.issue().secret}));
    prepared.push({account,hash:await hashNewPassword(password,credentials)});manifest.accounts.push(account);
  }
  const file = manifestPath(directory,manifest.runId);
  const fd = openSync(file,constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,0o600);
  try { writeFileSync(fd,JSON.stringify(manifest),'utf8'); } finally { closeSync(fd); }
  // Se conserva el manifiesto si SQL/COMMIT falla: permite limpieza dirigida aun con resultado ambiguo.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const now = (await client.query<{ now:Date }>('SELECT clock_timestamp() AS now')).rows[0].now;
    for (const {account,hash} of prepared) {
      const provisional = account.variant === 'PROVISIONAL';
      await client.query(`INSERT INTO "User" (id,name,email,"emailCanonical",role,status,"emailVerifiedAt",
        "passwordHash","mustSetPassword","provisionalPasswordHash","provisionalExpiresAt","createdAt","disabledAt")
        VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[account.id,account.name,account.email,account.role,account.status,
        account.variant==='ENABLED'||account.variant==='DISABLED'?now:null,provisional?null:hash,provisional,
        provisional?hash:null,provisional?provisionalExpiresAt(now):null,now,account.status==='DISABLED'?now:null]);
      for (const session of account.sessions) await client.query(`INSERT INTO "Session"
        (id,"userId","tokenHash","authVersion","createdAt","lastAcceptedAt","absoluteExpiresAt") VALUES ($1,$2,$3,0,$4,$4,$5)`,
      [session.id,account.id,Buffer.from(accessSecrets.digest(session.secret)!),now,new Date(now.getTime()+ABSOLUTE_SESSION_MS)]);
    }
    await client.query('COMMIT');
    return { runId:manifest.runId,file,accounts:manifest.accounts.length };
  } catch { await client.query('ROLLBACK').catch(() => undefined);throw new FixtureSafetyError(); }
  finally { client.release(); }
}

/** Lectura explícita para tests; nunca enviar este resultado a HTTP, stdout o logs. */
export function readFixtureManifest(environment: Environment, runId: string, directory = fixtureDirectory()): FixtureManifest {
  assertFixtureEnvironment(environment);
  let fd:number|undefined;
  try {
    privateDirectory(directory);
    fd = openSync(manifestPath(directory,runId),constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 64*1024 || (stat.mode & 0o077)!==0) throw new FixtureSafetyError();
    const data = JSON.parse(readFileSync(fd,'utf8')) as FixtureManifest;
    if (!data || data.version!==1 || data.runId!==runId || data.database!==new URL(environment.databaseUrl).pathname.slice(1)
      || data.schema!==environment.databaseSchema || !Array.isArray(data.accounts) || data.accounts.length!==12) throw new FixtureSafetyError();
    const ids = new Set<string>();const combinations = new Set<string>();
    for (const account of data.accounts) {
      if (!account || !uuid.test(account.id) || !roles.includes(account.role) || !variants.includes(account.variant)
        || account.email!==emailFor(runId,account.role,account.variant) || account.name!==nameFor(runId,account.role,account.variant)
        || account.status!==(account.variant==='DISABLED'?'DISABLED':'ACTIVE') || typeof account.password!=='string'
        || !/^[A-Za-z0-9_-]{43}$/.test(account.password) || !Array.isArray(account.sessions)
        || account.sessions.length!==(account.variant==='ENABLED'?2:0)) throw new FixtureSafetyError();
      if (ids.has(account.id) || combinations.has(`${account.role}:${account.variant}`)) throw new FixtureSafetyError();
      ids.add(account.id);combinations.add(`${account.role}:${account.variant}`);
      for (const session of account.sessions) {
        if (!session || !uuid.test(session.id) || ids.has(session.id) || !accessSecrets.digest(session.secret)) throw new FixtureSafetyError();
        ids.add(session.id);
      }
    }
    return data;
  } catch { throw new FixtureSafetyError(); } finally { if (fd!==undefined) closeSync(fd); }
}

export async function cleanupIdentityFixtures(environment: Environment, pool: Pool, runId: string, directory = fixtureDirectory()) {
  await assertTarget(pool,environment);
  const manifest = readFixtureManifest(environment,runId,directory);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = manifest.accounts.map(account => account.id);
    const existing = (await client.query<{ id:string; emailCanonical:string }>(
      'SELECT id,"emailCanonical" FROM "User" WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[ids])).rows;
    if (existing.some(row => !manifest.accounts.some(account => account.id===row.id && account.email===row.emailCanonical))) {
      throw new FixtureSafetyError();
    }
    // Solo relaciones de esas cuentas. Una FK externa (incluida SystemState) impide la limpieza completa.
    await client.query('DELETE FROM "AuditEvent" WHERE "targetUserId"=ANY($1::uuid[])',[ids]);
    await client.query('DELETE FROM "MailDelivery" WHERE "tokenId" IN (SELECT id FROM "ActionToken" WHERE "userId"=ANY($1::uuid[]))',[ids]);
    await client.query('DELETE FROM "ActionToken" WHERE "userId"=ANY($1::uuid[])',[ids]);
    await client.query('DELETE FROM "Session" WHERE "userId"=ANY($1::uuid[])',[ids]);
    await client.query('DELETE FROM "User" WHERE id=ANY($1::uuid[])',[ids]);
    await client.query('COMMIT');
    unlinkSync(manifestPath(directory,runId));
    return {runId,removed:existing.length};
  } catch { await client.query('ROLLBACK').catch(() => undefined);throw new FixtureSafetyError(); }
  finally { client.release(); }
}
