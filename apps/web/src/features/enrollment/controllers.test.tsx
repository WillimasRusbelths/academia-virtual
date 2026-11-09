import { expect, test, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiFailure } from '../../shared/api-client';
import type { EnrollmentApi, InventoryItem, Order, ReservationResult } from './api';
import { createReservationController, createReservationFlow, ReservationPage, ReservationScreen } from './reservation-page';
import { createOrdersController, OrderPage, OrdersScreen } from './order-page';
import { admitted, ids, order } from './test-contract';

const original=order as Order,request=admitted as ReservationResult;
test('OC09 detalle ajeno o inexistente muestra ausencia definitiva sin datos privados',async()=>{
  const f=fixture();f.api.order.mockRejectedValue(new ApiFailure(404,'NOT_FOUND','No disponible.'));
  const controller=createOrdersController(f.api);await controller.open(ids.order);
  expect(controller.snapshot()).toMatchObject({status:'NOT_FOUND',busy:false});
  expect(controller.snapshot().order).toBeUndefined();
  const html=renderToStaticMarkup(<OrderPage state={controller.snapshot()}/>);
  expect(html).toContain('Orden o solicitud no encontrada.');expect(html).not.toContain('Resultado incierto');
});
const alternate='00000000-0000-4000-8000-000000000004';
const inventory:InventoryItem={groupId:ids.group,courseId:ids.order,courseName:'Curso ficticio',groupName:'Grupo ficticio',teacherName:'Docente ficticio',periodStart:'2090-01-02',periodEnd:'2090-03-31',
  timeZone:'America/Lima',schedule:original.items[0].schedule,capacity:1,reserved:0,occupied:0,available:1,priceMinor:'12500',currency:'PEN'};
const page=<T,>(items:readonly T[])=>({items,page:1,pageSize:20,total:items.length});
function fixture(){
  const api={initiatePayment:vi.fn<EnrollmentApi['initiatePayment']>(),enrollments:vi.fn<EnrollmentApi['enrollments']>().mockResolvedValue(page([])),enrollment:vi.fn<EnrollmentApi['enrollment']>(),
    offerings:vi.fn<EnrollmentApi['offerings']>().mockResolvedValue({...page([inventory]),evaluatedAt:order.serverNow}),
    preview:vi.fn<EnrollmentApi['preview']>().mockResolvedValue({items:[inventory],totalMinor:'12500',evaluatedAt:order.serverNow}),
    reserve:vi.fn<EnrollmentApi['reserve']>().mockResolvedValue(request),request:vi.fn<EnrollmentApi['request']>().mockResolvedValue(request),
    requests:vi.fn<EnrollmentApi['requests']>().mockResolvedValue(page([])),order:vi.fn<EnrollmentApi['order']>().mockResolvedValue(original),
    orders:vi.fn<EnrollmentApi['orders']>().mockResolvedValue(page([original])),currentOrder:vi.fn<EnrollmentApi['currentOrder']>().mockResolvedValue(original)} satisfies EnrollmentApi;
  const allocate=vi.fn(()=>ids.intention),controller=createReservationController(api,{intentionId:allocate});return {api,allocate,controller};
}
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
async function prepare(f:ReturnType<typeof fixture>){await f.controller.load();f.controller.select(ids.group);await f.controller.preview();f.controller.consent(true);}

