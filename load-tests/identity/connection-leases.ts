import { performance } from 'node:perf_hooks';
import type { Pool,PoolClient } from 'pg';

type Kind='transaction'|'snapshot'|'profile'|'other'|'unused';
type Lease={start:number;kind:Kind;queries:number};
function firstKind(input:unknown):Kind {
  const sql=typeof input==='string'?input:typeof input==='object'&&input!==null&&'text' in input?String(input.text):'';
  if(/^\s*BEGIN\b/i.test(sql))return 'transaction';
  if(sql.includes('json_build_object'))return 'snapshot';
  if(sql.includes('FROM "User"'))return 'profile';
  return 'other';
}
function stats(values:number[]){
  const a=[...values].sort((a,b)=>a-b),p=(q:number)=>{const n=(a.length-1)*q,i=Math.floor(n);return a.length?a[i]!+(a[Math.ceil(n)]!-a[i]!)*(n-i):0;};
  return {count:a.length,total:a.reduce((a,b)=>a+b,0),p50:p(.5),p95:p(.95),p99:p(.99),max:a.at(-1)??0};
}
/** Solo benchmark optativo: acquire→release, sin sustituir release ni almacenar SQL/datos. */
export class ConnectionLeases {
  private enabled=true;
  private current=new WeakMap<PoolClient,Lease>();
  private wrapped=new WeakSet<PoolClient>();
  private values=new Map<Kind,{heldMs:number[];queries:number[]}>();
  private active=0;
  private releaseErrors=0;
  constructor(pool:Pool){
    pool.on('acquire',(client:PoolClient)=>{
      if(!this.enabled)return;
      this.current.set(client,{start:performance.now(),kind:'unused',queries:0});this.active++;
      if(this.wrapped.has(client))return;
      this.wrapped.add(client);
      const original=client.query,current=this.current;
      client.query=function(this:PoolClient,...args:unknown[]){
        const lease=current.get(this);
        if(lease){if(lease.queries===0)lease.kind=firstKind(args[0]);lease.queries++;}
        return Reflect.apply(original,this,args);
      } as typeof client.query;
    });
    pool.on('release',(error:Error|undefined,client:PoolClient)=>{
      const lease=this.current.get(client);if(!lease)return;
      this.current.delete(client);this.active--;if(error)this.releaseErrors++;
      let values=this.values.get(lease.kind);if(!values){values={heldMs:[],queries:[]};this.values.set(lease.kind,values);}
      values.heldMs.push(performance.now()-lease.start);values.queries.push(lease.queries);
    });
  }
  stop(){
    this.enabled=false;
    if(this.active!==0)throw new Error('Retenciones aún activas al cerrar la medición.');
    return {active:this.active,releaseErrors:this.releaseErrors,kinds:Object.fromEntries([...this.values].map(([kind,values])=>[kind,{heldMs:stats(values.heldMs),queries:stats(values.queries)}]))};
  }
}
