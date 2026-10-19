import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { Agent,request } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,appendFileSync,copyFileSync,readdirSync,rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as pause } from 'node:timers/promises';
import { identityDatabase } from '../support/identity-database.js';
import { us1Http } from '../support/us1-http.js';
import { assertMailpitAvailable } from '../support/mailpit.js';
import { assertFixtureEnvironment } from '../../src/infrastructure/testing/identity-fixtures.js';
import { repositoryRoot } from '../../src/infrastructure/config/environment.js';
import { createPasswordCredentials,ARGON2_PARAMETERS,HASH_CONCURRENCY,HASH_QUEUE_MAX,HASH_WAIT_MS } from '../../src/modules/identity/infrastructure/credentials.js';
import { comparison,protocol,shuffled,statistics,verdict } from './enumeration-protocol.js';
import type { Comparison,Stats,Verdict } from './enumeration-protocol.js';

type State='absent'|'enabled'|'disabled'|'unverified'|'pending'|'disabledPending'|'expired'|'replaced'|'fresh';
interface Class {name:string;state:State;matches?:boolean}
interface Cohort {name:string;route:string;status:401|202;classes:readonly Class[]}
const c=(name:string,state:State,matches=false):Class=>({name,state,matches});
export const cohorts:readonly Cohort[]=[
  {name:'login',route:'/auth/login',status:401,classes:[c('reference','enabled'),c('control','enabled'),c('absent','absent'),
    c('disabled-wrong','disabled'),c('disabled-match','disabled',true),c('unverified-wrong','unverified'),c('unverified-match','unverified',true),
    c('pending-wrong','pending'),c('pending-match','pending',true)]},
  {name:'initial',route:'/auth/password/initial',status:401,classes:[c('reference','pending'),c('control','pending'),c('absent','absent'),
    c('disabled-wrong','disabledPending'),c('disabled-match','disabledPending',true),c('expired-match','expired',true),c('replaced','replaced',true)]},
  {name:'register',route:'/auth/register',status:202,classes:[c('reference','fresh'),c('control','fresh'),c('duplicate','unverified')]},
  {name:'verification',route:'/auth/verification/request',status:202,classes:[c('reference','unverified'),c('control','unverified'),
    c('absent','absent'),c('disabled','disabled'),c('verified','enabled')]},
  {name:'forgot',route:'/auth/password/forgot',status:202,classes:[c('reference','enabled'),c('control','enabled'),
    c('absent','absent'),c('disabled','disabled'),c('unverified','unverified')]},
];
interface Item {round:number;block:number;warmup:boolean;class:string;body:string;source:string}
interface Sample {round:number;order:number;class:string;duration:number;status:number}
interface RoundResult {round:number;statistics:Record<string,Stats>;comparisons:Record<string,Comparison>}
interface CohortResult {name:string;route:string;rounds:RoundResult[];result:Verdict;warmups:number;samples:number}
class MeasurementIssue extends Error {
  constructor(readonly kind:'functional'|'quota'|'noise'|'environment',readonly details:Record<string,string|number>={}) {
    super('U2: '+kind+'; valores privados omitidos.');
  }
}
function ensure(condition:unknown,kind:MeasurementIssue['kind']='functional',details:Record<string,string|number>={}):asserts condition {
  if(!condition)throw new MeasurementIssue(kind,details);
}
const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const progress=(value:unknown)=>process.stdout.write(JSON.stringify(value)+'\n');
const sourceFor=(round:number,block:number)=>{
  const index=(round-1)*110+block;
  return `127.70.${Math.floor(index/250)}.${index%250+1}`;
};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function canonical(status:number,headers:IncomingMessage['headers'],text:string):string {
  ensure(typeof headers.date==='string'&&new Date(headers.date).toUTCString()===headers.date);
  ensure(headers['set-cookie']===undefined&&headers['retry-after']===undefined);
  ensure(!Object.keys(headers).some(name=>name.startsWith('access-control-allow-')));
  ensure(headers['cache-control']==='no-store'&&headers['referrer-policy']==='no-referrer');
  let body:Record<string,unknown>;
  try{body=JSON.parse(text);}catch{throw new MeasurementIssue('functional');}
  if(status===401) {
    ensure(Object.keys(body).join()==='error');const error=body.error as Record<string,unknown>;
    ensure(error&&Object.keys(error).sort().join()==='code,message,requestId');
    ensure(error.code==='INVALID_CREDENTIALS'&&error.message==='Debes iniciar sesión.'&&typeof error.requestId==='string'&&uuid.test(error.requestId));
    body={error:{...error,requestId:'<uuid-validado>'}};
  }else{
    ensure(status===202&&Object.keys(body).join()==='data');const data=body.data as Record<string,unknown>;
    ensure(data&&Object.keys(data).join()==='message'&&typeof data.message==='string');
  }
  // Comparar cabeceras de seguridad y tipo/longitud. ETag/Connection no son cabeceras de seguridad.
  const selected=['cache-control','referrer-policy','content-type','content-length','content-security-policy',
    'strict-transport-security','x-content-type-options','x-frame-options','permissions-policy'];
  return JSON.stringify({status,body,headers:Object.fromEntries(selected.map(key=>[key,headers[key]??null])),date:'<fecha-validada>'});
}
function readLimit(file:string) {try{return readFileSync(file,'utf8').trim();}catch{return 'no disponible';}}

