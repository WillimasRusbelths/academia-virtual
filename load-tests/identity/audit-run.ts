import { readFileSync,writeFileSync } from 'node:fs';
import { loadEnvironment } from '../../apps/api/dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../apps/api/dist/src/infrastructure/database/database.js';
import { assertLoadTarget,readManifest } from './fixtures.ts';
const name=process.argv[2];if(!/^[a-z0-9_-]+$/.test(name??''))throw new Error('Nombre inválido.');
const root='/load-private/',meta=JSON.parse(readFileSync(root+name+'-meta.json','utf8')) as {startedAt:string;finishedAt:string};
const environment=loadEnvironment(),database=createDatabase(environment);
try{
  await assertLoadTarget(environment,database.pool);
  const manifest=readManifest(root+'fixtures',environment),ids=manifest.accounts.map(a=>a.id);
  const sessions=(await database.pool.query(`SELECT count(*)::int AS created,
    count(DISTINCT "userId")::int AS users,count(DISTINCT encode("tokenHash",'hex'))::int AS secrets,
    count(*) FILTER(WHERE "revokedAt" IS NULL)::int AS notRevoked
    FROM "Session" WHERE "userId"=ANY($1::uuid[]) AND "createdAt">=$2 AND "createdAt"<=$3`,[ids,meta.startedAt,meta.finishedAt])).rows[0];
  const mailQueue=(await database.pool.query('SELECT status,count(*)::int AS count FROM "MailDelivery" GROUP BY status')).rows;
  const response=await fetch('http://mailpit:8025/api/v1/messages');
  if(!response.ok)throw new Error('Mailpit no disponible.');
  const mailpit=await response.json() as {total:number};
  if(!Number.isSafeInteger(mailpit.total)||mailpit.total<0)throw new Error('Conteo Mailpit inválido.');
  const result={name,sessions,mailQueue,mailpitCaptured:mailpit.total};
  writeFileSync(root+name+'-audit.json',JSON.stringify(result),{mode:0o600});
  process.stdout.write(JSON.stringify(result)+'\n');
}finally{await database.close();}
