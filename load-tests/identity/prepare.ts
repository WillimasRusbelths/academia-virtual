import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Environment } from '../../apps/api/src/infrastructure/config/environment.ts';
import { loadEnvironment } from '../../apps/api/dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../apps/api/dist/src/infrastructure/database/database.js';
import { createPasswordCredentials, accessSecrets } from '../../apps/api/dist/src/modules/identity/infrastructure/credentials.js';
import { sizes,assertLoadTarget,newManifest,emailFor,saveManifest,failure } from './fixtures.ts';
import type { Group } from './fixtures.ts';

export async function prepare(environment:Environment,pool:Pool,directory:string){
  await assertLoadTarget(environment,pool);const manifest=newManifest(environment);
  for(const group of Object.keys(sizes) as Group[])for(let index=0;index<sizes[group];index++)manifest.accounts.push({id:randomUUID(),email:emailFor(manifest.runId,group,index),password:accessSecrets.issue().secret,group,index});
  saveManifest(directory,manifest); // Sobrevive a interrupción: nunca se sobrescribe; limpieza explícita.
  const credentials=await createPasswordCredentials();const hashes:string[]=[];
  for(const account of manifest.accounts)hashes.push(await credentials.hash(account.password));
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    for(let index=0;index<manifest.accounts.length;index++){
      const a=manifest.accounts[index];await client.query(`INSERT INTO "User" (id,name,email,"emailCanonical",role,status,"emailVerifiedAt","passwordHash","mustSetPassword")
        VALUES ($1,'Alumno ficticio de carga',$2,$2,'STUDENT','ACTIVE',clock_timestamp(),$3,false)`,[a.id,a.email,hashes[index]]);
    }
    await client.query('COMMIT');return {accounts:1120,sessions:1000,warmup:20,authentication:100};
  }catch{await client.query('ROLLBACK');throw failure();}finally{client.release();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const database=createDatabase(loadEnvironment());
  prepare(loadEnvironment(),database.pool,'/load-private/fixtures').then(r=>process.stdout.write(JSON.stringify(r)+'\n'))
    .catch(()=>{process.stderr.write('Preparación no completada. Valores omitidos.\n');process.exitCode=1;}).finally(()=>database.close());
}
