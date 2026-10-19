import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { test as base,expect } from '@playwright/test';
import { us2Dataset } from '../../../api/tests/support/us2.js';
import type { Us2Dataset } from '../../../api/tests/support/us2.js';
import { us1Http } from '../../../api/tests/support/us1-http.js';
import { repositoryRoot } from '../../../api/src/infrastructure/config/environment.js';
import { assertMailpitAvailable,mailpitOrigin } from '../../../api/tests/support/mailpit.js';

export const test=base.extend<{fresh:undefined},{identity:Us2Dataset&{pauseMail():Promise<void>;backendUrl:string}}>({
  // eslint-disable-next-line no-empty-pattern
  identity:[async({},use)=>{
    const data=await us2Dataset('us2_browser');let server:Awaited<ReturnType<typeof us1Http>>|undefined;
    let vite:ReturnType<typeof spawn>|undefined;
    try {
      await assertMailpitAvailable();server=await us1Http(data);const root=repositoryRoot();
      vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5173'],
        {cwd:path.join(root,'apps/web'),env:{...process.env,API_PROXY_TARGET:server.url},stdio:'ignore'});
      let ready=false;
      for(let i=0;i<100;i++){if(vite.exitCode!==null)break;
        try{ready=(await fetch('http://localhost:5173/')).status===200;}catch{/* arranque */}
        if(ready)break;await pause(100);}
      if(!ready)throw new Error('Vite del ensayo US2 no disponible. Valores omitidos.');
      expect((await fetch(`${server.url}/health/ready`)).status).toBe(200);
      const scheduler=server.app.get<{beforeApplicationShutdown():Promise<void>;onApplicationBootstrap():void}>('MAIL_DELIVERY_SCHEDULER');
      await use({...data,backendUrl:server.url,async reset(){
        // Cada caso recupera el scheduler detenido por ensayos de fallo y evita resetear bajo un envío activo.
        await scheduler.beforeApplicationShutdown();await data.reset();scheduler.onApplicationBootstrap();
      },pauseMail:()=>scheduler.beforeApplicationShutdown()});
    }finally{
      if(vite && vite.exitCode===null){const exited=new Promise<void>(resolve=>vite!.once('exit',()=>resolve()));vite.kill('SIGTERM');await exited;}
      await server?.close();await data.cleanup();
    }
  },{scope:'worker',timeout:120000}],
  fresh:[async({identity},use)=>{await identity.reset();await use(undefined);},{auto:true}],
});
export {expect};

/** Buzón local: solo consultar el destinatario ficticio del ensayo; nunca imprimir el mensaje. */
export async function verificationLink(email:string,origin:string,accept:(link:string)=>boolean=()=>true,
  purpose:'VERIFY_EMAIL'|'RESET_PASSWORD'='VERIFY_EMAIL') {
  if(!email.endsWith('@example.test') || origin!=='http://localhost:5173')throw new Error('Buzón de ensayo no permitido.');
  for(let i=0;i<120;i++) {
    const response=await fetch(`${mailpitOrigin}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    if(!response.ok)throw new Error('Consulta del buzón local fallida. Valores omitidos.');
    const result=await response.json() as {messages:{ID:string}[]};
    for(const item of result.messages) {
      const message=await fetch(`${mailpitOrigin}/api/v1/message/${encodeURIComponent(item.ID)}`).then(value=>value.json()) as {Text?:string};
      const match=message.Text?.match(purpose==='VERIFY_EMAIL'?/http:\/\/localhost:5173\/verificar-correo#[A-Za-z0-9_-]{43}/
        :/http:\/\/localhost:5173\/restablecer#[A-Za-z0-9_-]{43}/);
      if(match&&accept(match[0]))return match[0];
    }
    await pause(100);
  }
  throw new Error('El buzón local no capturó el enlace dentro del plazo. Valores omitidos.');
}
export const passwordResetLink=(email:string,origin:string,accept?:(link:string)=>boolean)=>verificationLink(email,origin,accept,'RESET_PASSWORD');
