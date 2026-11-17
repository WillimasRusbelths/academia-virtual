import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,readdirSync} from 'node:fs';
import {test,expect} from 'vitest';
import {loadEnvironment} from '../../src/infrastructure/config/environment.js';
import {createDatabase} from '../../src/infrastructure/database/database.js';
import {createIsolatedTestEnvironment} from '../support/test-environment.js';
import {createIdentityFixtures,readFixtureManifest} from '../support/identity-fixtures.js';
import {baselineMigrations,legacyFingerprint,seedEnrollmentGraph} from '../support/enrollment-migration.js';
import {sessionFixture} from '../support/session-fixture.js';
import {financialFingerprint,seedCommitment} from '../support/enrollment-maintenance.js';
import {materialFileCase} from '../support/materials-files.js';
import {materialsProcess} from '../support/materials-testing.js';
import {us1Http} from '../support/us1-http.js';
import type {Us1Http} from '../support/us1-http.js';
import {SessionCookie} from '../../src/http/session-cookie.js';
import {runRestoredStateCli} from '../../src/cli/invalidate-restored-state.js';
import {recoverySnapshot} from './academic-snapshot.js';

const dir='/recovery-private';
const save=(name:string,value:unknown)=>writeFileSync(`${dir}/${name}.json`,JSON.stringify(value),{mode:0o600});
const saved=<T>(name:string):T=>JSON.parse(readFileSync(`${dir}/${name}.json`,'utf8'));
type Snapshot=Awaited<ReturnType<typeof recoverySnapshot>>;
type Actor={userId:string;sessionId:string;secret:string;email:string;password:string};
type Item={id:string;fileId:string;groupId:string;state:string;revision:string};
interface Handoff {schema:string;courseId:string;groupId:string;cancelledGroupId:string;actors:Record<string,Actor>;
 legacy:string;financial:string;items:Item[];pendingId:string;before?:Snapshot;
 publish?:{materialId:string;body:{commandId:string;expectedRevision:string}}}
