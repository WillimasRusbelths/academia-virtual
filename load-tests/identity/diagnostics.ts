import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync,writeFileSync } from 'node:fs';
import { monitorEventLoopDelay,performance } from 'node:perf_hooks';
import type { Pool,PoolClient } from 'pg';
import type { Request,Response,NextFunction } from 'express';

type Context={route:string;queries:number;queryMs:number;poolWaitMs:number};
function stats(values:number[]){
  values.sort((a,b)=>a-b);const p=(q:number)=>{const n=(values.length-1)*q,i=Math.floor(n);return values.length?values[i]!+(values[Math.ceil(n)]!-values[i]!)*(n-i):0;};
  return {count:values.length,total:values.reduce((a,b)=>a+b,0),p50:p(.5),p95:p(.95),p99:p(.99),max:values.at(-1)??0};
}
export function cpuStat(){return Object.fromEntries(readFileSync('/sys/fs/cgroup/cpu.stat','utf8').trim().split('\n').map(line=>{const [k,v]=line.split(' ');return [k,Number(v)];}));}
function queryClass(input:unknown){
  const text=typeof input==='string'?input:typeof input==='object'&&input!==null&&'text' in input?String(input.text):'';
  const verb=text.trim().split(/\s+/)[0]?.toUpperCase()??'OTHER';
  if(['BEGIN','COMMIT','ROLLBACK','SAVEPOINT','RELEASE'].includes(verb))return verb;
  if(/FOR UPDATE/.test(text))return text.includes('FROM "User"')?'LOCK_USER':'LOCK_SESSION';
  if(text.includes('json_build_object'))return 'SESSION_SNAPSHOT';
  if(text.includes('"Session"'))return verb+'_SESSION';
  if(text.includes('"RateBucket"')||text.includes('"RateEvent"'))return verb+'_RATE';
  if(text.includes('"User"'))return verb+'_USER';
  return 'OTHER';
}
/** Solo ensayo: mide cliente pg y proceso; nunca conserva SQL, parámetros o identidades. */
export class Diagnostics {
  private scope=new AsyncLocalStorage<Context|undefined>();
  private clients=new WeakSet<PoolClient>();
  private values=new Map<string,number[]>();
  private lag=monitorEventLoopDelay({resolution:20});
  private initialCpu=cpuStat();
  private initialUsage=process.cpuUsage();
  private name:string;
  constructor(name:string){this.name=name;if(!/^[a-z0-9_-]+$/.test(name))throw new Error('Nombre diagnóstico inválido.');this.lag.enable();}
  private add(key:string,value:number){let list=this.values.get(key);if(!list){list=[];this.values.set(key,list);}list.push(value);}
  private queryDone(ctx:Context|undefined,kind:string,start:number){const elapsed=performance.now()-start;this.add((ctx?.route??'background')+'/sql/'+kind,elapsed);if(ctx){ctx.queries++;ctx.queryMs+=elapsed;}}
  private wrapClient(client:PoolClient){
    if(this.clients.has(client))return;this.clients.add(client);const original=client.query;
    const current=()=>this.scope.getStore();
    const done=(ctx:Context|undefined,kind:string,start:number)=>this.queryDone(ctx,kind,start);
    const resume=(ctx:Context|undefined,cb:()=>unknown)=>this.scope.run(ctx,cb);
    client.query=function(this:PoolClient,...args:unknown[]){
      const ctx=current(),start=performance.now(),kind=queryClass(args[0]);
      const last=args.length-1,cb=args[last];
      if(typeof cb==='function'){
        args[last]=(...values:unknown[])=>{done(ctx,kind,start);return resume(ctx,()=>Reflect.apply(cb,undefined,values));};
        return Reflect.apply(original,this,args);
      }
      const result=Reflect.apply(original,this,args) as Promise<unknown>;
      return result.then(value=>{done(ctx,kind,start);return value;},error=>{done(ctx,kind,start);throw error;});
    } as typeof client.query;
  }
  install(pool:Pool){
    const original=pool.connect,current=()=>this.scope.getStore(),resume=(ctx:Context|undefined,cb:()=>unknown)=>this.scope.run(ctx,cb);
    const acquired=(ctx:Context|undefined,start:number,client:PoolClient)=>{this.wrapClient(client);const elapsed=performance.now()-start;this.add((ctx?.route??'background')+'/pool',elapsed);if(ctx)ctx.poolWaitMs+=elapsed;};
    pool.connect=function(this:Pool,...args:unknown[]){
      const ctx=current(),start=performance.now();
      const cb=args[0];
      if(typeof cb==='function')return Reflect.apply(original,this,[(...values:unknown[])=>{if(values[1])acquired(ctx,start,values[1] as PoolClient);return resume(ctx,()=>Reflect.apply(cb,undefined,values));}]);
      return (Reflect.apply(original,this,args) as Promise<PoolClient>).then(client=>{acquired(ctx,start,client);return client;});
    } as typeof pool.connect;
  }
  private context(route:string){return {route,queries:0,queryMs:0,poolWaitMs:0};}
  private finish(ctx:Context,start:number){for(const [key,value] of Object.entries({wall:performance.now()-start,queries:ctx.queries,sqlTotal:ctx.queryMs,poolTotal:ctx.poolWaitMs}))this.add(ctx.route+'/'+key,value);}
  middleware(request:Request,response:Response,next:NextFunction){
    const route=request.path==='/api/v1/me'?'me':request.path==='/api/v1/auth/login'?'login':request.path==='/api/v1/auth/logout'?'logout':'other';
    const ctx=this.context(route),start=performance.now();response.once('finish',()=>this.finish(ctx,start));this.scope.run(ctx,next);
  }
  async operation<T>(route:string,work:()=>Promise<T>){const ctx=this.context(route),start=performance.now();try{return await this.scope.run(ctx,work);}finally{this.finish(ctx,start);}}
  sample(){const lag={meanMs:Number.isFinite(this.lag.mean)?this.lag.mean/1e6:0,p99Ms:this.lag.percentile(99)/1e6,maxMs:this.lag.max/1e6};this.lag.reset();return {lag,cpu:cpuStat(),usage:process.cpuUsage(this.initialUsage),eventLoopUtilization:performance.eventLoopUtilization()};}
  write(){this.lag.disable();const result={name:this.name,initialCpu:this.initialCpu,final:this.sample(),metrics:Object.fromEntries([...this.values].map(([key,values])=>[key,stats(values)]))};writeFileSync('/load-private/'+this.name+'-diagnostics.json',JSON.stringify(result),{mode:0o600});return result;}
}
