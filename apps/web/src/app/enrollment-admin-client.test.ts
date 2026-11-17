import { expect,test,vi } from 'vitest';
import { createApiClient,enrollmentAdminApi,enrollmentApi } from './http';
import { RequestCancelled } from '../shared/api-client';
import { ids,order } from '../features/enrollment/test-contract';
const at='2026-11-12T00:00:00.123456Z',price={courseId:ids.group,defined:true,amountMinor:'12500',currency:'PEN',revision:'2'};
const note={id:ids.group,incidentId:ids.order,adminUserId:ids.intention,commandId:ids.intention,content:'Nota administrativa ficticia pendiente',recordedAt:at};
const incident={id:ids.order,orderId:ids.intention,reason:'UNKNOWN_REFERENCE',openedAt:at,affectedGroupIds:[ids.group],followUps:[note],payment:{amountUnits:'12500',amountScale:2,currency:'PEN',verifiedAt:at}};
const receipt={id:ids.intention,replayed:false,outcomeCode:'APPLIED',resultingRevision:'1',appliedAt:at};
function fixture(data:unknown){const transport=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(JSON.stringify({data}))),client=createApiClient(vi.fn(),transport);return {transport,client,api:enrollmentAdminApi(client),own:enrollmentApi(client)};}
test('AC01 US4.06 precio distingue cero de ausencia sin inventar valor',async()=>{
  for(const data of [{...price,amountMinor:'0'},{courseId:ids.group,defined:false,amountMinor:null,currency:null,revision:null}]){const f=fixture(data);expect(await f.api.price(ids.group)).toEqual(data);expect(f.transport.mock.calls[0][0]).toBe('/api/v1/admin/enrollment/courses/'+ids.group+'/price');}
});
test('AC02 US4.06 precio conserva cadenas exactas y solo serializa campos aprobados',async()=>{
  const data={...price,amountMinor:'9007199254740993',revision:'3'},f=fixture({resource:data,command:{...receipt,resultingRevision:'3'}});
  const input={commandId:ids.intention,expectedRevision:'2',amountMinor:data.amountMinor,currency:'PEN' as const,studentId:ids.order,resolved:true};expect((await f.api.setPrice(ids.group,input)).resource).toEqual(data);
  expect(JSON.parse(f.transport.mock.calls[0][1]!.body as string)).toEqual({commandId:ids.intention,expectedRevision:'2',amountMinor:data.amountMinor,currency:'PEN'});expect(f.transport.mock.calls[0][1]).toMatchObject({method:'PUT',cache:'no-store',credentials:'same-origin',headers:{'X-CSRF-Protection':'1'}});
});
test('AC03 US4.06 órdenes administrativas usan proyección propia y filtro explícito',async()=>{
  const data={...order,studentId:ids.intention},f=fixture({items:[data],total:1,page:1,pageSize:20});expect((await f.api.orders({studentId:ids.intention})).items).toEqual([data]);expect(f.transport.mock.calls[0][0]).toBe('/api/v1/admin/enrollment/orders?page=1&pageSize=20&studentId='+ids.intention);
  expect(await fixture(data).api.order(ids.order)).toEqual(data);await expect(fixture(data).own.order(ids.order)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  await expect(fixture(order).api.order(ids.order)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('AC04 US4.06 incidencia conserva hechos incompatibles sin afirmar pago aplicado',async()=>{
  const data={...incident,payment:{...incident.payment,amountUnits:'-9007199254740993',currency:'USD',amountScale:4}};expect(await fixture(data).api.incident(ids.order)).toEqual(data);
  const unknown={...incident,orderId:null,affectedGroupIds:[]};expect(await fixture(unknown).api.incident(ids.order)).toEqual(unknown);
});
test('AC05 US4.06 seguimiento solo envía texto y commandId, sin autoridad falsificada',async()=>{
  const f=fixture({resource:note,command:receipt}),input={commandId:ids.intention,content:note.content,resolved:true,adminUserId:ids.order,recordedAt:'forjado',expectedRevision:'99'};
  expect((await f.api.followUp(ids.order,input)).resource).toEqual(note);expect(f.transport).toHaveBeenCalledTimes(1);expect(JSON.parse(f.transport.mock.calls[0][1]!.body as string)).toEqual({commandId:ids.intention,content:note.content});
});
for(const change of [{providerPayload:'private'},{resolved:true},{followUps:[{...note,incidentId:ids.group}]},{followUps:[{...note,recordedAt:'2026-11-12T00:00:00.123Z'}]},{followUps:[{...note,providerEvidence:'private'}]},{orderId:null},{affectedGroupIds:[ids.group,ids.group]},{payment:{...incident.payment,amountUnits:12500}},{payment:{...incident.payment,normalizedEvidenceReference:'private'}},{payment:{...incident.payment,amountScale:1.5}},{followUps:[note,note]}])test('AC06 US4.06 incidencia inválida '+JSON.stringify(change)+' falla cerrada',async()=>{
  await expect(fixture({...incident,...change}).api.incident(ids.order)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
for(const change of [{id:ids.group},{replayed:'true'},{resultingRevision:'2'},{appliedAt:'2026-11-12T00:00:00.123Z'},{outcomeCode:'RESOLVED'},{signature:'private'}])test('AC07 US4.06 recibo inválido '+JSON.stringify(change)+' no confirma nota',async()=>{
  await expect(fixture({resource:note,command:{...receipt,...change}}).api.followUp(ids.order,{commandId:ids.intention,content:note.content})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
for(const change of [{courseId:ids.order},{amountMinor:12500},{revision:'0'},{defined:false},{amountMinor:'9223372036854775808'},{evidence:'private'}])test('AC08 US4.06 precio inválido '+JSON.stringify(change)+' falla cerrado',async()=>{
  await expect(fixture({...price,...change}).api.price(ids.group)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('AC09 US4.06 identidad ajena y filtro distinto no se aceptan',async()=>{
  await expect(fixture({...incident,id:ids.group}).api.incident(ids.order)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  await expect(fixture({items:[{...order,studentId:ids.group}],total:1,page:1,pageSize:20}).api.orders({studentId:ids.intention})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('AC10 US4.06 listas vacías se conservan sin anotaciones ficticias',async()=>{const empty={items:[],total:0,page:1,pageSize:20};expect(await fixture(empty).api.incidents()).toEqual(empty);});
test('AC11 US4.06 error temporal no genera otra identidad ni reenvía POST',async()=>{
  const f=fixture(null);f.transport.mockRejectedValue(new Error('private'));await expect(f.api.followUp(ids.order,{commandId:ids.intention,content:note.content})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(f.transport).toHaveBeenCalledTimes(1);
});
test('AC12 US4.07 logout descarta respuesta administrativa tardía',async()=>{
  const f=fixture(null);let resolve!:(response:Response)=>void;f.transport.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const pending=f.api.incident(ids.order);f.client.cancelPending();resolve(new Response(JSON.stringify({data:incident})));await expect(pending).rejects.toBeInstanceOf(RequestCancelled);expect(f.transport).toHaveBeenCalledTimes(1);
});
test('AC13 US4.06 replay de precio permite proyección más reciente sin repetir escritura',async()=>{
  const f=fixture({resource:{...price,revision:'4',amountMinor:'15000'},command:{...receipt,replayed:true,resultingRevision:'2'}});expect((await f.api.setPrice(ids.group,{commandId:ids.intention,expectedRevision:'1',amountMinor:'12500',currency:'PEN'})).resource.amountMinor).toBe('15000');expect(f.transport).toHaveBeenCalledTimes(1);
});
