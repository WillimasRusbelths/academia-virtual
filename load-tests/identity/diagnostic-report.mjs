import { readFileSync,createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
const root=process.argv[2],name=process.argv[3];
if(!root||!/^[a-z0-9_-]+$/.test(name??''))throw new Error('Directorio y ejecución requeridos.');
const read=suffix=>JSON.parse(readFileSync(path.join(root,name+suffix),'utf8').replace(/^\uFEFF/,''));
const meta=read('-meta.json'),resources=readFileSync(path.join(root,name+'-resources.jsonl'),'utf8').replace(/^\uFEFF/,'').trim().split('\n').map(x=>JSON.parse(x));
const cpu={},lastActiveIo={};
for(const s of resources)for(const entry of s.docker){
  if(Number(entry.PIDs)<=0)continue;
  const role=entry.Name.endsWith('-api-1')?'api':entry.Name.endsWith('-db-1')?'database':'generator';
  lastActiveIo[role]={at:s.at,blockIo:entry.BlockIO,networkIo:entry.NetIO};
}
for(const role of ['api','database','generator']){
  const samples=resources.filter(s=>s.cgroups?.[role]);if(samples.length<2)continue;
  const first=samples[0],last=samples.at(-1),a=first.cgroups[role],b=last.cgroups[role],delta={};
  for(const key of ['usage_usec','nr_periods','nr_throttled','throttled_usec'])delta[key]=b[key]-a[key];
  cpu[role]={samples:samples.length,first:first.at,last:last.at,delta};
}
let maxPublicationDelayMs=null,maxEventLoopWindowMs=null,plateauSamples=0,plateauFull=0,legacyPlateauSamples=0,legacyPlateauFull=0;
const report=read('-report.json');
for await(const line of createInterface({input:createReadStream(path.join(root,'server.jsonl')),crlfDelay:Infinity})){
  const s=JSON.parse(line),time=Date.parse(s.at);if(time<Date.parse(meta.startedAt)||time>Date.parse(meta.finishedAt))continue;
  const statement=s.groupSamples?.sessions.statementStartedAt;if(statement)maxPublicationDelayMs=Math.max(maxPublicationDelayMs??0,time-Date.parse(statement));
  if(s.diagnostics)maxEventLoopWindowMs=Math.max(maxEventLoopWindowMs??0,s.diagnostics.lag.maxMs);
  const counts=s.groups.sessions,full=counts.sessions===1000&&counts.users===1000&&counts.secrets===1000&&counts.recent===1000;
  const p=(Date.parse(statement??s.at)-report.scenarioEpoch)/1000,l=(time-report.scenarioEpoch)/1000;
  if(meta.scenario==='sessions'&&p>=300&&p<900){plateauSamples++;if(full)plateauFull++;}
  if(meta.scenario==='sessions'&&l>=300&&l<900){legacyPlateauSamples++;if(full)legacyPlateauFull++;}
}
process.stdout.write(JSON.stringify({name,cpu,lastActiveIo,maxPublicationDelayMs,maxEventLoopWindowMs,plateauSamples,plateauFull,legacyPlateauSamples,legacyPlateauFull})+'\n');
