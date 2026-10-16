import { randomUUID } from 'node:crypto';
import { constants, openSync, closeSync, readFileSync, lstatSync, fstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import type { Environment } from '../../apps/api/src/infrastructure/config/environment.ts';
import { assertFixtureEnvironment } from '../../apps/api/dist/src/infrastructure/testing/identity-fixtures.js';

export const sizes={sessions:1000,warmup:20,authentication:100} as const;
export type Group=keyof typeof sizes;
export interface LoadAccount {id:string;email:string;password:string;group:Group;index:number}
export interface LoadManifest {version:1;runId:string;database:string;schema:string;accounts:LoadAccount[]}
export const failure=()=>new Error('Carga no disponible: revisar destino y manifiesto privado. Valores omitidos.');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export async function assertLoadTarget(environment:Environment,pool:Pool){
  assertFixtureEnvironment(environment);
  if(!/^t_load_[a-z0-9_]+$/.test(environment.databaseSchema))throw failure();
  const row=(await pool.query(`SELECT current_database() AS database,current_schema() AS schema,
    shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`)).rows[0];
  if(row.database!==new URL(environment.databaseUrl).pathname.slice(1)||row.schema!==environment.databaseSchema||row.marker!=='identity-load-isolated')throw failure();
}
export function privateDirectory(directory:string){
  mkdirSync(directory,{recursive:true,mode:0o700});const stat=lstatSync(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync(directory)!==path.resolve(directory)||(stat.mode&0o077)!==0)throw failure();
}
export function emailFor(runId:string,group:Group,index:number){return `load-${runId}-${group}-${index}@example.test`;}
export function manifestPath(directory:string){privateDirectory(directory);return path.join(directory,'fixtures.json');}
export function saveManifest(directory:string,manifest:LoadManifest){writeFileSync(manifestPath(directory),JSON.stringify(manifest),{flag:'wx',mode:0o600});}
export function readManifest(directory:string,environment:Environment):LoadManifest{
  const fd=openSync(manifestPath(directory),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const stat=fstatSync(fd);if(!stat.isFile()||stat.size>1024*1024||(stat.mode&0o077)!==0)throw failure();
    const data=JSON.parse(readFileSync(fd,'utf8')) as LoadManifest;
    if(data.version!==1||!uuid.test(data.runId)||data.database!==new URL(environment.databaseUrl).pathname.slice(1)
      ||data.schema!==environment.databaseSchema||data.accounts?.length!==1120)throw failure();
    const ids=new Set<string>(),emails=new Set<string>(),passwords=new Set<string>();
    for(const group of Object.keys(sizes) as Group[]){
      const accounts=data.accounts.filter(account=>account.group===group);if(accounts.length!==sizes[group])throw failure();
      for(let index=0;index<accounts.length;index++){
        const a=accounts[index];if(!uuid.test(a.id)||a.index!==index||a.email!==emailFor(data.runId,group,index)
          ||!/^[A-Za-z0-9_-]{43}$/.test(a.password)||ids.has(a.id)||emails.has(a.email)||passwords.has(a.password))throw failure();
        ids.add(a.id);emails.add(a.email);passwords.add(a.password);
      }
    }
    return data;
  }finally{closeSync(fd);}
}
export function newManifest(environment:Environment):LoadManifest{return {version:1,runId:randomUUID(),database:new URL(environment.databaseUrl).pathname.slice(1),schema:environment.databaseSchema,accounts:[]};}
