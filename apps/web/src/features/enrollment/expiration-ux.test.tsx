import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect,test,vi } from 'vitest';
import { ApiFailure } from '../../shared/api-client';
import { OrderPage,PaymentPanel,createPaymentController } from './order-page';
import { ReservationPage,createReservationController,createReservationFlow } from './reservation-page';
import { ids,order,admitted } from './test-contract';
import type { EnrollmentApi,InventoryItem,Order,ReservationResult } from './api';
const confirmed={...admitted,state:'CONFIRMED',orderId:ids.order} as ReservationResult;
const expired={...order,state:'EXPIRED',paymentAllowed:false,serverNow:order.expiresAt} as Order;
const next='00000000-0000-4000-8000-000000000004';
const group:InventoryItem={groupId:ids.group,courseId:ids.intention,courseName:'Curso ficticio',groupName:'Grupo ficticio',teacherName:'Docente ficticio',periodStart:'2090-01-05',periodEnd:'2090-03-31',timeZone:'America/Lima',schedule:order.items[0].schedule,capacity:1,reserved:0,occupied:0,available:1,priceMinor:'12500',currency:'PEN'};
const page=<T,>(items:T[])=>({items,page:1,pageSize:20,total:items.length});
function api(){return {offerings:vi.fn().mockResolvedValue({...page([group]),evaluatedAt:expired.serverNow}),preview:vi.fn().mockResolvedValue({items:[group],totalMinor:'12500',evaluatedAt:expired.serverNow}),reserve:vi.fn().mockResolvedValue({...admitted,intentionId:next}),request:vi.fn().mockResolvedValue(confirmed),requests:vi.fn().mockResolvedValue(page([confirmed])),order:vi.fn().mockResolvedValue(expired),orders:vi.fn().mockResolvedValue(page([expired])),currentOrder:vi.fn().mockResolvedValue(null),initiatePayment:vi.fn(),enrollments:vi.fn().mockResolvedValue(page([])),enrollment:vi.fn()} satisfies EnrollmentApi;}
test('UX01 TV22 vencimiento conserva hora exacta del servidor y explica nueva selección sin penalización',()=>{
  const html=renderToStaticMarkup(createElement(OrderPage,{state:{status:'READY',order:expired}}));
  expect(html).toContain('aria-label="Hora del servidor">'+expired.serverNow);expect(html).toContain('sin penalización');expect(html).toContain('no asegura una plaza');
});
test('UX02 TV22 resultado incierto conserva historial y exige consulta antes de nueva selección',async()=>{
  const f=api(),allocate=vi.fn(()=>next),flow=createPaymentController(f,{order:expired,initiationId:allocate});
  f.order.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Temporal'));await flow.refresh();
  expect(flow.snapshot()).toMatchObject({status:'EXPIRED',queryUncertain:true,order:expired});
  await flow.start(expired.id);expect(f.initiatePayment).not.toHaveBeenCalled();expect(allocate).not.toHaveBeenCalled();
  const html=renderToStaticMarkup(createElement(OrderPage,{state:{status:'READY',order:flow.snapshot().order,uncertain:flow.snapshot().queryUncertain}}));
  expect(html).toContain('Estado actual pendiente de consulta.');expect(html).not.toContain('>Preparar nueva selección</a>');expect(html).toContain(expired.expiresAt);
  await flow.refresh();expect(flow.snapshot()).toMatchObject({status:'EXPIRED',queryUncertain:false,order:expired});
  const lost=api();lost.initiatePayment.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Temporal'));
  const payment=createPaymentController(lost,{order:order as Order,initiationId:()=>next});await payment.start(order.id);
  expect(payment.snapshot()).toMatchObject({status:'UNCERTAIN'});expect(payment.snapshot().queryUncertain).not.toBe(true);
  expect(renderToStaticMarkup(createElement(PaymentPanel,{state:payment.snapshot()}))).toContain('Resultado incierto.');
});
test('UX03 TV24 error de inventario no se presenta como ausencia de grupos',()=>{
  const html=renderToStaticMarkup(createElement(ReservationPage,{state:{status:'UNCERTAIN',items:[]}}));
  expect(html).not.toContain('No hay grupos disponibles');expect(html).toMatch(/incierto/i);
});
test('UX04 TV17 nueva intención requiere consulta, selección, preview y consentimiento nuevos',async()=>{
  const f=api(),allocate=vi.fn(()=>next),controller=createReservationController(f,{intentionId:allocate});
  await controller.recover();await controller.prepareNew();expect(f.order).toHaveBeenCalledWith(ids.order);expect(allocate).not.toHaveBeenCalled();expect(f.reserve).not.toHaveBeenCalled();
  controller.select(ids.group);await controller.confirm();expect(f.reserve).not.toHaveBeenCalled();await controller.preview();controller.consent(true);await controller.confirm();
  expect(f.reserve).toHaveBeenCalledExactlyOnceWith({intentionId:next,groupIds:[ids.group]});expect(allocate).toHaveBeenCalledTimes(1);expect(f.initiatePayment).not.toHaveBeenCalled();expect(expired.expiresAt).toBe(order.expiresAt);
});
test('UX05 TV22 revalidación incierta conserva intención anterior sin crear POST o UUID',async()=>{
  const f=api(),allocate=vi.fn(()=>next),flow=createReservationFlow(f,{intentionId:allocate});await flow.recover();
  f.order.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Temporal'));await flow.prepareNew();
  expect(flow.snapshot()).toMatchObject({state:'UNCERTAIN',intentionId:ids.intention});expect(allocate).not.toHaveBeenCalled();expect(f.reserve).not.toHaveBeenCalled();
  await flow.refresh();await flow.prepareNew();expect(flow.snapshot().intentionId).toBeUndefined();expect(f.reserve).not.toHaveBeenCalled();
});
test('UX06 TV24 fallo de actualización invalida consentimiento y preview anteriores',async()=>{
  const f=api();f.requests.mockResolvedValueOnce(page([]));const controller=createReservationController(f,{intentionId:()=>next});
  await controller.load();controller.select(ids.group);await controller.preview();controller.consent(true);
  f.offerings.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Temporal'));await controller.load();await controller.confirm();
  expect(controller.snapshot()).toMatchObject({status:'UNCERTAIN',confirmed:false,preview:undefined});expect(f.reserve).not.toHaveBeenCalled();expect(f.initiatePayment).not.toHaveBeenCalled();
});
