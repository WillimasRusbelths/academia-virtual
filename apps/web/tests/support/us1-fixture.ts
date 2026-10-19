import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { test as base, expect } from '@playwright/test';
import { us1Dataset, us1Http } from '../../../api/tests/support/us1-http.js';
import type { Us1Dataset } from '../../../api/tests/support/us1-http.js';
import { repositoryRoot } from '../../../api/src/infrastructure/config/environment.js';

export const test=base.extend<{fresh:undefined},{identity:Us1Dataset}>({
  // Playwright exige desestructurar las dependencias de una fixture, incluso si no tiene ninguna.
  // eslint-disable-next-line no-empty-pattern
  identity:[async({},use)=>{
    const data=await us1Dataset('us1_browser',true);let server:Awaited<ReturnType<typeof us1Http>>|undefined;
    let vite:ReturnType<typeof spawn>|undefined;
    try {
      server=await us1Http(data);
      const root=repositoryRoot();
      // Escuchar IPv4 loopback evita la divergencia localhost/::1 entre Vite y fetch.
      // El navegador y APP_ORIGIN conservan http://localhost:5173.
      vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5173'],
        {cwd:path.join(root,'apps/web'),env:{...process.env,API_PROXY_TARGET:server.url},stdio:'ignore'});
      let ready=false;
      for(let i=0;i<100;i++) {if(vite.exitCode!==null)break;
        try {ready=(await fetch('http://localhost:5173/')).status===200;}catch { /* arranque */ }
        if(ready)break;await pause(100);}
      if(!ready)throw new Error('Vite del ensayo no disponible. Configuración omitida.');
      expect((await fetch(`${server.url}/health/ready`)).status).toBe(200);
      await use(data);
    } finally {
      if(vite && vite.exitCode===null) {const exited=new Promise<void>(resolve=>vite!.once('exit',()=>resolve()));vite.kill('SIGTERM');await exited;}
      await server?.close();await data.cleanup();
    }
  },{scope:'worker',timeout:120000}],
  fresh:[async({identity},use)=>{await identity.reset();await use(undefined);},{auto:true}],
});
export { expect };
