import { randomInt } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import type { Pool, PoolClient } from 'pg';
import type { SessionActor, Permission } from '../../modules/authorization/public/session.js';

/** Capacidades de infraestructura ensambladas fuera de los módulos consumidores. */
export interface AccountMutationDependencies {
  authorization: { revalidateInTransaction(client:PoolClient,actor:SessionActor,permission:Permission):Promise<void> };
  audit: { write(client:PoolClient,event:unknown):Promise<void> };
}

/** Reintenta solo abortos conocidos tras rollback confirmado; nunca un commit ambiguo. */
export async function accountTransaction<T>(pool:Pool,operation:(client:PoolClient)=>Promise<T>,
  unavailable:()=>Error,preserve:(error:unknown)=>boolean):Promise<T> {
  for(let attempt=0;;attempt++) {
    let client:PoolClient|undefined;let broken=false;let rolledBack=false;
    const onError=()=>{broken=true;};
    try {
      client=await pool.connect();client.on('error',onError);
      await client.query('BEGIN');await client.query("SET LOCAL lock_timeout = '3s'");
      const result=await operation(client);await client.query('COMMIT');return result;
    }catch(error){
      if(client){try{await client.query('ROLLBACK');rolledBack=true;}catch{broken=true;}}
      if(rolledBack&&preserve(error))throw error;
      const aborted=error!==null&&typeof error==='object'&&
        (('code'in error&&['40001','40P01'].includes(String(error.code)))
          ||('transactionAborted'in error&&error.transactionAborted===true));
      if(attempt>=2||!rolledBack||!aborted)throw unavailable();
    }finally{if(client){client.release(broken);client.removeListener('error',onError);}}
    await pause(randomInt(5,26));
  }
}
