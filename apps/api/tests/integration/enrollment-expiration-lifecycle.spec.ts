import { expect,test } from 'vitest';
import { RESERVATION_EXPIRATION_LIFECYCLE } from '../../dist/src/modules/enrollment/enrollment.module.js';
import type { ExpirationWorker } from '../../src/modules/enrollment/infrastructure/expiration-scheduler.js';
import { ExpirationSuspended } from '../../src/modules/enrollment/infrastructure/expiration-scheduler.js';
import { expirationFixture,assertExpired } from '../support/reservation-expiration.js';
import { us1Http } from '../support/us1-http.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';

type Fixture=Awaited<ReturnType<typeof expirationFixture>>;
const open=(f:Fixture)=>us1Http({context:f,expirationWorker:true,clock:{configure(pool){pool.options.options=`-c search_path=${f.isolated.schema},pg_catalog -c timezone=UTC`;}}});

test('EL01 TV12/TV21 AppModule arranca vencimiento durable y segundo arranque conserva efecto/plazo',async()=>{
  const f=await expirationFixture();let http:Awaited<ReturnType<typeof open>>|undefined;
  try{
    await f.boundary(0);http=await open(f);
    await expect.poll(async()=>(await f.pool.query('SELECT state FROM "EnrollmentOrder"')).rows[0].state).toBe('EXPIRED');await assertExpired(f);
    await http.close();http=undefined;const before=await financialFingerprint(f.pool);http=await open(f);
    await http.app.get<ExpirationWorker>(RESERVATION_EXPIRATION_LIFECYCLE).tick();
    expect(await financialFingerprint(f.pool)).toBe(before);await assertExpired(f);
  }finally{await http?.close();await f.close();}
},120000);

test('EL02 TV21 shutdown espera worker bloqueado y solo después cierra pool compartido',async()=>{
  const f=await expirationFixture();let http:Awaited<ReturnType<typeof open>>|undefined;
  const lock=await f.pool.connect();let closing:Promise<void>|undefined;
  try{
    http=await open(f);const worker=http.app.get<ExpirationWorker>(RESERVATION_EXPIRATION_LIFECYCLE);await worker.tick();await f.boundary(0);
    await lock.query('BEGIN');const pid=Number((await lock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    await lock.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.groupId]);const pending=worker.tick();
    await expect.poll(async()=>(await f.pool.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS waiting',[pid])).rows[0].waiting).toBe(true);
    let closed=false;closing=http.close().then(()=>{closed=true;});await new Promise(resolve=>setTimeout(resolve,40));expect(closed).toBe(false);
    expect((await http.database.pool.query('SELECT 1 AS n')).rows[0].n).toBe(1);
    await lock.query('ROLLBACK');await pending;await closing;http=undefined;await assertExpired(f);
    expect(await worker.tick()).toEqual({examined:0,expired:0,failed:0});
  }finally{await lock.query('ROLLBACK');lock.release();await closing;await http?.close();await f.close();}
},120000);

test('EL03 TV24 reloj retrocede durante operación: suspende worker y readiness sin mutar orden',async()=>{
  const f=await expirationFixture();let http:Awaited<ReturnType<typeof open>>|undefined;
  try{
    http=await open(f);const worker=http.app.get<ExpirationWorker>(RESERVATION_EXPIRATION_LIFECYCLE);await worker.tick();const before=await financialFingerprint(f.pool);
    await f.set('2089-12-29T00:00:00.123456Z');await expect(worker.tick()).rejects.toMatchObject({reason:'CLOCK_UNHEALTHY'});
    expect(()=>worker.assertHealthy()).toThrow();expect((await fetch(http.url+'/health/ready')).status).toBe(503);
    await f.boundary(0);await expect(worker.tick()).rejects.toMatchObject({reason:'CLOCK_UNHEALTHY'});expect(await financialFingerprint(f.pool)).toBe(before);
  }finally{await http?.close();await f.close();}
},120000);

test('EL04 TV24 reinicio compara reloj con hechos persistidos aunque no haya candidatas',async()=>{
  const f=await expirationFixture(),worker=f.worker();
  try{
    await f.set('2089-12-29T00:00:00.123456Z');const before=await financialFingerprint(f.pool);
    await expect(worker.tick()).rejects.toBeInstanceOf(ExpirationSuspended);expect(await financialFingerprint(f.pool)).toBe(before);
    await f.boundary(0);await expect(worker.tick()).rejects.toMatchObject({reason:'CLOCK_UNHEALTHY'});
  }finally{await worker.beforeApplicationShutdown();await f.close();}
},120000);
