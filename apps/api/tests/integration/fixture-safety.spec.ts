import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import { sessionFixture } from '../support/session-fixture.js';
import type { IdentityTestDatabase } from '../support/session-fixture.js';
import { createIdentityFixtures, cleanupIdentityFixtures, readFixtureManifest, FixtureSafetyError } from '../support/identity-fixtures.js';
import type { FixtureManifest } from '../support/identity-fixtures.js';
import type { Environment } from '../../src/infrastructure/config/environment.js';
import { repositoryRoot } from '../../src/infrastructure/config/environment.js';
import { createPasswordCredentials, accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';

let context:IdentityTestDatabase;
const directory = mkdtempSync(path.join(tmpdir(),'identity-fixtures-'));
const location = () => path.join(directory,randomUUID());
beforeAll(async () => { context = await identityDatabase('fixture_safety'); },120000);
afterEach(async () => {
  vi.restoreAllMocks();
  await context.isolated.ownerQuery(`DROP FUNCTION IF EXISTS fixture_test_failure() CASCADE;
    TRUNCATE "SystemState","AuditEvent","MailDelivery","ActionToken","Session","User","RateEvent","RateBucket";
    INSERT INTO "SystemState" (id) VALUES (1);`);
});
afterAll(async () => { await context?.cleanup();rmSync(directory,{recursive:true,force:true}); });
async function count() { return Number((await context.database.pool.query<{count:string}>('SELECT count(*) FROM "User"')).rows[0].count); }

test.each(['development','demo','production','database','remote-db','origin','smtp','relay','port','auth','tls'] as const)(
  'rechaza entorno %s antes de conectar o escribir',async invalid => {
    const base = context.environment;
    const bad:Environment = {...base,...(invalid==='development'||invalid==='demo'||invalid==='production'?{appEnv:invalid}
      :invalid==='database'?{databaseUrl:base.databaseUrl.replace('/academia_v00_test','/academia_dev')}
      :invalid==='remote-db'?{databaseUrl:base.databaseUrl.replace('@db:', '@remote.invalid:')}
      :invalid==='origin'?{appOrigin:'https://remote.invalid'}:invalid==='smtp'?{mailMode:'smtp'}
      :{smtp:{...base.smtp,...(invalid==='relay'?{host:'remote.invalid'}:invalid==='port'?{port:587}
        :invalid==='auth'?{user:'not-used',password:randomUUID()}:{secure:true})}})};
    const spy = vi.spyOn(context.database.pool,'query');
    await expect(createIdentityFixtures(bad,context.database.pool,location())).rejects.toThrow(FixtureSafetyError);
    expect(spy).not.toHaveBeenCalled();spy.mockRestore();expect(await count()).toBe(0);
  });

test('compara base/schema efectivos antes de generar secretos o archivos',async () => {
  const directory = location();
  await expect(createIdentityFixtures({...context.environment,databaseSchema:'public'},context.database.pool,directory)).rejects.toThrow(FixtureSafetyError);
  expect(await count()).toBe(0);
});

test('todos los roles/estados, hashes reales y dos sesiones opacas por cuenta habilitada',async () => {
  const dir = location();const f = await createIdentityFixtures(context.environment,context.database.pool,dir);
  const manifest = readFixtureManifest(context.environment,f.runId,dir);
  expect(manifest.accounts.length).toBe(12);expect(await count()).toBe(12);
  expect(new Set(manifest.accounts.map(account => account.role))).toEqual(new Set(['STUDENT','TEACHER','ADMIN']));
  expect(new Set(manifest.accounts.map(account => account.status))).toEqual(new Set(['ACTIVE','DISABLED']));
  expect(new Set(manifest.accounts.map(account => account.password)).size).toBe(12);
  const credentials = await createPasswordCredentials();const sessions = new PostgresSessionStore(context.database.pool);
  for (const account of manifest.accounts) {
    const row = (await context.database.pool.query<{passwordHash:string|null;provisionalPasswordHash:string|null;emailVerifiedAt:Date|null; mustSetPassword:boolean}>(
      'SELECT "passwordHash","provisionalPasswordHash","emailVerifiedAt","mustSetPassword" FROM "User" WHERE id=$1',[account.id])).rows[0];
    expect(await credentials.verify(account.password,row.passwordHash??row.provisionalPasswordHash)).toBe(true);
    expect(row.mustSetPassword).toBe(account.variant==='PROVISIONAL');
    expect(row.emailVerifiedAt===null).toBe(['UNVERIFIED','PROVISIONAL'].includes(account.variant));
    expect(account.sessions.length).toBe(account.variant==='ENABLED'?2:0);
    for (const session of account.sessions) {
      expect((await sessions.lookup(session.secret))?.userId===account.id).toBe(true);
      const row = (await context.database.pool.query<{ tokenHash:Buffer }>('SELECT "tokenHash" FROM "Session" WHERE id=$1',[session.id])).rows[0];
      expect(row.tokenHash.equals(Buffer.from(accessSecrets.digest(session.secret)!))).toBe(true);
    }
  }
  expect(statSync(dir).mode & 0o777).toBe(0o700);expect(statSync(f.file).mode & 0o777).toBe(0o600);
  await cleanupIdentityFixtures(context.environment,context.database.pool,f.runId,dir);expect(await count()).toBe(0);
});

test('dos lotes aleatorios y limpieza dirigida preservan cuentas/sesiones ajenas y marca permanente',async () => {
  const existing = await sessionFixture(context,'ADMIN');
  await context.database.pool.query('UPDATE "SystemState" SET "bootstrapCompletedAt"=clock_timestamp(),"firstAdminUserId"=$1 WHERE id=1',[existing.userId]);
  const before = (await context.database.pool.query('SELECT * FROM "SystemState"')).rows[0];
  const dir = location();const first = await createIdentityFixtures(context.environment,context.database.pool,dir);
  const second = await createIdentityFixtures(context.environment,context.database.pool,dir);
  expect(first.runId===second.runId).toBe(false);expect(await count()).toBe(25);
  const manifest = readFixtureManifest(context.environment,first.runId,dir);
  await context.database.pool.query('UPDATE "User" SET name=\'Nombre corregido de ensayo\' WHERE id=$1',[manifest.accounts[0].id]);
  await cleanupIdentityFixtures(context.environment,context.database.pool,first.runId,dir);
  expect(await count()).toBe(13);expect(readdirSync(dir).length).toBe(1);
  expect((await new PostgresSessionStore(context.database.pool).lookup(existing.secret))?.userId===existing.userId).toBe(true);
  expect((await context.database.pool.query('SELECT * FROM "SystemState"')).rows[0]).toEqual(before);
  await cleanupIdentityFixtures(context.environment,context.database.pool,second.runId,dir);expect(await count()).toBe(1);
});

test('manifiesto alterado no permite borrar una cuenta ajena; schema/base ajenos se rechazan',async () => {
  const existing = await sessionFixture(context);
  const dir = location();const f = await createIdentityFixtures(context.environment,context.database.pool,dir);
  const original = readFileSync(f.file,'utf8');const manifest = JSON.parse(original) as FixtureManifest;
  manifest.accounts[0].id = existing.userId;writeFileSync(f.file,JSON.stringify(manifest));
  await expect(cleanupIdentityFixtures(context.environment,context.database.pool,f.runId,dir)).rejects.toThrow(FixtureSafetyError);
  expect(await count()).toBe(13);
  manifest.schema='public';writeFileSync(f.file,JSON.stringify(manifest));
  expect(() => readFixtureManifest(context.environment,f.runId,dir)).toThrow(FixtureSafetyError);
  writeFileSync(f.file,original);await cleanupIdentityFixtures(context.environment,context.database.pool,f.runId,dir);
});

test('no lee secretos desde symlink o archivo con permisos públicos',async () => {
  const dir = location();const f = await createIdentityFixtures(context.environment,context.database.pool,dir);
  chmodSync(f.file,0o644);expect(() => readFixtureManifest(context.environment,f.runId,dir)).toThrow(FixtureSafetyError);
  chmodSync(f.file,0o600);
  const runId=randomUUID();symlinkSync(f.file,path.join(dir,`${runId}.json`));
  expect(() => readFixtureManifest(context.environment,runId,dir)).toThrow(FixtureSafetyError);
  await cleanupIdentityFixtures(context.environment,context.database.pool,f.runId,dir);
});

test('fallo de inserción hace rollback y conserva manifiesto privado para limpieza dirigida',async () => {
  await context.isolated.ownerQuery(`CREATE FUNCTION fixture_test_failure() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'Fallo controlado'; END $$;
    CREATE TRIGGER fixture_test_failure BEFORE INSERT ON "Session" FOR EACH ROW EXECUTE FUNCTION fixture_test_failure();`);
  const dir = location();await expect(createIdentityFixtures(context.environment,context.database.pool,dir)).rejects.toThrow(FixtureSafetyError);
  expect(await count()).toBe(0);expect(readdirSync(dir).length).toBe(1);
  const runId = readdirSync(dir)[0].slice(0,-5);
  expect((await cleanupIdentityFixtures(context.environment,context.database.pool,runId,dir)).removed).toBe(0);
});

test('una referencia externa preserva marca/cuentas/sesiones: limpieza fallida revierte por completo',async () => {
  const dir=location();const f=await createIdentityFixtures(context.environment,context.database.pool,dir);
  const admin=readFixtureManifest(context.environment,f.runId,dir).accounts.find(account => account.role==='ADMIN')!;
  await context.database.pool.query('UPDATE "SystemState" SET "bootstrapCompletedAt"=clock_timestamp(),"firstAdminUserId"=$1 WHERE id=1',[admin.id]);
  const before=(await context.database.pool.query('SELECT * FROM "SystemState"')).rows[0];
  await expect(cleanupIdentityFixtures(context.environment,context.database.pool,f.runId,dir)).rejects.toThrow(FixtureSafetyError);
  expect(await count()).toBe(12);
  expect(Number((await context.database.pool.query<{count:string}>('SELECT count(*) FROM "Session"')).rows[0].count)).toBe(6);
  expect((await context.database.pool.query('SELECT * FROM "SystemState"')).rows[0]).toEqual(before);
  expect(readdirSync(dir).length).toBe(1);
});

test('directorio público o symlink no recibe manifiestos ni datos de fixtures',async () => {
  const publicDir=mkdtempSync(path.join(directory,'public-'));chmodSync(publicDir,0o755);
  await expect(createIdentityFixtures(context.environment,context.database.pool,publicDir)).rejects.toThrow(FixtureSafetyError);
  expect(readdirSync(publicDir).length).toBe(0);expect(await count()).toBe(0);
  const target=mkdtempSync(path.join(directory,'private-'));const linked=location();symlinkSync(target,linked);
  await expect(createIdentityFixtures(context.environment,context.database.pool,linked)).rejects.toThrow(FixtureSafetyError);
  expect(readdirSync(target).length).toBe(0);expect(await count()).toBe(0);
});

function cli(args:string[], env:NodeJS.ProcessEnv) {
  return spawnSync(process.execPath,['apps/api/dist/src/cli/fixtures-identity.js',...args],
    {cwd:repositoryRoot(),env,encoding:'utf8',timeout:30000});
}
test('CLI real exige test, no ofrece credenciales/HTTP y stdout nunca contiene secretos',async () => {
  const env = {...process.env,APP_ENV:'test',TEST_DATABASE_URL:context.environment.databaseUrl,TEST_MIGRATION_DATABASE_URL:context.environment.migrationUrl};
  for (const appEnv of ['development','production','demo']) {
    const result = cli(['create'],{...env,APP_ENV:appEnv});expect(result.status).toBe(1);expect(result.stdout).toBe('');
  }
  const marker = randomUUID();const invalid = cli(['create','--password',marker],env);
  expect(invalid.status).toBe(1);expect((invalid.stdout+invalid.stderr).includes(marker)).toBe(false);
  const result = cli(['create'],env);expect(result.status).toBe(0);
  const runId = result.stdout.match(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/)?.[0];expect(!!runId).toBe(true);
  const manifest = readFixtureManifest(context.environment,runId!);
  for (const account of manifest.accounts) {
    expect((result.stdout+result.stderr).includes(account.password)).toBe(false);
    for (const session of account.sessions) expect((result.stdout+result.stderr).includes(session.secret)).toBe(false);
  }
  const cleaned = cli(['cleanup',runId!],env);expect(cleaned.status).toBe(0);expect(await count()).toBe(0);
  expect(cleaned.stdout.includes('12')).toBe(true);
});
