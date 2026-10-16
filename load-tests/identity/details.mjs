import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';

// Postprocesado sin IO contra la API/BD: no altera el ensayo ni sus umbrales.
const name=process.argv[2];
if(!/^[a-z0-9_-]+$/.test(name))throw new Error('Nombre inválido.');
const root='/load-private/',meta=JSON.parse(readFileSync(root+name+'-meta.json','utf8'));
let epoch=null,lastLoginResponseSeconds=null,lastFirstActivitySeconds=null;const firstSlots=new Set();
const operations={},stages={},peaks={hashActive:0,duplicateSessions:0,duplicateSecrets:0};
const durations={};
for await(const line of createInterface({input:createReadStream(root+name+'-raw.jsonl'),crlfDelay:Infinity})){
  const p=JSON.parse(line);if(p.type!=='Point')continue;
  if(p.metric==='identity_scenario_start_ms')epoch=p.data.value;
  if(epoch!==null&&p.metric==='identity_sessions_started'&&p.data.value>0)lastLoginResponseSeconds=Math.max(lastLoginResponseSeconds??0,(Date.parse(p.data.time)-epoch)/1000);
  if(epoch!==null&&p.metric==='identity_active_slot'&&!firstSlots.has(p.data.tags.slot)){
    firstSlots.add(p.data.tags.slot);lastFirstActivitySeconds=Math.max(lastFirstActivitySeconds??0,(Date.parse(p.data.time)-epoch)/1000);
  }
  if(p.metric!=='http_req_duration')continue;
  const {name:operation,status}=p.data.tags;
  if(!['login','me','logout','revocation-check'].includes(operation))throw new Error('Operación inesperada.');
  const item=operations[operation]??={statuses:{},requests:0};
  item.requests++;item.statuses[status]=(item.statuses[status]??0)+1;
  (durations[operation]??=[]).push(p.data.value);
  if(epoch!==null&&meta.scenario==='authentication'){
    const elapsed=(Date.parse(p.data.time)-epoch)/1000;
    const stage=elapsed<120?'10':elapsed<240?'25':elapsed<360?'50':elapsed<480?'100':'grace';
    const s=stages[stage]??={requests:0,statuses:{},loginMs:[]};s.requests++;
    s.statuses[status]=(s.statuses[status]??0)+1;if(operation==='login')s.loginMs.push(p.data.value);
  }
}
function percentiles(values){
  values.sort((a,b)=>a-b);
  const at=p=>{if(!values.length)return null;const n=(values.length-1)*p,i=Math.floor(n);return values[i]+(values[Math.ceil(n)]-values[i])*(n-i);};
  return {count:values.length,p50:at(.5),p95:at(.95),p99:at(.99),max:values.at(-1)??null};
}
for(const [op,values] of Object.entries(durations))operations[op].ms=percentiles(values);
for(const s of Object.values(stages)){s.loginMs=percentiles(s.loginMs);}
const native=JSON.parse(readFileSync(root+name+'.json','utf8'));
const count=metric=>native.metrics[metric]?.values.count??0;
const total=Object.values(operations).reduce((n,op)=>n+op.requests,0);
assert.equal(total,count('http_reqs'),'Conteo HTTP crudo/resumen diferente');
assert.equal(total-(operations['revocation-check']?.requests??0),count('identity_valid_traffic_requests'));
assert.equal(operations.logout?.statuses['204']??0,count('identity_logouts_completed'));
assert.equal(Object.values(operations).reduce((n,op)=>n+(op.statuses['503']??0),0),count('identity_503'));
for(const op of ['login','me'])for(const [key,metric] of [['p50','p(50)'],['p95','p(95)'],['p99','p(99)']]){
  assert.ok(Math.abs(operations[op].ms[key]-native.metrics[`identity_${op}_ms`].values[metric])<1e-6,'Percentil crudo/resumen diferente');
}
let samples=0,first=null,last=null;
for await(const line of createInterface({input:createReadStream(root+'server.jsonl'),crlfDelay:Infinity})){
  const s=JSON.parse(line),t=Date.parse(s.at);
  if(t<Date.parse(meta.startedAt)||t>Date.parse(meta.finishedAt))continue;
  samples++;first??=s.at;last=s.at;peaks.hashActive=Math.max(peaks.hashActive,s.hash.active);
  for(const c of Object.values(s.groups)){
    peaks.duplicateSessions=Math.max(peaks.duplicateSessions,c.sessions-c.users);
    peaks.duplicateSecrets=Math.max(peaks.duplicateSecrets,c.sessions-c.secrets);
  }
}
const result={name,rawCrossChecks:true,lastLoginResponseSeconds,lastFirstActivitySeconds,firstSlotsValidated:firstSlots.size,operations,authenticationStages:stages,peaks,samples,first,last};
writeFileSync(root+name+'-details.json',JSON.stringify(result,null,2),{mode:0o600});
process.stdout.write(JSON.stringify(result)+'\n');
