import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,readdirSync} from 'node:fs';
import {test,expect} from 'vitest';
import {loadEnvironment,repositoryRoot} from '../../src/infrastructure/config/environment.js';
import {createDatabase} from '../../src/infrastructure/database/database.js';
import {createIsolatedTestEnvironment} from '../support/test-environment.js';
import {createIdentityFixtures,readFixtureManifest} from '../support/identity-fixtures.js';
import type {FixtureManifest,FixtureAccount} from '../support/identity-fixtures.js';
import {baselineMigrations,legacyFingerprint,seedEnrollmentGraph,enrollmentTables} from '../support/enrollment-migration.js';
import {us1Http,us1Process} from '../support/us1-http.js';
import type {Us1Http} from '../support/us1-http.js';
import {accessSecrets} from '../../src/modules/identity/infrastructure/credentials.js';
import {createPayloadCipher} from '../../src/modules/mail/infrastructure/payload-cipher.js';
import {PostgresRateStore} from '../../src/infrastructure/limits/rate-store.js';
import {runRestoredStateCli} from '../../src/cli/invalidate-restored-state.js';
import {recoverySnapshot} from './academic-snapshot.js';

const dir='/recovery-private';
const save=(name:string,value:unknown)=>writeFileSync(`${dir}/${name}.json`,JSON.stringify(value),{mode:0o600});
const saved=<T>(name:string):T=>JSON.parse(readFileSync(`${dir}/${name}.json`,'utf8'));
type Snapshot=Awaited<ReturnType<typeof recoverySnapshot>>;
interface Handoff {schema:string;manifest:FixtureManifest;fingerprint:string;courseId:string;groupId:string;
  before?:Snapshot;orderId?:string;incidentId?:string;followUpId?:string;verify:string;reset:string}
function inputFor(schema:string){
  expect(schema).toMatch(/^t_enrollment_recovery_[a-f0-9]+$/);
  const input:NodeJS.ProcessEnv={...process.env,APP_ENV:'test'};
  for(const key of ['TEST_DATABASE_URL','TEST_MIGRATION_DATABASE_URL'] as const){const url=new URL(process.env[key]!);url.searchParams.set('schema',schema);input[key]=url.toString();}
  return input;
}
async function guard(database:ReturnType<typeof createDatabase>){
  expect(process.env.RECOVERY_ISOLATED).toBe('1');
  expect((await database.pool.query(`SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`)).rows[0].marker).toBe('enrollment-recovery-isolated');
}
function deploy(input:NodeJS.ProcessEnv,config?:string){
  const args=config?['../../node_modules/prisma/build/index.js','migrate','deploy','--config',config]:['scripts/database.mjs','deploy'];
  const result=spawnSync(process.execPath,args,{env:input,encoding:'utf8',timeout:120000});
  expect(result.status,'Prisma deploy real debe completar sin errores; detalles privados').toBe(0);
}
const account=(h:Pick<Handoff,'manifest'>,role:FixtureAccount['role']='ADMIN')=>h.manifest.accounts.find(a=>a.role===role&&a.variant==='ENABLED')!;
async function start(environment:ReturnType<typeof loadEnvironment>){
  const http=await us1Http({context:{environment}});
  await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();
  return http;
}
async function login(http:Us1Http,a:FixtureAccount){
  const response=await http.post('/auth/login',{email:a.email,password:a.password});expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0].split('=')[1];
}
async function seedLink(database:ReturnType<typeof createDatabase>,environment:ReturnType<typeof loadEnvironment>,a:FixtureAccount,purpose:'VERIFY_EMAIL'|'RESET_PASSWORD'){
  const issued=accessSecrets.issue();
  const token=(await database.pool.query(`WITH t AS(SELECT clock_timestamp() AS at) INSERT INTO "ActionToken"
    ("userId",purpose,"tokenHash","emailCanonicalSnapshot","createdAt","expiresAt") SELECT $1,$2::"TokenPurpose",$3,$4,at,at+CASE WHEN $2='VERIFY_EMAIL' THEN interval '24 hours' ELSE interval '30 minutes' END FROM t RETURNING id`,[a.id,purpose,Buffer.from(issued.digest),a.email])).rows[0];
  const route=purpose==='VERIFY_EMAIL'?'verificar-correo':'restablecer';
  const cipher=createPayloadCipher(environment).encrypt({recipient:a.email,link:`${environment.appOrigin}/${route}#${issued.secret}`,template:purpose});
  const keys=new PostgresRateStore(database.pool,environment.rateHmacKey).mailKeys(a.email,purpose,'127.0.0.1');
  await database.pool.query(`INSERT INTO "MailDelivery"("tokenId","recipientKey","originKey","encryptedPayload",nonce,"authTag","keyId","nextAttemptAt") VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+interval '1 day')`,[token.id,keys.recipientKey,keys.originKey,Buffer.from(cipher.encryptedPayload),Buffer.from(cipher.nonce),Buffer.from(cipher.authTag),cipher.keyId]);
  if(purpose==='RESET_PASSWORD')await database.pool.query(`UPDATE "MailDelivery" SET status='SENDING',attempts=1,"claimId"=gen_random_uuid(),"leaseUntil"=clock_timestamp()+interval '1 hour' WHERE "tokenId"=$1`,[token.id]);
  return issued.secret;
}

