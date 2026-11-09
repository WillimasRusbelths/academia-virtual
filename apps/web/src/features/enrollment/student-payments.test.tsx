import { expect,test,vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEnrollmentApi } from './api';
import type { EnrollmentApi } from './api';
import type { ApiClient,ApiRequest } from '../../shared/api-client';
import { ApiFailure } from '../../shared/api-client';
import { createPaymentController,PaymentPanel } from './order-page';
import { createEnrollmentsController } from './enrollments-page';
import { ids,order } from './test-contract';
import { enrollment,attempt,apiFixture,deferred } from './payment-test-contract';

function fixture(data:unknown){
  const request=vi.fn<(path:string,options?:ApiRequest)=>Promise<unknown>>().mockResolvedValue(data);
  const client:ApiClient={async request<T>(path:string,options?:ApiRequest){return await request(path,options) as T|undefined;}};
  return {request,api:createEnrollmentApi(client)};
}
test('SC01 iniciación solo envía initiationId, sin dinero, titular o reloj',async()=>{
  const f=fixture(attempt);expect(await f.api.initiatePayment(ids.order,ids.intention)).toEqual(attempt);
  expect(f.request).toHaveBeenCalledExactlyOnceWith('/enrollment/orders/'+ids.order+'/payment-attempts',{method:'POST',body:{initiationId:ids.intention},signal:undefined});
});
for(const value of [{...attempt,providerPaymentId:'private'}, {...attempt,state:'PAID'},null])test('SC02 rechaza respuesta de intento abierta o desconocida '+JSON.stringify(value),async()=>{
  await expect(fixture(value).api.initiatePayment(ids.order,ids.intention)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('SC03 listado y detalle usan GET y conservan fechas exactas originales',async()=>{
  const page={items:[enrollment],total:1,page:1,pageSize:20},f=fixture(page);expect(await f.api.enrollments()).toEqual(page);
  expect(f.request.mock.calls[0]).toEqual(['/enrollment/enrollments',{query:{page:1,pageSize:20},signal:undefined}]);
  f.request.mockResolvedValue(enrollment);expect(await f.api.enrollment(enrollment.id)).toEqual(enrollment);
});
for(const data of [{...enrollment,paymentId:'private'},{...enrollment,validUntil:'2090-04-01T05:00:00.000Z'},{...enrollment,state:'ACTIVE'},{...enrollment,id:ids.group}])test('SC04 detalle de matrícula inválido o ajeno '+JSON.stringify(data),async()=>{
  await expect(fixture(data).api.enrollment(enrollment.id)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('SC05 consulta NOT_PAID tras respuesta perdida conserva repetición con la misma identidad',async()=>{
  const api=apiFixture();api.initiatePayment.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Consulta.')).mockResolvedValueOnce(attempt);
  api.order.mockResolvedValue(order);const id=vi.fn(()=>ids.intention),flow=createPaymentController(api,{initiationId:id});
  await flow.start(ids.order);await flow.refresh();expect(flow.snapshot().status).toBe('UNCERTAIN');await flow.replay();
  expect(api.initiatePayment.mock.calls.map(call=>call.slice(0,2))).toEqual([[ids.order,ids.intention],[ids.order,ids.intention]]);expect(id).toHaveBeenCalledTimes(1);
});
test('SC06 rechazo definitivo consultado permite nueva identidad solo al pulsar iniciar',async()=>{
  const api=apiFixture();api.initiatePayment.mockResolvedValueOnce({...attempt,state:'FAILED_NO_CHARGE'}).mockResolvedValueOnce(attempt);api.order.mockResolvedValue(order);
  const next=vi.fn().mockReturnValueOnce(ids.intention).mockReturnValueOnce(ids.group),flow=createPaymentController(api,{initiationId:next});
  await flow.start(ids.order);await flow.refresh();expect(api.initiatePayment).toHaveBeenCalledTimes(1);await flow.start(ids.order);expect(api.initiatePayment.mock.calls[1][1]).toBe(ids.group);
});
test('SC07 logout en listado descarta respuesta tardía y aborta lectura',async()=>{
  const wait=deferred<Awaited<ReturnType<EnrollmentApi['enrollments']>>>();
  const api={enrollments:vi.fn<EnrollmentApi['enrollments']>().mockReturnValue(wait.promise),enrollment:vi.fn<EnrollmentApi['enrollment']>()};
  const flow=createEnrollmentsController(api),pending=flow.list();flow.logout();wait.resolve({items:[],total:0,page:1,pageSize:20});await pending;
  expect(api.enrollments.mock.calls[0][1]?.aborted).toBe(true);expect(flow.snapshot()).toEqual({status:'EMPTY'});
});
test('SC08 error de permiso limpia un detalle de matrícula previamente consultado',async()=>{
  const f=fixture(enrollment),flow=createEnrollmentsController(f.api);await flow.open(enrollment.id);expect(flow.snapshot().enrollment?.id).toBe(enrollment.id);
  f.request.mockRejectedValue(new ApiFailure(401,'AUTH_REQUIRED','Accede.'));await flow.refresh();expect(flow.snapshot()).toEqual({status:'AUTH_REQUIRED'});
});
test('SC09 pago adicional en conciliación conserva matrícula confirmada por la orden',async()=>{
  const api=apiFixture();api.order.mockResolvedValue({...order,state:'ENROLLED',paymentState:'INCIDENT',paymentAllowed:false,incidentSummary:'Pago en conciliación, sin matrícula.'});
  const flow=createPaymentController(api,{initiationId:()=>ids.intention});await flow.start(ids.order);await flow.refresh();expect(flow.snapshot().status).toBe('APPLIED');
  const html=renderToStaticMarkup(createElement(PaymentPanel,{state:flow.snapshot()}));expect(html).toContain('Las matrículas confirmadas se conservan.');expect(html).not.toContain('Pago en conciliación, sin matrícula.');
});
