import { expect, test, vi } from 'vitest';
import { ApiFailure } from '../../shared/api-client';
import type { ApiClient, ApiRequest } from '../../shared/api-client';
import { apiTarget, ids, admitted, order } from './test-contract';

/** Doble de capacidad shared solo UNIT. El transporte real se verifica en
 * app/enrollment-api.test.ts; aquí no se acredita HTTP ni persistencia. */
function fixture(data:unknown=admitted){
  const request=vi.fn<(path:string,options?:ApiRequest)=>Promise<unknown>>().mockResolvedValue(data);
  const client:ApiClient={async request<T>(path:string,options?:ApiRequest){return await request(path,options) as T|undefined;}};
  return {request,target:()=>apiTarget(client)};
}
test('WA01 ADMITTED conserva intención y seis cifras; no crea orden por interpretar 200',async()=>{
  const f=fixture();expect(await f.target().reserve({intentionId:ids.intention,groupIds:[ids.group]})).toEqual(admitted);
  expect(f.request).toHaveBeenCalledTimes(1);expect(f.request).toHaveBeenCalledWith('/enrollment/reservation-requests',expect.objectContaining({method:'POST',body:{intentionId:ids.intention,groupIds:[ids.group]}}));
});
test('WA02 preview solo envía groupIds; no crea intención ni autoridad de precio',async()=>{
  const f=fixture({items:[],totalMinor:'0',evaluatedAt:'2026-11-04T00:00:00.123456Z'});
  await f.target().preview([ids.group]);expect(f.request).toHaveBeenCalledTimes(1);expect(f.request).toHaveBeenCalledWith('/enrollment/selection-preview',expect.objectContaining({method:'POST',body:{groupIds:[ids.group]}}));
});
test('WA03 detalle mantiene importes exactos fuera de Number y timestamps sin Date',async()=>{
  const data={...order,totalMinor:'9007199254740993',items:[{...order.items[0],priceMinor:'9007199254740993'}]},f=fixture(data);
  expect(await f.target().order(ids.order)).toEqual(data);
});
test('WA04 consulta de intención usa GET y no reenvía confirmación',async()=>{
  const f=fixture();expect(await f.target().request(ids.intention)).toEqual(admitted);
  expect(f.request.mock.calls[0][0]).toBe('/enrollment/reservation-requests/'+ids.intention);
  expect(f.request.mock.calls[0][1]?.method??'GET').toBe('GET');expect(f.request).toHaveBeenCalledTimes(1);
});
for(const state of ['CONFIRMED','REJECTED'])test(`WA05 ${state} es dato de solicitud, no error HTTP`,async()=>{
  const data=state==='CONFIRMED'?{...admitted,state,orderId:ids.order}:{...admitted,state,decisionCode:'CAPACITY_UNAVAILABLE'},f=fixture(data);
  expect(await f.target().request(ids.intention)).toEqual(data);
});
for(const data of [null,{...admitted,state:'RESERVED'},{...admitted,admittedAt:'2026-11-04T00:00:00.001Z'},{...admitted,actorSessionReference:ids.order}])test(`WA06 DTO solicitud inválido ${JSON.stringify(data)}`,async()=>{
  const f=fixture(data);await expect(f.target().request(ids.intention)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('WA07 cliente sin datos tras respuesta incierta no equivale a confirmación',async()=>{
  const f=fixture();f.request.mockResolvedValue(undefined);
  await expect(f.target().reserve({intentionId:ids.intention,groupIds:[ids.group]})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(f.request).toHaveBeenCalledTimes(1);
});
for(const code of ['AUTH_REQUIRED','TEMPORARILY_UNAVAILABLE'] as const)test(`WA08 ${code} no provoca replay automático`,async()=>{
  const f=fixture();f.request.mockRejectedValue(new ApiFailure(code==='AUTH_REQUIRED'?401:503,code,'Consulta el resultado.'));
  await expect(f.target().reserve({intentionId:ids.intention,groupIds:[ids.group]})).rejects.toMatchObject({code});expect(f.request).toHaveBeenCalledTimes(1);
});
