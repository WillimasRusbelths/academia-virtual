import { writeFileSync,readFileSync,renameSync } from 'node:fs';
import { loadEnvironment } from '../../apps/api/dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../apps/api/dist/src/infrastructure/database/database.js';
import { assertLoadTarget } from './fixtures.ts';
const environment=loadEnvironment(),database=createDatabase(environment);
try{
  await assertLoadTarget(environment,database.pool);
  if(process.env.LOAD_WATCHDOG_TEST!=='1')throw new Error('Solo fixture explícito de prueba.');
  if(process.argv[2]==='inject')writeFileSync('/load-private/stop.json',JSON.stringify({reason:'MONITOR_UNAVAILABLE',testInjected:true,at:new Date().toISOString()}),{flag:'wx',mode:0o600});
  else if(process.argv[2]==='archive'){
    const value=JSON.parse(readFileSync('/load-private/stop.json','utf8'));if(value.testInjected!==true)throw new Error('No se archiva una parada real.');
    renameSync('/load-private/stop.json','/load-private/watchdog-test-stop.json');
  }else throw new Error('Acción de prueba inválida.');
}finally{await database.close();}
