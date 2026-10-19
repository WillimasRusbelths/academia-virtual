import { test,expect } from 'vitest';
import type { PoolClient } from 'pg';
import { identityDatabase } from '../../apps/api/tests/support/identity-database.js';
import { ConnectionLeases } from './connection-leases.ts';

test('mide retención hasta release, reuso y transacción sin conservar SQL o datos',async()=>{
  const context=await identityDatabase('lease_probe');
  try{
    const pool=context.database.pool,probe=new ConnectionLeases(pool);
    const client=await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_sleep(0.02), $1::text AS secret',['lease-private-canary']);
    await client.query('COMMIT');client.release();
    expect((await pool.query('SELECT $1::int AS value',[7])).rows[0].value).toBe(7);
    const result=probe.stop();
    expect(result.active).toBe(0);expect(result.releaseErrors).toBe(0);
    expect(result.kinds.transaction?.queries).toMatchObject({count:1,total:3});
    expect(result.kinds.transaction!.heldMs.total).toBeGreaterThanOrEqual(20);
    expect(result.kinds.other?.queries).toMatchObject({count:1,total:1});
    const output=JSON.stringify(result);expect(output).not.toContain('lease-private-canary');expect(output).not.toContain('pg_sleep');
    await pool.query('SELECT 1');expect(probe.stop()).toEqual(result);
  }finally{await context.cleanup();}
});

test('conserva callbacks, release delegado y errores de consulta',async()=>{
  const context=await identityDatabase('lease_callbacks');
  try{
    const pool=context.database.pool,probe=new ConnectionLeases(pool);
    await new Promise<void>((resolve,reject)=>pool.connect((error,client,release)=>{
      if(error){reject(error);return;}
      (client as PoolClient).query('SELECT $1::int AS value',[9],(failure,result)=>{release();if(failure)reject(failure);else{expect(result.rows[0].value).toBe(9);resolve();}});
    }));
    await expect(pool.query('SELECT invalid_lease_probe_column')).rejects.toThrow();
    const result=probe.stop();expect(result.active).toBe(0);expect(result.kinds.other?.heldMs.count).toBe(2);
    expect(result.kinds.other?.queries.total).toBe(2);expect(result.releaseErrors).toBe(1);
  }finally{await context.cleanup();}
});
