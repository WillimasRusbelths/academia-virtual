import { expect, test, vi } from 'vitest';
import { createApiClient, materialsApi } from './http';
import { RequestCancelled } from '../shared/api-client';
const materialId='33333333-3333-4333-8333-333333333333',groupId='11111111-1111-4111-8111-111111111111';
const path=`/materials/items/${materialId}/content`;
function binary(overrides:Record<string,string|null|undefined>={}) {
  const headers=new Headers({'Content-Type':'application/pdf','Content-Length':'5',
    'Content-Disposition':`attachment; filename="lectura _.pdf"; filename*=UTF-8''lectura%20%C3%A1.pdf`,
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  for(const [name,value] of Object.entries(overrides))if(value===null)headers.delete(name);else if(value!==undefined)headers.set(name,value);
  return new Response('%PDF-',{headers});
}
test('DS01 UTF-8 attachment name is decoded and no Blob URL is created in transport',async()=>{
  const response=binary(),fetcher=vi.fn<typeof fetch>().mockResolvedValue(response);
  const result=await materialsApi(createApiClient(vi.fn(),fetcher)).download(materialId);
  expect(result.downloadName).toBe('lectura á.pdf');expect(await result.blob.text()).toBe('%PDF-');
});
test.each([
  {'Content-Type':'text/html'}, {'Content-Type':'application/pdf; charset=utf-8'}, {'Content-Disposition':null},
  {'Content-Disposition':`inline; filename="a.pdf"; filename*=UTF-8''a.pdf`},
  {'Content-Disposition':`attachment; filename="a.pdf"; filename*=UTF-8''..%2Fa.pdf`},
  {'Content-Disposition':`attachment; filename="a.pdf"; filename*=UTF-8''a%0d%0a.pdf`},
  {'Content-Disposition':`attachment; filename="a.pdf"; filename*=UTF-8''%FF.pdf`},
  {'Content-Disposition':`attachment; filename="a.pdf"; filename*=UTF-8''a.png`},
  {'Cache-Control':'public'}, {'X-Content-Type-Options':null}, {'Referrer-Policy':null},
  {'Content-Encoding':'gzip'}, {'Content-Range':'bytes 0-4/100'}, {'Location':'https://example.test/a'}, {'ETag':'"cached"'},
])('DS02 rejects unsafe/incompatible headers %j before reading the body',async headers=>{
  const response=binary(headers),blob=vi.spyOn(response,'blob'),fetcher=vi.fn<typeof fetch>().mockResolvedValue(response);
  await expect(materialsApi(createApiClient(vi.fn(),fetcher)).download(materialId)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(blob).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledOnce();
});
test('DS03 closed binary surface cannot use JSON content, uploads, arbitrary routes or an invalid id',async()=>{
  const fetcher=vi.fn<typeof fetch>(),client=createApiClient(vi.fn(),fetcher);
  for(const operation of [()=>client.request(path),()=>client.download('/auth/login'),()=>client.download(`/materials/uploads/${materialId}/content`),
    ()=>materialsApi(client).download('../invalid')])await expect(operation()).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(fetcher).not.toHaveBeenCalled();
});
test('DS04 body failure is safe and does not retry or return partial content',async()=>{
  const response=binary();vi.spyOn(response,'blob').mockRejectedValue(new Error('PRIVATE_BODY_FAILURE'));
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response);
  await expect(materialsApi(createApiClient(vi.fn(),fetcher)).download(materialId)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(fetcher).toHaveBeenCalledOnce();
});
test('DS05 cancellation during error decoding cannot expire a later session',async()=>{
  const response=new Response('{}',{status:401});let resolve!:(value:unknown)=>void;
  vi.spyOn(response,'json').mockReturnValue(new Promise(done=>{resolve=done;}));
  const expired=vi.fn(),client=createApiClient(expired,vi.fn<typeof fetch>().mockResolvedValue(response));
  const pending=materialsApi(client).download(materialId),rejected=expect(pending).rejects.toBeInstanceOf(RequestCancelled);
  await vi.waitFor(()=>expect(response.json).toHaveBeenCalledOnce());client.cancelPending();resolve({error:{code:'AUTH_REQUIRED'}});
  await rejected;expect(expired).not.toHaveBeenCalled();
});
test('DS07 nested scopes retain account cancellation before starting a download',async()=>{
  const fetcher=vi.fn<typeof fetch>(),account=new AbortController(),operation=new AbortController();
  const api=materialsApi(createApiClient(vi.fn(),fetcher)).scope(account.signal).scope(operation.signal);
  account.abort();await expect(api.download(materialId)).rejects.toBeInstanceOf(RequestCancelled);expect(fetcher).not.toHaveBeenCalled();
});
test.each(['bytes','sha256','revision','createdBy'])('DS06 student DTO rejects injected %s',async key=>{
  const item={id:materialId,groupId,title:'Lectura',description:null,mediaType:'application/pdf',byteSize:5,downloadName:'lectura.pdf',publishedAt:'2026-11-16T10:00:00.123456Z',[key]:'private'};
  const response=new Response(JSON.stringify({data:{items:[item],page:1,pageSize:20,total:1}}));
  await expect(materialsApi(createApiClient(vi.fn(),vi.fn<typeof fetch>().mockResolvedValue(response))).items(groupId)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
