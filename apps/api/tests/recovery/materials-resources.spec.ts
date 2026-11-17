import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import type {IncomingMessage} from 'node:http';
import {once} from 'node:events';
import {writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {test,expect} from 'vitest';
import {materialsFixture} from '../support/materials.js';
import {materialFileCase} from '../support/materials-files.js';
import {within} from '../support/materials-testing.js';
import {SessionCookie} from '../../src/http/session-cookie.js';
import {financialFingerprint} from '../support/enrollment-maintenance.js';

type Memory={rss:number;heapUsed:number;external:number;arrayBuffers:number};
type Metrics={baseline:Memory;peak:Memory;current:Memory;samples:number;incomingBytes:number;
  buffers:Record<string,{calls:number;bytes:number;atLeastFileSize:number}>;sqlBufferParameterBytes:number;sqlBufferResultBytes:number;
  injectedFault?:string;pool:{total:number;idle:number;waiting:number}};
const memory=():Memory=>{const {rss,heapUsed,external,arrayBuffers}=process.memoryUsage();return {rss,heapUsed,external,arrayBuffers};};
async function wait(check:()=>Promise<boolean>){for(let n=0;n<100;n++){if(await check())return;await delay(50);}throw Error('Resource observation deadline');}

test('T063 isolated 20 MB transfers, process resources, slow clients, admission and rollback',async()=>{
  expect(process.env.RESOURCES_ISOLATED).toBe('1');
  const f=await materialsFixture();let child:ReturnType<typeof fork>|undefined;
  let generator: {baseline:Memory;peak:Memory;samples:number}|undefined;
  const sample=()=>{if(generator){generator.samples++;const m=memory();for(const key of Object.keys(m) as (keyof Memory)[])generator.peak[key]=Math.max(generator.peak[key],m[key]);}};
  const sampler=setInterval(sample,25);sampler.unref();
  try{
    expect((await f.pool.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker).toBe('materials-resources-isolated');
    const finance=await financialFingerprint(f.pool),file=materialFileCase('pdf-limit');expect(file.byteSize).toBe(20_000_000);
    child=fork(fileURLToPath(new URL('../support/materials-resource-process.mjs',import.meta.url)),[],{stdio:['ignore','ignore','ignore','ipc'],
      env:{...process.env,APP_ENV:'test',APP_ORIGIN:f.environment.appOrigin,TEST_DATABASE_URL:f.environment.databaseUrl,TEST_MIGRATION_DATABASE_URL:f.environment.migrationUrl}});
    const exited=once(child,'exit');let nextId=0;
    const pending=new Map<number,(result:Metrics)=>void>();
    child.on('message',message=>{if(message&&typeof message==='object'&&'id'in message&&'result'in message){const done=pending.get(Number(message.id));pending.delete(Number(message.id));done?.(message.result as Metrics);}});
    const url=await within(new Promise<string>((resolve,reject)=>{child!.once('error',()=>reject(Error('Resource API failed')));child!.once('exit',()=>reject(Error('Resource API exited')));
      child!.on('message',message=>{if(message&&typeof message==='object'&&'ready'in message&&typeof message.ready==='string'&&/^http:\/\/127\.0\.0\.1:\d+$/.test(message.ready))resolve(message.ready);});}),20000);
    const rpc=(operation:string,extra:Record<string,string>={})=>within(new Promise<Metrics>(resolve=>{const id=++nextId;pending.set(id,resolve);child!.send({id,operation,...extra});}),10000);
    const headers=(secret:string)=>({cookie:`${new SessionCookie(f.environment).name}=${secret}`,origin:f.environment.appOrigin,'x-csrf-protection':'1','sec-fetch-site':'same-origin'});
    const post=(path:string,body:unknown,secret=f.teacher.secret)=>fetch(url+'/api/v1'+path,{method:'POST',headers:{...headers(secret),'content-type':'application/json'},body:JSON.stringify(body)});
    const register=async(secret=f.teacher.secret,groupId=f.groupId)=>{const response=await post(`/materials/groups/${groupId}/uploads`,{intentionId:randomUUID(),title:'Recurso ficticio al límite',description:null,downloadName:file.name,mediaType:file.mediaType,byteSize:file.byteSize,sha256:file.sha256},secret);expect(response.status).toBe(201);return (await response.json()).data.uploadId as string;};
    const content=(id:string)=>url+`/api/v1/materials/items/${id}/content`;
    function upload(id:string,secret=f.teacher.secret){let request!:ReturnType<typeof httpRequest>;const response=new Promise<{status:number;body:Record<string,unknown>} >((resolve,reject)=>{
      request=httpRequest(url+`/api/v1/materials/uploads/${id}/content`,{method:'PUT',headers:{...headers(secret),'content-type':'application/octet-stream','content-length':String(file.byteSize)}},incoming=>{const chunks:Buffer[]=[];incoming.on('data',(chunk:Buffer)=>chunks.push(chunk));incoming.on('error',reject);incoming.on('end',()=>resolve({status:incoming.statusCode??0,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));});request.once('error',reject);request.setTimeout(20000,()=>request.destroy(Error('Resource upload deadline')));
    });void response.catch(()=>undefined);return {request,response};}
    async function send(id:string,secret=f.teacher.secret,slow=false){const transfer=upload(id,secret);try{for(let offset=0;offset<file.byteSize;offset+=262144){if(!transfer.request.write(file.bytes.subarray(offset,offset+262144)))await within(once(transfer.request,'drain'),10000);if(slow)await delay(25);}transfer.request.end();return await within(transfer.response,20000);}finally{transfer.request.destroy();}}
    const db=async()=>{const row=(await f.pool.query(`SELECT pg_database_size(current_database())::text AS "databaseBytes",pg_current_wal_lsn()::text AS "walLsn",
      pg_total_relation_size('"MaterialContent"'::regclass)::text AS "contentRelationBytes",(SELECT count(*) FROM "MaterialContent")::text AS "contentRows",
      (SELECT COALESCE(sum("byteSize"),0) FROM "MaterialContent")::text AS "logicalContentBytes"`)).rows[0];return row;};
    const noTransaction=async()=>expect((await f.pool.query("SELECT count(*)::text AS n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows[0].n).toBe('0');
    const windows:Record<string,unknown>={};
    async function measure<T>(name:string,operation:()=>Promise<T>){const before=await db(),initial=memory();generator={baseline:initial,peak:{...initial},samples:0};await rpc('begin');const started=performance.now();
      const result=await operation(),api=await rpc('end');sample();const after=await db();const walBytes=(await f.pool.query('SELECT pg_wal_lsn_diff($1::pg_lsn,$2::pg_lsn)::text AS bytes',[after.walLsn,before.walLsn])).rows[0].bytes;
      windows[name]={durationMs:performance.now()-started,api,generator,dbBefore:before,dbAfter:after,walBytes};generator=undefined;return result;}
    const baseline=await db();const id=await register();
    const uploaded=await measure('uploadLimit',()=>send(id));expect(uploaded.status).toBe(201);
    const uploadedData=uploaded.body.data as {resource:{id:string;revision:string}};const material=uploadedData.resource;
    const stored=(await f.pool.query('SELECT octet_length(bytes) AS size,encode(sha256(bytes),\'hex\') AS hash FROM "MaterialContent" WHERE "materialId"=$1',[material.id])).rows[0];expect(stored).toEqual({size:file.byteSize,hash:file.sha256});
    expect((await post(`/materials/items/${material.id}/publish`,{commandId:randomUUID(),expectedRevision:material.revision})).status).toBe(200);
    await measure('downloadLimit',async()=>{const response=await fetch(content(material.id),{headers:headers(f.student.secret)});expect(response.status).toBe(200);expect(response.headers.get('content-length')).toBe(String(file.byteSize));const hash=createHash('sha256');let count=0;for await(const chunk of response.body!){hash.update(chunk);count+=chunk.length;}expect(count).toBe(file.byteSize);expect(hash.digest('hex')).toBe(file.sha256);});
    const heldTeacher=await register(),heldAdmin=await register(f.admin.secret),third=await register(f.otherTeacher.secret,f.otherGroupId);
    await measure('twoHeldUploadsAdmissionAndAbort',async()=>{
      const a=upload(heldTeacher),b=upload(heldAdmin,f.admin.secret);
      try{a.request.write(file.bytes.subarray(0,1024));b.request.write(file.bytes.subarray(0,1024));await wait(async()=> (await rpc('snapshot')).incomingBytes===2048);
        const during=await rpc('snapshot');expect(during.pool.idle).toBe(during.pool.total);expect(during.pool.waiting).toBe(0);await noTransaction();
        const same=upload(heldTeacher);same.request.flushHeaders();const sameResponse=await within(same.response);expect(sameResponse.status).toBe(429);same.request.destroy();
        const global=upload(third,f.otherTeacher.secret);global.request.flushHeaders();const globalResponse=await within(global.response);expect(globalResponse.status).toBe(503);global.request.destroy();
        expect((await rpc('snapshot')).incomingBytes).toBe(2048);
      }finally{a.request.destroy();b.request.destroy();await Promise.allSettled([a.response,b.response]);}
      await wait(async()=>{const response=await fetch(content(material.id),{headers:headers(f.teacher.secret)});await response.body?.cancel();return response.status===200;});
      for(const pendingId of [heldTeacher,heldAdmin,third])expect((await f.pool.query('SELECT "materialId" FROM "MaterialUpload" WHERE "uploadId"=$1',[pendingId])).rows[0].materialId).toBeNull();
    });
    const slowId=await register();await measure('slowUpload',async()=>{const response=await send(slowId,f.teacher.secret,true);expect(response.status).toBe(201);await noTransaction();});
    await measure('slowDownload',async()=>{
      let incoming:IncomingMessage|undefined;
      const request=httpRequest(content(material.id),{headers:headers(f.teacher.secret)});
      const received=new Promise<IncomingMessage>((resolve,reject)=>{request.once('response',response=>{response.pause();incoming=response;resolve(response);});request.once('error',reject);});request.end();
      try{const response=await within(received);expect(response.statusCode).toBe(200);await delay(500);const during=await rpc('snapshot');expect(during.pool.idle).toBe(during.pool.total);await noTransaction();
        const denied=await fetch(content(material.id),{headers:headers(f.teacher.secret)});await denied.body?.cancel();expect(denied.status).toBe(429);
        let count=0;const hash=createHash('sha256');for await(const chunk of response){count+=chunk.length;hash.update(chunk);await delay(2);}expect(count).toBe(file.byteSize);expect(hash.digest('hex')).toBe(file.sha256);
      }finally{incoming?.destroy();request.destroy();}
    });
    const faultResults=[];
    for(const code of ['53100','53200']){
      const failedId=await register();const before=(await f.pool.query('SELECT (SELECT count(*) FROM "Material")::text AS materials,(SELECT count(*) FROM "MaterialAuditEvent")::text AS audit')).rows[0];
      await measure('injected-'+code,async()=>{await rpc('fault',{code});const response=await send(failedId);expect(response.status).toBe(503);expect(response.body).toMatchObject({error:{code:'TEMPORARILY_UNAVAILABLE'}});
        expect((await rpc('snapshot')).injectedFault).toBe(code);
        expect((await f.pool.query('SELECT (SELECT count(*) FROM "Material")::text AS materials,(SELECT count(*) FROM "MaterialAuditEvent")::text AS audit')).rows[0]).toEqual(before);
        expect((await f.pool.query('SELECT "materialId" FROM "MaterialUpload" WHERE "uploadId"=$1',[failedId])).rows[0].materialId).toBeNull();await noTransaction();
        const good=await fetch(content(material.id),{headers:headers(f.teacher.secret)});expect(good.status).toBe(200);await good.body!.cancel();
      });faultResults.push({code,httpStatus:503,rolledBack:true,pendingIntentionPreserved:true,admissionReleased:true});
    }
    expect(await financialFingerprint(f.pool)).toBe(finance);
    expect((await f.pool.query('SELECT encode(sha256(bytes),\'hex\') AS hash FROM "MaterialContent" WHERE "materialId"=$1',[material.id])).rows[0].hash).toBe(file.sha256);
    const final=await db();expect(Number(final.logicalContentBytes)-Number(baseline.logicalContentBytes)).toBe(40_000_000);
    child.kill('SIGTERM');await within(exited,10000);child=undefined;
    writeFileSync('/recovery-private/resources-summary.json',JSON.stringify({schema:f.isolated.schema,apiProcessSeparated:true,generatorSeparated:true,samplingIntervalMs:25,
      configured:{fileLimit:20_000_000,globalTransfers:2,actorTransfers:1,poolMax:f.environment.poolMax,uploadTimeoutMs:f.environment.materials?.uploadTimeoutMs},
      corpus:{format:'PDF',bytes:file.byteSize,sha256:file.sha256,compressibleSyntheticPadding:true},baseline,final,windows,faultResults,
      hashesVerified:true,financialFactsUnchanged:true,physicalDiskExhaustion:false,concurrentHeld:2,actorExcessStatus:429,globalExcessStatus:503,queueUnbounded:false,
      slowClientConnectionsReleased:true,backupNotYetMeasured:true,capacityAccepted:false,humanAcceptance:false}),{mode:0o600});
  }finally{clearInterval(sampler);if(child){child.kill('SIGTERM');await within(once(child,'exit'),10000).catch(()=>undefined);}await f.database.close();}
},180000);
