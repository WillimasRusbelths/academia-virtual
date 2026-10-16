import { readFileSync,existsSync,createReadStream,writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fullPlateau } from './observe.ts';
const name=process.argv[2];if(!/^[a-z0-9_-]+$/.test(name))throw new Error('Nombre inválido.');
const file=suffix=>`/load-private/${name}${suffix}`;
const metadata=JSON.parse(readFileSync(file('-meta.json'),'utf8'));
const k6=existsSync(file('.json'))?JSON.parse(readFileSync(file('.json'),'utf8')):null;
const values=metric=>k6?.metrics?.[metric]?.values??null;
const errorValues=values('unexpected_errors');
const slots=new Set();let peakVUs=0,scenarioEpoch=null;
if(existsSync(file('-raw.jsonl'))){for await(const line of createInterface({input:createReadStream(file('-raw.jsonl')),crlfDelay:Infinity})){
  const point=JSON.parse(line);if(point.type!=='Point')continue;
  if(point.metric==='vus')peakVUs=Math.max(peakVUs,point.data.value);
  if(point.metric==='identity_scenario_start_ms')scenarioEpoch=point.data.value;
  if(point.metric==='identity_active_slot'&&point.data.tags.phase==='plateau')slots.add(point.data.tags.slot);
}}
let samples=0,plateauSamples=0,fullSamples=0,maxGapMs=0,lastTime=0,peakHttp=0,hashWaitMaxMs=0,hashWorkMaxMs=0,peakHashQueue=0,peakPoolWait=0;
let peakSessions=0,peakUsers=0,peakRecent=0,plateauFirst=null,plateauLast=null,lastHash=null,peakConnections=0,peakLockWaiters=0;
const peakSessionsByGroup={sessions:0,warmup:0,authentication:0};
const started=Date.parse(metadata.startedAt),finished=Date.parse(metadata.finishedAt);
if(existsSync('/load-private/server.jsonl'))for await(const line of createInterface({input:createReadStream('/load-private/server.jsonl'),crlfDelay:Infinity})){
  const sample=JSON.parse(line),time=Date.parse(sample.at);if(time<started||time>finished)continue;samples++;
  if(lastTime)maxGapMs=Math.max(maxGapMs,time-lastTime);lastTime=time;
  peakHttp=Math.max(peakHttp,sample.http.peak);hashWaitMaxMs=Math.max(hashWaitMaxMs,sample.hash.waitMaxMs);
  lastHash=sample.hash;peakConnections=Math.max(peakConnections,sample.activity.connections);peakLockWaiters=Math.max(peakLockWaiters,sample.activity.lockWaiters);
  hashWorkMaxMs=Math.max(hashWorkMaxMs,sample.hash.workMaxMs);peakHashQueue=Math.max(peakHashQueue,sample.hash.peakQueued);peakPoolWait=Math.max(peakPoolWait,sample.pool.waiting);
  peakSessions=Math.max(peakSessions,sample.groups.sessions.sessions);peakUsers=Math.max(peakUsers,sample.groups.sessions.users);peakRecent=Math.max(peakRecent,sample.groups.sessions.recent);
  for(const group of Object.keys(peakSessionsByGroup))peakSessionsByGroup[group]=Math.max(peakSessionsByGroup[group],sample.groups[group].sessions);
  const elapsed=(time-(scenarioEpoch??started))/1000;if(metadata.scenario==='sessions'&&elapsed>=300&&elapsed<900){plateauSamples++;plateauFirst??=sample.at;plateauLast=sample.at;if(fullPlateau(sample.groups.sessions))fullSamples++;}
}
const before=JSON.parse(readFileSync(file('-before.json'),'utf8')),after=JSON.parse(readFileSync(file('-after.json'),'utf8'));
const cleanup=JSON.parse(readFileSync(file('-cleanup.json'),'utf8'));
const requiredDurationSeconds={'sessions-warmup':60,sessions:1020,authentication:480}[metadata.scenario]??null;
const executionComplete=requiredDurationSeconds!==null&&[0,99].includes(metadata.exitCode)&&!metadata.stopReason&&!!k6
  &&k6.state.testRunDurationMs>=requiredDurationSeconds*1000;
const thresholdsPassed=k6?Object.values(k6.metrics).every(metric=>Object.values(metric.thresholds??{}).every(threshold=>threshold.ok)):null;
const result={kind:metadata.scenario,exitCode:metadata.exitCode,apiExitCode:metadata.apiExitCode,durationSeconds:(finished-started)/1000,generatorDurationSeconds:k6?.state?.testRunDurationMs/1000,peakVUs,
  requests:values('http_reqs'),validTraffic:values('identity_valid_traffic_requests'),meMs:values('identity_me_ms'),loginMs:values('identity_login_ms'),
  bytesSent:values('data_sent'),bytesReceived:values('data_received'),
  unexpectedErrors:errorValues?{rate:errorValues.rate,unexpected:errorValues.passes,total:errorValues.passes+errorValues.fails}:null,identityMismatch:values('identity_mismatch'),unavailable503:values('identity_503'),
  completedLogouts:values('identity_logouts_completed'),revocationFailures:values('revocation_failures'),
  samples,plateauSamples,fullPlateauSamples:fullSamples,maxSamplingGapMs:maxGapMs,uniquePlateauSlots:slots.size,
  peakHttp,peakSessions,peakUsers,peakRecent,peakSessionsByGroup,hashWaitMaxMs,hashWorkMaxMs,peakHashQueue,peakPoolWait,
  hashAtLastSample:lastHash,peakConnections,peakLockWaiters,resources:metadata.resources,resourceSamples:metadata.resourceSamples,
  settings:existsSync('/load-private/settings.json')?JSON.parse(readFileSync('/load-private/settings.json','utf8')):null,
  accountsBefore:before.accounts,accountsAfter:after.accounts,accountsUnchanged:before.usersDigest===after.usersDigest,
  singletonUnchanged:before.singletonDigest===after.singletonDigest,cleanup,
  k6SummaryPresent:!!k6,requiredDurationSeconds,executionComplete,thresholdsPassed,completeProfile:executionComplete,
  thousandSessionsObserved:fullSamples>0,
  plateauAllSamplesFull:plateauSamples>0&&fullSamples===plateauSamples,plateauFirst,plateauLast,scenarioEpoch,
  stop:metadata.stopReason??(existsSync('/load-private/stop.json')?JSON.parse(readFileSync('/load-private/stop.json','utf8')):null)};
writeFileSync(file('-report.json'),JSON.stringify(result,null,2),{mode:0o600});process.stdout.write(JSON.stringify(result)+'\n');
