import { test,expect } from 'vitest';
import { identityDatabase } from '../../apps/api/tests/support/identity-database.js';
import { sessionFixture } from '../../apps/api/tests/support/session-fixture.js';
import { databaseActivity,sessionCounts } from './observe.ts';
import type { LoadManifest } from './fixtures.ts';

test('conteo conserva su forma y separa lectura PostgreSQL de publicación',async()=>{
  const context=await identityDatabase('sample_times');
  try{
    const times:Date[]=[];
    const counts=await sessionCounts(context.database.pool,{accounts:[]} as unknown as LoadManifest,(_group,t)=>{
      expect(t.statementStartedAt instanceof Date).toBe(true);expect(t.readFinishedAt>=t.statementStartedAt).toBe(true);
      times.push(t.readFinishedAt);
    });
    expect(times).toHaveLength(3);expect(counts.sessions).toEqual({sessions:0,users:0,secrets:0,recent:0});
  }finally{await context.cleanup();}
},120000);
test('cuenta bloqueo real por transacción, incluso cuando pg_locks.database es NULL',async()=>{
  const context=await identityDatabase('load_metrics');const pool=context.database.pool;
  const fixture=await sessionFixture(context);const holder=await pool.connect(),waiter=await pool.connect();
  let pending:Promise<unknown>|undefined;
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',[fixture.userId]);
    await waiter.query('BEGIN');await waiter.query("SET LOCAL lock_timeout='5s'");
    pending=waiter.query('UPDATE "User" SET name=name WHERE id=$1',[fixture.userId]);
    let observed=0;for(let i=0;i<100;i++){observed=(await databaseActivity(pool)).lockWaiters;if(observed>0)break;await new Promise(resolve=>setTimeout(resolve,10));}
    expect(observed).toBeGreaterThan(0);
    await holder.query('ROLLBACK');await pending;await waiter.query('ROLLBACK');
    expect((await databaseActivity(pool)).lockWaiters).toBe(0);
  }finally{await holder.query('ROLLBACK');await pending?.catch(()=>undefined);await waiter.query('ROLLBACK');holder.release();waiter.release();await context.cleanup();}
},120000);
