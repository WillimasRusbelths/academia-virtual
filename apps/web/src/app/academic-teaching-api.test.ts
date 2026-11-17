import { expect, test, vi } from 'vitest';
import { createApiClient } from './http';
import { academicOfferingApi } from '../features/academic-offering/api';
import { RequestCancelled } from '../shared/api-client';

const id='00000000-0000-4000-8000-000000000001';
const group={id,course:{id,name:'Curso',description:null},name:'Grupo',state:'DRAFT',periodStart:null,periodEnd:null,
  timeZone:'America/Lima',capacity:null,occupancy:null,availability:null,capacityStatus:'NOT_CALCULATED',schedule:[],teacher:{name:'Docente'}};
const response=(data:unknown)=>new Response(JSON.stringify({data}),{status:200});
for(const value of [{...group,email:'privado@example.test'},{...group,revision:'1'},{...group,teacherReviewRequired:true},
  {...group,cancellationReason:'Privado'},{...group,teacher:{name:'Docente',eligible:true}},{...group,course:{...group.course,groups:[]}},
  {...group,capacity:0},{...group,capacity:51},{...group,occupancy:0},{...group,availability:50},{...group,timeZone:'UTC'},
  {...group,schedule:[{dayOfWeek:1,startTime:'23:00',endTime:'01:00'}]}])
  test(`DTO docente rechaza ampliación/valor inválido ${JSON.stringify(value)}`,async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValue(response(value));
    await expect(academicOfferingApi(createApiClient(vi.fn(),transport)).teachingGroup(id)).rejects.toMatchObject({status:503});
  });
test('borrador incompleto y cancelado se decodifican sin inventar datos ni acceder a cursos generales',async()=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(response(group)).mockResolvedValueOnce(response({...group,state:'CANCELLED'}));
  const api=academicOfferingApi(createApiClient(vi.fn(),transport));expect(await api.teachingGroup(id)).toEqual(group);
  expect((await api.teachingGroup(id)).state).toBe('CANCELLED');expect(transport.mock.calls.every(([url])=>url===`/api/v1/teaching/groups/${id}`)).toBe(true);
});
test('listado permite solo paginación y envía señal de cancelación',async()=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValue(response({items:[group],total:1,page:2,pageSize:3}));
  const client=createApiClient(vi.fn(),transport),api=academicOfferingApi(client),controller=new AbortController();
  expect((await api.teachingGroups({page:2,pageSize:3},controller.signal)).total).toBe(1);
  expect(transport.mock.calls[0][0]).toBe('/api/v1/teaching/groups?page=2&pageSize=3');
  for(const query of [{q:'Docente'},{state:'PUBLISHED'},{teacherUserId:id}])await expect(client.request('/teaching/groups',{query})).rejects.toMatchObject({status:503});
  expect(transport).toHaveBeenCalledTimes(1);
});
test('detalle no admite referencia distinta o parámetros privados',async()=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValue(response({...group,id:'00000000-0000-4000-8000-000000000002'})),client=createApiClient(vi.fn(),transport);
  await expect(academicOfferingApi(client).teachingGroup(id)).rejects.toMatchObject({status:503});
  await expect(client.request(`/teaching/groups/${id}`,{query:{page:1}})).rejects.toMatchObject({status:503});
});
test('cancelar pendientes invalida respuesta tardía aunque el transporte ignore AbortSignal, sin replay',async()=>{
  let release!:(value:Response)=>void;const transport=vi.fn<typeof fetch>().mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const client=createApiClient(vi.fn(),transport),reading=client.request('/teaching/groups').then(value=>({value}),error=>({error}));
  client.cancelPending();expect(transport.mock.calls[0][1]?.signal?.aborted).toBe(true);release(response(group));
  expect(await reading).toMatchObject({error:expect.any(RequestCancelled)});expect(await reading).not.toHaveProperty('value');expect(transport).toHaveBeenCalledTimes(1);
});
test('401 docente cancela operaciones hermanas y comunica pérdida de acceso una sola vez',async()=>{
  let release!:(value:Response)=>void;const denied=vi.fn(),transport=vi.fn<typeof fetch>().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}))
    .mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'AUTH_REQUIRED'}}),{status:401}));
  const client=createApiClient(denied,transport),reading=client.request('/teaching/groups').catch(error=>error);
  await expect(client.request('/me')).rejects.toMatchObject({code:'AUTH_REQUIRED'});release(response(group));
  expect(await reading).toBeInstanceOf(RequestCancelled);expect(denied).toHaveBeenCalledTimes(1);expect(transport).toHaveBeenCalledTimes(2);
});
