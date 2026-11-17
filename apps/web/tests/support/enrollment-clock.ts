import type { Pool } from 'pg';
import type { AcademicOfferingDataset } from '../../../api/tests/support/academic-offering.js';

/** Publica reloj y sesiones de la fixture juntos, incluso con solicitudes en vuelo. */
export async function advanceBrowserClockWithSessions(pool:Pool,instant:string){
  if(process.env.APP_ENV!=='test')throw new Error('Reloj fuera del ensayo.');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const schema=(await client.query<{schema:string}>('SELECT current_schema() AS schema')).rows[0].schema;
    if(!/^t_[a-z0-9_]+$/.test(schema))throw new Error('Reloj fuera del esquema aislado.');
    const changed=await client.query('UPDATE "BrowserClock" SET instant=$1::timestamptz WHERE id=1',[instant]);
    if(changed.rowCount!==1)throw new Error('Falta reloj de la fixture.');
    await client.query(`UPDATE "Session" SET "createdAt"=(SELECT instant FROM "BrowserClock")-interval '1 minute',"lastAcceptedAt"=(SELECT instant FROM "BrowserClock")-interval '1 minute',"absoluteExpiresAt"=(SELECT instant FROM "BrowserClock")+interval '7 hours 59 minutes'`);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

/** Reloj SQL solo de un esquema de ensayo; la API captura sus propios instantes. */
export async function enrollmentClock(data:AcademicOfferingDataset){
  const context=data.context,schema=context.isolated.schema;
  if(!/^t_[a-z0-9_]+$/.test(schema))throw new Error('Reloj fuera del ensayo.');
  await context.isolated.ownerQuery(`CREATE TABLE "BrowserClock" (id int PRIMARY KEY, instant timestamptz NOT NULL);
    INSERT INTO "BrowserClock" VALUES (1,'2090-01-02T04:59:59.999999Z');
    CREATE FUNCTION clock_timestamp() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$ SELECT instant FROM "BrowserClock" WHERE id=1 $$`);
  const configure=(pool:Pool)=>{pool.options.options=`-c search_path=${schema},pg_catalog -c timezone=UTC`;};
  configure(context.database.pool);
  await context.database.pool.query(`UPDATE "Session" SET "createdAt"='2090-01-02T04:58:00Z',"lastAcceptedAt"='2090-01-02T04:58:00Z',"absoluteExpiresAt"='2090-01-02T12:58:00Z'`);
  return {configure,
    async now(){return (await context.database.pool.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now;},
    async set(at:Date){await context.database.pool.query('UPDATE "BrowserClock" SET instant=$1 WHERE id=1',[at]);},
    async advance(milliseconds:number){await context.database.pool.query(`UPDATE "BrowserClock" SET instant=instant+($1*interval '1 millisecond') WHERE id=1`,[milliseconds]);},
  };
}
