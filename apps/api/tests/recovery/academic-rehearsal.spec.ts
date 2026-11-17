import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,readdirSync} from 'node:fs';
import {test,expect} from 'vitest';
import {loadEnvironment,repositoryRoot} from '../../src/infrastructure/config/environment.js';
import {createDatabase} from '../../src/infrastructure/database/database.js';
import {createIsolatedTestEnvironment} from '../support/test-environment.js';
import {createIdentityFixtures,readFixtureManifest} from '../support/identity-fixtures.js';
import type {FixtureManifest,FixtureAccount} from '../support/identity-fixtures.js';
import {identityFingerprint,identityMigrations} from '../support/academic-migration.js';
import {us1Http,us1Process} from '../support/us1-http.js';
import type {Us1Http} from '../support/us1-http.js';
import {accessSecrets} from '../../src/modules/identity/infrastructure/credentials.js';
import {createPayloadCipher} from '../../src/modules/mail/infrastructure/payload-cipher.js';
import {PostgresRateStore} from '../../src/infrastructure/limits/rate-store.js';
import {runRestoredStateCli} from '../../src/cli/invalidate-restored-state.js';
import type {AdminCourse,AdminGroup,CommandResult} from '../../src/modules/academic-offering/public/offer.js';
import {recoverySnapshot} from './academic-snapshot.js';

const dir='/recovery-private';
const save=(name:string,value:unknown)=>writeFileSync(`${dir}/${name}.json`,JSON.stringify(value),{mode:0o600});
const saved=<T>(name:string):T=>JSON.parse(readFileSync(`${dir}/${name}.json`,'utf8'));
type Snapshot=Awaited<ReturnType<typeof recoverySnapshot>>;
interface Handoff {schema:string;manifest:FixtureManifest;fingerprint:string;before?:Snapshot;
  courseId?:string;staleId?:string;reviewedId?:string;cancelledId?:string;createBody?:object;
  verify?:string;reset?:string}
function inputFor(schema:string){
  const input:NodeJS.ProcessEnv={...process.env,APP_ENV:'test'};
  for(const key of ['TEST_DATABASE_URL','TEST_MIGRATION_DATABASE_URL'] as const){const url=new URL(process.env[key]!);url.searchParams.set('schema',schema);input[key]=url.toString();}
  return input;
}
async function guard(database:ReturnType<typeof createDatabase>){
  expect(process.env.RECOVERY_ISOLATED).toBe('1');
  expect((await database.pool.query(`SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`)).rows[0].marker).toBe('academic-recovery-isolated');
}
function deploy(input:NodeJS.ProcessEnv,config?:string){
  const args=config?['../../node_modules/prisma/build/index.js','migrate','deploy','--config',config]:['scripts/database.mjs','deploy'];
  const result=spawnSync(process.execPath,args,{env:input,encoding:'utf8',timeout:120000});
  // Los detalles pueden incluir destinos privados: no imprimir stdout/stderr en una aserción.
  expect(result.status,'Prisma deploy real debe completar sin errores').toBe(0);
}
const account=(h:Handoff,role:FixtureAccount['role']='ADMIN')=>h.manifest.accounts.find(a=>a.role===role&&a.variant==='ENABLED')!;
async function start(environment:ReturnType<typeof loadEnvironment>){
  const http=await us1Http({context:{environment}});
  await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();
  return http;
}
async function identityCommand(http:Us1Http,path:string,body:object,secret:string){
  return fetch(`${http.url}/api/v1${path}`,{method:path.endsWith('/status')?'PUT':'PATCH',headers:http.headers(secret),body:JSON.stringify(body)});
}
async function command(http:Us1Http,path:string,body:object,secret:string,status=200){
  const response=await http.post(path,body,secret);expect(response.status,`Comando académico ${path}`).toBe(status);
  const result=(await response.json()).data as CommandResult;expect(result.command.result).toBe('APPLIED');expect(result.command.replayed).toBe(false);return result.resource;
}
async function group(http:Us1Http,id:string,secret:string){const response=await http.get(`/admin/academic/groups/${id}`,secret);expect(response.status).toBe(200);return (await response.json()).data as AdminGroup;}
async function login(http:Us1Http,a:FixtureAccount){const response=await http.post('/auth/login',{email:a.email,password:a.password});expect(response.status).toBe(200);return response.headers.get('set-cookie')!.split(';')[0].split('=')[1];}
async function seedLink(database:ReturnType<typeof createDatabase>,environment:ReturnType<typeof loadEnvironment>,a:FixtureAccount,purpose:'VERIFY_EMAIL'|'RESET_PASSWORD'){
  const issued=accessSecrets.issue();
  const token=(await database.pool.query(`WITH t AS(SELECT clock_timestamp() AS at) INSERT INTO "ActionToken"
    ("userId",purpose,"tokenHash","emailCanonicalSnapshot","createdAt","expiresAt") SELECT $1,$2::"TokenPurpose",$3,$4,at,at+CASE WHEN $2='VERIFY_EMAIL' THEN interval '24 hours' ELSE interval '30 minutes' END FROM t RETURNING id`,[a.id,purpose,Buffer.from(issued.digest),a.email])).rows[0];
  const route=purpose==='VERIFY_EMAIL'?'verificar-correo':'restablecer';
  const cipher=createPayloadCipher(environment).encrypt({recipient:a.email,link:`${environment.appOrigin}/${route}#${issued.secret}`,template:purpose});
  const keys=new PostgresRateStore(database.pool,environment.rateHmacKey).mailKeys(a.email,purpose,'127.0.0.1');
  // Correo sintético retenido: ningún worker real debe enviarlo durante el ensayo.
  await database.pool.query(`INSERT INTO "MailDelivery"("tokenId","recipientKey","originKey","encryptedPayload",nonce,"authTag","keyId","nextAttemptAt") VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+interval '1 day')`,[token.id,keys.recipientKey,keys.originKey,Buffer.from(cipher.encryptedPayload),Buffer.from(cipher.nonce),Buffer.from(cipher.authTag),cipher.keyId]);
  if(purpose==='RESET_PASSWORD')await database.pool.query(`UPDATE "MailDelivery" SET status='SENDING',attempts=1,"claimId"=gen_random_uuid(),"leaseUntil"=clock_timestamp()+interval '1 hour' WHERE "tokenId"=$1`,[token.id]);
  return issued.secret;
}

