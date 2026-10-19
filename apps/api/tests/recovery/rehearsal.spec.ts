import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, mkdirSync, cpSync } from 'node:fs';
import { test, expect } from 'vitest';
import { us1Dataset, us1Http, us1Process } from '../support/us1-http.js';
import type { FixtureManifest } from '../support/identity-fixtures.js';
import { seedAction } from '../support/us2.js';
import { loadEnvironment } from '../../src/infrastructure/config/environment.js';
import { createDatabase } from '../../src/infrastructure/database/database.js';
import { runRestoredStateCli } from '../../src/cli/invalidate-restored-state.js';

const dir='/recovery-private';
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function saved<T>(name:string):T{return JSON.parse(readFileSync(`${dir}/${name}.json`,'utf8'));}
function save(name:string,value:unknown){writeFileSync(`${dir}/${name}.json`,JSON.stringify(value),{mode:0o600});}
interface Handoff {schema:string;manifest:FixtureManifest;verify:string;reset:string;counts:Record<string,string>;users:string;marker:string;audit:string;catalog:string}
function envFor(schema:string){return {...process.env,APP_ENV:'test',TEST_DATABASE_URL:withSchema(process.env.TEST_DATABASE_URL!,schema),
  TEST_MIGRATION_DATABASE_URL:withSchema(process.env.TEST_MIGRATION_DATABASE_URL!,schema)};}
