import { expect, test, vi } from 'vitest';
import { ApiFailure } from '../../shared/api-client';
import { createMaterialsManagementController, hashMaterialFile } from './management-page';
import type { MaterialReference } from './api';
const groupId='11111111-1111-4111-8111-111111111111',uploadId='22222222-2222-4222-8222-222222222222',materialId='33333333-3333-4333-8333-333333333333';
const prepared:MaterialReference={id:materialId,title:'Lectura',description:null,state:'PREPARED',revision:'1'};
function setup(){
  const api={createUpload:vi.fn().mockResolvedValue({uploadId,state:'PENDING',materialId:null}),putContent:vi.fn().mockResolvedValue(prepared),
    uploadStatus:vi.fn().mockResolvedValue({uploadId,state:'PENDING',materialId:null}),getMaterial:vi.fn().mockResolvedValue(prepared),
    publish:vi.fn().mockResolvedValue({resource:{...prepared,state:'PUBLISHED',revision:'2'},command:{replayed:false,result:'APPLIED',appliedRevision:'2'}})};
  const options={groupId,intentionId:vi.fn().mockImplementation(()=>crypto.randomUUID()),commandId:vi.fn().mockImplementation(()=>crypto.randomUUID()),hash:vi.fn().mockResolvedValue('a'.repeat(64)),onDenied:vi.fn()};
  const controller=createMaterialsManagementController(api,options);controller.setTitle('Lectura');controller.setFile(new File(['%PDF-'],'lectura.pdf',{type:'application/pdf'}));
  return {api,controller,options};
}
test('hashes the actual File using SHA-256',async()=>{
  expect(await hashMaterialFile(new File(['abc'],'abc.pdf'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test.each([0,20_000_001])('rejects preliminary byte size %s before hash or server call',async size=>{
  const {controller,api,options}=setup(),file=new File(['a'],'a.pdf');Object.defineProperty(file,'size',{value:size});controller.setFile(file);
  await controller.prepare();expect(controller.snapshot().state).toBe('REJECTED');expect(options.hash).not.toHaveBeenCalled();expect(api.createUpload).not.toHaveBeenCalled();
});
test('no duplicate hash, mutation or late data after disposal',async()=>{
  const {controller,api,options}=setup();let release!:(digest:string)=>void;options.hash.mockImplementationOnce(()=>new Promise<string>(resolve=>{release=resolve;}));
  const pending=controller.prepare();await controller.prepare();expect(options.hash).toHaveBeenCalledOnce();
  controller.dispose();release('a'.repeat(64));await pending;
  expect(api.createUpload).not.toHaveBeenCalled();expect(controller.snapshot()).toMatchObject({state:'DISPOSED',file:null,title:'',intentionId:null,material:null});
});
test('uncertain send is blocked until explicit query; changing fields cannot discard its identity',async()=>{
  const {controller,api}=setup();api.putContent.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Incierto'));
  await controller.prepare();const prior=controller.snapshot();controller.setTitle('Otro');controller.setFile(new File(['otro'],'otro.pdf'));
  await controller.prepare();expect(controller.snapshot()).toBe(prior);expect(api.putContent).toHaveBeenCalledOnce();
  await controller.recover();expect(controller.snapshot().state).toBe('RETRY_READY');expect(api.putContent).toHaveBeenCalledOnce();
});
test('lost registration response resolves the same intention manually without sending any bytes',async()=>{
  const {controller,api,options}=setup();api.createUpload.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Incierto'));
  await controller.prepare();expect(controller.snapshot().state).toBe('UNCERTAIN');await controller.recover();
  expect(api.createUpload).toHaveBeenCalledTimes(2);expect(api.createUpload.mock.calls[0]).toEqual(api.createUpload.mock.calls[1]);
  expect(options.intentionId).toHaveBeenCalledOnce();expect(api.putContent).not.toHaveBeenCalled();expect(controller.snapshot().state).toBe('RETRY_READY');
});
test('normalized identical metadata preserves intention; changed digest creates a new one',async()=>{
  const {controller,api,options}=setup();api.putContent.mockRejectedValue(new ApiFailure(400,'VALIDATION_ERROR','Inválido'));
  await controller.prepare();controller.setTitle('  Lectura  ');await controller.prepare();expect(options.intentionId).toHaveBeenCalledOnce();
  options.hash.mockResolvedValueOnce('b'.repeat(64));controller.setFile(new File(['other'],'lectura.pdf',{type:'application/pdf'}));await controller.prepare();
  expect(options.intentionId).toHaveBeenCalledTimes(2);expect(api.createUpload).toHaveBeenCalledTimes(2);
});
test('lost publish response is queried and a manual retry retains the original command identity',async()=>{
  const {controller,api,options}=setup();await controller.prepare();api.publish.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Incierto'));
  await controller.confirmPublish(materialId,true);await controller.confirmPublish(materialId,true);expect(api.publish).toHaveBeenCalledOnce();
  await controller.recover();expect(api.getMaterial).toHaveBeenCalledExactlyOnceWith(materialId);expect(controller.snapshot().state).toBe('PREPARED');
  await controller.confirmPublish(materialId,true);expect(options.commandId).toHaveBeenCalledOnce();expect(api.publish.mock.calls[0]).toEqual(api.publish.mock.calls[1]);
});
test('version conflict requires visible comparison and explicit adoption before new confirmation',async()=>{
  const {controller,api,options}=setup();await controller.prepare();api.publish.mockRejectedValueOnce(new ApiFailure(409,'MATERIAL_VERSION_CONFLICT','Cambió'));
  await controller.confirmPublish(materialId,true);api.getMaterial.mockResolvedValueOnce({...prepared,revision:'3'});await controller.recover();
  expect(controller.snapshot()).toMatchObject({state:'COMPARING',material:{revision:'1'},comparison:{revision:'3'}});
  await controller.confirmPublish(materialId,true);expect(api.publish).toHaveBeenCalledOnce();controller.acceptComparison();await controller.confirmPublish(materialId,true);
  expect(api.publish.mock.calls[1][1].expectedRevision).toBe('3');expect(options.commandId).toHaveBeenCalledTimes(2);
});
test.each([401,403,404])('permission/session failure %s clears previous material and in-memory input',async status=>{
  const {controller,api,options}=setup();await controller.prepare();api.publish.mockRejectedValueOnce(new ApiFailure(status,status===401?'AUTH_REQUIRED':status===403?'FORBIDDEN':'NOT_FOUND','Denegado'));
  await controller.confirmPublish(materialId,true);expect(controller.snapshot()).toMatchObject({state:status===401?'AUTH_REQUIRED':'DENIED',file:null,title:'',material:null});
  expect(options.onDenied).toHaveBeenCalledOnce();await controller.prepare();expect(api.putContent).toHaveBeenCalledOnce();
});
