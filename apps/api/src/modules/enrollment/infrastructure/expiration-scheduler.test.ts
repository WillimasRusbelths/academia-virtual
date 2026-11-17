import { afterEach,expect,test,vi } from 'vitest';
import { schedulerTarget } from '../../../../tests/support/expiration-contract.js';
import type { ExpirationCandidate,ExpirationWork } from '../../../../tests/support/expiration-contract.js';
import { ref } from '../../../../tests/support/reservation-domain.js';

const candidate=(n:number):ExpirationCandidate=>({id:ref(n),expiresAt:BigInt(n)});
function gate(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
function fixture(numbers=[1,2,3]){
  const rows=numbers.map(candidate),calls:string[]=[];
  const work:ExpirationWork={horizon:vi.fn(async()=>rows.at(-1)??null),page:vi.fn(async({after,through,limit})=>rows.filter(row=>(!after||row.expiresAt>after.expiresAt||row.expiresAt===after.expiresAt&&row.id>after.id)&&(row.expiresAt<through.expiresAt||row.expiresAt===through.expiresAt&&row.id<=through.id)).slice(0,limit)),expire:vi.fn(async id=>{calls.push(id);rows.splice(rows.findIndex(row=>row.id===id),1);return 'EXPIRED' as const;})};
  return {work,rows,calls};
}
afterEach(()=>vi.useRealTimers());
test('XS00 control: candidatas ficticias y puertos no normalizan por sí solos',()=>{const f=fixture();expect(f.rows.map(row=>row.expiresAt)).toEqual([1n,2n,3n]);expect(f.calls).toEqual([]);});
test('XS01 TV21 ticks simultáneos comparten vuelo y no ejecutan candidatas dos veces',async()=>{
  const f=fixture([1]),entered=gate(),release=gate();f.work.expire=vi.fn(async id=>{f.calls.push(id);entered.resolve();await release.promise;return 'EXPIRED' as const;});
  const worker=schedulerTarget(f.work);const first=worker.tick(),second=worker.tick();
  try{await entered.promise;expect(first).toBe(second);expect(f.calls).toEqual([ref(1)]);}finally{release.resolve();await first;await second;await worker.beforeApplicationShutdown();}
});
test('XS02 TV20 lote por defecto20 no procesa el conjunto completo en una transacción',async()=>{
  const f=fixture(Array.from({length:25},(_,i)=>i+1)),worker=schedulerTarget(f.work);
  try{expect(await worker.tick()).toEqual({examined:20,expired:20,failed:0});expect(f.calls).toHaveLength(20);expect(await worker.tick()).toEqual({examined:5,expired:5,failed:0});expect(new Set(f.calls).size).toBe(25);}finally{await worker.beforeApplicationShutdown();}
});
test('XS03 TV20 fallida avanza cursor, horizonte finito excluye nuevas y después revisita',async()=>{
  const f=fixture();f.work.expire=vi.fn(async id=>{f.calls.push(id);if(id===ref(1))throw new Error('Fallo aislado ficticio');f.rows.splice(f.rows.findIndex(row=>row.id===id),1);return 'EXPIRED' as const;});
  const worker=schedulerTarget(f.work,{batchSize:1});
  try{
    expect(await worker.tick()).toEqual({examined:1,expired:0,failed:1});f.rows.push(candidate(4));
    await worker.tick();await worker.tick();await worker.tick();await worker.tick();
    expect(f.calls).toEqual([ref(1),ref(2),ref(3),ref(1),ref(4)]);expect(f.rows.map(row=>row.id)).toEqual([ref(1)]);
  }finally{await worker.beforeApplicationShutdown();}
});
test('XS04 TV19 55P03 no obtiene reintento inmediato dentro del tick',async()=>{
  const f=fixture([1]);f.work.expire=vi.fn(async()=>{throw Object.assign(new Error('Timeout ficticio'),{code:'55P03'});});const worker=schedulerTarget(f.work);
  try{expect(await worker.tick()).toEqual({examined:1,expired:0,failed:1});expect(f.work.expire).toHaveBeenCalledTimes(1);}finally{await worker.beforeApplicationShutdown();}
});
for(const outcome of ['NOT_DUE','ALREADY_TERMINAL'] as const)test('XS05 TV16 '+outcome+' no se cuenta como liberación',async()=>{
  const f=fixture([1]);f.work.expire=vi.fn(async()=>outcome);const worker=schedulerTarget(f.work);
  try{expect(await worker.tick()).toEqual({examined:1,expired:0,failed:0});}finally{await worker.beforeApplicationShutdown();}
});
test('XS06 TV21 inicio idempotente, sondeo5s y parada sin nuevos trabajos',async()=>{
  vi.useFakeTimers();const f=fixture([]),worker=schedulerTarget(f.work);
  try{worker.onApplicationBootstrap();worker.onApplicationBootstrap();await vi.advanceTimersByTimeAsync(0);expect(f.work.horizon).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(4999);expect(f.work.horizon).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(1);expect(f.work.horizon).toHaveBeenCalledTimes(2);}finally{await worker.beforeApplicationShutdown();}
  await vi.advanceTimersByTimeAsync(15000);expect(await worker.tick()).toEqual({examined:0,expired:0,failed:0});expect(f.work.horizon).toHaveBeenCalledTimes(2);
});
test('XS07 TV21 shutdown espera normalización activa sin apropiarse del pool',async()=>{
  const f=fixture([1]),entered=gate(),release=gate();f.work.expire=vi.fn(async()=>{entered.resolve();await release.promise;return 'EXPIRED' as const;});
  const worker=schedulerTarget(f.work),run=worker.tick();let closed=false;
  try{await entered.promise;const stop=worker.beforeApplicationShutdown().then(()=>{closed=true;});await Promise.resolve();expect(closed).toBe(false);release.resolve();await run;await stop;expect(closed).toBe(true);expect(await worker.tick()).toEqual({examined:0,expired:0,failed:0});}finally{release.resolve();await run;await worker.beforeApplicationShutdown();}
});
test('XS08 TV20 descubrimiento fallido no inventa candidatas o liberación',async()=>{
  const f=fixture();f.work.horizon=vi.fn(async()=>{throw new Error('Descubrimiento ficticio indisponible');});const worker=schedulerTarget(f.work);
  try{await expect(worker.tick()).rejects.toThrow();expect(f.calls).toEqual([]);}finally{await worker.beforeApplicationShutdown();}
});
for(const batchSize of [0,-1,21,1.5,Number.NaN])test('XS09 configuración rechaza lote '+batchSize,()=>{
  // La ausencia del objetivo falla antes de la expectativa de validación: no
  // presentar el error de conformidad como si el producto rechazara la opción.
  const probe=schedulerTarget(fixture([]).work);void probe.beforeApplicationShutdown();
  expect(()=>schedulerTarget(fixture().work,{batchSize})).toThrow();
});
for(const intervalMs of [0,-1,1.5])test('XS10 configuración rechaza intervalo '+intervalMs,()=>{
  const probe=schedulerTarget(fixture([]).work);void probe.beforeApplicationShutdown();expect(()=>schedulerTarget(fixture().work,{intervalMs})).toThrow();
});
test('XS11 TV20 empate temporal pagina por UUID sin saltar candidatas',async()=>{
  const f=fixture();for(let i=0;i<f.rows.length;i++)f.rows[i]={...f.rows[i],expiresAt:1n};const worker=schedulerTarget(f.work,{batchSize:1});
  try{await worker.tick();await worker.tick();await worker.tick();expect(f.calls).toEqual([ref(1),ref(2),ref(3)]);}finally{await worker.beforeApplicationShutdown();}
});
test('XS12 TV20 fallo aislado no aborta las demás candidatas del mismo lote',async()=>{
  const f=fixture();f.work.expire=vi.fn(async(id:string)=>{f.calls.push(id);if(id===ref(1))throw new Error('Fallo aislado ficticio');f.rows.splice(f.rows.findIndex(row=>row.id===id),1);return 'EXPIRED' as const;});const worker=schedulerTarget(f.work);
  try{expect(await worker.tick()).toEqual({examined:3,expired:2,failed:1});expect(f.calls).toEqual([ref(1),ref(2),ref(3)]);}finally{await worker.beforeApplicationShutdown();}
});