function inputFor(schema:string){
  expect(schema).toMatch(/^t_materials_recovery_[a-f0-9]+$/);
  const input:NodeJS.ProcessEnv={...process.env,APP_ENV:'test'};
  for(const key of ['TEST_DATABASE_URL','TEST_MIGRATION_DATABASE_URL'] as const){const url=new URL(process.env[key]!);url.searchParams.set('schema',schema);input[key]=url.toString();}
  return input;
}
async function guard(database:ReturnType<typeof createDatabase>){
  expect(process.env.RECOVERY_ISOLATED).toBe('1');
  expect((await database.pool.query(`SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`)).rows[0].marker).toBe('materials-recovery-isolated');
}
function deploy(input:NodeJS.ProcessEnv,config?:string){
  const args=config?['../../node_modules/prisma/build/index.js','migrate','deploy','--config',config]:['scripts/database.mjs','deploy'];
  expect(spawnSync(process.execPath,args,{env:input,encoding:'utf8',timeout:120000}).status,'Deploy aislado; detalles privados').toBe(0);
}
async function start(environment:ReturnType<typeof loadEnvironment>){
  const http=await us1Http({context:{environment}});
  await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();return http;
}
async function login(http:Us1Http,actor:Actor){
  const response=await http.post('/auth/login',{email:actor.email,password:actor.password});expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0].split('=')[1];
}
async function upload(http:Us1Http,h:Handoff,fileId:string,state:string,groupId=h.groupId,actor=h.actors.teacher){
  const file=materialFileCase(fileId),intentionId=randomUUID();
  const registered=await http.post(`/materials/groups/${groupId}/uploads`,{intentionId,title:'Lectura ficticia de recuperación',description:'Sin datos reales',
    downloadName:file.name,mediaType:file.mediaType,byteSize:file.byteSize,sha256:file.sha256},actor.secret);
  expect(registered.status).toBe(201);const uploadId=(await registered.json()).data.uploadId;
  const completed=await fetch(http.url+`/api/v1/materials/uploads/${uploadId}/content`,{method:'PUT',headers:{...http.headers(actor.secret),'content-type':'application/octet-stream'},body:new Uint8Array(file.bytes)});
  expect(completed.status).toBe(201);const item=(await completed.json()).data.resource;
  if(state!=='PREPARED'){
    const body={commandId:randomUUID(),expectedRevision:'1'},operation=state==='PUBLISHED'?'publish':'withdraw';
    const result=await http.post(`/materials/items/${item.id}/${operation}`,body,h.actors.admin.secret);expect(result.status).toBe(200);
    if(!h.publish&&state==='PUBLISHED'&&groupId===h.groupId)h.publish={materialId:item.id,body};
  }
  return {id:item.id,fileId,groupId,state,revision:state==='PREPARED'?'1':'2'};
}
async function verifyBytes(database:ReturnType<typeof createDatabase>,h:Handoff){
  for(const item of h.items){
    const row=(await database.pool.query('SELECT bytes,sha256,"byteSize" FROM "MaterialContent" WHERE "materialId"=$1',[item.id])).rows[0],file=materialFileCase(item.fileId);
    expect(row.bytes.equals(file.bytes)).toBe(true);expect(row.sha256).toBe(file.sha256);expect(row.byteSize).toBe(file.byteSize);
    expect(createHash('sha256').update(row.bytes).digest('hex')).toBe(file.sha256);
    const metadata=(await database.pool.query('SELECT "groupId","createdBy",state,revision::text FROM "Material" WHERE id=$1',[item.id])).rows[0];
    expect(metadata).toMatchObject({groupId:item.groupId,createdBy:item.groupId===h.groupId?h.actors.teacher.userId:h.actors.admin.userId,state:item.state,revision:item.revision});
  }
}
async function permissions(http:Us1Http,h:Handoff,cookies:Record<string,string>){
  const list=await http.get(`/materials/groups/${h.groupId}/items`,cookies.student);expect(list.status).toBe(200);
  expect((await list.json()).data.items.map((i:{id:string})=>i.id).sort()).toEqual(h.items.filter(i=>i.groupId===h.groupId&&i.state==='PUBLISHED').map(i=>i.id).sort());
  for(const item of h.items){
    const response=await http.get(`/materials/items/${item.id}/content`,cookies.admin);expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');expect(Buffer.from(await response.arrayBuffer()).equals(materialFileCase(item.fileId).bytes)).toBe(true);
    expect((await http.get(`/materials/items/${item.id}/content`,cookies.student)).status).toBe(item.groupId===h.groupId&&item.state==='PUBLISHED'?200:404);
    expect((await http.get(`/materials/items/${item.id}`,cookies.teacher)).status).toBe(404);
    expect((await http.get(`/materials/items/${item.id}`,cookies.successor)).status).toBe(item.groupId===h.groupId?200:404);
    for(const kind of ['historical','foreign'])expect((await http.get(`/materials/items/${item.id}/content`,cookies[kind])).status).toBe(404);
  }
  const pending=await http.get(`/materials/uploads/${h.pendingId}`,cookies.admin);expect(pending.status).toBe(200);expect((await pending.json()).data.state).toBe('PENDING');
}

