import { writeFileSync } from 'node:fs';
import { loadEnvironment } from '../../apps/api/dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../apps/api/dist/src/infrastructure/database/database.js';
import { cleanup } from './cleanup.ts';
const name=process.argv[2];if(!name||!/^[a-z0-9_-]+$/.test(name))throw new Error('Nombre inválido.');
const environment=loadEnvironment(),database=createDatabase(environment);
try{const result=await cleanup(environment,database.pool,'/load-private/fixtures');writeFileSync(`/load-private/${name}-cleanup.json`,JSON.stringify(result),{mode:0o600});}
finally{await database.close();}
