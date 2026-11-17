import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect,test,vi } from 'vitest';
import { ApiFailure } from '../../shared/api-client';
import { pricesPage,pricesController,adminApi,price,deferred } from './admin-test-contract';
import { ids } from './test-contract';
test('PU00 control: fixture distingue ausencia de cero y revisión exacta',()=>{expect(price).toMatchObject({amountMinor:'12500',revision:'2',currency:'PEN'});expect({...price,defined:false,amountMinor:null}).not.toEqual({...price,amountMinor:'0'});});
for(const status of ['LOADING','EMPTY','ERROR','CONFLICT','UNCERTAIN','AUTH_REQUIRED','FORBIDDEN'])test('PU01 US4.06 precios anuncia '+status+' sin prometer guardado',()=>{
  const html=renderToStaticMarkup(createElement(pricesPage(),{state:{status,price}}));expect(html).toMatch(/role="(?:alert|status)"|aria-live=/);expect(html).not.toMatch(/precio (?:actualizado|guardado)/i);
});
test('PU02 US4.06 sin precio no se presenta como PEN 0',()=>{
  const html=renderToStaticMarkup(createElement(pricesPage(),{state:{status:'READY',price:{courseId:ids.group,defined:false,amountMinor:null,currency:null,revision:null}}}));expect(html).toMatch(/sin definir|no definido/i);expect(html).not.toContain('PEN 0.00');
});
test('PU03 US4.06 cargar conserva revisión y no guarda automáticamente',async()=>{
  const api=adminApi(),controller=pricesController(api);await controller.load(ids.group);expect(controller.snapshot()).toMatchObject({status:'READY',price});expect(api.setPrice).not.toHaveBeenCalled();
});
test('PU04 US4.06 conflicto conserva entrada y revisión enviada hasta comparar',async()=>{
  const api=adminApi(),controller=pricesController(api);await controller.load(ids.group);controller.edit('14000');api.setPrice.mockRejectedValueOnce(new ApiFailure(409,'ENROLLMENT_VERSION_CONFLICT','Compara los datos guardados.'));await controller.submit();
  expect(controller.snapshot()).toMatchObject({status:'CONFLICT',amountMinor:'14000',expectedRevision:'2'});expect(api.setPrice).toHaveBeenCalledTimes(1);expect(api.setPrice.mock.calls[0][1]).toMatchObject({amountMinor:'14000',expectedRevision:'2',currency:'PEN'});
});
test('PU05 US4.06 doble envío comparte commandId y una mutación en vuelo',async()=>{
  const api=adminApi(),allocate=vi.fn(()=>ids.intention),controller=pricesController(api,allocate);await controller.load(ids.group);controller.edit('14000');const wait=deferred<unknown>();api.setPrice.mockReturnValueOnce(wait.promise);
  const one=controller.submit(),two=controller.submit();expect(api.setPrice).toHaveBeenCalledTimes(1);wait.resolve({resource:{...price,revision:'3'},command:{id:ids.intention,replayed:false}});await Promise.all([one,two]);expect(allocate).toHaveBeenCalledTimes(1);
});
test('PU06 US4.06 resultado incierto no cambia importe ni reenvía al consultar',async()=>{
  const api=adminApi(),controller=pricesController(api);await controller.load(ids.group);controller.edit('14000');api.setPrice.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Consulta el resultado.'));await controller.submit();expect(controller.snapshot()).toMatchObject({status:'UNCERTAIN',amountMinor:'14000'});await controller.refresh();expect(api.setPrice).toHaveBeenCalledTimes(1);
});
test('PU07 US4.07 logout descarta respuesta tardía y borra borrador financiero',async()=>{
  const api=adminApi(),wait=deferred<unknown>(),controller=pricesController(api);api.price.mockReturnValueOnce(wait.promise);const loading=controller.load(ids.group);controller.logout();wait.resolve(price);await loading;expect(controller.snapshot()).toMatchObject({status:'EMPTY'});expect(JSON.stringify(controller.snapshot())).not.toContain(ids.group);
});
