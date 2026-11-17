import { expect, test, vi } from 'vitest';
import { createApiClient, materialsApi } from './http';

const id='33333333-3333-4333-8333-333333333333',commandId='44444444-4444-4444-8444-444444444444',at='2026-11-16T10:00:00.123456Z';
const resource={id,groupId:'11111111-1111-4111-8111-111111111111',title:'Correccion',description:null,state:'PUBLISHED',revision:'3',
  mediaType:'application/pdf',byteSize:5,downloadName:'lectura.pdf',createdBy:commandId,createdAt:at,updatedAt:at,publishedAt:at,withdrawnAt:null};
const input={commandId,expectedRevision:'2'},receipt={id:commandId,replayed:false,appliedRevision:'3',result:'APPLIED'};
test.each(['edit','withdraw'] as const)('%s uses the closed route with secure fetch and exact immutable input',async action=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({data:{resource,command:receipt}}),{status:200}));
  const api=materialsApi(createApiClient(vi.fn(),fetcher)),body=action==='edit'?{...input,title:'Correccion',description:null}:input;
  await (action==='edit'?api.edit(id,{...input,title:'Correccion',description:null}):api.withdraw(id,input));
  expect(fetcher).toHaveBeenCalledTimes(1);const [path,options]=fetcher.mock.calls[0];
  expect(path).toBe('/api/v1/materials/items/'+id+(action==='edit'?'':'/withdraw'));
  expect(options).toMatchObject({method:action==='edit'?'PATCH':'POST',credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error'});
  expect(JSON.parse(options?.body as string)).toEqual(body);expect(new Headers(options?.headers).get('X-CSRF-Protection')).toBe('1');
});
test.each(['edit','withdraw'] as const)('%s preserves only allowed conflict and validation fields',async action=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'MATERIAL_VERSION_CONFLICT',message:'untrusted',fields:[{field:'password'}]}}),{status:409}))
    .mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'VALIDATION_ERROR',message:'untrusted',fields:[{field:'expectedRevision'},{field:'title'},{field:'password'}]}}),{status:400}));
  const api=materialsApi(createApiClient(vi.fn(),fetcher)),send=()=>action==='edit'?api.edit(id,{...input,title:'Correccion',description:null}):api.withdraw(id,input);
  await expect(send()).rejects.toMatchObject({code:'MATERIAL_VERSION_CONFLICT',fields:[]});
  await expect(send()).rejects.toMatchObject({code:'VALIDATION_ERROR',fields:action==='edit'?['expectedRevision','title']:['expectedRevision']});
});
test.each(['wrong-command','wrong-resource','extra-receipt','unknown-result'] as const)('malformed %s cannot become a current correction response',async kind=>{
  const command={...receipt,...(kind==='wrong-command'?{id:resource.groupId}:kind==='extra-receipt'?{bytes:[]}:
    kind==='unknown-result'?{result:'SUCCESS'}:{})};
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({data:{resource:kind==='wrong-resource'?{...resource,id:resource.groupId}:resource,command}}),{status:200}));
  await expect(materialsApi(createApiClient(vi.fn(),fetcher)).edit(id,{...input,title:'Correccion',description:null})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
