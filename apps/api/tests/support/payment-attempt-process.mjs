import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { loadEnvironment } from '../../dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../dist/src/infrastructure/database/database.js';
import { PostgresSessionStore } from '../../dist/src/modules/identity/infrastructure/session-store.js';
import { createReservationOfferingParticipant } from '../../dist/src/modules/academic-offering/infrastructure/reservation-participant.js';
import * as stores from '../../dist/src/modules/enrollment/infrastructure/enrollment-store.js';

const environment=loadEnvironment();
if(environment.appEnv!=='test'||!/^t_[a-z0-9_]+$/.test(environment.databaseSchema))throw new Error('Proceso fuera de pruebas.');
const database=createDatabase(environment);database.pool.options.options=`-c search_path=${environment.databaseSchema},pg_catalog -c timezone=UTC`;
// Dos barreras del transporte ficticio: antes del efecto externo y después de
// aceptarlo sin devolver aún respuesta. SIGKILL prueba pérdida real del proceso.
const next=()=>new Promise(resolve=>process.once('message',resolve));
const gateway={async initiate(){process.send?.({state:'BEFORE_EXTERNAL'});await next();process.send?.({state:'EXTERNAL_ACCEPTED'});await next();return {state:'INITIATION_UNKNOWN'};},async recover(){return {state:'UNRESOLVED'};},async verify(){return {state:'UNRESOLVED'};}};
process.once('message',async message=>{
  try{
    if(message.kind==='probe'){await database.pool.query('SELECT 1');process.send?.({state:'READY'});}
    else{
      if(typeof stores.createPaymentAttempts!=='function')throw new Error('Iniciación pendiente.');
      const sessions=new PostgresSessionStore(database.pool);
      const service=stores.createPaymentAttempts(database.pool,{revalidateInTransaction:sessions.revalidateInTransaction.bind(sessions)},createReservationOfferingParticipant,gateway,{providerScope:'fixture/provider/merchant/sandbox'});
      await service.initiate(message.actor,message.input,randomUUID());process.send?.({state:'DONE'});
    }
  }catch{process.send?.({state:'FAILED'});process.exitCode=1;}
  finally{await database.close();process.disconnect();}
});