test(`T062 recuperación de materiales: ${process.env.RECOVERY_PHASE??'fase requerida'}`,async()=>{
  const phase=process.env.RECOVERY_PHASE;expect(['legacy','upgrade','restart','postbackup','restore']).toContain(phase);
  const initial=createDatabase(loadEnvironment());try{await guard(initial);}finally{await initial.close();}
  if(phase==='legacy'){
    const isolated=await createIsolatedTestEnvironment('materials_recovery'),input=inputFor(isolated.schema);
    const temporary=mkdtempSync('/tmp/materials-legacy-');mkdirSync(`${temporary}/migrations`);
    cpSync('prisma/schema.prisma',`${temporary}/schema.prisma`);cpSync('prisma/migrations/migration_lock.toml',`${temporary}/migrations/migration_lock.toml`);
    for(const name of [...baselineMigrations,'0006_enrollment','0007_payment_reconciliation'])cpSync(`prisma/migrations/${name}`,`${temporary}/migrations/${name}`,{recursive:true});
    writeFileSync('recovery-legacy.config.ts',`import {defineConfig} from 'prisma/config';import {loadEnvironment} from './src/infrastructure/config/environment.ts';export default defineConfig({schema:'${temporary}/schema.prisma',migrations:{path:'${temporary}/migrations'},datasource:{url:loadEnvironment().migrationUrl}});`);
    deploy(input,'recovery-legacy.config.ts');const environment=loadEnvironment(input),database=createDatabase(environment);
    try{
      const fixtureDir=mkdtempSync('/tmp/materials-fixtures-'),created=await createIdentityFixtures(environment,database.pool,fixtureDir),manifest=readFixtureManifest(environment,created.runId,fixtureDir);
      const actors:Record<string,Actor>={};
      for(const role of ['ADMIN','TEACHER','STUDENT'] as const){const a=manifest.accounts.find(a=>a.role===role&&a.variant==='ENABLED')!;actors[role.toLowerCase()]={userId:a.id,sessionId:a.sessions[0].id,secret:a.sessions[0].secret,email:a.email,password:a.password};}
      const context={isolated,environment,database,async cleanup(){throw Error('El destino de recuperación se conserva.');}};
      for(const [kind,role] of [['successor','TEACHER'],['historical','STUDENT'],['foreign','STUDENT']] as const){
        const extra=await sessionFixture(context,role),base=actors[role.toLowerCase()];
        await database.pool.query('UPDATE "User" SET "passwordHash"=(SELECT "passwordHash" FROM "User" WHERE id=$2) WHERE id=$1',[extra.userId,base.userId]);
        const email=(await database.pool.query('SELECT email FROM "User" WHERE id=$1',[extra.userId])).rows[0].email;actors[kind]={...extra,email,password:base.password};
      }
      await database.pool.query('UPDATE "SystemState" SET "bootstrapCompletedAt"=clock_timestamp(),"firstAdminUserId"=$1 WHERE id=1',[actors.admin.userId]);
      const courseId=randomUUID(),groupId=randomUUID(),cancelledGroupId=randomUUID();
      await database.pool.query(`INSERT INTO "AcademicCourse"(id,name,description) VALUES($1,'Curso ficticio de recuperación','Snapshot real 0007')`,[courseId]);
      for(const id of [groupId,cancelledGroupId])await database.pool.query(`INSERT INTO "AcademicGroup"(id,"courseId",name,capacity,"periodStart","periodEnd","teacherUserId") VALUES($1,$2,'Grupo previo ficticio',50,'2030-01-07','2030-01-31',$3)`,[id,courseId,actors.teacher.userId]);
      await database.pool.query('INSERT INTO "AcademicSlot"("groupId","dayOfWeek","startMinute","endMinute") VALUES($1,1,1080,1140)',[groupId]);
      await seedEnrollmentGraph({database,courseId,groupId,admin:actors.admin,student:actors.student});
      await seedCommitment({database,courseId,groupId,student:actors.historical},'FINISHED',database.pool,'2');
      const h:Handoff={schema:isolated.schema,courseId,groupId,cancelledGroupId,actors,legacy:await legacyFingerprint(database.pool),financial:await financialFingerprint(database.pool),items:[],pendingId:''};save('handoff',h);
      expect((await database.pool.query('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows[0].count).toBe('7');
      expect((await database.pool.query(`SELECT to_regclass('"Material"') AS material`)).rows[0].material).toBeNull();
      save('legacy-summary',{migrations:7,materialTablesAbsent:true,financialAndIdentityRowsRecorded:true});
    }finally{await database.close();}return;
  }
  const h=saved<Handoff>('handoff'),input=inputFor(h.schema),environment=loadEnvironment(input),database=createDatabase(environment);
  try{
    if(phase==='upgrade'){
      deploy(input);expect(await legacyFingerprint(database.pool)).toBe(h.legacy);expect(await financialFingerprint(database.pool)).toBe(h.financial);
      expect((await database.pool.query('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows[0].count).toBe('9');
      const http=await start(environment);
      try{
        for(const fileId of ['pdf-valid','jpg-valid','png-valid'])h.items.push(await upload(http,h,fileId,'PUBLISHED'));
        h.items.push(await upload(http,h,'pdf-valid','PREPARED'));h.items.push(await upload(http,h,'png-valid','WITHDRAWN'));
        h.items.push(await upload(http,h,'pdf-valid','PUBLISHED',h.cancelledGroupId,h.actors.admin));
        const file=materialFileCase('pdf-valid'),pending=await http.post(`/materials/groups/${h.groupId}/uploads`,{intentionId:randomUUID(),title:'Pendiente ficticio',description:null,downloadName:file.name,mediaType:file.mediaType,byteSize:file.byteSize,sha256:file.sha256},h.actors.admin.secret);
        expect(pending.status).toBe(201);h.pendingId=(await pending.json()).data.uploadId;
        await database.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1',[h.groupId,h.actors.successor.userId]);
        const first=h.items[0],edit=await fetch(http.url+`/api/v1/materials/items/${first.id}`,{method:'PATCH',headers:http.headers(h.actors.successor.secret),body:JSON.stringify({commandId:randomUUID(),expectedRevision:'2',title:'Corrección del sucesor',description:null})});
        expect(edit.status).toBe(200);first.revision='3';
        await database.pool.query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Cancelación ficticia',"cancelledAt"=clock_timestamp(),revision=revision+1 WHERE id=$1`,[h.cancelledGroupId]);
        await permissions(http,h,Object.fromEntries(Object.entries(h.actors).map(([key,a])=>[key,a.secret])));
      }finally{await http.close();}
      await verifyBytes(database,h);expect(await financialFingerprint(database.pool)).toBe(h.financial);
      h.before=await recoverySnapshot(database,h.schema);save('handoff',h);
      save('upgrade-summary',{migrations:9,legacyPreserved:true,financesPreserved:true,materials:6,pendingIntentions:1,formats:3,states:3,authorshipPreserved:true});return;
    }
    if(phase==='restart'){
      const first=await materialsProcess(environment);const originalPid=first.pid;await first.close();const second=await materialsProcess(environment);
      try{
        expect(second.pid).not.toBe(originalPid);const headers={cookie:`${new SessionCookie(environment).name}=${h.actors.admin.secret}`};
        expect((await fetch(second.url+`/api/v1/materials/items/${h.items[0].id}/content`,{headers})).status).toBe(200);
        const pending=await fetch(second.url+`/api/v1/materials/uploads/${h.pendingId}`,{headers});expect(pending.status).toBe(200);expect((await pending.json()).data.state).toBe('PENDING');
        for(const item of h.items.filter(i=>i.state!=='PUBLISHED'))expect((await fetch(second.url+`/api/v1/materials/items/${item.id}/content`,{headers:{cookie:`${new SessionCookie(environment).name}=${h.actors.student.secret}`}})).status).toBe(404);
      }finally{await second.close();}
      await verifyBytes(database,h);expect(await financialFingerprint(database.pool)).toBe(h.financial);
      h.before=await recoverySnapshot(database,h.schema);save('handoff',h);save('restart-summary',{distinctProcesses:true,bytesAndStatesPreserved:true,pendingNotCompleted:true,financesPreserved:true});return;
    }
    if(phase==='postbackup'){
      const http=await start(environment);try{
        const withdraw={commandId:randomUUID(),expectedRevision:h.items[0].revision},publish={commandId:randomUUID(),expectedRevision:'1'};
        expect((await http.post(`/materials/items/${h.items[0].id}/withdraw`,withdraw,h.actors.admin.secret)).status).toBe(200);
        expect((await http.post(`/materials/items/${h.items[3].id}/publish`,publish,h.actors.admin.secret)).status).toBe(200);
        save('postbackup-private',{withdraw,publish});save('postbackup-summary',{knownLostChanges:2,withdrawnAfterBackup:true,publishedAfterBackup:true,at:new Date().toISOString()});
      }finally{await http.close();}return;
    }
    expect(new URL(environment.databaseUrl).pathname).toMatch(/^\/recovery_[a-z0-9_]+_test$/);
    const restored=await recoverySnapshot(database,h.schema);expect(restored).toEqual(h.before);await verifyBytes(database,h);
    deploy(input);expect(await recoverySnapshot(database,h.schema)).toEqual(restored);
    await expect(database.pool.query('CREATE TABLE "ForbiddenDdl"(id int)')).rejects.toMatchObject({code:'42501'});
    await expect(database.pool.query('UPDATE "Material" SET "createdBy"=$2 WHERE id=$1',[h.items[0].id,h.actors.admin.userId])).rejects.toMatchObject({code:'23514'});
    await expect(database.pool.query('UPDATE "MaterialContent" SET bytes=$2 WHERE "materialId"=$1',[h.items[0].id,Buffer.from('invalid')])).rejects.toMatchObject({code:'23514'});
    const receipt=await runRestoredStateCli(['--operator-ref','materials-t062','--schema',h.schema,'--maintenance-confirmed'],input);expect(receipt.counts.sessions).toBeGreaterThan(0);
    const invalidated=await recoverySnapshot(database,h.schema);
    for(const table of Object.keys(restored.data).filter(t=>!['Session','ActionToken','MailDelivery'].includes(t)))expect(invalidated.data[table],table).toBe(restored.data[table]);
    const http=await start(environment);const cookies:Record<string,string>={};
    try{
      for(const [kind,a] of Object.entries(h.actors)){expect((await http.get('/me',a.secret)).status).toBe(401);cookies[kind]=await login(http,a);}
      await permissions(http,h,cookies); // Backup point, still a quarantined test API, no public traffic.
      const beforeReplay=await recoverySnapshot(database,h.schema);
      const replay=await http.post(`/materials/items/${h.publish!.materialId}/publish`,h.publish!.body,cookies.admin);expect(replay.status).toBe(200);
      expect((await replay.json()).data).toMatchObject({resource:{revision:'3'},command:{replayed:true,appliedRevision:'2'}});
      const afterReplay=await recoverySnapshot(database,h.schema);for(const table of ['Material','MaterialContent','MaterialUpload','MaterialCommand','MaterialAuditEvent'])expect(afterReplay.data[table]).toBe(beforeReplay.data[table]);
      const lost=saved<{withdraw:{commandId:string;expectedRevision:string};publish:{commandId:string;expectedRevision:string}}>('postbackup-private');
      expect((await database.pool.query('SELECT count(*) FROM "MaterialCommand" WHERE "commandId"=ANY($1::uuid[])',[[lost.withdraw.commandId,lost.publish.commandId]])).rows[0].count).toBe('0');
      // Explicit review of the known withdrawal; do not replay the lost publication.
      const reapplied=await http.post(`/materials/items/${h.items[0].id}/withdraw`,lost.withdraw,cookies.admin);expect(reapplied.status).toBe(200);expect((await reapplied.json()).data.command.replayed).toBe(false);
      const repeated=await http.post(`/materials/items/${h.items[0].id}/withdraw`,lost.withdraw,cookies.admin);expect(repeated.status).toBe(200);expect((await repeated.json()).data.command.replayed).toBe(true);
      expect((await http.get(`/materials/items/${h.items[0].id}/content`,cookies.student)).status).toBe(404);
      expect((await http.get(`/materials/items/${h.items[3].id}/content`,cookies.student)).status).toBe(404);
      expect(await financialFingerprint(database.pool)).toBe(h.financial);
      const after=await recoverySnapshot(database,h.schema);for(const table of ['MaterialContent','MaterialUpload'])expect(after.data[table]).toBe(restored.data[table]);
      for(const table of ['MaterialCommand','MaterialAuditEvent'])expect(Number(after.counts[table])).toBe(Number(restored.counts[table])+1);
    }finally{await http.close();}
    const entries=readdirSync('../../apps/api/logs/security').filter(n=>n.endsWith('.jsonl')).flatMap(n=>readFileSync('../../apps/api/logs/security/'+n,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line)));
    expect(entries.filter(e=>e.correlationId===receipt.correlationId).map(e=>e.result)).toEqual(['STARTED','SUCCEEDED']);
    const text=JSON.stringify(entries);for(const a of Object.values(h.actors))for(const secret of [a.secret,a.email,a.password])expect(text).not.toContain(secret);
    save('restore-summary',{snapshotEqualBeforeInvalidation:true,catalogAndAclEqual:true,fullBytesHashesEqual:true,allStatesAndFormats:true,authorAndGroupPreserved:true,
      oldSessionsDenied:true,freshLoginPermissionsChecked:true,expiredEnrollmentStillDenied:true,unauthorizedTeacherDenied:true,pendingNotCompleted:true,
      ledgerReplayPreserved:true,knownLostChanges:2,reviewedWithdrawalReapplied:1,publicationNotAutomaticallyReplayed:true,financesPreserved:true,trafficOpened:false,counts:restored.counts});
  }finally{await database.close();}
},120000);
