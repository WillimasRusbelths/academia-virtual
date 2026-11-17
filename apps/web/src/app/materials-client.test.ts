import { expect, test, vi } from 'vitest';
import { createApiClient, materialsApi } from './http';
import { RequestCancelled } from '../shared/api-client';

const groupId='11111111-1111-4111-8111-111111111111',uploadId='22222222-2222-4222-8222-222222222222',materialId='33333333-3333-4333-8333-333333333333';
const commandId='44444444-4444-4444-8444-444444444444',at='2026-11-16T10:00:00.123456Z';
const resource={id:materialId,groupId,title:'Lectura',description:null,state:'PREPARED',revision:'1',mediaType:'application/pdf',byteSize:5,downloadName:'lectura.pdf',
  createdBy:commandId,createdAt:at,updatedAt:at,publishedAt:null,withdrawnAt:null};
const intent={uploadId,state:'PENDING',materialId:null,command:{replayed:false}};
const response=(data:unknown,status=200)=>new Response(JSON.stringify({data}),{status,headers:{'Content-Type':'application/json'}});
const error=(status:number,code:string,fields:unknown[]=[])=>new Response(JSON.stringify({error:{code,message:'Remote untrusted message',fields}}),{status});
test('binary upload sends the exact File with fixed CSRF and shared secure fetch options',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response({resource,replayed:false},201));
  const file=new File(['%PDF-'],'lectura.pdf',{type:'application/pdf'});
  expect(await materialsApi(createApiClient(vi.fn(),fetcher)).putContent(uploadId,file)).toEqual(resource);
  expect(fetcher).toHaveBeenCalledTimes(1);const [path,options]=fetcher.mock.calls[0];
  expect(path).toBe(`/api/v1/materials/uploads/${uploadId}/content`);expect(options?.body).toBe(file);
  expect(options).toMatchObject({method:'PUT',credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error'});
  const headers=new Headers(options?.headers);expect(headers.get('Content-Type')).toBe('application/octet-stream');
  expect(headers.get('X-CSRF-Protection')).toBe('1');expect(headers.has('Cookie')).toBe(false);expect(headers.has('Content-Length')).toBe(false);
});
test('JSON registration and filtered queries use their real closed routes',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(response(intent,201)).mockResolvedValueOnce(response({page:1,pageSize:20,total:1,items:[resource]}));
  const api=materialsApi(createApiClient(vi.fn(),fetcher)),input={intentionId:commandId,title:'Lectura',description:null,downloadName:'lectura.pdf',mediaType:'application/pdf',byteSize:5,sha256:'a'.repeat(64)};
  expect((await api.createUpload(groupId,input)).uploadId).toBe(uploadId);
  expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toEqual(input);
  const item=(await api.items(groupId,{page:1,state:'PREPARED'})).items[0];
  expect('revision' in item&&item.revision).toBe('1');
  expect(fetcher.mock.calls[1][0]).toBe(`/api/v1/materials/groups/${groupId}/items?page=1&state=PREPARED`);
});
test.each([
  ['register-replay',200,{...intent,command:{replayed:true}}],
  ['content-replay',200,{resource,replayed:true}],
] as const)('%s requires explicit replay acknowledgement',async(kind,status,data)=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response(data,status)),client=createApiClient(vi.fn(),fetcher);
  if(kind==='register-replay')expect(await client.request(`/materials/groups/${groupId}/uploads`,{method:'POST',body:{}})).toEqual(data);
  else expect(await client.upload(`/materials/uploads/${uploadId}/content`,new File(['a'],'a.pdf'))).toEqual(data);
});
test.each([202,204,206,201])('metadata query rejects unexpected success status %s',async status=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(status===204?new Response(null,{status}):response(resource,status));
  await expect(materialsApi(createApiClient(vi.fn(),fetcher)).getMaterial(materialId)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test.each(['extra','digest','foreign-group','bad-revision','wrong-id'] as const)('invalid material DTO %s never becomes current resource',async kind=>{
  const value={...resource,...(kind==='extra'?{bytes:[1]}:kind==='digest'?{sha256:'private'}:kind==='foreign-group'?{groupId:uploadId}:kind==='bad-revision'?{revision:1}:{id:uploadId})};
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response(kind==='foreign-group'?{page:1,pageSize:20,total:1,items:[value]}:value));
  const api=materialsApi(createApiClient(vi.fn(),fetcher));
  await expect(kind==='foreign-group'?api.items(groupId):api.getMaterial(materialId)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('material conflict and validation fields cannot bleed into other routes or methods',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(error(409,'MATERIAL_VERSION_CONFLICT'))
    .mockResolvedValueOnce(error(409,'MATERIAL_VERSION_CONFLICT')).mockResolvedValueOnce(error(400,'VALIDATION_ERROR',[{field:'title'},{field:'password'},{field:'sha256'}]));
  const client=createApiClient(vi.fn(),fetcher);
  await expect(client.request(`/materials/items/${materialId}/publish`,{method:'POST'})).rejects.toMatchObject({code:'MATERIAL_VERSION_CONFLICT'});
  await expect(client.request('/auth/login',{method:'POST'})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  await expect(client.request(`/materials/groups/${groupId}/uploads`,{method:'POST'})).rejects.toMatchObject({fields:['title','sha256']});
});
test('binary upload and JSON share auth-generation cancellation, even if transport ignores abort',async()=>{
  let complete!:(value:Response)=>void;const delayed=new Promise<Response>(resolve=>{complete=resolve;});
  const fetcher=vi.fn<typeof fetch>().mockReturnValueOnce(delayed).mockResolvedValueOnce(error(401,'AUTH_REQUIRED'));
  const expired=vi.fn(),client=createApiClient(expired,fetcher),operation=materialsApi(client).putContent(uploadId,new File(['a'],'a.pdf'));
  const rejection=expect(operation).rejects.toBeInstanceOf(RequestCancelled);
  await expect(client.request('/me')).rejects.toMatchObject({code:'AUTH_REQUIRED'});
  complete(response({resource,replayed:false},201));await rejection;
  expect(expired).toHaveBeenCalledOnce();expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
});
test('scope abort during body parsing discards the late binary result and never retries',async()=>{
  let release!:(value:unknown)=>void;const body=new Promise<unknown>(resolve=>{release=resolve;});
  const reply=response({},201);vi.spyOn(reply,'json').mockReturnValue(body);
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(reply),scope=new AbortController();
  const pending=materialsApi(createApiClient(vi.fn(),fetcher)).scope(scope.signal).putContent(uploadId,new File(['a'],'a.pdf'));
  const rejection=expect(pending).rejects.toBeInstanceOf(RequestCancelled);
  await vi.waitFor(()=>expect(reply.json).toHaveBeenCalledOnce());scope.abort();release({data:{resource,replayed:false}});await rejection;
  expect(fetcher).toHaveBeenCalledOnce();
});
test('binary capability refuses unknown path/method surfaces and mismatched success status',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response({resource,replayed:false},200)),client=createApiClient(vi.fn(),fetcher),file=new File(['a'],'a.pdf');
  await expect(client.upload('/auth/login',file)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  await expect(client.request(`/materials/uploads/${uploadId}/content`,{method:'PUT',body:{file}})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  // T054 now supports withdraw; replacement remains outside the closed surface.
  await expect(client.request(`/materials/items/${materialId}/replace`,{method:'POST'})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(fetcher).not.toHaveBeenCalled();
  await expect(client.upload(`/materials/uploads/${uploadId}/content`,file)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(fetcher).toHaveBeenCalledOnce();
});

// T037: student/download contracts precede T043. Existing manager tests remain intact.
const studentResource={id:materialId,groupId,title:'Lectura',description:null,mediaType:'application/pdf',byteSize:5,downloadName:'lectura.pdf',publishedAt:at};
function studentDownload(api:unknown):(id:string)=>Promise<{blob:Blob;downloadName:string}> {
  const method=Reflect.get(api as object,'download');
  if(typeof method!=='function')throw new Error('T043 pending: validated binary materials download not implemented');
  return method.bind(api) as (id:string)=>Promise<{blob:Blob;downloadName:string}>;
}
const binary=(status=200,length='5',body:BodyInit='%PDF-')=>new Response(body,{status,headers:{
  'Content-Type':'application/pdf','Content-Length':length,'Content-Disposition':"attachment; filename=\"lectura.pdf\"; filename*=UTF-8''lectura.pdf",
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
}});
test('MSC01 student context/list accepts minimal DTO and distinguishes a successful empty page',async()=>{
  const context={id:groupId,name:'Grupo propio',courseName:'Curso de ensayo'},fetcher=vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response(context)).mockResolvedValueOnce(response({items:[studentResource],page:1,pageSize:20,total:1}))
    .mockResolvedValueOnce(response({items:[],page:2,pageSize:20,total:1}));
  const api=materialsApi(createApiClient(vi.fn(),fetcher));expect(await api.group(groupId)).toEqual(context);
  expect((await api.items(groupId)).items).toEqual([studentResource]);expect((await api.items(groupId,{page:2})).items).toEqual([]);
});
test('MSC02 binary GET is same-origin/no-store/redirect error, exact bytes and name; it never parses successful content as JSON',async()=>{
  const reply=binary(),json=vi.spyOn(reply,'json'),fetcher=vi.fn<typeof fetch>().mockResolvedValue(reply);
  const result=await studentDownload(materialsApi(createApiClient(vi.fn(),fetcher)))(materialId);
  expect(result.blob.size).toBe(5);expect(result.blob.type).toBe('application/pdf');expect(result.downloadName).toBe('lectura.pdf');
  expect(await result.blob.text()).toBe('%PDF-');expect(json).not.toHaveBeenCalled();
  expect(fetcher.mock.calls[0][0]).toBe(`/api/v1/materials/items/${materialId}/content`);
  const options=fetcher.mock.calls[0][1];expect(options).toMatchObject({method:'GET',credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error'});
  expect(options?.body).toBeUndefined();expect(new Headers(options?.headers).has('Cookie')).toBe(false);
});
test.each(['4','6','0','-1','NaN','20000001','05',''])('MSC03 invalid or incompatible Content-Length %s cannot complete',async length=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(binary(200,length));
  await expect(studentDownload(materialsApi(createApiClient(vi.fn(),fetcher)))(materialId)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(fetcher).toHaveBeenCalledOnce();
});
test.each([201,206,304])('MSC04 download refuses status %s instead of creating a partial/cached success',async status=>{
  const reply=status===304?new Response(null,{status}):binary(status),fetcher=vi.fn<typeof fetch>().mockResolvedValue(reply);
  await expect(studentDownload(materialsApi(createApiClient(vi.fn(),fetcher)))(materialId)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('MSC05 safe download error envelope preserves code but drops remote/private messages',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(error(404,'NOT_FOUND'));
  await expect(studentDownload(materialsApi(createApiClient(vi.fn(),fetcher)))(materialId)).rejects.toMatchObject({status:404,code:'NOT_FOUND',message:'Recurso no encontrado.'});
});
test('MSC06 auth generation discards binary from the previous account even if abort is ignored',async()=>{
  let resolve!:(value:Response)=>void;const delayed=new Promise<Response>(done=>{resolve=done;});
  const fetcher=vi.fn<typeof fetch>().mockReturnValueOnce(delayed),client=createApiClient(vi.fn(),fetcher);
  const pending=studentDownload(materialsApi(client))(materialId),rejected=expect(pending).rejects.toBeInstanceOf(RequestCancelled);
  client.cancelPending();resolve(binary());await rejected;expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);expect(fetcher).toHaveBeenCalledOnce();
});
test('MSC07 scope abort during binary body consumption discards the late Blob',async()=>{
  const reply=binary();let resolve!:(value:Blob)=>void;const delayed=new Promise<Blob>(done=>{resolve=done;});vi.spyOn(reply,'blob').mockReturnValue(delayed);
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(reply),scope=new AbortController();
  const pending=studentDownload(materialsApi(createApiClient(vi.fn(),fetcher)).scope(scope.signal))(materialId),rejected=expect(pending).rejects.toBeInstanceOf(RequestCancelled);
  await vi.waitFor(()=>expect(reply.blob).toHaveBeenCalledOnce());scope.abort();resolve(new Blob(['%PDF-'],{type:'application/pdf'}));await rejected;
  expect(fetcher).toHaveBeenCalledOnce();
});
test('MSC08 binary 401 expires the shared session once and never retries',async()=>{
  const expired=vi.fn(),fetcher=vi.fn<typeof fetch>().mockResolvedValue(error(401,'AUTH_REQUIRED'));
  await expect(studentDownload(materialsApi(createApiClient(expired,fetcher)))(materialId)).rejects.toMatchObject({code:'AUTH_REQUIRED'});
  expect(expired).toHaveBeenCalledOnce();expect(fetcher).toHaveBeenCalledOnce();
});
