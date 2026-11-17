import { randomUUID } from 'node:crypto';
import { expect,test } from 'vitest';
import { expirationFixture,assertExpired } from '../support/reservation-expiration.js';
import type { ExpirationFixture } from '../support/reservation-expiration.js';
import { us1Http } from '../support/us1-http.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { createReservationDispatcher } from '../../src/modules/enrollment/infrastructure/dispatch.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';

type Http=Awaited<ReturnType<typeof us1Http>>;
async function open(f:ExpirationFixture){const h=await us1Http({context:f,clock:{configure(pool){pool.options.options=`-c search_path=${f.isolated.schema},pg_catalog -c timezone=UTC`;}}});let closed=false;return {...h,async close(){if(closed)return;closed=true;await h.close();}};}
function http(name:string,work:(f:ExpirationFixture,h:Http)=>Promise<void>){test(name,async()=>{const f=await expirationFixture();let h:Http|undefined;try{h=await open(f);await work(f,h);}finally{await h?.close();await f.close();}},120000);}
for(const delta of [-1,0,1])http('HX01 TV13/TV22 GET en límite '+delta+'µs sin worker',async(f,h)=>{
  await f.boundary(delta);await f.refreshSessions();const before=await financialFingerprint(f.pool);
  const response=await h.get('/enrollment/orders/'+f.original.id,f.student.secret);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await response.json()).data).toMatchObject({state:delta<0?'RESERVED':'EXPIRED',confirmedAt:f.original.confirmedAt,expiresAt:f.original.expiresAt});expect(await financialFingerprint(f.pool)).toBe(before);
});
http('HX02 TV13 consulta libera inventario efectivo sin modificar filas ni auditoría',async(f,h)=>{
  await f.boundary(0);await f.refreshSessions();const before=await financialFingerprint(f.pool);
  const response=await h.get('/enrollment/offerings?page=1&pageSize=20',f.student.secret);expect(response.status).toBe(200);
  expect((await response.json()).data.items.find((row:{groupId:string})=>row.groupId===f.groupId)).toMatchObject({reserved:0,occupied:0,available:1});expect(await financialFingerprint(f.pool)).toBe(before);
});
http('HX03 TV12/TV22 cerrar y reconstruir API conserva resultado e instantes',async(f,h)=>{
  await f.boundary(0);await f.refreshSessions();const first=(await (await h.get('/enrollment/orders/'+f.original.id,f.student.secret)).json()).data;
  await h.close();const restarted=await open(f);
  try{const response=await restarted.get('/enrollment/orders/'+f.original.id,f.student.secret);expect(response.status).toBe(200);expect((await response.json()).data).toEqual(first);expect((await f.pool.query('SELECT state FROM "EnrollmentOrder"')).rows[0].state).toBe('RESERVED');}finally{await restarted.close();}
});
http('HX04 TV13/TV22 logout niega lectura pero SYSTEM normaliza sin sesión viva',async(f,h)=>{
  await f.boundary(0);await f.refreshSessions();const logout=await h.post('/auth/logout',{},f.student.secret);expect(logout.status).toBe(204);
  expect((await h.get('/enrollment/orders/'+f.original.id,f.student.secret)).status).toBe(401);await f.normalize();await assertExpired(f);
});
http('HX05 TV17 nueva intención tras abandono sin sanción y replay anterior no renueva',async(f,h)=>{
  await f.boundary(0);await f.refreshSessions();const intentionId=randomUUID();
  const response=await h.post('/enrollment/reservation-requests',{intentionId,groupIds:[f.groupId]},f.student.secret);expect(response.status).toBe(200);expect((await response.json()).data.state).toBe('ADMITTED');
  expect((await createReservationDispatcher(f.pool,f.authorization,createReservationOfferingParticipant).dispatchNext(randomUUID())).state).toBe('CONFIRMED');await assertExpired(f);
  const result=(await (await h.get('/enrollment/reservation-requests/'+intentionId,f.student.secret)).json()).data;expect(result.state).toBe('CONFIRMED');expect(result.orderId).not.toBe(f.original.id);
  const older=(await (await h.get('/enrollment/orders/'+f.original.id,f.student.secret)).json()).data;expect(older).toMatchObject({state:'EXPIRED',confirmedAt:f.original.confirmedAt,expiresAt:f.original.expiresAt});
});
for(const route of ['/enrollment/orders/expire','/enrollment/reservations/release'])http('HX06 usuario no puede forzar vencimiento por '+route,async(f,h)=>{
  const before=await financialFingerprint(f.pool);expect((await h.post(route,{orderId:f.original.id,actorKind:'SYSTEM'},f.student.secret)).status).toBe(404);expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const field of ['serverNow','expiresAt','expirationProcessedAt'])http('HX07 TV22 cliente no decide '+field,async(f,h)=>{
  const before=await financialFingerprint(f.pool);const response=await h.post('/enrollment/reservation-requests',{intentionId:randomUUID(),groupIds:[f.groupId],[field]:'2099-01-01T00:00:00.000000Z'},f.student.secret);expect(response.status).toBe(400);expect(await financialFingerprint(f.pool)).toBe(before);
});
http('HX08 TV16 APPLIED mantiene ENROLLED/matrículas después del plazo',async(f,h)=>{
  expect((await f.processor().finalize(f.first)).state).toBe('APPLIED');await f.boundary(1);await f.refreshSessions();const before=await financialFingerprint(f.pool);
  const response=await h.get('/enrollment/orders/'+f.original.id,f.student.secret);expect(response.status).toBe(200);expect((await response.json()).data.state).toBe('ENROLLED');
  expect((await (await h.get('/enrollment/enrollments',f.student.secret)).json()).data.total).toBe(2);expect(await financialFingerprint(f.pool)).toBe(before);
});
http('HX09 TV25 recibo pendiente no extiende ni fabrica pago/matrícula al vencer',async(f,h)=>{
  await f.boundary(0);await f.refreshSessions();const response=await h.get('/enrollment/orders/'+f.original.id,f.student.secret);expect(response.status).toBe(200);expect((await response.json()).data).toMatchObject({state:'EXPIRED',paymentAllowed:false});
  expect((await f.pool.query('SELECT state FROM "ProviderReceipt"')).rows).toEqual([{state:'RECEIVED'}]);expect((await f.pool.query('SELECT count(*)::int AS n FROM "VerifiedPayment"')).rows[0].n).toBe(0);
});
http('HX10 TV21 cierre y recuperación con worker real mantienen materialización',async(f,h)=>{
  await f.boundary(0);await f.refreshSessions();const worker=f.worker();try{await worker.tick();await assertExpired(f);const response=await h.get('/enrollment/orders/'+f.original.id,f.student.secret);expect(response.status).toBe(200);expect((await response.json()).data.state).toBe('EXPIRED');}finally{await worker.beforeApplicationShutdown();}
});
http('HX11 T065 TV24 retroceso detectable no fabrica disponibilidad',async(f,h)=>{
  await f.set('2089-12-29T00:00:00.123456Z');await f.refreshSessions();const before=await financialFingerprint(f.pool);
  expect((await h.get('/enrollment/orders/'+f.original.id,f.student.secret)).status).toBe(503);
  expect((await h.get('/enrollment/offerings?page=1&pageSize=20',f.student.secret)).status,'T065 pendiente: lectura temporal no debe presentar cupo con reloj anterior al compromiso conocido').toBe(503);expect(await financialFingerprint(f.pool)).toBe(before);
});
