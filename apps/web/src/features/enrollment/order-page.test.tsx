import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { order, orderPage } from './test-contract';
afterEach(()=>vi.useRealTimers());
function markup(data:Readonly<Record<string,unknown>>=order,status='READY'){return renderToStaticMarkup(createElement(orderPage(),{state:{status,order:data}}));}
test('WO01 orden confirmada muestra desglose original, moneda y referencia',()=>{
  const html=markup();expect(html).toContain('Curso original ficticio');expect(html).toContain('Grupo original ficticio');expect(html).toContain('PEN');expect(html).toContain(order.id);
  expect(html).toMatch(/125(?:[.,]00)?/);expect(html).toContain(order.expiresAt);
});
test('WO02 ADMITTED carece de orden, plazo y acción de pago',()=>{
  const html=markup({state:'ADMITTED'},'ADMITTED');expect(html).toMatch(/espera|pendiente/i);expect(html).not.toContain(order.expiresAt);expect(html).not.toMatch(/<button[^>]*>[^<]*Pagar/i);
});
test('WO03 reloj local posterior al vencimiento no inventa expiración del servidor',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2199-01-01T00:00:00Z'));const html=markup();expect(html).toMatch(/reservad|vigente/i);expect(html).not.toMatch(/reserva (?:ha )?vencid/i);
});
test('WO04 expiración confirmada permite nueva selección; no convierte intención vieja en nueva',()=>{
  const html=markup({...order,state:'EXPIRED',paymentAllowed:false});expect(html).toMatch(/vencid|expirad/i);expect(html).toMatch(/nueva|seleccion/i);expect(html).not.toMatch(/<button[^>]*>[^<]*Pagar/i);
});
test('WO05 oferta oculta muestra aviso genérico y deshabilita pago sin detalles privados',()=>{
  const html=markup({...order,paymentAllowed:false,offeringUnavailable:true});expect(html).toMatch(/oferta.*no disponible/i);expect(html).not.toMatch(/generaci[oó]n|authVersion|teacherEligibility|providerPaymentId/);expect(html).not.toMatch(/<button(?![^>]*disabled)[^>]*>[^<]*Pagar/i);
});
test('WO06 incidente no se anuncia como matrícula o pago rechazado',()=>{
  const html=markup({...order,state:'EXPIRED',paymentAllowed:false,incident:{state:'OPEN',message:'Pago en conciliación, sin matrícula'}});expect(html).toMatch(/conciliaci[oó]n/);expect(html).toMatch(/sin matr[ií]cula/);
});
for(const status of ['LOADING','EMPTY','ERROR','UNCERTAIN'])test(`WO07 ${status} anuncia estado y consulta recuperable`,()=>{
  const html=renderToStaticMarkup(createElement(orderPage(),{state:{status,items:[],message:'Consulta el resultado antes de repetir.'}}));expect(html).toMatch(/role="(?:status|alert)"|aria-live=/);
});
test('WO08 detalle no habilita todavía un botón financiero funcional en US1',()=>{
  expect(markup()).not.toMatch(/<button(?![^>]*disabled)[^>]*>[^<]*(?:Pagar|Iniciar pago)/i);
});