test(`T069 recuperación real: ${process.env.RECOVERY_PHASE??'fase requerida'}`,async()=>{
  expect(process.env.RECOVERY_ISOLATED).toBe('1');
  expect(['legacy','upgrade','postbackup','restore']).toContain(process.env.RECOVERY_PHASE);
  const initial=createDatabase(loadEnvironment());try{await guard(initial);}finally{await initial.close();}
  if(process.env.RECOVERY_PHASE==='legacy'){
    const isolated=await createIsolatedTestEnvironment('academic_recovery');const input=inputFor(isolated.schema);
    const temporary=mkdtempSync('/tmp/recovery-legacy-');mkdirSync(`${temporary}/migrations`);
    cpSync('prisma/schema.prisma',`${temporary}/schema.prisma`);cpSync('prisma/migrations/migration_lock.toml',`${temporary}/migrations/migration_lock.toml`);
    for(const name of identityMigrations)cpSync(`prisma/migrations/${name}`,`${temporary}/migrations/${name}`,{recursive:true});
    const config='recovery-legacy.config.ts';writeFileSync(config,`import {defineConfig} from 'prisma/config';import {loadEnvironment} from './src/infrastructure/config/environment.ts';export default defineConfig({schema:'${temporary}/schema.prisma',migrations:{path:'${temporary}/migrations'},datasource:{url:loadEnvironment().migrationUrl}});`);
    deploy(input,config);const environment=loadEnvironment(input),database=createDatabase(environment);
    try{
      const directory=mkdtempSync('/tmp/recovery-fixtures-');
      const created=await createIdentityFixtures(environment,database.pool,directory);
      const manifest=readFixtureManifest(environment,created.runId,directory);
      const admin=manifest.accounts.find(a=>a.role==='ADMIN'&&a.variant==='ENABLED')!;
      await database.pool.query('UPDATE "SystemState" SET "bootstrapCompletedAt"=clock_timestamp(),"firstAdminUserId"=$1 WHERE id=1',[admin.id]);
      const h:Handoff={schema:isolated.schema,manifest,fingerprint:await identityFingerprint(database.pool)};
      h.verify=await seedLink(database,environment,manifest.accounts.find(a=>a.role==='STUDENT'&&a.variant==='UNVERIFIED')!,'VERIFY_EMAIL');
      h.reset=await seedLink(database,environment,account(h,'STUDENT'),'RESET_PASSWORD');
      await database.pool.query(`INSERT INTO "AuditEvent"("actorKind","actorUserId","targetUserId",action,result,"requestId") VALUES('ACCOUNT',$1,$2,'ACCOUNT_CREATED','APPLIED',$3)`,[admin.id,account(h,'STUDENT').id,randomUUID()]);
      h.fingerprint=await identityFingerprint(database.pool);save('handoff',h);
      expect((await database.pool.query('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows[0].count).toBe('4');
      save('legacy-summary',{migrations:4,accounts:manifest.accounts.length,identityFingerprintRecorded:true});
    }finally{await database.close();}return;
  }
  const h=saved<Handoff>('handoff'),input=inputFor(h.schema),environment=loadEnvironment(input),database=createDatabase(environment);
  try{
    if(process.env.RECOVERY_PHASE==='upgrade'){
      deploy(input);expect(await identityFingerprint(database.pool)).toBe(h.fingerprint);
      expect((await database.pool.query('SELECT bool_and("teacherEligibilityVersion"=0) AS all_zero FROM "User"')).rows[0].all_zero).toBe(true);
      expect((await database.pool.query('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows[0].count).toBe('5');
      const http=await start(environment),secret=account(h).sessions[0].secret;
      try{
        h.createBody={commandId:randomUUID(),name:'Curso ficticio de recuperación',description:'Ensayo aislado de oferta'};
        const course=await command(http,'/admin/academic/courses',h.createBody,secret,201) as AdminCourse;h.courseId=course.id;
        await command(http,`/admin/academic/courses/${course.id}/publish`,{commandId:randomUUID(),expectedRevision:course.revision},secret);
        const ids:string[]=[];
        for(let index=0;index<3;index++){
          const g=await command(http,`/admin/academic/courses/${course.id}/groups`,{commandId:randomUUID(),name:`Grupo ficticio ${index+1}`,periodStart:'2026-11-02',periodEnd:'2026-11-08',capacity:index===0?1:50,teacherUserId:account(h,'TEACHER').id},secret,201) as AdminGroup;
          const scheduled=await fetch(`${http.url}/api/v1/admin/academic/groups/${g.id}/schedule`,{method:'PUT',headers:http.headers(secret),body:JSON.stringify({commandId:randomUUID(),expectedRevision:g.revision,schedule:[{dayOfWeek:1,startTime:`${10+index}:00`,endTime:`${11+index}:00`}]})});expect(scheduled.status).toBe(200);
          const configured=(await scheduled.json()).data as CommandResult;
          await command(http,`/admin/academic/groups/${g.id}/publish`,{commandId:randomUUID(),expectedRevision:configured.resource.revision},secret);ids.push(g.id);
        }
        [h.staleId,h.reviewedId,h.cancelledId]=ids;
        expect((await identityCommand(http,`/admin/users/${account(h,'TEACHER').id}/status`,{status:'DISABLED'},secret)).status).toBe(200);
        expect((await identityCommand(http,`/admin/users/${account(h,'TEACHER').id}/status`,{status:'ACTIVE'},secret)).status).toBe(200);
        const stale=await group(http,h.staleId,secret);expect(stale.teacherReviewRequired).toBe(true);expect(stale.studentVisible).toBe(false);
        const withdrawn=await command(http,`/admin/academic/groups/${h.reviewedId}/withdraw`,{commandId:randomUUID(),expectedRevision:(await group(http,h.reviewedId,secret)).revision},secret);
        const reviewed=await command(http,`/admin/academic/groups/${h.reviewedId}/publish`,{commandId:randomUUID(),expectedRevision:withdrawn.revision},secret) as AdminGroup;expect(reviewed.studentVisible).toBe(true);
        const cancelled=await command(http,`/admin/academic/groups/${h.cancelledId}/cancel`,{commandId:randomUUID(),expectedRevision:(await group(http,h.cancelledId,secret)).revision,cancellationReason:'Cancelación ficticia previa al respaldo'},secret) as AdminGroup;expect(cancelled.state).toBe('CANCELLED');
      }finally{await http.close();}
      const teacher=(await database.pool.query('SELECT "teacherEligibilityVersion"::text AS version FROM "User" WHERE id=$1',[account(h,'TEACHER').id])).rows[0];expect(teacher.version).toBe('1');
      h.before=await recoverySnapshot(database,h.schema);save('handoff',h);
      save('upgrade-summary',{identityPreserved:true,migrations:5,accounts:12,teacherGeneration:'1',staleGroupHidden:true,explicitlyReviewedGroupVisible:true,cancelledTerminal:true,counts:h.before.counts});return;
    }
    if(process.env.RECOVERY_PHASE==='postbackup'){
      const http=await start(environment),secret=account(h).sessions[0].secret;
      try{
        const cancellation={commandId:randomUUID(),expectedRevision:(await group(http,h.reviewedId!,secret)).revision,cancellationReason:'Decisión ficticia posterior al respaldo'};
        expect((await identityCommand(http,`/admin/users/${account(h,'TEACHER').id}/status`,{status:'DISABLED'},secret)).status).toBe(200);
        await command(http,`/admin/academic/groups/${h.reviewedId}/cancel`,cancellation,secret);
        expect((await identityCommand(http,`/admin/users/${account(h,'STUDENT').id}/name`,{name:'Cambio ficticio posterior al respaldo'},secret)).status).toBe(200);
        save('postbackup-private',{cancellation});
        save('postbackup-summary',{knownLostChanges:3,teacherDisabled:true,groupCancelled:true,studentRenamed:true,at:new Date().toISOString()});
      }finally{await http.close();}return;
    }
    expect(new URL(environment.databaseUrl).pathname).toMatch(/^\/recovery_[a-z0-9_]+_test$/);
    const restored=await recoverySnapshot(database,h.schema);expect(restored).toEqual(h.before);
    deploy(input);expect(await recoverySnapshot(database,h.schema)).toEqual(restored);
    await expect(database.pool.query('CREATE TABLE "ForbiddenDdl"(id int)')).rejects.toMatchObject({code:'42501'});
    await expect(database.pool.query('UPDATE "AcademicGroup" SET capacity=0 WHERE id=$1',[h.staleId])).rejects.toMatchObject({code:'23514'});
    const receipt=await runRestoredStateCli(['--operator-ref','academic-t069','--schema',h.schema,'--maintenance-confirmed'],input);
    expect(receipt.counts.sessions).toBeGreaterThan(0);expect(receipt.counts.tokens).toBe(2);expect(receipt.counts.mail).toBe(2);
    const invalidated=await recoverySnapshot(database,h.schema);
    for(const table of ['User','SystemState','AuditEvent','RateBucket','RateEvent','AcademicCourse','AcademicGroup','AcademicSlot','AcademicCommand','AcademicAuditEvent'])expect(invalidated.data[table]).toBe(restored.data[table]);
    const http=await start(environment);let adminCookie='';
    try{
      for(const role of ['ADMIN','STUDENT','TEACHER'] as const){const a=account(h,role);expect((await http.get('/me',a.sessions[0].secret)).status).toBe(401);const cookie=await login(http,a);if(role==='ADMIN')adminCookie=cookie;
        expect((await http.get('/me',cookie)).status).toBe(200);expect((await http.get('/admin/academic/courses',cookie)).status).toBe(role==='ADMIN'?200:403);
      }
      const replay=await http.post('/admin/academic/courses',h.createBody!,adminCookie);expect(replay.status).toBe(201);expect((await replay.json()).data).toMatchObject({command:{replayed:true},resource:{id:h.courseId}});
      const mismatched=await http.post('/admin/academic/courses',{...h.createBody,name:'Intención distinta'},adminCookie);expect(mismatched.status).toBe(409);expect((await mismatched.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
      const terminal=await http.post(`/admin/academic/groups/${h.cancelledId}/publish`,{commandId:randomUUID(),expectedRevision:(await group(http,h.cancelledId!,adminCookie)).revision},adminCookie);expect(terminal.status).toBe(409);expect((await terminal.json()).error.code).toBe('OFFERING_STATE_CONFLICT');
      const afterRetry=await recoverySnapshot(database,h.schema);
      for(const table of ['AcademicCourse','AcademicGroup','AcademicSlot','AcademicCommand','AcademicAuditEvent'])expect(afterRetry.data[table]).toBe(restored.data[table]);
      expect(await group(http,h.staleId!,adminCookie)).toMatchObject({teacherReviewRequired:true,studentVisible:false});
      expect(await group(http,h.reviewedId!,adminCookie)).toMatchObject({state:'PUBLISHED',studentVisible:true});
      expect(await group(http,h.cancelledId!,adminCookie)).toMatchObject({state:'CANCELLED',studentVisible:false});
      // Decisiones ficticias del operador, registradas antes del fallo; no se inventa una política de producto.
      expect((await identityCommand(http,`/admin/users/${account(h,'TEACHER').id}/status`,{status:'DISABLED'},adminCookie)).status).toBe(200);
      const post=saved<{cancellation:object}>('postbackup-private');await command(http,`/admin/academic/groups/${h.reviewedId}/cancel`,post.cancellation,adminCookie);
      expect((await identityCommand(http,`/admin/users/${account(h,'STUDENT').id}/name`,{name:'Cambio ficticio posterior al respaldo'},adminCookie)).status).toBe(200);
      expect(await group(http,h.reviewedId!,adminCookie)).toMatchObject({state:'CANCELLED',studentVisible:false});
      expect((await database.pool.query('SELECT "teacherEligibilityVersion"::text AS version FROM "User" WHERE id=$1',[account(h,'TEACHER').id])).rows[0].version).toBe('2');
      expect((await database.pool.query('SELECT name FROM "User" WHERE id=$1',[account(h,'STUDENT').id])).rows[0].name).toBe('Cambio ficticio posterior al respaldo');
      expect((await database.pool.query('SELECT count(*) FROM "AcademicCommand"')).rows[0].count).toBe(String(Number(restored.counts.AcademicCommand)+1));
      expect((await database.pool.query('SELECT count(*) FROM "AcademicAuditEvent"')).rows[0].count).toBe(String(Number(restored.counts.AcademicAuditEvent)+1));
      for(const [route,body] of [['/auth/verification/confirm',{token:h.verify}],['/auth/password/reset',{token:h.reset,newPassword:'Only-Fictitious-Reset-739!'}]] as const)expect((await http.post(route,body)).status).toBe(400);
    }finally{await http.close();}
    const restarted=await us1Process({context:{environment}});try{expect((await restarted.get(adminCookie)).status).toBe(200);expect((await restarted.get(account(h).sessions[0].secret)).status).toBe(401);}finally{await restarted.close();}
    const entries=readdirSync(`${repositoryRoot()}/apps/api/logs/security`).filter(n=>n.endsWith('.jsonl')).flatMap(n=>readFileSync(`${repositoryRoot()}/apps/api/logs/security/${n}`,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)));
    expect(entries.filter(e=>e.correlationId===receipt.correlationId).map(e=>e.result)).toEqual(['STARTED','SUCCEEDED']);
    const serialized=JSON.stringify(entries);for(const secret of [h.verify!,h.reset!,environment.databaseUrl,...h.manifest.accounts.flatMap(a=>[a.email,a.password,...a.sessions.map(s=>s.secret)])])expect(serialized.includes(secret)).toBe(false);
    expect((await database.pool.query('SELECT count(*) FROM "MailDelivery" WHERE status<>\'CANCELLED\' OR "encryptedPayload" IS NOT NULL OR "claimId" IS NOT NULL')).rows[0].count).toBe('0');
    expect((await fetch('http://mailpit:8025/api/v1/messages').then(r=>r.json()) as {total:number}).total).toBe(0);
    save('restore-summary',{matchingRows:true,matchingSchemaConstraintsFunctionsViewsAndGrants:true,migrationsAfterRestore:5,academicRowsPreservedByInvalidation:true,ledgerReplay:true,differentIntentRejected:true,oldCredentialsRejected:true,newRoleLogins:true,denials:true,restartMode:'separate-node-process',staleMailSent:0,knownLostChanges:3,reviewedAndReappliedFictitiousDecisions:3,teacherGeneration:'2',cancelledTerminal:true,invalidated:receipt.counts,trafficReady:false,at:new Date().toISOString()});
  }finally{await database.close();}
},120000);
