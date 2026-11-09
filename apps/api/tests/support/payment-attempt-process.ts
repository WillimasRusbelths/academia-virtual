import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AttemptFixture } from './payment-attempt.js';

export async function attemptProcess(f:AttemptFixture,kind:'probe'|'initiate',input?:{orderId:string;initiationId:string}){
  const child=fork(fileURLToPath(new URL('./payment-attempt-process.mjs',import.meta.url)),[],{serialization:'advanced',stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,APP_ENV:'test',TEST_DATABASE_URL:f.environment.databaseUrl,TEST_MIGRATION_DATABASE_URL:f.environment.migrationUrl}});
  const messages:{state:string}[]=[],listeners=new Set<()=>void>();
  let ended=false;
  const exited=new Promise<void>(resolve=>{child.once('exit',()=>{ended=true;for(const notify of listeners)notify();resolve();});child.once('error',()=>{ended=true;for(const notify of listeners)notify();resolve();});});
  child.on('message',message=>{if(message&&typeof message==='object'&&'state'in message&&typeof message.state==='string'){messages.push(message as {state:string});for(const notify of listeners)notify();}});
  child.send({kind,input,actor:f.actor});
  return {send:(message:object)=>child.send(message),
    next:(state:string)=>new Promise<{state:string}>((resolve,reject)=>{
      const timer=setTimeout(()=>{listeners.delete(check);reject(new Error('Proceso de ensayo no alcanzó barrera; valores omitidos.'));},15000);
      const check=()=>{const at=messages.findIndex(m=>m.state===state);if(at>=0){const [message]=messages.splice(at,1);clearTimeout(timer);listeners.delete(check);resolve(message);}else if(ended||messages.some(m=>m.state==='FAILED')){clearTimeout(timer);listeners.delete(check);reject(new Error('Proceso de ensayo interrumpido; valores omitidos.'));}};
      listeners.add(check);check();
    }),
    async close(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;},
  };
}
