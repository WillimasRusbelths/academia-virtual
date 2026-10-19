import {readFileSync} from 'node:fs';
import path from 'node:path';
const profile=JSON.parse(readFileSync(process.argv[2],'utf8'));
const nodes=new Map(profile.nodes.map(n=>[n.id,n])),counts=new Map();
for(const id of profile.samples??[])counts.set(id,(counts.get(id)??0)+1);
const grouped=new Map();
for(const [id,count] of counts){
 const frame=nodes.get(id)?.callFrame;if(!frame)throw Error('Nodo de perfil ausente.');
 const file=frame.url?.startsWith('file:')?new URL(frame.url).pathname:frame.url;
 const key=JSON.stringify([frame.functionName,file?.startsWith('/workspace/')?file.slice('/workspace/'.length):path.basename(file??''),frame.lineNumber]);
 grouped.set(key,(grouped.get(key)??0)+count);
}
const samples=profile.samples?.length??0;if(!samples)throw Error('Perfil sin muestras.');
const top=[...grouped].map(([key,count])=>{const [fn,file,line]=JSON.parse(key);return {fn,file,line:line+1,samples:count,percent:100*count/samples};}).sort((a,b)=>b.samples-a.samples);
const deltas=profile.timeDeltas??[];
console.log(JSON.stringify({samples,windowMs:(profile.endTime-profile.startTime)/1000,
 maxSampleGapMs:deltas.reduce((max,x)=>Math.max(max,x),0)/1000,
 gapsOver10ms:deltas.filter(x=>x>10000).length,top:top.slice(0,40),
 note:'Porcentajes de muestras, incluye idle/GC; no son milisegundos CPU ni percentiles HTTP. Ventana de proceso completa.'}));
