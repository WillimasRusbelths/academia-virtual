import { afterEach,expect,test,vi } from 'vitest';
import { createExpirationScheduler,ExpirationSuspended } from './expiration-scheduler.js';
import type { ExpirationWork } from './expiration-scheduler.js';
const work=():ExpirationWork=>({async horizon(){return {id:'00000000-0000-4000-8000-000000000001',expiresAt:1n};},async page(){return [{id:'00000000-0000-4000-8000-000000000001',expiresAt:1n}];},async expire(){return 'EXPIRED';}});
afterEach(()=>vi.useRealTimers());
test('XH01 TV24 anomalía de autoridad suspende el lote y todos los ticks siguientes',async()=>{
  const f=work(),expire=vi.fn(async()=>{throw new ExpirationSuspended('CLOCK_UNHEALTHY');});f.expire=expire;const worker=createExpirationScheduler(f);
  try{await expect(worker.tick()).rejects.toMatchObject({reason:'CLOCK_UNHEALTHY'});expect(()=>worker.assertHealthy()).toThrow();await expect(worker.tick()).rejects.toThrow();expect(expire).toHaveBeenCalledTimes(1);}finally{await worker.beforeApplicationShutdown();}
});
test('XH02 TV21 configuración inválida durante descubrimiento detiene timer sin siguiente sondeo',async()=>{
  vi.useFakeTimers();const f=work(),horizon=vi.fn(async()=>{throw new ExpirationSuspended('CONFIGURATION_INVALID');});f.horizon=horizon;const worker=createExpirationScheduler(f),warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try{worker.onApplicationBootstrap();await vi.advanceTimersByTimeAsync(0);await vi.advanceTimersByTimeAsync(20000);expect(horizon).toHaveBeenCalledTimes(1);expect(()=>worker.assertHealthy()).toThrow();expect(warning).toHaveBeenCalledWith('SYSTEM ORDER_EXPIRATION TEMPORARILY_UNAVAILABLE');}finally{await worker.beforeApplicationShutdown();warning.mockRestore();}
});