/** HTTP real, reloj real y un único proceso API. No importa este runner desde producción. */
export async function runEnumeration() {
  ensure(process.env.APP_ENV==='test','environment');
  const output=process.env.U2_OUTPUT;ensure(output?.startsWith('/enumeration-results/'),'environment');
  ensure(!existsSync(output),'environment',{reason:'output-already-exists-preserve-earlier-attempt'});
  mkdirSync(output,{recursive:true});
  const raw=mkdtempSync(path.join(os.tmpdir(),'u2-raw-'));
  const flushRaw=()=>{for(const file of readdirSync(raw))copyFileSync(path.join(raw,file),path.join(output,file));};
  const report:{protocol:typeof protocol;metadata:Record<string,unknown>;cohorts:CohortResult[];result:Verdict;issues:unknown[];checks:Record<string,unknown>}=
    {protocol,metadata:{},cohorts:[],result:'inconcluso',issues:[],checks:{}};
  const save=()=>writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  const started=new Date();let stage='setup';
  const data=await identityDatabase('enumeration_u2');assertFixtureEnvironment(data.environment);
  ensure(/^t_[a-z0-9_]+$/.test(data.environment.databaseSchema),'environment');
  const agents=new Map<string,Agent>();let server:Awaited<ReturnType<typeof us1Http>>|undefined;
  try{
    await assertMailpitAvailable();
    report.metadata={startedAt:started.toISOString(),revision:process.env.U2_REVISION,diffSha256:process.env.U2_DIFF_SHA256,
      lockfileSha256:digest(readFileSync(path.join(repositoryRoot(),'package-lock.json'))),
      runnerSha256:digest(readFileSync(fileURLToPath(import.meta.url))),
      protocolSha256:digest(readFileSync(fileURLToPath(new URL('./enumeration-protocol.ts',import.meta.url)))),
      node:process.version,platform:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,
      memoryBytes:os.totalmem(),cpuMax:readLimit('/sys/fs/cgroup/cpu.max'),memoryMax:readLimit('/sys/fs/cgroup/memory.max'),
      postgres:(await data.database.pool.query('SELECT version() AS version')).rows[0].version,pool:data.environment.poolMax,
      argon2:ARGON2_PARAMETERS,hashConcurrency:HASH_CONCURRENCY,hashQueueMax:HASH_QUEUE_MAX,hashWaitMs:HASH_WAIT_MS,
      topology:'runner y API en un contenedor efímero; TCP loopback; PostgreSQL en db:5432; host Docker compartido con servicios manuales inactivos',
      worker:'detenido antes de calentamientos; Mailpit disponible sin procesar esta cola',
      connection:'HTTP/1.1 keep-alive; Agent por origen, maxSockets=1; una solicitud global en vuelo; timeout=15000 ms',
      sampleStorage:'filesystem local del contenedor durante rondas; copia al host al cerrar ronda/finalizar, sin escrituras al bind mount por muestra',
      sourceSchedule:'330 IP loopback reales; origen=(ronda-1)*110+bloque; mismas IP por clase y ruta; 13 admisiones públicas/IP incluyendo calentamientos',
      clock:'clock_timestamp real, sin reloj congelado ni cambios de cuotas',normalization:'solo Date y requestId UUID validado; comparar cuerpos completos y cabeceras de seguridad/tipo/longitud',
    };
    ensure(typeof process.env.U2_REVISION==='string'&&/^[a-f0-9]{40}$/.test(process.env.U2_REVISION),'environment');
    const credentials=await createPasswordCredentials();const correct=randomBytes(32).toString('base64url');
    const wrong=randomBytes(32).toString('base64url');const newPassword=randomBytes(32).toString('base64url');
    const prepared=new Map<string,Item[]>();const rows:Record<string,unknown>[]=[];
    stage='fixtures';
    for(const [cohortIndex,cohort] of cohorts.entries()) {
      const items:Item[]=[];
      for(let round=1;round<=3;round++)for(let block=0;block<110;block++) {
        const order=shuffled(cohort.classes,protocol.seed+cohortIndex*10000+round*1000+block);
        for(const cls of order){
          const email='u'+randomBytes(16).toString('hex')+'@example.test';
          const body=cohort.name==='login'?{email,password:cls.matches?correct:wrong}
            :cohort.name==='initial'?{email,provisionalPassword:cls.matches?correct:wrong,newPassword}
              :cohort.name==='register'?{name:'Persona ficticia',email,password:correct}:{email};
          items.push({round,block,warmup:block<10,class:cls.name,body:JSON.stringify(body),source:sourceFor(round,block)});
          if(cls.state==='absent'||cls.state==='fresh')continue;
          const pending=['pending','disabledPending','expired'].includes(cls.state);
          const createdAt=new Date(Date.now()-(cls.state==='expired'?25*60*60_000:0));
          const disabled=['disabled','disabledPending'].includes(cls.state);
          rows.push({id:randomUUID(),name:'Persona ficticia',email,status:disabled?'DISABLED':'ACTIVE',
            verified:(['enabled','replaced'].includes(cls.state)||(cls.state==='disabled'&&cohort.name!=='verification')
              ||(cls.state==='pending'&&cohort.name==='login'))?createdAt.toISOString():null,
            pending,createdAt:createdAt.toISOString(),expires:pending?new Date(createdAt.getTime()+24*60*60_000).toISOString():null,hash:null});
        }
      }
      ensure(new Set(items.map(item=>Buffer.byteLength(item.body))).size===1,'environment');
      prepared.set(cohort.name,items);
    }
    for(let index=0;index<rows.length;index+=16){
      const batch=rows.slice(index,index+16);await Promise.all(batch.map(async row=>{row.hash=await credentials.hash(correct);}));
      await data.database.pool.query(`INSERT INTO "User" (id,name,email,"emailCanonical",role,status,"emailVerifiedAt","passwordHash",
        "mustSetPassword","provisionalPasswordHash","provisionalExpiresAt","createdAt","updatedAt","disabledAt")
        SELECT x.id::uuid,x.name,x.email,x.email,'STUDENT',x.status::"AccountStatus",x.verified::timestamptz,
        CASE WHEN x.pending THEN NULL ELSE x.hash END,x.pending,CASE WHEN x.pending THEN x.hash ELSE NULL END,
        x.expires::timestamptz,x."createdAt"::timestamptz,x."createdAt"::timestamptz,
        CASE WHEN x.status='DISABLED' THEN x."createdAt"::timestamptz ELSE NULL END
        FROM jsonb_to_recordset($1::jsonb) AS x(id text,name text,email text,status text,verified text,pending boolean,hash text,expires text,"createdAt" text)`,[JSON.stringify(batch)]);
      if(index%1024===0)progress({stage,prepared:index+batch.length,total:rows.length});
    }
    const ids=rows.map(row=>row.id);rows.length=0;
    const existing=async()=>digest(JSON.stringify((await data.database.pool.query('SELECT * FROM "User" WHERE id=ANY($1::uuid[]) ORDER BY id',[ids])).rows));
    const baseline=await existing();
    server=await us1Http({context:data,clock:undefined});
    await server.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();
    let observed='';
    server.app.getHttpServer().on('request',(incoming:IncomingMessage&{ip?:string})=>{observed=incoming.ip??incoming.socket.remoteAddress??'';});
    async function send(item:Pick<Item,'body'|'source'>,route:string,method='POST') {
      let agent=agents.get(item.source);if(!agent){agent=new Agent({keepAlive:true,maxSockets:1,maxFreeSockets:1});agents.set(item.source,agent);}
      return new Promise<{duration:number;status:number;headers:IncomingMessage['headers'];text:string}>((resolve,reject)=>{
        const before=performance.now();observed='';
        const req=request(new URL(method==='GET'?'/health/live':'/api/v1'+route,server!.url),{method,localAddress:item.source,agent,
          headers:method==='GET'?{}:{Origin:data.environment.appOrigin,'X-CSRF-Protection':'1','Content-Type':'application/json',
            'Content-Length':Buffer.byteLength(item.body),Accept:'application/json'}},response=>{
          const chunks:Buffer[]=[];response.on('data',chunk=>chunks.push(Buffer.from(chunk)));
          response.on('end',()=>{
            if(observed!==item.source){reject(new MeasurementIssue('environment',{reason:'backend-source-mismatch'}));return;}
            resolve({duration:performance.now()-before,status:response.statusCode??0,headers:response.headers,text:Buffer.concat(chunks).toString('utf8')});
          });response.on('error',()=>reject(new MeasurementIssue('environment',{reason:'response-error'})));
        });req.setTimeout(15000,()=>req.destroy());req.on('error',()=>reject(new MeasurementIssue('environment',{reason:'network-or-timeout'})));
        req.end(method==='POST'?item.body:undefined);
      });
    }
    stage='source-preflight';
    for(let round=1;round<=3;round++)for(let block=0;block<110;block++)ensure((await send({source:sourceFor(round,block),body:''},'', 'GET')).status===200,'environment');
    report.checks.realSourcesVerified=330;report.checks.bodyBytes=Object.fromEntries(cohorts.map(cohort=>[cohort.name,Buffer.byteLength(prepared.get(cohort.name)![0].body)]));
    report.metadata.measurementStartedAt=new Date().toISOString();save();
    for(const cohort of cohorts){
      stage=cohort.name;const result:CohortResult={name:cohort.name,route:cohort.route,rounds:[],result:'inconcluso',warmups:0,samples:0};report.cohorts.push(result);
      let reference:string|undefined;
      for(let round=1;round<=3;round++){
        const samples:Sample[]=[];let order=0;
        for(const item of prepared.get(cohort.name)!.filter(value=>value.round===round)){
          const response=await send(item,cohort.route);
          const sample={round,order:++order,class:item.class,duration:response.duration,status:response.status};
          appendFileSync(path.join(raw,cohort.name+(item.warmup?'-warmup': '-samples')+'.jsonl'),JSON.stringify(sample)+'\n');
          if(response.status===429)throw new MeasurementIssue('quota',{cohort:cohort.name,round,class:item.class,retryAfter:String(response.headers['retry-after']??'ausente')});
          if(response.status>=500)throw new MeasurementIssue('environment',{cohort:cohort.name,round,class:item.class,status:response.status});
          ensure(response.status===cohort.status,'functional',{cohort:cohort.name,round,class:item.class,status:response.status});
          const normalized=canonical(response.status,response.headers,response.text);reference??=normalized;
          ensure(normalized===reference,'functional',{cohort:cohort.name,round,class:item.class,reason:'public-response-diff'});
          if(item.warmup)result.warmups++;else{samples.push(sample);result.samples++;}
          await pause(protocol.pauseMs);
          if(order%100===0)progress({stage,round,requests:order,warmups:result.warmups,samples:result.samples});
        }
        const stats=Object.fromEntries(cohort.classes.map(cls=>[cls.name,statistics(samples.filter(value=>value.class===cls.name).map(value=>value.duration))]));
        const comparisons=Object.fromEntries(cohort.classes.filter(cls=>cls.name!=='reference').map(cls=>[cls.name,comparison(stats.reference,stats[cls.name])]));
        result.rounds.push({round,statistics:stats,comparisons});
        ensure(await existing()===baseline,'functional',{cohort:cohort.name,reason:'existing-accounts-changed'});
        ensure((await data.database.pool.query('SELECT count(*)::int AS n FROM "Session"')).rows[0].n===0,'functional',{reason:'unexpected-session'});
        flushRaw();save();progress({stage,round,statistics:stats,comparisons});
      }
      result.result=verdict(result.rounds.map(round=>round.comparisons));save();progress({stage,result:result.result});
    }
    stage='state-check';
    const counts=(await data.database.pool.query(`SELECT
      (SELECT count(*)::int FROM "User") AS users,(SELECT count(*)::int FROM "Session") AS sessions,
      (SELECT count(*)::int FROM "ActionToken") AS tokens,(SELECT count(*)::int FROM "MailDelivery") AS deliveries,
      (SELECT count(*)::int FROM "MailDelivery" WHERE status<>'PENDING') AS processed,
      (SELECT count(*)::int FROM "AuditEvent") AS audit,
      EXISTS(SELECT 1 FROM "SystemState" WHERE "bootstrapCompletedAt" IS NOT NULL) AS bootstrap`)).rows[0];
    ensure(counts.users===ids.length+660&&counts.sessions===0&&counts.tokens===1980&&counts.deliveries===1980&&counts.processed===0&&counts.audit===0&&!counts.bootstrap);
    const origins=(await data.database.pool.query(`SELECT count(*)::int AS n,min(events)::int AS min,max(events)::int AS max FROM
      (SELECT b.key,count(e.id) AS events FROM "RateBucket" b LEFT JOIN "RateEvent" e ON e."bucketKey"=b.key
      WHERE b.scope='MAIL_ORIGIN' AND b.phase='ADMISSION' GROUP BY b.key) x`)).rows[0];
    ensure(origins.n===330&&origins.min===13&&origins.max===13);
    report.checks={...report.checks,counts,mailOrigins:origins,existingAccountsUnchanged:await existing()===baseline};
    report.result=report.cohorts.some(value=>value.result==='fallo')?'fallo':report.cohorts.every(value=>value.result==='sin señal detectada bajo este protocolo')
      ?'sin señal detectada bajo este protocolo':'inconcluso';
  }catch(error){
    const issue=error instanceof MeasurementIssue?{stage,kind:error.kind,details:error.details}:{stage,kind:'environment',details:{reason:'error-details-withheld'}};
    report.issues.push(issue);report.result=issue.kind==='functional'?'fallo':'inconcluso';progress(issue);
  }finally{
    flushRaw();report.metadata.finishedAt=new Date().toISOString();report.metadata.elapsedMs=Date.now()-started.getTime();save();
    for(const agent of agents.values())agent.destroy();await server?.close();await data.cleanup();
    rmSync(raw,{recursive:true,force:true});
  }
  progress({result:report.result,issues:report.issues,cohorts:report.cohorts.map(value=>({name:value.name,result:value.result,samples:value.samples,warmups:value.warmups}))});
  return report;
}
