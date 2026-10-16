import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import type { Environment } from '../../apps/api/src/infrastructure/config/environment.ts';
import { loadEnvironment } from '../../apps/api/dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../apps/api/dist/src/infrastructure/database/database.js';
import { assertLoadTarget,readManifest,failure } from './fixtures.ts';

export async function cleanup(environment:Environment,pool:Pool,directory:string,mode:'sessions'|'accounts'='sessions'){
  await assertLoadTarget(environment,pool);const manifest=readManifest(directory,environment);
  if(!['sessions','accounts'].includes(mode))throw failure();const ids=manifest.accounts.map(a=>a.id);
  const client=await pool.connect();try{
    await client.query('BEGIN');
    const rows=(await client.query('SELECT id,"emailCanonical" FROM "User" WHERE id=ANY($1::uuid[]) FOR UPDATE',[ids])).rows;
    if(rows.some(row=>!manifest.accounts.some(a=>a.id===row.id&&a.email===row.emailCanonical)))throw failure();
    const revoked=await client.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE "userId"=ANY($1::uuid[]) AND "revokedAt" IS NULL',[ids]);
    let removed=0;
    if(mode==='accounts'){
      await client.query('DELETE FROM "MailDelivery" WHERE "tokenId" IN (SELECT id FROM "ActionToken" WHERE "userId"=ANY($1::uuid[]))',[ids]);
      await client.query('DELETE FROM "ActionToken" WHERE "userId"=ANY($1::uuid[])',[ids]);
      await client.query('DELETE FROM "AuditEvent" WHERE "targetUserId"=ANY($1::uuid[])',[ids]);
      await client.query('DELETE FROM "Session" WHERE "userId"=ANY($1::uuid[])',[ids]);
      removed=(await client.query('DELETE FROM "User" WHERE id=ANY($1::uuid[])',[ids])).rowCount??0;
    }
    await client.query('COMMIT');return {revoked:revoked.rowCount??0,removed};
  }catch{await client.query('ROLLBACK');throw failure();}finally{client.release();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  if(process.argv.length>3)throw failure();
  const mode=process.argv[2]??'sessions';if(!['sessions','accounts'].includes(mode))throw failure();
  const database=createDatabase(loadEnvironment());cleanup(loadEnvironment(),database.pool,'/load-private/fixtures',mode as 'sessions'|'accounts')
    .then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(()=>{process.stderr.write('Limpieza no completada. Valores omitidos.\n');process.exitCode=1;}).finally(()=>database.close());
}
