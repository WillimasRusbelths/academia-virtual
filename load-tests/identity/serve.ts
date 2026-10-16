import 'reflect-metadata';
import { appendFileSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { Request,Response,NextFunction } from 'express';
import { AppModule } from '../../apps/api/dist/src/app.module.js';
import { configureTransport } from '../../apps/api/dist/src/http/transport.js';
import { loadEnvironment } from '../../apps/api/dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../apps/api/dist/src/infrastructure/database/database.js';
import { credentialMetrics, ARGON2_PARAMETERS, HASH_CONCURRENCY, HASH_QUEUE_MAX, HASH_WAIT_MS } from '../../apps/api/dist/src/modules/identity/infrastructure/credentials.js';
import { assertLoadTarget,readManifest } from './fixtures.ts';
import { sessionCounts,stopReason } from './observe.ts';

const environment=loadEnvironment(),database=createDatabase(environment);await assertLoadTarget(environment,database.pool);
const manifest=readManifest('/load-private/fixtures',environment);
const app=await NestFactory.create(AppModule.forRoot(environment,database),{logger:false,bodyParser:false});
let inFlight=0,peakInFlight=0;
app.use((request:Request,response:Response,next:NextFunction)=>{
  if(request.path.startsWith('/api/v1/')){inFlight++;peakInFlight=Math.max(peakInFlight,inFlight);let done=false;
    const finish=()=>{if(!done){done=true;inFlight--;}};response.once('finish',finish);response.once('close',finish);}
  next();
});
configureTransport(app,environment);await app.listen(3000,'0.0.0.0');
writeFileSync('/load-private/settings.json',JSON.stringify({node:process.version,installedLockSha256:createHash('sha256').update(readFileSync('/workspace/package-lock.json')).digest('hex'),
  postgres:(await database.pool.query('SHOW server_version')).rows[0].server_version,pool:environment.poolMax,argon2:ARGON2_PARAMETERS,hashConcurrency:HASH_CONCURRENCY,hashQueue:HASH_QUEUE_MAX,hashWaitMs:HASH_WAIT_MS}),{mode:0o600});
let pending=false,stopped=false;
const timer=setInterval(()=>{if(pending||stopped)return;pending=true;void sample().catch(()=>{
  writeFileSync('/load-private/stop.json',JSON.stringify({reason:'MONITOR_UNAVAILABLE',at:new Date().toISOString()}),{mode:0o600});
}).finally(()=>{pending=false;});},1000);
async function sample(){
  const groups=await sessionCounts(database.pool,manifest);
  const activity=(await database.pool.query(`SELECT count(*)::int AS connections,
    (SELECT count(*)::int FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND NOT granted) AS "lockWaiters",
    count(*) FILTER(WHERE state='active')::int AS active FROM pg_stat_activity WHERE datname=current_database()`)).rows[0];
  const hash=credentialMetrics();let memoryCurrent=0,memoryLimit=0;
  if(existsSync('/sys/fs/cgroup/memory.current')){memoryCurrent=Number(readFileSync('/sys/fs/cgroup/memory.current','utf8'));memoryLimit=Number(readFileSync('/sys/fs/cgroup/memory.max','utf8'));}
  const event={at:new Date().toISOString(),hash,http:{active:inFlight,peak:peakInFlight},pool:{total:database.pool.totalCount,idle:database.pool.idleCount,waiting:database.pool.waitingCount},groups,activity,memoryCurrent,memoryLimit};
  appendFileSync('/load-private/server.jsonl',JSON.stringify(event)+'\n',{mode:0o600});
  const reason=stopReason(hash.waitMaxMs,memoryCurrent,memoryLimit);
  if(reason){
    writeFileSync('/load-private/stop.json',JSON.stringify({reason,at:event.at}),{mode:0o600});
    stopped=true;await app.close();
  }
}
async function shutdown(){stopped=true;clearInterval(timer);while(pending)await new Promise(resolve=>setTimeout(resolve,25));await app.close();await database.close();}
process.once('SIGTERM',()=>{void shutdown().finally(()=>{process.exitCode=0;});});
process.once('SIGINT',()=>{void shutdown().finally(()=>{process.exitCode=0;});});
