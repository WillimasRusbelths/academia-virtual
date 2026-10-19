import { readFileSync,writeFileSync } from 'node:fs';
import { loadEnvironment } from '../../apps/api/dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../apps/api/dist/src/infrastructure/database/database.js';
import { assertLoadTarget,readManifest } from './fixtures.ts';
const name=process.argv[2];if(!/^[a-z0-9_-]+$/.test(name??''))throw new Error('Nombre inválido.');
const environment=loadEnvironment(),database=createDatabase(environment);
function safePlan(node:Record<string,unknown>):unknown{return {type:node['Node Type'],index:node['Index Name'],rows:node['Actual Rows'],loops:node['Actual Loops'],
  sharedHits:node['Shared Hit Blocks'],sharedReads:node['Shared Read Blocks'],children:((node.Plans??[]) as Record<string,unknown>[]).map(safePlan)};}
try{
  await assertLoadTarget(environment,database.pool);const manifest=readManifest('/load-private/fixtures',environment);
  const row=(await database.pool.query('SELECT "tokenHash" FROM "Session" WHERE "userId"=ANY($1::uuid[]) ORDER BY "createdAt" DESC LIMIT 1',[manifest.accounts.map(a=>a.id)])).rows[0];
  if(!row)throw new Error('Se requiere una sesión histórica del ensayo.');
  const source=readFileSync('/workspace/apps/api/src/modules/identity/infrastructure/session-store.ts','utf8');
  const sql=source.match(/const snapshot = `([\s\S]*?)`;/)?.[1];if(!sql||!sql.startsWith('SELECT ')||sql.includes(';'))throw new Error('Consulta no reconocida.');
  const plan=(await database.pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql+' WHERE s."tokenHash"=$1',[row.tokenHash])).rows[0]['QUERY PLAN'][0];
  const result={name,planningMs:plan['Planning Time'],executionMs:plan['Execution Time'],plan:safePlan(plan.Plan)};
  // Se omiten filtros, condiciones y parámetros; pueden contener hashes/UUID privados.
  writeFileSync('/load-private/'+name+'-plan.json',JSON.stringify(result),{mode:0o600});process.stdout.write(JSON.stringify(result)+'\n');
}finally{await database.close();}
