import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect,test,vi } from 'vitest';
import { ApiFailure } from '../../shared/api-client';
import { order,ids } from './test-contract';
import { apiFixture,attempt,deferred,paymentController,paymentPanel } from './payment-test-contract';

test('WP00 control: fixture conserva importe y microsegundos originales, sin decidir pago',()=>{expect(order.totalMinor).toBe('12500');expect(order.expiresAt).toBe('2026-11-05T00:00:00.123456Z');expect(attempt.state).toBe('PENDING');});
test('WP01 inicio solo explícito y con initiationId estable; doble clic no reenvía',async()=>{
  const api=apiFixture(),waiting=deferred<unknown>(),id=vi.fn(()=>ids.intention),flow=paymentController(api,id);api.initiatePayment.mockReturnValue(waiting.promise);
  expect(api.initiatePayment).not.toHaveBeenCalled();const first=flow.start(ids.order);const second=flow.start(ids.order);waiting.resolve(attempt);await Promise.all([first,second]);expect(api.initiatePayment).toHaveBeenCalledTimes(1);expect(api.initiatePayment.mock.calls[0].slice(0,2)).toEqual([ids.order,ids.intention]);expect(id).toHaveBeenCalledTimes(1);
});
test('WP02 respuesta perdida conserva identidad; consultar no inicia otro cobro',async()=>{
  const api=apiFixture(),flow=paymentController(api);api.initiatePayment.mockRejectedValue(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Consulta antes de repetir.'));
  await flow.start(ids.order);expect(flow.snapshot()).toMatchObject({status:'UNCERTAIN',initiationId:ids.intention});await flow.refresh();expect(api.order).toHaveBeenCalledWith(ids.order,expect.anything());expect(api.initiatePayment).toHaveBeenCalledTimes(1);expect(flow.snapshot().status).not.toBe('APPLIED');
});
for(const state of ['SUBMITTING','INITIATION_UNKNOWN','PENDING'])test('WP03 '+state+' conserva consulta sin otra iniciación',async()=>{
  const api=apiFixture(),flow=paymentController(api);api.initiatePayment.mockResolvedValue({...attempt,state});await flow.start(ids.order);await flow.start(ids.order);await flow.refresh();expect(api.initiatePayment).toHaveBeenCalledTimes(1);expect(flow.snapshot()).not.toMatchObject({status:'APPLIED'});
});
test('WP04 rechazo definitivo permite nueva acción explícita con identidad nueva',async()=>{
  const api=apiFixture(),next=vi.fn().mockReturnValueOnce(ids.intention).mockReturnValueOnce(ids.group),flow=paymentController(api,next);api.initiatePayment.mockResolvedValueOnce({...attempt,state:'FAILED_NO_CHARGE'}).mockResolvedValueOnce(attempt);
  await flow.start(ids.order);expect(api.initiatePayment).toHaveBeenCalledTimes(1);await flow.start(ids.order);expect(api.initiatePayment.mock.calls.map(call=>call[1])).toEqual([ids.intention,ids.group]);
});
test('WP05 lectura APPLIED no regresa a pendiente por respuesta de inicio tardía',async()=>{
  const api=apiFixture(),waiting=deferred<unknown>(),flow=paymentController(api);api.initiatePayment.mockReturnValue(waiting.promise);const starting=flow.start(ids.order);
  api.order.mockResolvedValue({...order,state:'ENROLLED',paymentState:'APPLIED',paymentAllowed:false});await flow.refresh();waiting.resolve(attempt);await starting;expect(flow.snapshot().status).toBe('APPLIED');expect(api.initiatePayment).toHaveBeenCalledTimes(1);
});
test('WP06 logout descarta respuestas tardías y limpia intención/detalle',async()=>{
  const api=apiFixture(),waiting=deferred<unknown>(),flow=paymentController(api);api.initiatePayment.mockReturnValue(waiting.promise);const starting=flow.start(ids.order);flow.logout();waiting.resolve(attempt);await starting;
  expect(flow.snapshot()).toMatchObject({status:'EMPTY'});expect(JSON.stringify(flow.snapshot())).not.toMatch(new RegExp(ids.order+'|'+ids.intention));
});
for(const code of ['AUTH_REQUIRED','FORBIDDEN'] as const)test('WP07 '+code+' limpia estado privado sin replay automático',async()=>{
  const api=apiFixture(),flow=paymentController(api);api.initiatePayment.mockRejectedValue(new ApiFailure(code==='AUTH_REQUIRED'?401:403,code,'Acceso no permitido.'));await flow.start(ids.order);expect(flow.snapshot().status).toBe(code);expect(flow.snapshot()).not.toHaveProperty('initiationId');expect(api.initiatePayment).toHaveBeenCalledTimes(1);
});
function markup(status:string,data:Readonly<Record<string,unknown>>={}){return renderToStaticMarkup(createElement(paymentPanel(),{state:{status,order,...data}}));}
for(const status of ['SUBMITTING','PENDING','INITIATION_UNKNOWN','UNCERTAIN'])test('WP08 '+status+' anuncia consulta y no promete matrícula',()=>{
  const html=markup(status);expect(html).toMatch(/role="(?:status|alert)"|aria-live=/);expect(html).toMatch(/consult|pendiente|inciert|inici/i);expect(html).not.toMatch(/matr[ií]cula confirmada/i);expect(html).not.toMatch(/<button(?![^>]*disabled)[^>]*>[^<]*Iniciar pago/i);
});
test('WP09 incidencia se distingue de rechazo, matrícula y devolución',()=>{const html=markup('INCIDENT',{order:{...order,paymentState:'INCIDENT',paymentAllowed:false}});expect(html).toMatch(/conciliaci[oó]n.*sin matr[ií]cula/i);expect(html).not.toMatch(/(?:devoluci[oó]n|matr[ií]cula) confirmada/i);});
test('WP10 vencimiento viene del servidor y conserva plazo exacto',()=>{const html=markup('EXPIRED',{order:{...order,state:'EXPIRED',paymentAllowed:false}});expect(html).toMatch(/vencid|expirad/i);expect(html).toContain(order.expiresAt);expect(html).not.toMatch(/<button(?![^>]*disabled)[^>]*>[^<]*Iniciar pago/i);});
test('WP11 APPLIED solo desde estado del servidor; success navegador no basta',()=>{const html=markup('PENDING',{browserSuccess:true});expect(html).not.toMatch(/matr[ií]cula confirmada/i);expect(markup('APPLIED',{order:{...order,state:'ENROLLED',paymentState:'APPLIED'}})).toMatch(/matr[ií]cula|matriculad/i);});
test('WP12 oferta oculta conserva detalle y bloquea inicio sin causas privadas',()=>{const html=markup('READY',{order:{...order,paymentAllowed:false,paymentMessage:'Oferta no disponible.'}});expect(html).toMatch(/oferta.*no disponible/i);expect(html).not.toMatch(/teacherEligibilityVersion|authVersion|generaci[oó]n/i);expect(html).not.toMatch(/<button(?![^>]*disabled)[^>]*>[^<]*Iniciar pago/i);});
test('WP13 producción no ofrece simulación, secretos o confirmación manual',()=>{const html=markup('READY');expect(html).not.toMatch(/Simular pago|Aprobar pago|merchantReference|externalIdempotencyKey|providerPaymentId|receiptId/);});
