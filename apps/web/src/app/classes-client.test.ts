import { expect, test, vi } from 'vitest';
import * as http from './http';
import type { ClassesApi } from '../features/classes/api';
import type { ApiClient } from '../shared/api-client';
const groupId='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',commandId='33333333-3333-4333-8333-333333333333';
const at='2026-11-18T12:00:00.123456Z';
const resource={id,groupId,title:'Clase',description:null,state:'PREPARED',revision:'1',viewVersion:'1',createdBy:commandId,updatedBy:commandId,
  createdAt:at,updatedAt:at,startedAt:null,finishedAt:null,cancelledAt:null,actions:{edit:true,start:true,finish:false,cancel:true}};
const receipt={id:commandId,replayed:false,result:'APPLIED',appliedRevision:'1',appliedEventSeq:'1'};
const response=(data:unknown,status=200)=>new Response(JSON.stringify({data}),{status});
function api(client:ApiClient):ClassesApi {
  const factory:unknown=Reflect.get(http,'classesApi'); expect(typeof factory,'T024: closed classes client must exist').toBe('function');
  return Reflect.apply(factory as (...args:unknown[])=>unknown,undefined,[client]) as ClassesApi;
}
test('create binds the group, immutable intention and safe transport, without starting the session',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response({resource,command:receipt},201));
  const result=await api(http.createApiClient(vi.fn(),fetcher)).create(groupId,{commandId,title:'Clase',description:null});
  expect(result.resource).toEqual(resource); expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][0]).toBe('/api/v1/classes/groups/'+groupId+'/sessions');
  const options=fetcher.mock.calls[0][1]; expect(options).toMatchObject({method:'POST',credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error'});
  expect(JSON.parse(options?.body as string)).toEqual({commandId,title:'Clase',description:null});
  expect(new Headers(options?.headers).get('X-CSRF-Protection')).toBe('1');
});
test.each(['edit','start','finish','cancel'] as const)('%s preserves its exact intention and declared route',async operation=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValue(response({resource,command:receipt}));
  const client=api(http.createApiClient(vi.fn(),transport));
  await (operation==='edit'?client.edit(id,{commandId,expectedRevision:'1',title:'Clase',description:null}):client[operation](id,{commandId,expectedRevision:'1'}));
  expect(transport.mock.calls[0][0]).toBe('/api/v1/classes/sessions/'+id+(operation==='edit'?'':'/'+operation));
});
test.each(['CLASS_VERSION_CONFLICT','CLASS_STATE_CONFLICT','CLASS_ALREADY_LIVE','IDEMPOTENCY_CONFLICT'] as const)('classes conflict %s is local and never trusts a server message',async code=>{
  const transport=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(JSON.stringify({error:{code,message:'unsafe',fields:[{field:'password'}]}}),{status:409}));
  const client=http.createApiClient(vi.fn(),transport);
  await expect(api(client).start(id,{commandId,expectedRevision:'1'})).rejects.toMatchObject({code,fields:[]});
  await expect(client.request('/me')).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('validation fields are closed per classes operation',async()=>{
  const transport=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(JSON.stringify({error:{code:'VALIDATION_ERROR',fields:[{field:'title'},{field:'expectedRevision'},{field:'password'}]}}),{status:400}));
  const client=api(http.createApiClient(vi.fn(),transport));
  await expect(client.create(groupId,{commandId,title:'Clase',description:null})).rejects.toMatchObject({fields:['title']});
  await expect(client.start(id,{commandId,expectedRevision:'1'})).rejects.toMatchObject({fields:['expectedRevision']});
});
test.each(['extra','wrong-id','wrong-group','bad-revision','bad-time','bad-actions','bad-receipt','wrong-command','status'])(
  'malformed %s does not become a confirmed write',async kind=>{
    const item={...resource,...(kind==='extra'?{token:'unsafe'}:kind==='wrong-id'?{id:groupId}:kind==='wrong-group'?{groupId:id}:
      kind==='bad-revision'?{revision:'9223372036854775808'}:kind==='bad-time'?{createdAt:'2026-11-18T12:00:00.123Z'}:kind==='bad-actions'?{actions:{edit:true}}:{})};
    const command={...receipt,...(kind==='bad-receipt'?{payloadDigest:'unsafe'}:kind==='wrong-command'?{id:groupId}:{})};
    const transport=vi.fn<typeof fetch>().mockResolvedValue(response({resource:item,command},kind==='status'?201:200));
    const client=api(http.createApiClient(vi.fn(),transport));
    // Wrong group is bound when creating; other corruptions use an existing resource.
    await expect(kind==='wrong-group'?client.create(groupId,{commandId,title:'Clase',description:null}):client.edit(id,{commandId,expectedRevision:'1',title:'Clase',description:null}))
      .rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  });
test('command recovery accepts NOT_CONFIRMED or a currently authorized managed result only',async()=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(response({result:'NOT_CONFIRMED'}))
    .mockResolvedValueOnce(response({result:'APPLIED',response:{resource,command:{...receipt,replayed:true}}}));
  const client=api(http.createApiClient(vi.fn(),transport));
  expect(await client.command(commandId)).toEqual({result:'NOT_CONFIRMED'});
  expect(await client.command(commandId)).toMatchObject({result:'APPLIED',response:{command:{id:commandId}}});
  expect(transport.mock.calls.every(call=>call[0]==='/api/v1/classes/commands/'+commandId&&call[1]?.method==='GET')).toBe(true);
});
test.each(['/classes/sessions/'+id+'/messages','/classes/sessions/'+id+'/reopen','/classes/anything'])(
  'unimplemented route %s is rejected before fetch',async path=>{
    const transport=vi.fn<typeof fetch>(),client=http.createApiClient(vi.fn(),transport);
    for(const target of [path,path.toUpperCase()])await expect(client.request(target)).rejects.toBeDefined();
    expect(transport).not.toHaveBeenCalled();
  });
