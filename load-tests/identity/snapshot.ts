import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { loadEnvironment } from '../../apps/api/dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../apps/api/dist/src/infrastructure/database/database.js';
import { assertLoadTarget,readManifest } from './fixtures.ts';
import { sessionCounts } from './observe.ts';
const environment=loadEnvironment(),database=createDatabase(environment);
try{
  await assertLoadTarget(environment,database.pool);const manifest=readManifest('/load-private/fixtures',environment);
  const users=(await database.pool.query('SELECT * FROM "User" ORDER BY id')).rows;
  const marker=(await database.pool.query('SELECT * FROM "SystemState"')).rows;
  const result={at:new Date().toISOString(),accounts:users.length,usersDigest:createHash('sha256').update(JSON.stringify(users)).digest('hex'),
    singletonDigest:createHash('sha256').update(JSON.stringify(marker)).digest('hex'),groups:await sessionCounts(database.pool,manifest),
    mailQueue:(await database.pool.query('SELECT status,count(*)::int AS count FROM "MailDelivery" GROUP BY status')).rows};
  const name=process.argv[2];if(!name||!/^[a-z0-9_-]+$/.test(name))throw new Error('Nombre inválido.');
  writeFileSync(`/load-private/${name}.json`,JSON.stringify(result),{mode:0o600});process.stdout.write(JSON.stringify(result)+'\n');
}finally{await database.close();}
