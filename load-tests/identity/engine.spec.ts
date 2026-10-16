import {test,expect} from 'vitest';
import {identityDatabase} from '../../apps/api/tests/support/identity-database.js';
import {engineSnapshot} from './engine.ts';
test('motor agrega tiempos internos sin publicar SQL ni valores de consulta',async()=>{
  const context=await identityDatabase('engine_observation');
  try{
    const canary='private-engine-canary';await context.database.pool.query('SELECT $1::text',[canary]);
    const sample=await engineSnapshot(context.database.pool),serialized=JSON.stringify(sample);
    expect(sample.settings).toMatchObject({io:'on',wal:'on',planning:'on',installed:true});
    expect(Array.isArray(sample.statements)).toBe(true);expect(serialized).not.toContain(canary);
    expect(serialized).not.toContain('SELECT');expect(serialized).not.toContain('queryid');
    expect(sample.database).not.toHaveProperty('datname');expect(sample.database).not.toHaveProperty('datid');
  }finally{await context.cleanup();}
},120000);
