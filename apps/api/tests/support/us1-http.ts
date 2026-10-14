import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../dist/src/app.module.js';
import { configureTransport } from '../../dist/src/http/transport.js';
import { SessionCookie } from '../../dist/src/http/session-cookie.js';
import { createDatabase } from '../../src/infrastructure/database/database.js';
import { identityDatabase } from './identity-database.js';
import { createIdentityFixtures, readFixtureManifest } from './identity-fixtures.js';
import type { FixtureAccount } from './identity-fixtures.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import type { Role } from '../../src/modules/users/public/account.js';

export async function us1Dataset(suite:string,frozen = false) {
  const context = await identityDatabase(suite);
  const directory = mkdtempSync(path.join(tmpdir(),'us1-private-'));
  try {
    const clock = frozen?await installClock(context):undefined;
    const f = await createIdentityFixtures(context.environment,context.database.pool,directory);
    const manifest = readFixtureManifest(context.environment,f.runId,directory);
    const rows = (await context.database.pool.query<UserBaseline>('SELECT * FROM "User" ORDER BY id')).rows;
    const baseTime = clock?await clock.now():undefined;
    return {context,manifest,clock,
      account(role:Role = 'STUDENT',variant:FixtureAccount['variant'] = 'ENABLED') {
        return manifest.accounts.find(account => account.role===role && account.variant===variant)!;
      },
      async reset() {
        if (baseTime) await clock!.set(baseTime);
        await context.database.pool.query('DELETE FROM "Session"; DELETE FROM "RateEvent"; DELETE FROM "RateBucket"');
        for (const row of rows) await context.database.pool.query(`UPDATE "User" SET role=$2,status=$3,"emailVerifiedAt"=$4,
          "passwordHash"=$5,"mustSetPassword"=$6,"provisionalPasswordHash"=$7,"provisionalExpiresAt"=$8,
          "authVersion"=$9,"createdAt"=$10,"disabledAt"=$11 WHERE id=$1`,[row.id,row.role,row.status,row.emailVerifiedAt,
          row.passwordHash,row.mustSetPassword,row.provisionalPasswordHash,row.provisionalExpiresAt,row.authVersion,row.createdAt,row.disabledAt]);
        for (const account of manifest.accounts) for (const session of account.sessions) {
          await context.database.pool.query(`WITH instant AS (SELECT clock_timestamp() AS at)
            INSERT INTO "Session" (id,"userId","tokenHash","authVersion","createdAt","lastAcceptedAt","absoluteExpiresAt")
            SELECT $1,$2,$3,0,at,at,at+interval '8 hours' FROM instant`,
          [session.id,account.id,Buffer.from(accessSecrets.digest(session.secret)!)]);
        }
      },
      async cleanup() { await context.cleanup();rmSync(directory,{recursive:true,force:true}); },
    };
  } catch (error) { await context.cleanup();rmSync(directory,{recursive:true,force:true});throw error; }
}
interface UserBaseline {
  id:string;role:string;status:string;emailVerifiedAt:Date|null;passwordHash:string|null;mustSetPassword:boolean;
  provisionalPasswordHash:string|null;provisionalExpiresAt:Date|null;authVersion:string;createdAt:Date;disabledAt:Date|null;
}
export type Us1Dataset = Awaited<ReturnType<typeof us1Dataset>>;

