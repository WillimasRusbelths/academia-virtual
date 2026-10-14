import { randomInt } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import type { Pool,PoolClient } from 'pg';
import { ActionLinkUnavailable } from '../application/issue-action-link.js';

/** Solo conflictos abortados y rollback confirmado se reintentan; un commit ambiguo no. */
export async function actionTransaction<T>(pool:Pool,operation:(client:PoolClient)=>Promise<T>):Promise<T> {
  for(let attempt=0;;attempt++) {
    let client:PoolClient|undefined;let broken=false;let rolledBack=false;
    const onError=()=>{broken=true;};
    try {
      client=await pool.connect();client.on('error',onError);
      await client.query('BEGIN');await client.query("SET LOCAL lock_timeout = '3s'");
      const result=await operation(client);await client.query('COMMIT');return result;
    }catch(error){
      if(client){try{await client.query('ROLLBACK');rolledBack=true;}catch{broken=true;}}
      const aborted=error!==null && typeof error==='object' && 'code'in error && ['40001','40P01'].includes(String(error.code));
      if(attempt>=2 || !rolledBack || !aborted)throw new ActionLinkUnavailable();
    }finally{if(client){client.release(broken);client.removeListener('error',onError);}}
    await pause(randomInt(5,26));
  }
}
