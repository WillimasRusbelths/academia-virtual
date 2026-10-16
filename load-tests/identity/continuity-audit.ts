import { readFileSync,writeFileSync } from 'node:fs';
import { loadEnvironment } from '../../apps/api/dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../apps/api/dist/src/infrastructure/database/database.js';
import { assertLoadTarget,readManifest } from './fixtures.ts';
const name=process.argv[2];if(!/^[a-z0-9_-]+$/.test(name??''))throw new Error('Nombre inválido.');
const root='/load-private/',meta=JSON.parse(readFileSync(root+name+'-meta.json','utf8'));
const report=JSON.parse(readFileSync(root+name+'-report.json','utf8'));
const environment=loadEnvironment(),database=createDatabase(environment);
try{
  await assertLoadTarget(environment,database.pool);const manifest=readManifest(root+'fixtures',environment);
  const ids=manifest.accounts.filter(a=>a.group==='sessions').map(a=>a.id);
  const rows=(await database.pool.query(`SELECT count(*)::int AS count,min("createdAt") AS first,
    max("createdAt") AS last,min("revokedAt") AS "firstRevocation",
    count(*) FILTER(WHERE "createdAt">$4)::int AS "createdAfterPlateauStart"
    FROM "Session" WHERE "userId"=ANY($1::uuid[]) AND "createdAt">=$2 AND "createdAt"<=$3`,
  [ids,meta.startedAt,meta.finishedAt,new Date(report.scenarioEpoch+300000)])).rows[0];
  const samples=[];
  for(const line of readFileSync(root+'server.jsonl','utf8').trim().split('\n')){
    const sample=JSON.parse(line),elapsed=(Date.parse(sample.at)-report.scenarioEpoch)/1000;
    if(elapsed<300||elapsed>=900||sample.groups.sessions.sessions===1000)continue;
    const count=(await database.pool.query(`SELECT count(*)::int AS count FROM "Session" WHERE "userId"=ANY($1::uuid[])
      AND "createdAt">=$2 AND "createdAt"<=$3 AND ("revokedAt" IS NULL OR "revokedAt">$3)`,[ids,meta.startedAt,sample.at])).rows[0].count;
    samples.push({at:sample.at,observed:sample.groups.sessions.sessions,createdAndNotRevokedAtTimestamp:count});
  }
  const before=Date.now(),clock=(await database.pool.query('SELECT clock_timestamp() AS now')).rows[0].now as Date,after=Date.now();
  const boundary=(await database.pool.query(`WITH cohort AS (SELECT id,ordinality::int AS slot FROM unnest($1::uuid[]) WITH ORDINALITY AS c(id,ordinality))
    SELECT c.slot,extract(epoch FROM (s."createdAt"-$4::timestamptz))::float8 AS "createdSeconds"
    FROM "Session" s JOIN cohort c ON c.id=s."userId" WHERE s."createdAt">=$2 AND s."createdAt"<=$3
    ORDER BY s."createdAt" DESC LIMIT 20`,[ids,meta.startedAt,meta.finishedAt,new Date(report.scenarioEpoch)])).rows;
  const result={name,sessions:rows,lastCreatedSeconds:(new Date(rows.last).getTime()-report.scenarioEpoch)/1000,
    firstRevocationSeconds:(new Date(rows.firstRevocation).getTime()-report.scenarioEpoch)/1000,samples,
    boundary,currentClock:{offsetMidpointMs:clock.getTime()-(before+after)/2,roundTripMs:after-before}};
  writeFileSync(root+name+'-continuity.json',JSON.stringify(result),{mode:0o600,flag:'wx'});process.stdout.write(JSON.stringify(result)+'\n');
}finally{await database.close();}
