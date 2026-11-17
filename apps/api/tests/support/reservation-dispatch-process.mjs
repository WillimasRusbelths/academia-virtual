import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { loadEnvironment } from '../../dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../dist/src/infrastructure/database/database.js';
import { PostgresSessionStore } from '../../dist/src/modules/identity/infrastructure/session-store.js';
import { createReservationOfferingParticipant } from '../../dist/src/modules/academic-offering/infrastructure/reservation-participant.js';

const environment=loadEnvironment();
if(environment.appEnv!=='test'||!/^t_[a-z0-9_]+$/.test(environment.databaseSchema))process.exit(1);
const database=createDatabase(environment),pool=database.pool;
try{
  process.send?.({phase:'ready',pid:(await pool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid});
  if(process.env.DISPATCH_PROCESS_PHASE==='probe'){await database.close();process.exit(0);}
  const hold=()=>new Promise(resolve=>process.once('message',resolve));
  const decorated=new Proxy(pool,{get(target,key){
    if(key==='connect')return async()=>{
      const client=await target.connect();
      return new Proxy(client,{get(connection,member){
        if(member==='query')return async(sql,values)=>{
          if(sql==='COMMIT'&&process.env.DISPATCH_PROCESS_PHASE==='beforeCommit'){process.send?.({phase:'beforeCommit'});await hold();}
          const result=await connection.query(sql,values);
          if(sql==='COMMIT'&&process.env.DISPATCH_PROCESS_PHASE==='afterCommit'){process.send?.({phase:'afterCommit'});await hold();}
          return result;
        };
        const value=Reflect.get(connection,member);return typeof value==='function'?value.bind(connection):value;
      }});
    };
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  const {createReservationDispatcher}=await import('../../dist/src/modules/enrollment/infrastructure/dispatch.js');
  const sessions=new PostgresSessionStore(pool);
  await createReservationDispatcher(decorated,{revalidateInTransaction:sessions.revalidateInTransaction.bind(sessions)},createReservationOfferingParticipant).dispatchNext(randomUUID());
  await database.close();process.exit(0);
}catch{process.send?.({phase:'failed'});await database.close();process.exit(1);}
