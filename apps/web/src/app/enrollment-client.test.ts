import { expect, test, vi } from 'vitest';
import { createApiClient, enrollmentApi } from './http';
import { RequestCancelled } from '../shared/api-client';
import { ids, admitted, order } from '../features/enrollment/test-contract';

function fixture(value:unknown){const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({data:value})));return {transport,api:enrollmentApi(createApiClient(vi.fn(),transport))};}
test('WC01 adaptación app/shared conserva 200 ADMITTED, CSRF y no-store',async()=>{
  const f=fixture(admitted);expect(await f.api.reserve({intentionId:ids.intention,groupIds:[ids.group]})).toEqual(admitted);
  expect(f.transport).toHaveBeenCalledTimes(1);expect(f.transport.mock.calls[0]).toMatchObject(['/api/v1/enrollment/reservation-requests',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'X-CSRF-Protection':'1'}}]);
});
test('WC02 listas y current nulo usan GET con paginación recuperable',async()=>{
  const f=fixture({items:[admitted],total:1,page:1,pageSize:20});expect((await f.api.requests()).items).toEqual([admitted]);
  expect(f.transport.mock.calls[0][0]).toBe('/api/v1/enrollment/reservation-requests?page=1&pageSize=20');
  expect(await fixture(null).api.currentOrder()).toBeNull();
});
for(const [name,change]of [
  ['fracciones',{confirmedAt:'2026-11-04T00:00:00.123Z'}],['fecha imposible',{serverNow:'2026-02-30T00:00:00.000001Z'}],
  ['plazo alterado',{expiresAt:'2026-11-05T00:00:00.123457Z'}],['total número',{totalMinor:12500}],['total incoherente',{totalMinor:'12501'}],
  ['campo privado',{providerPaymentId:'private'}],['pago vencido',{serverNow:order.expiresAt}],['estado de pago',{paymentState:'VERIFIED_IN_BROWSER'}],
] as const)test(`WC03 DTO inválido ${name} no se convierte en orden`,async()=>{
  await expect(fixture({...order,...change}).api.order(ids.order)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('WC04 año ampliado conserva seis fracciones sin Date',async()=>{
  const value={...order,items:[{...order.items[0],groupStartAt:'9999-12-31T05:00:00.000000Z',enrollmentValidUntil:'+010000-01-01T05:00:00.000000Z'}]};
  expect(await fixture(value).api.order(ids.order)).toEqual(value);
});
test('WC05 202 no se interpreta ni reenvía y cancelación conserva generación',async()=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({data:admitted}),{status:202}));
  const client=createApiClient(vi.fn(),transport);await expect(enrollmentApi(client).reserve({intentionId:ids.intention,groupIds:[ids.group]})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(transport).toHaveBeenCalledTimes(1);
  const controller=new AbortController();controller.abort();await expect(enrollmentApi(client).request(ids.intention,controller.signal)).rejects.toBeInstanceOf(RequestCancelled);
  expect(transport).toHaveBeenCalledTimes(1);
});
const original=order.items[0];
const offering={groupId:ids.group,courseId:original.courseId,courseName:original.courseName,groupName:original.groupName,teacherName:'Docente ficticio',
  periodStart:original.periodStart,periodEnd:original.periodEnd,timeZone:original.timeZone,schedule:original.schedule,capacity:1,reserved:0,occupied:0,available:1,priceMinor:'12500',currency:'PEN'};
const inventoryPage={items:[offering],total:1,page:1,pageSize:20,evaluatedAt:order.serverNow};
for(const priceMinor of [null,'0'])test(`WC06 oferta conserva precio ${priceMinor}`,async()=>{
  const f=fixture({...inventoryPage,items:[{...offering,priceMinor}]});expect((await f.api.offerings()).items[0].priceMinor).toBe(priceMinor);
});
for(const change of [{available:0},{reserved:2,available:0},{teacherEligibilityVersion:'private'}])test(`WC07 inventario inválido ${JSON.stringify(change)}`,async()=>{
  await expect(fixture({...inventoryPage,items:[{...offering,...change}]}).api.offerings()).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('WC08 preview comprueba total y conserva selección sin admisión',async()=>{
  const data={items:[offering],totalMinor:'12500',evaluatedAt:order.serverNow};expect(await fixture(data).api.preview([ids.group])).toEqual(data);
  await expect(fixture({...data,totalMinor:'0'}).api.preview([ids.group])).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('WC09 respuestas de otra intención u orden se rechazan',async()=>{
  await expect(fixture({...admitted,intentionId:ids.order}).api.request(ids.intention)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  await expect(fixture({...order,id:ids.group}).api.order(ids.order)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
