import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { hash, argon2id } from 'argon2';
import type { Pool } from 'pg';
import { setTimeout as pause } from 'node:timers/promises';
import { test as base, expect } from '@playwright/test';
import { materialsFixture } from '../../../api/tests/support/materials.js';
import type { MaterialsFixture } from '../../../api/tests/support/materials.js';
import { materialFileCase } from '../../../api/tests/support/materials-files.js';
import { us1Http } from '../../../api/tests/support/us1-http.js';
import { repositoryRoot } from '../../../api/src/infrastructure/config/environment.js';
import { financialFingerprint } from '../../../api/tests/support/enrollment-maintenance.js';

const fictionalPassword='Materiales E2E ficticio 2026!';
let loginHash:Promise<string>|undefined;

/** New schema per case, real composition/PG/proxy. No fake route or business adapter. */
export const test=base.extend<{materials:MaterialsFixture & {backendUrl:string;cookieName:string;file:ReturnType<typeof materialFileCase>;otherLogin:{email:string;password:string};httpPool:Pool}}>({
  materials:[async({browserName},use)=>{
    if(browserName!=='chromium')throw new Error('Este ensayo de materiales requiere Chromium.');
    const probe=createServer();
    await new Promise<void>((resolve,reject)=>{probe.once('error',()=>reject(new Error('Puerto de ensayo ocupado. No reutilizar servidor manual.')));
      probe.listen(5173,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
    const data=await materialsFixture();let http:Awaited<ReturnType<typeof us1Http>>|undefined,vite:ReturnType<typeof spawn>|undefined;
    try {
      // A fictional credential confined to this random test schema, never a real account.
      loginHash??=hash(fictionalPassword,{type:argon2id,memoryCost:19456,timeCost:2,parallelism:1});
      await data.pool.query('UPDATE "User" SET "passwordHash"=$2 WHERE id=$1',[data.otherStudent.userId,await loginHash]);
      const email=(await data.pool.query<{email:string}>('SELECT email FROM "User" WHERE id=$1',[data.otherStudent.userId])).rows[0].email;
      const financialBefore=await financialFingerprint(data.pool);
      http=await us1Http({context:data});const root=repositoryRoot();
      vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5173','--strictPort'],
        {cwd:path.join(root,'apps/web'),env:{...process.env,API_PROXY_TARGET:http.url},stdio:'ignore'});
      let failed=false;vite.once('error',()=>{failed=true;});let ready=false;
      for(let attempt=0;attempt<100;attempt++) {
        if(failed||vite.exitCode!==null)break;
        try{ready=(await fetch('http://localhost:5173/',{signal:AbortSignal.timeout(1000)})).ok;}catch{/* bounded readiness */}
        if(ready)break;await pause(100);
      }
      if(!ready)throw new Error('Vite de materiales no alcanzó readiness. Valores omitidos.');
      expect((await fetch(http.url+'/health/ready')).status).toBe(200);
      await use({...data,backendUrl:http.url,cookieName:http.cookie.name,file:materialFileCase('pdf-valid'),otherLogin:{email,password:fictionalPassword},httpPool:http.database.pool});
      expect(await financialFingerprint(data.pool)).toBe(financialBefore);
    } finally {
      if(vite?.pid&&vite.exitCode===null&&vite.signalCode===null){const exited=new Promise<void>(resolve=>vite!.once('exit',()=>resolve()));vite.kill('SIGTERM');await exited;}
      try{await http?.close();}finally{await data.cleanup();}
    }
  },{timeout:120000}],
});
export {expect};
