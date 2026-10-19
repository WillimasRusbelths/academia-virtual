import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { test as base,expect } from '@playwright/test';
import { identityDatabase } from '../../../api/tests/support/identity-database.js';
import { us1Http } from '../../../api/tests/support/us1-http.js';
import { repositoryRoot } from '../../../api/src/infrastructure/config/environment.js';
import { assertMailpitAvailable } from '../../../api/tests/support/mailpit.js';

async function bootstrapEnvironment(){
  const context=await identityDatabase('us6_bootstrap_browser');
  let server:Awaited<ReturnType<typeof us1Http>>|undefined;let vite:ReturnType<typeof spawn>|undefined;
  const cleanup=async()=>{
    if(vite&&vite.exitCode===null){const exited=new Promise<void>(resolve=>vite!.once('exit',()=>resolve()));vite.kill('SIGTERM');await exited;}
    await server?.close();await context.cleanup();
  };
  try{
    await assertMailpitAvailable();server=await us1Http({context,clock:undefined});
    const root=repositoryRoot();vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5173'],
      {cwd:path.join(root,'apps/web'),env:{...process.env,API_PROXY_TARGET:server.url},stdio:'ignore'});
    let ready=false;
    for(let i=0;i<100;i++){
      if(vite.exitCode!==null)break;
      try{ready=(await fetch('http://localhost:5173/')).status===200;}catch{/* arranque */}
      if(ready)break;await pause(100);
    }
    if(!ready)throw new Error('Entorno aislado US6 no disponible. Valores omitidos.');
    const scheduler=server.app.get<{beforeApplicationShutdown():Promise<void>;onApplicationBootstrap():void}>('MAIL_DELIVERY_SCHEDULER');
    return {context,async reset(){
      if(!/^t_[a-z0-9_]+$/.test(context.environment.databaseSchema))throw new Error('Restablecimiento de ensayo no permitido.');
      await scheduler.beforeApplicationShutdown();
      await context.isolated.ownerQuery(`TRUNCATE "SystemState","AuditEvent","MailDelivery","ActionToken","Session","User","RateEvent","RateBucket";
        INSERT INTO "SystemState" (id) VALUES (1);`);
      scheduler.onApplicationBootstrap();
    },cleanup};
  }catch(error){await cleanup();throw error;}
}
export const test=base.extend<{fresh:undefined},{bootstrap:Awaited<ReturnType<typeof bootstrapEnvironment>>}>({
  // eslint-disable-next-line no-empty-pattern
  bootstrap:[async({},use)=>{const environment=await bootstrapEnvironment();try{await use(environment);}finally{await environment.cleanup();}},
    {scope:'worker',timeout:120000}],
  fresh:[async({bootstrap},use)=>{await bootstrap.reset();await use(undefined);},{auto:true}],
});
export {expect};
