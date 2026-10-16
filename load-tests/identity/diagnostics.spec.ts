import { test,expect } from 'vitest';
import { identityDatabase } from '../../apps/api/tests/support/identity-database.js';
import { Diagnostics } from './diagnostics.ts';
test('telemetría conserva promesas/callbacks, correlación concurrente y omite SQL/valores',async()=>{
  const context=await identityDatabase('diagnostics');
  try{
    const diagnostic=new Diagnostics('diagnostic-controls');diagnostic.install(context.database.pool);
    const canary='private-diagnostic-canary';
    await Promise.all(Array.from({length:25},async()=>diagnostic.operation('me',async()=>{
      expect((await context.database.pool.query('SELECT $1::text AS value',[canary])).rows[0].value).toBe(canary);
      const client=await context.database.pool.connect();
      try{
        await client.query('SELECT 1');
        await new Promise<void>((resolve,reject)=>client.query('SELECT 2',(error,result)=>{if(error)reject(error);else{expect(result.rows[0]['?column?']).toBe(2);resolve();}}));
      }finally{client.release();}
    })));
    const result=diagnostic.write();expect(result.metrics['me/queries']).toMatchObject({count:25,p50:3,max:3});
    expect(result.metrics['me/sql/OTHER']?.count).toBe(75);
    expect(JSON.stringify(result)).not.toContain(canary);expect(JSON.stringify(result)).not.toContain('SELECT');
  }finally{await context.cleanup();}
},120000);
