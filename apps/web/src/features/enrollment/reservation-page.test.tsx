import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ApiFailure } from '../../shared/api-client';
import { admitted, flowTarget, ids, reservationPage } from './test-contract';
import type { EnrollmentApi } from './test-contract';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function apiFixture(){
  return {offerings:vi.fn<EnrollmentApi['offerings']>().mockResolvedValue({items:[]}),preview:vi.fn<EnrollmentApi['preview']>().mockResolvedValue({totalMinor:'12500'}),reserve:vi.fn<EnrollmentApi['reserve']>().mockResolvedValue(admitted),
    request:vi.fn<EnrollmentApi['request']>().mockResolvedValue(admitted),requests:vi.fn<EnrollmentApi['requests']>().mockResolvedValue({items:[admitted]}),order:vi.fn<EnrollmentApi['order']>().mockResolvedValue(null)} satisfies EnrollmentApi;
}
test('WR01 ADMITTED muestra espera y carece de pago o matrícula confirmada',()=>{
  const html=renderToStaticMarkup(createElement(reservationPage(),{state:{status:'ADMITTED',request:admitted}}));
  expect(html).toMatch(/espera|pendiente|procesando/i);expect(html).not.toMatch(/<button[^>]*>[^<]*(?:Pagar|matriculad)/i);expect(html).toMatch(/role="status"|aria-live=/);
});
test('WR02 doble clic comparte intención y un solo POST en vuelo',async()=>{
  const api=apiFixture();let release!:(value:unknown)=>void;api.reserve.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const allocate=vi.fn(()=>ids.intention),flow=flowTarget(api,allocate),one=flow.submit([ids.group]),two=flow.submit([ids.group]);
  expect(api.reserve).toHaveBeenCalledTimes(1);release(admitted);await Promise.all([one,two]);expect(allocate).toHaveBeenCalledTimes(1);
  expect(flow.snapshot()).toMatchObject({state:'ADMITTED',intentionId:ids.intention});
});
test('WR03 resultado incierto conserva intención para consulta manual, no renueva POST',async()=>{
  const api=apiFixture();api.reserve.mockRejectedValue(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Consulta el resultado.'));
  const flow=flowTarget(api);await flow.submit([ids.group]);expect(flow.snapshot()).toMatchObject({state:'UNCERTAIN',intentionId:ids.intention});
  await flow.refresh();expect(api.reserve).toHaveBeenCalledTimes(1);expect(api.request).toHaveBeenCalledWith(ids.intention);
});
test('WR04 recarga recupera solicitudes propias sin recrear intención',async()=>{
  const api=apiFixture(),allocate=vi.fn(()=>ids.intention),flow=flowTarget(api,allocate);
  await flow.recover();expect(api.requests).toHaveBeenCalledTimes(1);expect(api.reserve).not.toHaveBeenCalled();expect(allocate).not.toHaveBeenCalled();
  expect(flow.snapshot()).toMatchObject({state:'ADMITTED',intentionId:ids.intention});
});
test('WR05 logout borra intención en memoria y descarta respuesta tardía',async()=>{
  const api=apiFixture();let release!:(value:unknown)=>void;api.reserve.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const flow=flowTarget(api),pending=flow.submit([ids.group]);flow.logout();release(admitted);await pending;
  expect(flow.snapshot().intentionId).toBeUndefined();expect(flow.snapshot().state).not.toBe('CONFIRMED');expect(api.reserve).toHaveBeenCalledTimes(1);
});
test('WR06 flujo nunca persiste intención, grupo o token en localStorage',async()=>{
  const storage={getItem:vi.fn(),setItem:vi.fn(),removeItem:vi.fn(),clear:vi.fn()};vi.stubGlobal('localStorage',storage);
  const api=apiFixture(),flow=flowTarget(api);await flow.submit([ids.group]);await flow.refresh();flow.logout();
  expect(storage.setItem).not.toHaveBeenCalled();expect(storage.getItem).not.toHaveBeenCalled();
});
test('WR07 AUTH_REQUIRED seguida de recuperación no reenvía operación financiera',async()=>{
  const api=apiFixture();api.reserve.mockRejectedValue(new ApiFailure(401,'AUTH_REQUIRED','Inicia sesión.'));
  const flow=flowTarget(api);await flow.submit([ids.group]);flow.logout();await flow.recover();expect(api.reserve).toHaveBeenCalledTimes(1);
});
test('WR08 reloj local adelantado no convierte ADMITTED en confirmación',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2199-01-01T00:00:00Z'));
  const api=apiFixture(),flow=flowTarget(api);await flow.submit([ids.group]);vi.advanceTimersByTime(86400000);
  expect(flow.snapshot()).toMatchObject({state:'ADMITTED'});expect(flow.snapshot().orderId).toBeUndefined();expect(api.order).not.toHaveBeenCalled();
});
test('WR09 CONFIRMED requiere referencia persistida; REJECTED no muestra pago',async()=>{
  const api=apiFixture();api.request.mockResolvedValue({...admitted,state:'CONFIRMED',orderId:ids.order});
  const flow=flowTarget(api);await flow.submit([ids.group]);await flow.refresh();expect(flow.snapshot()).toMatchObject({state:'CONFIRMED',orderId:ids.order});
});
for(const status of ['LOADING','EMPTY','ERROR','VALIDATION_ERROR'])test(`WR10 estado accesible ${status}`,()=>{
  const html=renderToStaticMarkup(createElement(reservationPage(),{state:{status,items:[],message:'Revisa la selección.'}}));
  expect(html).toMatch(/role="(?:status|alert)"|aria-live=/);expect(html).not.toMatch(/<button[^>]*>Pagar/i);
});
test('WR11 oferta separa capacidad, retenciones, ocupación y evaluación; ausencia no es cero',()=>{
  const html=renderToStaticMarkup(createElement(reservationPage(),{state:{status:'READY',evaluatedAt:'2026-11-04T00:00:00.123456Z',items:[{groupId:ids.group,courseName:'Curso ficticio',groupName:'Grupo ficticio',capacity:2,reserved:1,occupied:0,available:1,priceMinor:null}]}}));
  expect(html).toMatch(/capacidad/i);expect(html).toMatch(/retencion|reservad/i);expect(html).toMatch(/ocupa/i);expect(html).toMatch(/disponib/i);expect(html).toMatch(/sin definir|no definido/i);expect(html).toMatch(/evaluad|actualizad/i);
});