/** Reloj SQL exclusivo del esquema de prueba; no modifica pg_catalog ni el reloj del equipo. */
async function installClock(context:Awaited<ReturnType<typeof identityDatabase>>) {
  const schema = context.environment.databaseSchema;
  if (!/^t_[a-z0-9_]+$/.test(schema)) throw new Error('Reloj de pruebas fuera de schema aislado.');
  await context.isolated.ownerQuery(`CREATE TABLE "Us1TestClock" (id int PRIMARY KEY CHECK(id=1),instant timestamptz NOT NULL);
    INSERT INTO "Us1TestClock" VALUES (1,date_trunc('milliseconds',pg_catalog.clock_timestamp()));
    CREATE FUNCTION clock_timestamp() RETURNS timestamptz LANGUAGE sql VOLATILE AS
    $$ SELECT instant FROM "Us1TestClock" WHERE id=1 $$;`);
  const configure = (pool:Pool) => { pool.options.options = `-c search_path=${schema},pg_catalog -c timezone=UTC`; };
  configure(context.database.pool);
  return {configure,
    async now():Promise<Date> { return (await context.database.pool.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now; },
    async set(value:Date) { await context.database.pool.query('UPDATE "Us1TestClock" SET instant=$1 WHERE id=1',[value]); },
    async advance(milliseconds:number) {
      await context.database.pool.query('UPDATE "Us1TestClock" SET instant=instant+($1*interval \'1 millisecond\') WHERE id=1',[milliseconds]);
    },
  };
}

/** Composición real: el ensayo no añade controladores login/logout/me ni accesos privilegiados. */
export async function us1Http(dataset:Us1Dataset,origin = dataset.context.environment.appOrigin) {
  const environment = {...dataset.context.environment,appOrigin:origin};
  const database = createDatabase(environment);
  dataset.clock?.configure(database.pool);
  let app:NestExpressApplication|undefined;
  try {
    const module = await Test.createTestingModule({imports:[AppModule.forRoot(environment,database)]}).compile();
    app = module.createNestApplication<NestExpressApplication>({logger:false,bodyParser:false});
    configureTransport(app,environment);
    await app.listen(0,'127.0.0.1');
    const url = await app.getUrl();const cookie = new SessionCookie(environment);
    const ready = await fetch(`${url}/health/ready`);
    if (ready.status!==200) throw new Error('Readiness de la composicion de prueba no disponible.');
    return {app,database,url,cookie,origin,
      headers(secret?:string) { return {'content-type':'application/json',origin,'x-csrf-protection':'1',
        ...(secret?{cookie:`${cookie.name}=${secret}`}:{})}; },
      async get(path:string,secret?:string,headers?:Record<string,string>) {
        return fetch(`${url}/api/v1${path}`,{headers:{...this.headers(secret),...headers}});
      },
      async post(path:string,body:object,secret?:string) {
        return fetch(`${url}/api/v1${path}`,{method:'POST',headers:this.headers(secret),body:JSON.stringify(body)});
      },
      async close() { await app!.close();await database.close(); },
    };
  } catch (error) { await app?.close();await database.close();throw error; }
}
export type Us1Http = Awaited<ReturnType<typeof us1Http>>;

export async function sessionState(dataset:Us1Dataset,id:string) {
  return (await dataset.context.database.pool.query<{lastAcceptedAt:Date;absoluteExpiresAt:Date;revokedAt:Date|null}>(
    'SELECT "lastAcceptedAt","absoluteExpiresAt","revokedAt" FROM "Session" WHERE id=$1',[id])).rows[0];
}
export async function restrictRead(dataset:Us1Dataset,table:'User'|'Session',allowed:boolean) {
  const role = new URL(dataset.context.environment.databaseUrl).username;
  if (!/^[a-z][a-z0-9_]+$/.test(role)) throw new Error('Rol de prueba invalido.');
  await dataset.context.isolated.ownerQuery(`${allowed?'GRANT SELECT':'REVOKE SELECT'} ON "${table}" ${allowed?'TO':'FROM'} "${role}"`);
}

export async function us1Process(dataset:Us1Dataset) {
  const environment=dataset.context.environment;
  const child=fork(fileURLToPath(new URL('./us1-process.mjs',import.meta.url)),[],{stdio:['ignore','ignore','ignore','ipc'],
    env:{...process.env,APP_ENV:'test',APP_ORIGIN:environment.appOrigin,
      TEST_DATABASE_URL:environment.databaseUrl,TEST_MIGRATION_DATABASE_URL:environment.migrationUrl}});
  const exited=new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.once('error',()=>resolve());});
  const close=async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited;};
  try {
    const url=await new Promise<string>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Proceso de ensayo no disponible. Valores omitidos.')),15000);
      child.once('error',()=>{clearTimeout(timer);reject(new Error('Proceso de ensayo no disponible. Valores omitidos.'));});
      child.once('exit',()=>{clearTimeout(timer);reject(new Error('Proceso de ensayo terminado antes de readiness.'));});
      child.once('message',message=>{clearTimeout(timer);
        if(message&&typeof message==='object'&&'ready'in message&&typeof message.ready==='string'&&/^http:\/\/127\.0\.0\.1:\d+$/.test(message.ready))resolve(message.ready);
        else reject(new Error('Respuesta de proceso de ensayo inválida.'));});
    });
    if((await fetch(`${url}/health/ready`)).status!==200)throw new Error('Proceso de ensayo sin readiness.');
    const cookie=new SessionCookie(environment);
    return {pid:child.pid,close,
      async get(secret:string){return fetch(`${url}/api/v1/me`,{headers:{cookie:`${cookie.name}=${secret}`}});},
      async logout(secret:string){return fetch(`${url}/api/v1/auth/logout`,{method:'POST',
        headers:{'content-type':'application/json','x-csrf-protection':'1',origin:environment.appOrigin,cookie:`${cookie.name}=${secret}`},body:'{}'});},
    };
  } catch(error){await close();throw error;}
}
