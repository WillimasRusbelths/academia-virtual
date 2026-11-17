import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ApiFailure } from '../../shared/api-client';
import { createMaterialsStudentController, MaterialsStudentPage } from './student-page';
const groupId='11111111-1111-4111-8111-111111111111',materialId='33333333-3333-4333-8333-333333333333';
const group={id:groupId,name:'Grupo propio',courseName:'Curso de ensayo'};
const item={id:materialId,groupId,title:'Lectura',description:'<script>sin ejecutar</script>',mediaType:'application/pdf',byteSize:5,downloadName:'lectura.pdf',publishedAt:'2026-11-16T10:00:00.123456Z'};
function setup() {
  const api={group:vi.fn().mockResolvedValue(group),items:vi.fn().mockResolvedValue({items:[item],page:1,pageSize:20,total:21}),
    download:vi.fn().mockResolvedValue({blob:new Blob(['%PDF-'],{type:'application/pdf'}),downloadName:item.downloadName})};
  const urls={createObjectURL:vi.fn().mockReturnValue('blob:one'),revokeObjectURL:vi.fn()};
  return {api,urls,controller:createMaterialsStudentController(api,{groupId,urls})};
}
test('SF01 page changes reauthorize and clear the previous attachment; metadata is visible and escaped',async()=>{
  const {controller,api,urls}=setup();await controller.load();await controller.download(materialId);
  const html=renderToStaticMarkup(createElement(MaterialsStudentPage,{controller}));
  expect(html).toContain('PDF');expect(html).toContain('5 bytes');expect(html).toContain(item.publishedAt);
  expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
  api.items.mockResolvedValueOnce({items:[],page:2,pageSize:20,total:21});await controller.load(2);
  expect(api.items).toHaveBeenLastCalledWith(groupId,{page:2,pageSize:20});
  expect(controller.snapshot()).toMatchObject({state:'EMPTY',page:2,items:[],download:null});expect(urls.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:one');
});
test.each([401,403,404])('SF02 a download denied with %s clears prior group, list and URL',async status=>{
  const {controller,api,urls}=setup();await controller.load();await controller.download(materialId);
  api.download.mockRejectedValueOnce(new ApiFailure(status,status===401?'AUTH_REQUIRED':status===403?'FORBIDDEN':'NOT_FOUND','Acceso no permitido.'));
  await controller.download(materialId);expect(controller.snapshot()).toMatchObject({state:status===401?'AUTH_REQUIRED':'DENIED',group:null,items:[],download:null,busy:false});
  expect(urls.revokeObjectURL).toHaveBeenCalledOnce();
});
test.each(['type','name'])('SF03 mismatched %s cannot create an attachment URL',async kind=>{
  const {controller,api,urls}=setup();await controller.load();
  api.download.mockResolvedValueOnce({blob:new Blob(['%PDF-'],{type:kind==='type'?'image/png':'application/pdf'}),downloadName:kind==='name'?'other.pdf':item.downloadName});
  await controller.download(materialId);expect(controller.snapshot().state).toBe('ERROR');expect(urls.createObjectURL).not.toHaveBeenCalled();
});
test('SF04 disposal aborts the actual scoped operation and ignores late completion',async()=>{
  const {api,urls}=setup();let signal:AbortSignal|undefined,resolve!:(value:unknown)=>void;
  const scoped={...api,scope(next:AbortSignal){signal=next;return api;}};
  const controller=createMaterialsStudentController(scoped,{groupId,urls});await controller.load();
  api.download.mockReturnValueOnce(new Promise(done=>{resolve=done;}));const pending=controller.download(materialId);
  expect(signal?.aborted).toBe(false);controller.dispose();expect(signal?.aborted).toBe(true);
  resolve({blob:new Blob(['%PDF-'],{type:'application/pdf'}),downloadName:item.downloadName});await pending;
  expect(urls.createObjectURL).not.toHaveBeenCalled();expect(controller.snapshot().state).toBe('DISPOSED');
});
test('SF05 no concurrent binary transfer and no stale release of a newer URL',async()=>{
  const {controller,api,urls}=setup();await controller.load();let resolve!:(value:unknown)=>void;
  api.download.mockReturnValueOnce(new Promise(done=>{resolve=done;}));const pending=controller.download(materialId);await controller.download(materialId);
  expect(api.download).toHaveBeenCalledOnce();resolve({blob:new Blob(['%PDF-'],{type:'application/pdf'}),downloadName:item.downloadName});await pending;
  urls.createObjectURL.mockReturnValueOnce('blob:two');await controller.download(materialId);controller.releaseDownload('blob:one');
  expect(controller.snapshot().download?.url).toBe('blob:two');controller.dispose();expect(urls.revokeObjectURL.mock.calls).toEqual([['blob:one'],['blob:two']]);
});
test('SF06 malformed audience or foreign group fails closed instead of displaying management/private metadata',async()=>{
  const {controller,api}=setup();api.group.mockResolvedValueOnce({...group,state:'DRAFT'});await controller.load();
  expect(controller.snapshot()).toMatchObject({state:'ERROR',group:null,items:[]});
  api.items.mockResolvedValueOnce({items:[{...item,groupId:materialId}],page:1,pageSize:20,total:1});await controller.load();
  expect(controller.snapshot()).toMatchObject({state:'ERROR',group:null,items:[]});
});