test(`T086 recuperación real: ${process.env.RECOVERY_PHASE??'fase requerida'}`,async()=>{
  expect(['legacy','upgrade','postbackup','restore']).toContain(process.env.RECOVERY_PHASE);
  const initial=createDatabase(loadEnvironment());try{await guard(initial);}finally{await initial.close();}
  if(process.env.RECOVERY_PHASE==='legacy'){
    const isolated=await createIsolatedTestEnvironment('enrollment_recovery');const input=inputFor(isolated.schema);
    const temporary=mkdtempSync('/tmp/enrollment-legacy-');mkdirSync(`${temporary}/migrations`);
    cpSync('prisma/schema.prisma',`${temporary}/schema.prisma`);cpSync('prisma/migrations/migration_lock.toml',`${temporary}/migrations/migration_lock.toml`);
    for(const name of baselineMigrations)cpSync(`prisma/migrations/${name}`,`${temporary}/migrations/${name}`,{recursive:true});
    writeFileSync('recovery-legacy.config.ts',`import {defineConfig} from 'prisma/config';import {loadEnvironment} from './src/infrastructure/config/environment.ts';export default defineConfig({schema:'${temporary}/schema.prisma',migrations:{path:'${temporary}/migrations'},datasource:{url:loadEnvironment().migrationUrl}});`);
    deploy(input,'recovery-legacy.config.ts');const environment=loadEnvironment(input),database=createDatabase(environment);
    try{
      const fixtureDir=mkdtempSync('/tmp/enrollment-fixtures-'),created=await createIdentityFixtures(environment,database.pool,fixtureDir);
      const manifest=readFixtureManifest(environment,created.runId,fixtureDir),actors={manifest};
      await database.pool.query('UPDATE "SystemState" SET "bootstrapCompletedAt"=clock_timestamp(),"firstAdminUserId"=$1 WHERE id=1',[account(actors).id]);
      const courseId=randomUUID(),groupId=randomUUID();
      await database.pool.query(`INSERT INTO "AcademicCourse"(id,name,description) VALUES($1,'Curso previo ficticio','Snapshot 0005')`,[courseId]);
      await database.pool.query(`INSERT INTO "AcademicGroup"(id,"courseId",name,capacity,"periodStart","periodEnd","teacherUserId") VALUES($1,$2,'Grupo previo ficticio',2,'2030-01-07','2030-01-31',$3)`,[groupId,courseId,account(actors,'TEACHER').id]);
      await database.pool.query(`INSERT INTO "AcademicSlot"("groupId","dayOfWeek","startMinute","endMinute") VALUES($1,1,1080,1140)`,[groupId]);
      await database.pool.query(`INSERT INTO "AuditEvent"("actorKind","actorUserId","targetUserId",action,result,"requestId") VALUES('ACCOUNT',$1,$2,'ACCOUNT_CREATED','APPLIED',$3)`,[account(actors).id,account(actors,'STUDENT').id,randomUUID()]);
      const verify=await seedLink(database,environment,manifest.accounts.find(a=>a.role==='STUDENT'&&a.variant==='UNVERIFIED')!,'VERIFY_EMAIL');
      const reset=await seedLink(database,environment,account(actors,'STUDENT'),'RESET_PASSWORD');
      const h:Handoff={schema:isolated.schema,manifest,courseId,groupId,verify,reset,fingerprint:await legacyFingerprint(database.pool)};
      save('handoff',h);
      expect((await database.pool.query('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows[0].count).toBe('5');
      save('legacy-summary',{migrations:5,accounts:manifest.accounts.length,legacyRowsRecorded:true});
    }finally{await database.close();}return;
  }
  const h=saved<Handoff>('handoff'),input=inputFor(h.schema),environment=loadEnvironment(input),database=createDatabase(environment);
  try{
    if(process.env.RECOVERY_PHASE==='upgrade'){
      deploy(input);expect(await legacyFingerprint(database.pool)).toBe(h.fingerprint);
      expect((await database.pool.query('SELECT description FROM "AcademicGroup" WHERE id=$1',[h.groupId])).rows[0].description).toBeNull();
      expect((await database.pool.query('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows[0].count).toBe('7');
      // Grafo físico ficticio compartido con pruebas de migración; no acredita un pago del proveedor.
      const graph=await seedEnrollmentGraph({database,courseId:h.courseId,groupId:h.groupId,
        admin:{userId:account(h).id},student:{userId:account(h,'STUDENT').id,sessionId:account(h,'STUDENT').sessions[0].id}});
      h.orderId=graph.rows.EnrollmentOrder!.id as string;h.incidentId=graph.rows.PaymentIncident!.id as string;
      h.followUpId=graph.rows.IncidentFollowUp!.id as string;
      const http=await start(environment);
      try{
        const response=await http.get('/enrollment/orders/'+h.orderId,account(h,'STUDENT').sessions[0].secret);
        expect(response.status).toBe(200);expect((await response.json()).data).toMatchObject({state:'ENROLLED',totalMinor:'12500'});
      }finally{await http.close();}
      h.before=await recoverySnapshot(database,h.schema);save('handoff',h);
      save('upgrade-summary',{migrations:7,legacyRowsPreserved:true,newDescriptionDefaultNull:true,accounts:12,counts:h.before.counts,orderReadable:true,financialRows:'synthetic physical fixtures'});return;
    }
    if(process.env.RECOVERY_PHASE==='postbackup'){
      const http=await start(environment);
      try{
        const body={commandId:randomUUID(),content:'Anotación ficticia posterior al respaldo'};
        const response=await http.post(`/admin/enrollment/incidents/${h.incidentId}/follow-ups`,body,account(h).sessions[0].secret);
        expect(response.status).toBe(200);expect((await response.json()).data.command.replayed).toBe(false);
        expect((await database.pool.query('SELECT count(*) FROM "IncidentFollowUp"')).rows[0].count).toBe('2');
        save('postbackup-private',{body});save('postbackup-summary',{knownLostChanges:1,additionalFollowUp:true,at:new Date().toISOString()});
      }finally{await http.close();}return;
    }
    expect(new URL(environment.databaseUrl).pathname).toMatch(/^\/recovery_[a-z0-9_]+_test$/);
    const restored=await recoverySnapshot(database,h.schema);expect(restored).toEqual(h.before);
    deploy(input);expect(await recoverySnapshot(database,h.schema)).toEqual(restored);
    await expect(database.pool.query('CREATE TABLE "ForbiddenDdl"(id int)')).rejects.toMatchObject({code:'42501'});
    await expect(database.pool.query('UPDATE "VerifiedPayment" SET currency=\'USD\' WHERE "orderId"=$1',[h.orderId])).rejects.toMatchObject({code:'23514'});
    const receipt=await runRestoredStateCli(['--operator-ref','enrollment-t086','--schema',h.schema,'--maintenance-confirmed'],input);
    expect(receipt.counts.sessions).toBeGreaterThan(0);expect(receipt.counts.tokens).toBe(2);expect(receipt.counts.mail).toBe(2);
    const invalidated=await recoverySnapshot(database,h.schema);
    for(const table of Object.keys(restored.data).filter(t=>!['Session','ActionToken','MailDelivery'].includes(t)))expect(invalidated.data[table],table).toBe(restored.data[table]);
    const http=await start(environment);let adminCookie='';
    try{
      for(const role of ['ADMIN','STUDENT','TEACHER'] as const){
        const a=account(h,role);expect((await http.get('/me',a.sessions[0].secret)).status).toBe(401);
        const cookie=await login(http,a);if(role==='ADMIN')adminCookie=cookie;
        expect((await http.get('/me',cookie)).status).toBe(200);
        expect((await http.get('/admin/enrollment/orders',cookie)).status).toBe(role==='ADMIN'?200:403);
        if(role==='STUDENT'){
          const order=await http.get('/enrollment/orders/'+h.orderId,cookie);expect(order.status).toBe(200);
          expect((await order.json()).data).toMatchObject({state:'ENROLLED',totalMinor:'12500'});
          const enrollments=await http.get('/enrollment/enrollments',cookie);expect(enrollments.status).toBe(200);
          expect((await enrollments.json()).data.items).toHaveLength(1);
        }
      }
      const follow=await http.get('/admin/enrollment/incidents/'+h.incidentId,adminCookie);expect(follow.status).toBe(200);
      const post=saved<{body:{commandId:string;content:string}}>('postbackup-private');
      // Decisión conocida revisada por el operador ficticio; no conciliación automática.
      const reapplied=await http.post(`/admin/enrollment/incidents/${h.incidentId}/follow-ups`,post.body,adminCookie);
      expect(reapplied.status).toBe(200);expect((await reapplied.json()).data.command.replayed).toBe(false);
      const replay=await http.post(`/admin/enrollment/incidents/${h.incidentId}/follow-ups`,post.body,adminCookie);
      expect(replay.status).toBe(200);expect((await replay.json()).data.command.replayed).toBe(true);
      const conflict=await http.post(`/admin/enrollment/incidents/${h.incidentId}/follow-ups`,{...post.body,content:'Intención distinta'},adminCookie);
      expect(conflict.status).toBe(409);expect((await conflict.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
      expect((await database.pool.query('SELECT count(*) FROM "IncidentFollowUp"')).rows[0].count).toBe('2');
      const after=await recoverySnapshot(database,h.schema);
      for(const table of enrollmentTables.filter(t=>!['IncidentFollowUp','EnrollmentCommand','EnrollmentAuditEvent'].includes(t)))expect(after.data[table],table).toBe(restored.data[table]);
      for(const table of ['EnrollmentCommand','EnrollmentAuditEvent'])expect(Number(after.counts[table])).toBe(Number(restored.counts[table])+1);
      for(const [route,body] of [['/auth/verification/confirm',{token:h.verify}],['/auth/password/reset',{token:h.reset,newPassword:'Only-Fictitious-Reset-739!'}]] as const)expect((await http.post(route,body)).status).toBe(400);
    }finally{await http.close();}
    const restarted=await us1Process({context:{environment}});
    try{expect((await restarted.get(adminCookie)).status).toBe(200);expect((await restarted.get(account(h).sessions[0].secret)).status).toBe(401);}finally{await restarted.close();}
    const entries=readdirSync(`${repositoryRoot()}/apps/api/logs/security`).filter(n=>n.endsWith('.jsonl')).flatMap(n=>readFileSync(`${repositoryRoot()}/apps/api/logs/security/${n}`,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)));
    expect(entries.filter(e=>e.correlationId===receipt.correlationId).map(e=>e.result)).toEqual(['STARTED','SUCCEEDED']);
    const serialized=JSON.stringify(entries);for(const secret of [h.verify,h.reset,environment.databaseUrl,...h.manifest.accounts.flatMap(a=>[a.email,a.password,...a.sessions.map(s=>s.secret)])])expect(serialized.includes(secret)).toBe(false);
    expect((await database.pool.query('SELECT count(*) FROM "MailDelivery" WHERE status<>\'CANCELLED\' OR "encryptedPayload" IS NOT NULL OR "claimId" IS NOT NULL')).rows[0].count).toBe('0');
    expect((await fetch('http://mailpit:8025/api/v1/messages').then(r=>r.json()) as {total:number}).total).toBe(0);
    save('restore-summary',{matchingRows:true,matchingSchemaConstraintsFunctionsViewsAndGrants:true,migrationsAfterRestore:7,allNonAccessRowsPreservedByInvalidation:true,financialRowsUnchanged:true,oldCredentialsRejected:true,newRoleLogins:true,roleDenials:true,ledgerReplay:true,differentIntentRejected:true,restartMode:'separate-node-process',staleMailSent:0,knownLostChanges:1,reviewedAndReappliedFictitiousDecisions:1,invalidated:receipt.counts,trafficReady:false,at:new Date().toISOString()});
  }finally{await database.close();}
},120000);
