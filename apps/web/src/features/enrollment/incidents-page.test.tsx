import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect,test,vi } from 'vitest';
import { ApiFailure } from '../../shared/api-client';
import { incidentsPage,incidentsController,adminApi,incident,deferred } from './admin-test-contract';
import { ids } from './test-contract';
test('IU00 control: fixture no declara resolución o matrícula por una nota',()=>{expect(incident.followUps).toEqual([]);expect(incident).not.toHaveProperty('resolved');});
for(const status of ['LOADING','EMPTY','ERROR','CONFLICT','UNCERTAIN','AUTH_REQUIRED','FORBIDDEN'])test('IU01 US4.06 incidencias anuncia '+status+' sin resolver economía',()=>{
  const html=renderToStaticMarkup(createElement(incidentsPage(),{state:{status,incident}}));expect(html).toMatch(/role="(?:alert|status)"|aria-live=/);expect(html).not.toMatch(/incidencia resuelta|devolución completada/i);
});
test('IU02 US4.08 seguimiento registrado mantiene aviso económico pendiente',()=>{
  const html=renderToStaticMarkup(createElement(incidentsPage(),{state:{status:'SAVED',incident,followUps:[{content:'Nota ficticia',recordedAt:'2026-11-12T00:00:00.123456Z'}]}}));expect(html).toMatch(/seguimiento registrado/i);expect(html).toMatch(/pendiente|conciliaci/i);expect(html).not.toMatch(/<button[^>]*>[^<]*(?:Resolver|Devolver|Matricular|Trasladar)/i);
});
test('IU03 US4.06 abrir incidencia solo consulta',async()=>{const api=adminApi(),controller=incidentsController(api);await controller.open(ids.order);expect(controller.snapshot()).toMatchObject({status:'READY',incident});expect(api.followUp).not.toHaveBeenCalled();});
test('IU04 US4.06 doble clic conserva identidad y un solo POST',async()=>{
  const api=adminApi(),next=vi.fn(()=>ids.intention),controller=incidentsController(api,next);await controller.open(ids.order);controller.edit('Nota ficticia');const wait=deferred<unknown>();api.followUp.mockReturnValueOnce(wait.promise);const one=controller.submit(),two=controller.submit();expect(api.followUp).toHaveBeenCalledTimes(1);expect(api.followUp.mock.calls[0][1]).toEqual({commandId:ids.intention,content:'Nota ficticia'});wait.resolve({resource:{id:ids.group,incidentId:ids.order,content:'Nota ficticia'}});await Promise.all([one,two]);expect(next).toHaveBeenCalledTimes(1);
});
test('IU05 US4.06 respuesta perdida conserva borrador y no reenvía al consultar',async()=>{
  const api=adminApi(),controller=incidentsController(api);await controller.open(ids.order);controller.edit('Nota ficticia');api.followUp.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Consulta antes de repetir.'));await controller.submit();expect(controller.snapshot()).toMatchObject({status:'UNCERTAIN',content:'Nota ficticia'});await controller.refresh();expect(api.followUp).toHaveBeenCalledTimes(1);
});
test('IU06 US4.07 logout limpia datos y descarta lectura tardía',async()=>{
  const api=adminApi(),wait=deferred<unknown>(),controller=incidentsController(api);api.incident.mockReturnValueOnce(wait.promise);const opening=controller.open(ids.order);controller.logout();wait.resolve(incident);await opening;expect(controller.snapshot()).toMatchObject({status:'EMPTY'});expect(JSON.stringify(controller.snapshot())).not.toContain(ids.order);
});