function withSchema(value:string,schema:string){const url=new URL(value);url.searchParams.set('schema',schema);return url.toString();}
async function guarded(database:ReturnType<typeof createDatabase>){
  expect(process.env.RECOVERY_ISOLATED).toBe('1');
  expect((await database.pool.query(`SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`)).rows[0].marker).toBe('identity-recovery-isolated');
}
async function snapshot(database:ReturnType<typeof createDatabase>,schema:string){
  const counts:Record<string,string>={};
  for(const table of ['User','Session','ActionToken','MailDelivery','AuditEvent','SystemState','RateBucket','RateEvent','_prisma_migrations'])
    counts[table]=(await database.pool.query(`SELECT count(*) FROM "${table}"`)).rows[0].count;
  const users=digest((await database.pool.query('SELECT * FROM "User" ORDER BY id')).rows);
  const marker=digest((await database.pool.query('SELECT * FROM "SystemState"')).rows);
  const audit=digest((await database.pool.query('SELECT * FROM "AuditEvent" ORDER BY id')).rows);
  const constraints=(await database.pool.query(`SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) AS definition
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 ORDER BY c.relname,k.conname`,[schema])).rows;
  // pg_restore reparsa CHECK y aplana AND asociativos. Compara la expresión reescrita
  // por PostgreSQL, sin ejecutar filas ni quitar paréntesis indiscriminadamente.
  const client=await database.pool.connect();
  try {await client.query('BEGIN READ ONLY');await client.query('SET LOCAL enable_indexscan=off; SET LOCAL enable_bitmapscan=off; SET LOCAL enable_indexonlyscan=off');
    for(const constraint of constraints)if(constraint.definition.startsWith('CHECK ')){
      if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(constraint.relname))throw new Error('Tabla no permitida.');
      const plan=await client.query(`EXPLAIN (FORMAT JSON, VERBOSE, COSTS OFF) SELECT 1 FROM "${constraint.relname}" WHERE ${constraint.definition.slice(6)}`);
      constraint.definition=JSON.stringify(plan.rows[0]['QUERY PLAN']);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  const columns=(await database.pool.query(`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns
    WHERE table_schema=$1 ORDER BY table_name,ordinal_position`,[schema])).rows;
  const indexes=(await database.pool.query('SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=$1 ORDER BY tablename,indexname',[schema])).rows;
  const functions=(await database.pool.query(`SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 ORDER BY p.proname`,[schema])).rows;
  const triggers=(await database.pool.query(`SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,[schema])).rows;
  const enums=(await database.pool.query(`SELECT t.typname,e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
    JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=$1 ORDER BY t.typname,e.enumsortorder`,[schema])).rows;
  const catalog={constraints,columns,indexes,functions,triggers,enums};
  save('catalog-'+new URL(database.pool.options.connectionString!).pathname.slice(1),catalog);
  return {counts,users,marker,audit,catalog:digest(catalog)};
}
test('ensayo de recuperación aislado: fase explícita',async()=>{
  expect(process.env.RECOVERY_ISOLATED).toBe('1');
  if(process.env.RECOVERY_PHASE==='prepare'){
    const guard=createDatabase(loadEnvironment());try{await guarded(guard);}finally{await guard.close();}
    const data=await us1Dataset('recovery_v16');
    try{
      const admin=data.account('ADMIN');const http=await us1Http(data);
      try{
        await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();
        const rename=await fetch(`${http.url}/api/v1/admin/users/${data.account().id}/name`,{method:'PATCH',headers:http.headers(admin.sessions[0].secret),body:JSON.stringify({name:'Ensayo recuperación'})});
        expect(rename.status).toBe(200);
      }finally{await http.close();}
      await data.context.database.pool.query('UPDATE "SystemState" SET "bootstrapCompletedAt"=clock_timestamp(),"firstAdminUserId"=$1 WHERE id=1',[admin.id]);
      const verify=await seedAction(data,'VERIFY_EMAIL',true);const reset=await seedAction(data,'RESET_PASSWORD',true);
      await data.context.database.pool.query(`UPDATE "MailDelivery" SET status='SENDING',attempts=1,"claimId"=gen_random_uuid(),
        "leaseUntil"=clock_timestamp()+interval '60 seconds' WHERE id=$1`,[reset.deliveryId]);
      save('handoff',{schema:data.context.environment.databaseSchema,manifest:data.manifest,verify:verify.secret,reset:reset.secret,
        ...await snapshot(data.context.database,data.context.environment.databaseSchema)} satisfies Handoff);
      save('prepare-summary',{schema:data.context.environment.databaseSchema,counts:(await snapshot(data.context.database,data.context.environment.databaseSchema)).counts,
        sourceCheckedAt:(await data.context.database.pool.query('SELECT clock_timestamp() AS at')).rows[0].at});
    }finally{await data.context.database.close();} // Persiste únicamente en el volumen exclusivo del ensayo.
    return;
  }
  const handoff=saved<Handoff>('handoff');const input=envFor(handoff.schema);const environment=loadEnvironment(input);const database=createDatabase(environment);
  try{
    await guarded(database);
    if(process.env.RECOVERY_PHASE==='postbackup'){
      await database.pool.query('UPDATE "User" SET name=$2 WHERE id=$1',[handoff.manifest.accounts[0].id,'Cambio posterior al backup']);
      save('postbackup-summary',{changedRows:1,at:(await database.pool.query('SELECT clock_timestamp() AS at')).rows[0].at});return;
    }
    expect(process.env.RECOVERY_PHASE).toBe('restore');expect(new URL(environment.databaseUrl).pathname).toMatch(/^\/recovery_[a-z0-9_]+_test$/);
    const restored=await snapshot(database,handoff.schema);
    save('comparison-summary',{counts:restored.counts,matches:Object.fromEntries(['users','marker','audit','catalog'].map(key=>
      [key,restored[key as keyof typeof restored]===handoff[key as keyof Handoff]]))});
    expect(restored).toEqual({counts:handoff.counts,users:handoff.users,marker:handoff.marker,audit:handoff.audit,catalog:handoff.catalog});
    const deploy=spawnSync(process.execPath,['scripts/database.mjs','deploy'],{env:input,encoding:'utf8',timeout:120000});
    expect(deploy.status).toBe(0); // Revisión compatible: las cuatro migraciones ya aplicadas permanecen iguales.
    // Corrección hacia adelante solo en una copia efímera de Prisma; nunca en migraciones del repo.
    const temporary=mkdtempSync('/tmp/recovery-forward-');cpSync('prisma',`${temporary}/prisma`,{recursive:true});
    mkdirSync(`${temporary}/prisma/migrations/0005_recovery_checked`);
    const correctiveSql='BEGIN; CREATE TABLE "RecoverySchemaProbe" (id integer PRIMARY KEY CHECK(id=1), "verifiedAt" timestamptz NOT NULL); INSERT INTO "RecoverySchemaProbe" VALUES (1,CURRENT_TIMESTAMP); COMMIT;';
    writeFileSync(`${temporary}/prisma/migrations/0005_recovery_checked/migration.sql`,correctiveSql);
    writeFileSync('recovery-valid.config.ts',`import {defineConfig} from 'prisma/config'; import {loadEnvironment} from './src/infrastructure/config/environment.ts'; export default defineConfig({schema:'${temporary}/prisma/schema.prisma',migrations:{path:'${temporary}/prisma/migrations'},datasource:{url:loadEnvironment().migrationUrl}});`);
    const corrected=spawnSync(process.execPath,['../../node_modules/prisma/build/index.js','migrate','deploy','--config','recovery-valid.config.ts'],{env:input,encoding:'utf8',timeout:120000});
    expect(corrected.status).toBe(0);
    expect((await database.pool.query(`SELECT count(*) FROM "_prisma_migrations" WHERE migration_name='0005_recovery_checked' AND finished_at IS NOT NULL`)).rows[0].count).toBe('1');
    expect((await database.pool.query('SELECT count(*) FROM "RecoverySchemaProbe" WHERE id=1')).rows[0].count).toBe('1');
    const owner=(await database.pool.query(`SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname=$1`,[handoff.schema])).rows;
    expect(owner).toEqual([{tableowner:'academia_v00_owner'}]);
    const role=(await database.pool.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    expect(Object.values(role).every(value=>value===false)).toBe(true);
    for(const sql of ['CREATE TABLE "ForbiddenDdl"(id int)',
      `UPDATE "User" SET role='INVALID' WHERE id='${handoff.manifest.accounts[0].id}'`,
      `UPDATE "User" SET "emailCanonical"='${handoff.manifest.accounts[1].email}',email='${handoff.manifest.accounts[1].email}' WHERE id='${handoff.manifest.accounts[0].id}'`,
      `UPDATE "Session" SET "userId"='00000000-0000-0000-0000-000000000000'`,
      `UPDATE "Session" SET "absoluteExpiresAt"="createdAt"+interval '9 hours'`,
      'DELETE FROM "SystemState"'])await expect(database.pool.query(sql)).rejects.toThrow();
    const receipt=await runRestoredStateCli(['--operator-ref','Williams','--schema',handoff.schema,'--maintenance-confirmed'],input);
    expect(receipt.counts).toEqual({sessions:6,tokens:2,mail:2});
    const logRoot='/workspace/apps/api/logs/security';const logs=readdirSync(logRoot).filter(name=>name.endsWith('.jsonl')).map(name=>readFileSync(`${logRoot}/${name}`,'utf8')).join('');
    const events=logs.split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(e=>e.correlationId===receipt.correlationId);
    expect(events.map(e=>e.result)).toEqual(['STARTED','SUCCEEDED']);
    for(const event of events)expect(event).toMatchObject({category:'OPERATION',action:'RESTORED_STATE_INVALIDATION',actorKind:'LOCAL_OPERATOR',operatorRef:'Williams',targetKind:'IDENTITY_SCOPE'});
    for(const value of [handoff.verify,handoff.reset,environment.databaseUrl,environment.mailPayloadKey.toString('base64'),
      ...handoff.manifest.accounts.flatMap(a=>[a.email,a.password,...a.sessions.map(s=>s.secret)])])expect(logs.includes(value)).toBe(false);
    expect((await database.pool.query('SELECT count(*) FROM "MailDelivery" WHERE status<>\'CANCELLED\' OR "encryptedPayload" IS NOT NULL')).rows[0].count).toBe('0');
    const after=await snapshot(database,handoff.schema);expect(after.users).toBe(handoff.users);expect(after.marker).toBe(handoff.marker);expect(after.audit).toBe(handoff.audit);
    const context={environment,database};const http=await us1Http({context});
    let newCookie:string|undefined;
    try{
      for(const role of ['STUDENT','TEACHER','ADMIN'] as const){
        const a=handoff.manifest.accounts.find(a=>a.role===role&&a.variant==='ENABLED')!;
        expect((await http.get('/me',a.sessions[0].secret)).status).toBe(401);
        const login=await http.post('/auth/login',{email:a.email,password:a.password});expect(login.status).toBe(200);
        const cookie=login.headers.get('set-cookie')!.split(';')[0].split('=')[1];if(role==='ADMIN')newCookie=cookie;
        const me=await http.get('/me',cookie);expect(me.status).toBe(200);expect((await me.json()).data.role).toBe(role);
        expect((await http.get('/admin/users',cookie)).status).toBe(role==='ADMIN'?200:403);
      }
      for(const variant of ['DISABLED','UNVERIFIED','PROVISIONAL']){
        const a=handoff.manifest.accounts.find(a=>a.role==='STUDENT'&&a.variant===variant)!;
        const response=await http.post('/auth/login',{email:a.email,password:a.password});
        expect(response.status).toBe(401);
      }
      for(const [route,body] of [['/auth/verification/confirm',{token:handoff.verify}],['/auth/password/reset',{token:handoff.reset,newPassword:'Restored-Password-728-Test!'}]] as const){
        const response=await http.post(route,body);expect(response.status).toBe(400);expect(await response.json()).toMatchObject({error:{code:'INVALID_ACTION_LINK'}});
      }
      expect((await fetch('http://mailpit:8025/api/v1/messages').then(r=>r.json()) as {total:number}).total).toBe(0);
    }finally{await http.close();}
    const restarted=await us1Process({context});try{
      expect((await restarted.get(newCookie!)).status).toBe(200);
      expect((await restarted.get(handoff.manifest.accounts.find(a=>a.role==='ADMIN'&&a.variant==='ENABLED')!.sessions[0].secret)).status).toBe(401);
    }finally{await restarted.close();}
    save('restore-summary',{schema:handoff.schema,counts:restored.counts,matchingSchema:true,matchingUsers:true,matchingSingleton:true,
      matchingAudit:true,permissions:true,constraints:6,correctiveMigrationSha256:createHash('sha256').update(correctiveSql).digest('hex'),
      migrationsAfterCorrection:5,probeRows:1,invalidated:receipt.counts,correlationId:receipt.correlationId,
      oldCredentialsRejected:true,newRoleLogins:true,restart:true,restartMode:'separate-node-process',staleMailSent:0,knownLostChanges:1,at:new Date().toISOString()});
  }finally{await database.close();}
},120000);
