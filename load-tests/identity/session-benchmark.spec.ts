import { test,expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { identityDatabase } from '../../apps/api/tests/support/identity-database.js';
import { sessionFixture } from '../../apps/api/tests/support/session-fixture.js';
import { PostgresSessionStore } from '../../apps/api/src/modules/identity/infrastructure/session-store.js';
import { PostgresUserQueries } from '../../apps/api/src/modules/users/infrastructure/user-queries.js';
import { Diagnostics } from './diagnostics.ts';
import { engineSnapshot } from './engine.ts';
import { ConnectionLeases } from './connection-leases.ts';

test('diagnóstico aislado del recorrido de persistencia; no acredita capacidad HTTP',async()=>{
  const name=process.env.LOAD_BENCH_NAME;if(!/^[a-z0-9_-]+$/.test(name??''))throw new Error('Nombre explícito requerido.');
  const context=await identityDatabase('session_diagnostic');
  try{
    const fixtures=await Promise.all(Array.from({length:100},()=>sessionFixture(context)));
    const diagnostic=new Diagnostics(name!),store=new PostgresSessionStore(context.database.pool),users=new PostgresUserQueries(context.database.pool);
    const tracing=process.env.LOAD_BENCH_TRACE!=='off';
    if(tracing)diagnostic.install(context.database.pool);
    const operation=async(index:number)=>diagnostic.operation('me',async()=>{
      const fixture=fixtures[index]!,actor=await store.lookup(fixture.secret);
      expect(actor?.userId).toBe(fixture.userId);expect((await users.getOwn(actor!))?.id).toBe(fixture.userId);expect(await store.accept(actor!)).toBe(true);
    });
    const engineBefore=process.env.LOAD_ENGINE_DIAGNOSTICS==='1'?await engineSnapshot(context.database.pool):undefined;
    const leaseProbe=process.env.LOAD_BENCH_LEASES==='1'?new ConnectionLeases(context.database.pool):undefined;
    const startedAt=new Date().toISOString();
    for(let i=0;i<50;i++)await operation(i%100);
    const concurrentStart=performance.now();
    await Promise.all(fixtures.map(async(_,i)=>{for(let n=0;n<20;n++)await operation(i);}));
    const concurrentMs=performance.now()-concurrentStart;
    const leases=leaseProbe?.stop();
    const engineAfter=engineBefore?await engineSnapshot(context.database.pool):undefined;
    const result={name,tracing,startedAt,finishedAt:new Date().toISOString(),concurrency:100,operations:2000,concurrentMs,engineBefore,engineAfter,leases,diagnostic:diagnostic.write()};
    writeFileSync('/load-private/'+name+'-benchmark.json',JSON.stringify(result),{mode:0o600});
    expect(result.diagnostic.metrics['me/wall']?.count).toBe(2050);
    if(leases){expect(leases.releaseErrors).toBe(0);for(const kind of ['transaction','snapshot','profile'])expect(leases.kinds[kind]?.heldMs.count).toBe(2050);}
  }finally{await context.cleanup();}
},240000);
