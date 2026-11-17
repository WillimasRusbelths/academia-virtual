import { existsSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import { loadEnvironment } from '../../dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../dist/src/infrastructure/database/database.js';
import { createReservationOfferingParticipant } from '../../dist/src/modules/academic-offering/infrastructure/reservation-participant.js';
const environment=loadEnvironment();
if(environment.appEnv!=='test'||!/^t_[a-z0-9_]+$/.test(environment.databaseSchema))throw new Error('Proceso fuera del ensayo aislado.');
const database=createDatabase(environment);database.pool.options.options=`-c search_path=${environment.databaseSchema},pg_catalog -c timezone=UTC`;
process.once('message',async message=>{
  let worker;
  try{
    if(message?.kind==='probe'){await database.pool.query('SELECT 1');process.send?.({state:'READY'});}
    else{
      const url=new URL('../../dist/src/modules/enrollment/infrastructure/expiration-scheduler.js',import.meta.url);
      if(!existsSync(url)){process.send?.({state:'MISSING'});return;}
      const exports=await import(url.href);
      if(typeof exports.createReservationExpiration!=='function'){process.send?.({state:'MISSING'});return;}
      worker=exports.createReservationExpiration(database.pool,createReservationOfferingParticipant);
      process.send?.({state:'DONE',result:await worker.tick()});
    }
  }catch{process.send?.({state:'FAILED'});process.exitCode=1;}
  finally{await worker?.beforeApplicationShutdown();await database.close();process.disconnect();}
});
