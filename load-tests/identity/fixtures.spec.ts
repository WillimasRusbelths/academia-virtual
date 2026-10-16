import { mkdtempSync,readFileSync,writeFileSync,rmSync,statSync,chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll,afterAll,test,expect } from 'vitest';
import { identityDatabase } from '../../apps/api/tests/support/identity-database.js';
import { sessionFixture } from '../../apps/api/tests/support/session-fixture.js';
import { prepare } from './prepare.ts';
import { cleanup } from './cleanup.ts';
import { assertLoadTarget,readManifest } from './fixtures.ts';
import { sessionCounts,fullPlateau } from './observe.ts';
import { createPasswordCredentials } from '../../apps/api/dist/src/modules/identity/infrastructure/credentials.js';

let context:Awaited<ReturnType<typeof identityDatabase>>;const directory=mkdtempSync(path.join(tmpdir(),'load-fixtures-'));
let original:string;
beforeAll(async()=>{context=await identityDatabase('load_fixtures');await prepare(context.environment,context.database.pool,directory);original=readFileSync(path.join(directory,'fixtures.json'),'utf8');},240000);
afterAll(async()=>{await context?.cleanup();rmSync(directory,{recursive:true,force:true});});
test('1120 cuentas exclusivas, activas/verificadas, muestras disjuntas y hashes nativos completos',async()=>{
  const manifest=readManifest(directory,context.environment);expect(manifest.accounts).toHaveLength(1120);
  const rows=(await context.database.pool.query('SELECT * FROM "User"')).rows;
  expect(rows).toHaveLength(1120);expect(new Set(rows.map(r=>r.passwordHash)).size).toBe(1120);
  expect(rows.every(r=>r.role==='STUDENT'&&r.status==='ACTIVE'&&r.emailVerifiedAt&&!r.mustSetPassword
    &&r.passwordHash.startsWith('$argon2id$v=19$')&&r.passwordHash.split('$')[3].split(',').sort().join(',')==='m=19456,p=1,t=2')).toBe(true);
  const credentials=await createPasswordCredentials();for(const group of ['sessions','warmup','authentication']){
    const a=manifest.accounts.find(a=>a.group===group)!;expect(await credentials.verify(a.password,rows.find(r=>r.id===a.id).passwordHash)).toBe(true);
  }
  expect(statSync(directory).mode&0o777).toBe(0o700);expect(statSync(path.join(directory,'fixtures.json')).mode&0o777).toBe(0o600);
});
test.each(['development','manual','schema','database','smtp','origin'] as const)('guarda %s rechaza antes de tocar archivos o cuentas',async kind=>{
  const env={...context.environment,...(kind==='development'?{appEnv:'development' as const}:kind==='manual'?{databaseSchema:'manual_us1_protected'}:
    kind==='schema'?{databaseSchema:'t_wrong'}:kind==='database'?{databaseUrl:context.environment.databaseUrl.replace('academia_v00_test','academia_dev')}:
    kind==='smtp'?{mailMode:'smtp' as const}:{appOrigin:'https://example.invalid'})};
  await expect(assertLoadTarget(env,context.database.pool)).rejects.toThrow();
});
test('no sobrescribe un manifiesto; permisos abiertos y manifiesto manipulado impiden limpiar',async()=>{
  await expect(prepare(context.environment,context.database.pool,directory)).rejects.toThrow();
  const file=path.join(directory,'fixtures.json');chmodSync(file,0o644);expect(()=>readManifest(directory,context.environment)).toThrow();chmodSync(file,0o600);
  const bad=JSON.parse(original);bad.accounts[0].email='ajeno@example.test';writeFileSync(file,JSON.stringify(bad));
  await expect(cleanup(context.environment,context.database.pool,directory)).rejects.toThrow();writeFileSync(file,original);
});
test('contador detecta 1000 sesiones sintéticas distintas y duplicados; limpieza dirigida e idempotente preserva ajenos',async()=>{
  const manifest=readManifest(directory,context.environment);const outside=await sessionFixture(context,'ADMIN');
  await context.database.pool.query('UPDATE "SystemState" SET "bootstrapCompletedAt"=clock_timestamp(),"firstAdminUserId"=$1 WHERE id=1',[outside.userId]);
  const marker=(await context.database.pool.query('SELECT * FROM "SystemState"')).rows;
  // Únicamente prueba del contador/limpiador; nunca se usa para autenticar un escenario k6.
  for(const a of manifest.accounts.filter(a=>a.group==='sessions'))await context.database.pool.query(`WITH t AS(SELECT clock_timestamp() AS at)
    INSERT INTO "Session" ("userId","tokenHash","authVersion","createdAt","lastAcceptedAt","absoluteExpiresAt") SELECT $1,$2,0,at,at,at+interval '8 hours' FROM t`,[a.id,randomBytes(32)]);
  const counts=(await sessionCounts(context.database.pool,manifest)).sessions;expect(fullPlateau(counts)).toBe(true);
  expect(fullPlateau({...counts,sessions:1001})).toBe(false);expect(fullPlateau({...counts,recent:999})).toBe(false);
  expect(await cleanup(context.environment,context.database.pool,directory)).toEqual({revoked:1000,removed:0});
  expect(await cleanup(context.environment,context.database.pool,directory)).toEqual({revoked:0,removed:0});
  expect((await context.database.pool.query('SELECT count(*) FROM "Session" WHERE id=$1 AND "revokedAt" IS NULL',[outside.sessionId])).rows[0].count).toBe('1');
  expect(await cleanup(context.environment,context.database.pool,directory,'accounts')).toEqual({revoked:0,removed:1120});
  expect((await context.database.pool.query('SELECT count(*) FROM "User"')).rows[0].count).toBe('1');
  expect((await context.database.pool.query('SELECT * FROM "SystemState"')).rows).toEqual(marker);
  expect(await cleanup(context.environment,context.database.pool,directory,'accounts')).toEqual({revoked:0,removed:0});
});
