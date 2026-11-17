import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Pool, PoolClient } from 'pg';
import { vi } from 'vitest';
import type { Environment } from '../../src/infrastructure/config/environment.js';

export function barrier() {
  let enter!:()=>void,release!:()=>void;
  const entered=new Promise<void>(resolve=>{enter=resolve;}),released=new Promise<void>(resolve=>{release=resolve;});
  return {enter,release,entered,released};
}
export async function within<T>(operation:Promise<T>,ms=5000):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Test barrier not reached')),ms);})]);}
  finally{clearTimeout(timer);}
}
/** Real pg queries, intercepted only for observable barriers and synthetic IO faults. */
export function instrumentMaterialsPool(pool:Pool,intercept:(sql:string,execute:()=>Promise<unknown>,client:PoolClient)=>Promise<unknown>) {
  const original=pool.connect.bind(pool),seen=new Set<PoolClient>(),restores:(()=>void)[]=[];
  function attach(client:PoolClient) {
    if(!seen.has(client)) {
      seen.add(client);const query=client.query.bind(client);
      const spy=vi.spyOn(client,'query').mockImplementation(((...args:unknown[])=>intercept(typeof args[0]==='string'?args[0]:'',
        async()=>Reflect.apply(query,client,args),client)) as typeof client.query);restores.push(()=>spy.mockRestore());
    }return client;
  }
  // pg.Pool.query uses connect(callback), while coordinators await connect().
  // Preserve both overloads so the observer connection is real and cannot hang.
  const connect=vi.spyOn(pool,'connect').mockImplementation(((...args:unknown[])=>{
    const callback=args[0];
    if(typeof callback==='function')return Reflect.apply(original,pool,[(...values:unknown[])=>{
      if(values[1])attach(values[1] as PoolClient);Reflect.apply(callback,undefined,values);
    }]);
    return (Reflect.apply(original,pool,args) as Promise<PoolClient>).then(attach);
  }) as typeof pool.connect);
  return ()=>{connect.mockRestore();restores.forEach(restore=>restore());};
}
export function rawMaterialUpload(url:string,headers:Record<string,string>) {
  let request!:ReturnType<typeof httpRequest>;
  const response=new Promise<{status:number;text:string}>((resolve,reject)=>{
    request=httpRequest(url,{method:'PUT',headers:{...headers,'content-type':'application/octet-stream'}},incoming=>{
      const chunks:Buffer[]=[];incoming.on('data',(chunk:Buffer)=>chunks.push(chunk));incoming.once('error',reject);
      incoming.once('end',()=>resolve({status:incoming.statusCode??0,text:Buffer.concat(chunks).toString('utf8')}));
    });request.once('error',reject);request.setTimeout(10000,()=>request.destroy(new Error('Synthetic request timeout')));
  });void response.catch(()=>undefined);return {request,response};
}
export function firstMaterialChunk(path:string) {
  const gate=barrier();const observe=(incoming:IncomingMessage)=>{
    if(incoming.url!==path)return;const emit=incoming.emit;
    incoming.emit=function(event:string|symbol,...args:unknown[]){
      const result=Reflect.apply(emit,this,[event,...args]) as boolean;
      if(event==='data'){this.emit=emit;gate.enter();}return result;
    };
  };return {observe,entered:gate.entered};
}
export async function materialsProcess(environment:Environment) {
  const child=fork(fileURLToPath(new URL('./materials-process.mjs',import.meta.url)),[],{stdio:['ignore','ignore','ignore','ipc'],
    env:{...process.env,APP_ENV:'test',APP_ORIGIN:environment.appOrigin,TEST_DATABASE_URL:environment.databaseUrl,TEST_MIGRATION_DATABASE_URL:environment.migrationUrl}});
  const exited=new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.once('error',()=>resolve());});
  async function close(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await within(exited,10000);}
  try {
    const url=await within(new Promise<string>((resolve,reject)=>{
      child.once('error',()=>reject(new Error('Materials process failed')));child.once('exit',()=>reject(new Error('Materials process exited before readiness')));
      child.once('message',message=>{if(message&&typeof message==='object'&&'ready'in message&&typeof message.ready==='string'
        &&/^http:\/\/127\.0\.0\.1:\d+$/.test(message.ready))resolve(message.ready);else reject(new Error('Invalid readiness'));});
    }),15000);
    if((await fetch(url+'/health/ready')).status!==200)throw new Error('Materials process not ready');return {url,pid:child.pid,close};
  }catch(error){await close();throw error;}
}
