import {readFileSync,createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
const mode=process.argv[2],file=process.argv[3];
const numericRoundoff=[];
const delta=(a,b)=>{
 const result={};for(const [key,value] of Object.entries(b??{}))if(!['numbackends','op_bytes'].includes(key)&&typeof value==='number'&&typeof a?.[key]==='number'){
   const difference=value-a[key];
   if(difference<0){
    if(-difference>8*Number.EPSILON*Math.max(1,Math.abs(value),Math.abs(a[key])))throw Error(`Contador ${key} decrece: ${a[key]} -> ${value}. No comparar deltas.`);
    numericRoundoff.push({key,before:a[key],after:value,difference});result[key]=0;
   }else result[key]=difference;
 }return result;
};
function compare(a,b){
 if(!a||!b)throw Error('Faltan muestras de motor.');
 for(const key of ['wal','database'])if(a[key].stats_reset!==b[key].stats_reset)throw Error('Estadísticas reiniciadas.');
 if(a.statementsInfo&&b.statementsInfo&&(a.statementsInfo.stats_reset!==b.statementsInfo.stats_reset||a.statementsInfo.dealloc!==b.statementsInfo.dealloc))throw Error('Estadísticas SQL reiniciadas o expulsadas.');
 const statements=(b.statements??[]).map(row=>{
  const before=a.statements?.find(x=>x.kind===row.kind)??{};
  const {maxExecutionMs,...values}=row;const d=delta(Object.fromEntries(Object.keys(values).map(k=>[k,before[k]??0])),values);
  return {kind:row.kind,...d,meanExecutionMs:d.calls?d.executionMs/d.calls:null,maxExecutionMsCumulative:maxExecutionMs};
 });
 return {first:a.at,last:b.at,settings:b.settings,statementsInfo:b.statementsInfo??null,statements,database:delta(a.database,b.database),wal:delta(a.wal,b.wal),
  io:(b.io??[]).map(row=>{const before=a.io?.find(x=>x.backend_type===row.backend_type&&x.object===row.object&&x.context===row.context);
   if(!before||before.stats_reset!==row.stats_reset)throw Error('Ventana IO incompatible.');
   return {backend_type:row.backend_type,object:row.object,context:row.context,op_bytes:row.op_bytes,...delta(before,row)};
  })};
}
if(mode==='benchmark'){
 const b=JSON.parse(readFileSync(file,'utf8'));const engine=compare(b.engineBefore,b.engineAfter);console.log(JSON.stringify({name:b.name,concurrentMs:b.concurrentMs,client:b.diagnostic.metrics,engine,numericRoundoff}));
}else if(mode==='run'){
 const meta=JSON.parse(readFileSync(process.argv[4],'utf8').replace(/^\uFEFF/,'')),samples=[];
 for await(const line of createInterface({input:createReadStream(file),crlfDelay:Infinity})){const s=JSON.parse(line);if(s.engine&&Date.parse(s.at)<=Date.parse(meta.finishedAt)+10000)samples.push(s.engine);}
 const a=samples.filter(s=>Date.parse(s.at)<=Date.parse(meta.startedAt)).at(-1)??samples[0],b=samples.filter(s=>Date.parse(s.at)<=Date.parse(meta.finishedAt)).at(-1);
 const engine=compare(a,b);console.log(JSON.stringify({name:process.argv[4],coverage:{startedAt:meta.startedAt,finishedAt:meta.finishedAt,first:a?.at,last:b?.at},engine,numericRoundoff}));
}else throw Error('Usar benchmark <archivo> o run <server.jsonl> <meta.json>.');