test('RC01 preview y consentimiento preceden UUID; doble confirmación admite una sola intención',async()=>{
  const f=fixture();await f.controller.load();f.controller.select(ids.group);f.controller.consent(true);await f.controller.confirm();
  expect(f.api.reserve).not.toHaveBeenCalled();expect(f.allocate).not.toHaveBeenCalled();
  await f.controller.preview();f.controller.consent(true);const pending=deferred<ReservationResult>();f.api.reserve.mockReturnValue(pending.promise);
  const one=f.controller.confirm(),two=f.controller.confirm();expect(f.api.reserve).toHaveBeenCalledTimes(1);expect(f.allocate).toHaveBeenCalledTimes(1);
  pending.resolve(request);await Promise.all([one,two]);expect(f.controller.snapshot()).toMatchObject({status:'ADMITTED',intentionId:ids.intention});
  f.controller.select(ids.group);expect(f.controller.snapshot().selected).toEqual([ids.group]);
});
test('RC02 un grupo por curso también entre páginas de catálogo',async()=>{
  const f=fixture();await f.controller.load();f.controller.select(ids.group);
  f.api.offerings.mockResolvedValue({...page([{...inventory,groupId:alternate}]),page:2,total:21,evaluatedAt:order.serverNow});await f.controller.load(2);f.controller.select(alternate);
  expect(f.controller.snapshot()).toMatchObject({status:'VALIDATION_ERROR',selected:[ids.group],selectedCourseIds:[inventory.courseId]});
});
test('RC03 ausencia, cero explícito y grupo lleno no se confunden',async()=>{
  const f=fixture();f.api.offerings.mockResolvedValue({...page([{...inventory,priceMinor:null},{...inventory,groupId:alternate,priceMinor:'0'},
    {...inventory,groupId:ids.intention,courseId:ids.intention,reserved:1,available:0}]),evaluatedAt:order.serverNow});await f.controller.load();
  f.controller.select(ids.group);expect(f.controller.snapshot().selected).toEqual([]);f.controller.select(alternate);expect(f.controller.snapshot().selected).toEqual([alternate]);
  f.controller.select(ids.intention);expect(f.controller.snapshot().selected).toEqual([alternate]);expect(f.api.reserve).not.toHaveBeenCalled();
});
test('RC04 cambiar selección invalida resumen y consentimiento',async()=>{
  const f=fixture();await prepare(f);f.controller.select(ids.group);expect(f.controller.snapshot()).toMatchObject({selected:[],confirmed:false,preview:undefined});
  await f.controller.confirm();expect(f.api.reserve).not.toHaveBeenCalled();
});
test('RC05 preview tardío tras logout no repuebla datos',async()=>{
  const f=fixture();await f.controller.load();f.controller.select(ids.group);const pending=deferred<Awaited<ReturnType<EnrollmentApi['preview']>>>();f.api.preview.mockReturnValue(pending.promise);
  const work=f.controller.preview();f.controller.logout();pending.resolve({items:[inventory],totalMinor:'12500',evaluatedAt:order.serverNow});await work;
  expect(f.controller.snapshot()).toMatchObject({items:[],selected:[],preview:undefined});expect(f.controller.snapshot().intentionId).toBeUndefined();
});
test('RC06 resultado incierto conserva payload para replay manual idéntico',async()=>{
  const f=fixture();await prepare(f);f.api.reserve.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','privado'));await f.controller.confirm();
  expect(f.controller.snapshot()).toMatchObject({status:'UNCERTAIN',intentionId:ids.intention,canReplay:true});await f.controller.recover();
  expect(f.controller.snapshot().intentionId).toBe(ids.intention);await f.controller.replay();expect(f.api.reserve).toHaveBeenCalledTimes(2);
  expect(f.api.reserve.mock.calls[0]).toEqual(f.api.reserve.mock.calls[1]);expect(f.allocate).toHaveBeenCalledTimes(1);
});
test('RC07 rechazo permite preparar otra selección sin generar UUID antes de confirmar',async()=>{
  const f=fixture();await prepare(f);f.api.reserve.mockResolvedValue({...request,state:'REJECTED',decisionCode:'CAPACITY_UNAVAILABLE'});await f.controller.confirm();
  await f.controller.prepareNew();expect(f.controller.snapshot()).toMatchObject({status:'READY',selected:[],intentionId:undefined});expect(f.allocate).toHaveBeenCalledTimes(1);
});
test('RC08 nueva selección consulta vencimiento del servidor y conserva replay antiguo',async()=>{
  const f=fixture();const confirmed:ReservationResult={id:ids.intention,intentionId:ids.intention,state:'CONFIRMED',orderId:ids.order};f.api.requests.mockResolvedValue(page([confirmed]));
  await f.controller.recover();await f.controller.prepareNew();expect(f.controller.snapshot().intentionId).toBe(ids.intention);
  f.api.order.mockResolvedValue({...original,state:'EXPIRED',paymentAllowed:false,serverNow:original.expiresAt});await f.controller.prepareNew();
  expect(f.controller.snapshot().intentionId).toBeUndefined();expect(f.allocate).not.toHaveBeenCalled();expect(f.api.reserve).not.toHaveBeenCalled();
});
test('RC09 sesión perdida limpia catálogo, selección y preview',async()=>{
  const f=fixture();await prepare(f);f.api.reserve.mockRejectedValue(new ApiFailure(401,'AUTH_REQUIRED','privado'));await f.controller.confirm();
  expect(f.controller.snapshot()).toMatchObject({status:'AUTH_REQUIRED',items:[],selected:[],preview:undefined,intentionId:undefined});
});
test('RC10 catálogo tardío no reemplaza una búsqueda posterior',async()=>{
  const f=fixture(),pending=deferred<Awaited<ReturnType<EnrollmentApi['offerings']>>>();f.api.offerings.mockReturnValueOnce(pending.promise);
  const first=f.controller.load(1,'primera');await f.controller.load(1,'segunda');pending.resolve({...page([]),evaluatedAt:order.serverNow});await first;
  expect(f.controller.snapshot()).toMatchObject({q:'segunda',items:[inventory]});
});
test('RC11 validación de servidor no deja bloqueada una intención no admitida',async()=>{
  const f=fixture();await prepare(f);f.api.reserve.mockRejectedValue(new ApiFailure(400,'VALIDATION_ERROR','privado'));await f.controller.confirm();
  expect(f.controller.snapshot().intentionId).toBeUndefined();f.controller.select(ids.group);expect(f.controller.snapshot().selected).toEqual([]);
});
test('RC12 consultar una intención histórica no crea otra admisión',async()=>{
  const f=fixture(),flow=createReservationFlow(f.api,{intentionId:f.allocate});f.api.request.mockResolvedValue({...request,state:'REJECTED',decisionCode:'CAPACITY_UNAVAILABLE'});
  await flow.inspect(ids.intention);await flow.refresh();expect(flow.snapshot()).toMatchObject({state:'REJECTED',intentionId:ids.intention});expect(f.api.reserve).not.toHaveBeenCalled();expect(f.allocate).not.toHaveBeenCalled();
});
test('OC01 recuperación consulta listas/current sin mutaciones',async()=>{
  const f=fixture();f.api.currentOrder.mockResolvedValue(null);f.api.orders.mockResolvedValue(page([]));f.api.requests.mockResolvedValue(page([request]));
  const controller=createOrdersController(f.api);await controller.list();expect(controller.snapshot()).toMatchObject({status:'READY',current:null,orders:{items:[]},requests:{items:[request]}});
  expect(f.api.reserve).not.toHaveBeenCalled();expect(f.api.orders).toHaveBeenCalledWith({page:1,pageSize:20},expect.any(AbortSignal));
});
test('OC02 logout descarta detalle tardío y su referencia para refresh',async()=>{
  const f=fixture(),pending=deferred<Order>();f.api.order.mockReturnValueOnce(pending.promise);const controller=createOrdersController(f.api),work=controller.open(ids.order);
  controller.logout();pending.resolve(original);await work;expect(controller.snapshot()).toEqual({status:'EMPTY'});await controller.refresh();expect(f.api.order).toHaveBeenCalledTimes(1);
});
test('OC03 resultado más reciente prevalece sobre detalle anterior',async()=>{
  const f=fixture(),pending=deferred<Order>();f.api.order.mockReturnValueOnce(pending.promise);const controller=createOrdersController(f.api),first=controller.open(alternate);
  await controller.open(ids.order);pending.resolve({...original,id:alternate});await first;await controller.refresh();
  expect(controller.snapshot().order?.id).toBe(ids.order);expect(f.api.order.mock.calls.at(-1)?.[0]).toBe(ids.order);
});
test('OC04 ADMITTED se consulta sin inventar orden; CONFIRMED carga referencia propia',async()=>{
  const f=fixture(),controller=createOrdersController(f.api);await controller.inspect(ids.intention);expect(controller.snapshot()).toMatchObject({status:'ADMITTED',order:undefined});expect(f.api.order).not.toHaveBeenCalled();
  f.api.request.mockResolvedValue({...request,state:'CONFIRMED',orderId:ids.order});await controller.refresh();expect(controller.snapshot().order?.id).toBe(ids.order);
});
test('OC05 error de lectura no conserva detalle financiero como estado actual',async()=>{
  const f=fixture(),controller=createOrdersController(f.api);await controller.open(ids.order);f.api.order.mockRejectedValue(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','privado'));await controller.refresh();
  expect(controller.snapshot().status).toBe('UNCERTAIN');expect(controller.snapshot().order).toBeUndefined();
});
test('OC06 listas de solicitudes y órdenes paginan de forma independiente',async()=>{
  const f=fixture(),controller=createOrdersController(f.api);await controller.list(3,2);expect(f.api.orders.mock.calls[0][0]).toEqual({page:3,pageSize:20});expect(f.api.requests.mock.calls[0][0]).toEqual({page:2,pageSize:20});
});
test('OC07 retry conserva las páginas solicitadas tras un error de lectura',async()=>{
  const f=fixture(),controller=createOrdersController(f.api);f.api.orders.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','privado'));
  await controller.list(3,2);await controller.refresh();expect(f.api.orders.mock.calls.at(-1)?.[0]).toEqual({page:3,pageSize:20});expect(f.api.requests.mock.calls.at(-1)?.[0]).toEqual({page:2,pageSize:20});
});
test('OC08 sesión perdida borra también la referencia privada de recuperación',async()=>{
  const f=fixture(),controller=createOrdersController(f.api);f.api.order.mockRejectedValue(new ApiFailure(401,'AUTH_REQUIRED','privado'));
  await controller.open(ids.order);expect(controller.snapshot().status).toBe('AUTH_REQUIRED');await controller.refresh();expect(f.api.order).toHaveBeenCalledTimes(1);expect(f.api.requests).toHaveBeenCalledTimes(1);
});
test('VC01 formulario anuncia validación y mantiene confirmación explícita deshabilitada',()=>{
  const html=renderToStaticMarkup(createElement(ReservationPage,{state:{status:'VALIDATION_ERROR',items:[inventory],selected:[ids.group]}}));
  expect(html).toContain('aria-invalid="true"');expect(html).toContain('reservation-validation');expect(html).toContain('Previsualizar selección');expect(html).not.toMatch(/<button(?![^>]*disabled)[^>]*>Confirmar/);
});
test('VC02 no hay acción de pago y dinero enorme se presenta exactamente',()=>{
  const data={...original,totalMinor:'9007199254740993',items:[{...original.items[0],priceMinor:'9007199254740993'}]};
  const html=renderToStaticMarkup(createElement(OrderPage,{state:{status:'READY',order:data}}));expect(html).toContain('PEN 90071992547409.93');expect(html).not.toMatch(/>Pagar|>Iniciar pago/);
});
test('VC03 contenedores iniciales renderizan carga sin datos privados ni POST durante SSR',()=>{
  const f=fixture();const reservation=renderToStaticMarkup(createElement(ReservationScreen,{api:f.api})),orders=renderToStaticMarkup(createElement(OrdersScreen,{api:f.api}));
  expect(reservation).toContain('role="status"');expect(orders).toContain('role="status"');expect(orders).not.toContain(original.id);expect(f.api.reserve).not.toHaveBeenCalled();expect(f.api.offerings).not.toHaveBeenCalled();
});
