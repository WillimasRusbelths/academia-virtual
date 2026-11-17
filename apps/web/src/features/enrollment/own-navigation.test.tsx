import { expect,test,vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiFailure } from '../../shared/api-client';
import { createOrdersController,OrderPage } from './order-page';
import { createEnrollmentsController,EnrollmentsPage } from './enrollments-page';
import { orderView } from './api';
import { ids,order } from './test-contract';
import { enrollment } from './payment-test-contract';
const original=orderView(order),page={items:[original],page:2,pageSize:20,total:21};
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
test('ON01 orden vigente e historial tienen referencias navegables y detalle original',()=>{
  const html=renderToStaticMarkup(<OrderPage state={{status:'READY',current:original,orders:page}}/>);
  expect(html.match(new RegExp('href="/mis-ordenes/'+ids.order+'"','g'))).toHaveLength(2);
  expect(html).toContain('PEN 125.00');
});
test('ON02 solicitud confirmada enlaza orden sin otra reserva',()=>{
  const html=renderToStaticMarkup(<OrderPage state={{status:'CONFIRMED',request:{id:ids.intention,intentionId:ids.intention,state:'CONFIRMED',orderId:ids.order,admittedAt:original.confirmedAt},order:original}}/>);
  expect(html).toContain('href="/mis-ordenes/'+ids.order+'"');expect(html).toContain(original.expiresAt);
});
test('ON03 matrícula histórica enlaza orden original y permite volver a la lista',()=>{
  const html=renderToStaticMarkup(<EnrollmentsPage state={{status:'READY',enrollment:{...enrollment,state:'FINISHED'}}} actions={{refresh:vi.fn(),list:vi.fn(),open:vi.fn()}}/>);
  expect(html).toContain('histórica');expect(html).toContain(enrollment.validUntil);expect(html).toContain('href="/mis-ordenes/'+enrollment.orderId+'"');expect(html).toContain('Volver a mis matrículas');
});
test('ON04 error en matrícula no revela detalle y usa mensaje propio seguro',()=>{
  const html=renderToStaticMarkup(<EnrollmentsPage state={{status:'NOT_FOUND',enrollment}}/>);
  expect(html).toContain('Matrícula no encontrada.');expect(html).not.toContain(enrollment.courseName);
});
test('ON05 consulta conserva paginación independiente y no muta',async()=>{
  const api={orders:vi.fn().mockResolvedValue(page),requests:vi.fn().mockResolvedValue({items:[],page:3,pageSize:20,total:0}),currentOrder:vi.fn().mockResolvedValue(null),order:vi.fn().mockResolvedValue(original),request:vi.fn()};
  const controller=createOrdersController(api);await controller.list(2,3);await controller.refresh();
  expect(api.orders).toHaveBeenLastCalledWith({page:2,pageSize:20},expect.any(AbortSignal));expect(api.requests).toHaveBeenLastCalledWith({page:3,pageSize:20},expect.any(AbortSignal));expect(api.order).not.toHaveBeenCalled();
});
test('ON06 orden desconocida y ajena producen mismo estado sin datos previos',async()=>{
  const api={orders:vi.fn(),requests:vi.fn(),currentOrder:vi.fn(),order:vi.fn().mockResolvedValueOnce(original).mockRejectedValue(new ApiFailure(404,'NOT_FOUND','No encontrado.')),request:vi.fn()};
  const controller=createOrdersController(api);await controller.open(ids.order);await controller.open(ids.group);expect(controller.snapshot()).toEqual({status:'NOT_FOUND',busy:false});
});
for(const code of ['AUTH_REQUIRED','FORBIDDEN'] as const)test('ON07 '+code+' limpia matrícula y reinicia destino de consulta',async()=>{
  const api={enrollment:vi.fn().mockResolvedValueOnce(enrollment).mockRejectedValue(new ApiFailure(code==='AUTH_REQUIRED'?401:403,code,'Acceso denegado.')),enrollments:vi.fn().mockResolvedValue({items:[],page:1,pageSize:20,total:0})};
  const controller=createEnrollmentsController(api);await controller.open(enrollment.id);await controller.refresh();expect(controller.snapshot()).toEqual({status:code});await controller.refresh();expect(api.enrollments).toHaveBeenCalledWith({page:1,pageSize:20},expect.any(AbortSignal));
});
test('ON08 logout aborta y descarta orden tardía',async()=>{
  const wait=deferred<typeof original>(),api={orders:vi.fn(),requests:vi.fn(),currentOrder:vi.fn(),order:vi.fn().mockReturnValue(wait.promise),request:vi.fn()};
  const c=createOrdersController(api),loading=c.open(ids.order);c.logout();wait.resolve(original);await loading;expect(c.snapshot()).toEqual({status:'EMPTY'});expect(api.order.mock.calls[0][1].aborted).toBe(true);
});
test('ON09 cambiar de matrícula descarta lectura anterior y logout limpia la vigente',async()=>{
  const wait=deferred<typeof enrollment>(),api={enrollment:vi.fn().mockReturnValueOnce(wait.promise).mockResolvedValueOnce({...enrollment,id:ids.group}),enrollments:vi.fn()};
  const c=createEnrollmentsController(api),loading=c.open(enrollment.id);await c.open(ids.group);wait.resolve(enrollment);await loading;expect(c.snapshot().enrollment?.id).toBe(ids.group);expect(api.enrollment.mock.calls[0][1].aborted).toBe(true);c.logout();expect(c.snapshot()).toEqual({status:'EMPTY'});
});
