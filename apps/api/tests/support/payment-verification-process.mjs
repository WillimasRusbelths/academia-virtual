import { loadEnvironment } from '../../dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../dist/src/infrastructure/database/database.js';
import * as store from '../../dist/src/modules/enrollment/infrastructure/enrollment-store.js';
import { createReservationOfferingParticipant } from '../../dist/src/modules/academic-offering/infrastructure/reservation-participant.js';

const environment=loadEnvironment();
if(environment.appEnv!=='test'||!/^t_[a-z0-9_]+$/.test(environment.databaseSchema))throw new Error('Proceso fuera del ensayo.');
const database=createDatabase(environment);
// La misma función SQL del schema de prueba que usa el proceso padre.
database.pool.options.options=`-c search_path=${environment.databaseSchema},pg_catalog -c timezone=UTC`;
process.once('message',async message=>{
  try{
    if(message?.kind==='probe'){
      await database.pool.query('SELECT 1');process.send?.({state:'READY'});
    }else{
      if(typeof store.createPaymentVerification!=='function')throw new Error('Finalizador pendiente.');
      const input=message.input;
      if(input.observation.state==='ECONOMIC_FACT')input.observation.evidence.amountUnits=BigInt(input.observation.evidence.amountUnits);
      const result=await store.createPaymentVerification(database.pool,createReservationOfferingParticipant).finalize(input);
      process.send?.({state:'DONE',result});
    }
  }catch{process.send?.({state:'FAILED'});process.exitCode=1;}
  finally{await database.close();process.disconnect();}
});
import process from 'node:process';
