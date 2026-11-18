import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ApiFailure } from '../../shared/api-client';
import type { ClassesApi, ManagedClass } from './api';
import type * as Management from './management-page';
const modules=import.meta.glob<Record<string,unknown>>('./management-page.tsx');
const groupId='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',commandId='33333333-3333-4333-8333-333333333333';
const at='2026-11-18T12:00:00.123456Z';
const resource:ManagedClass={id,groupId,title:'Clase',description:null,state:'PREPARED',revision:'1',viewVersion:'1',createdBy:commandId,updatedBy:commandId,
  createdAt:at,updatedAt:at,startedAt:null,finishedAt:null,cancelledAt:null,actions:{edit:true,start:true,finish:false,cancel:true}};
const result={resource,command:{id:commandId,result:'APPLIED' as const,replayed:false,appliedRevision:'1',appliedEventSeq:'1'}};
async function setup(initial:ManagedClass|null=resource) {
  expect(modules['./management-page.tsx'],'T025: management implementation is pending').toBeDefined();
  const module=await modules['./management-page.tsx']() as unknown as typeof Management;
  const fake={create:vi.fn().mockResolvedValue(result),edit:vi.fn().mockResolvedValue(result),start:vi.fn().mockResolvedValue(result),finish:vi.fn().mockResolvedValue(result),cancel:vi.fn().mockResolvedValue(result),session:vi.fn().mockResolvedValue(resource),command:vi.fn().mockResolvedValue({result:'NOT_CONFIRMED'})};
  const options={groupId,initial:initial??undefined,commandId:vi.fn().mockReturnValue(commandId),onDenied:vi.fn()};
  const controller=module.createClassesManagementController(fake as unknown as ClassesApi,options);
  return {...module,controller,fake,options};
}
test.each(['start','finish','cancel'] as const)('%s needs an explicit confirmation and allocates nothing on cancel',async operation=>{
  const initial=operation==='finish'?{...resource,state:'LIVE' as const,actions:{edit:true,start:false,finish:true,cancel:false}}:resource;
  const {controller,fake,options}=await setup(initial);
  controller.ask(operation); controller.decline(); expect(fake[operation]).not.toHaveBeenCalled(); expect(options.commandId).not.toHaveBeenCalled();
  controller.ask(operation); await controller.confirm(); expect(fake[operation]).toHaveBeenCalledExactlyOnceWith(id,{commandId,expectedRevision:'1'});
});
test('creation never starts playback or a session automatically',async()=>{
  const {controller,fake}=await setup(null); controller.setTitle('Nueva clase'); await controller.save();
  expect(fake.create).toHaveBeenCalledExactlyOnceWith(groupId,{commandId,title:'Nueva clase',description:null}); expect(fake.start).not.toHaveBeenCalled();
});
test.each(['',' '.repeat(5),'x'.repeat(161),'bad\u0000text','\ud800'])('invalid title is retained without allocating an intention: %s',async title=>{
  const {controller,fake,options}=await setup(); controller.setTitle(title); await controller.save();
  expect(fake.edit).not.toHaveBeenCalled(); expect(options.commandId).not.toHaveBeenCalled(); expect(controller.snapshot().title).toBe(title); expect(controller.snapshot().fields.title).toBeDefined();
});
test('uncertain edit freezes its body and permits only query then explicit retry with the same identity',async()=>{
  const {controller,fake,options}=await setup(); fake.edit.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Incierto'));
  controller.setTitle('Mi corrección'); await controller.save(); const original=fake.edit.mock.calls[0];
  controller.setTitle('Otra'); await controller.save(); await controller.retry(); expect(fake.edit).toHaveBeenCalledOnce();
  await controller.recover(); expect(fake.command).toHaveBeenCalledExactlyOnceWith(commandId); expect(fake.edit).toHaveBeenCalledOnce();
  await controller.retry(); expect(fake.edit.mock.calls[1]).toEqual(original); expect(options.commandId).toHaveBeenCalledOnce();
});
test('confirmed lookup uses the current view without repeating a write',async()=>{
  const {controller,fake}=await setup(); fake.start.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Incierto'));
  controller.ask('start'); await controller.confirm(); fake.command.mockResolvedValueOnce({result:'APPLIED',response:result});
  await controller.recover(); expect(fake.start).toHaveBeenCalledOnce(); expect(controller.snapshot().phase).toBe('IDLE');
});
test('uncertain creation queries before retrying and never creates a second intention',async()=>{
  const {controller,fake,options}=await setup(null); controller.setTitle('Nueva'); fake.create.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Incierto'));
  await controller.save(); await controller.recover(); await controller.retry();
  expect(fake.create.mock.calls[1]).toEqual(fake.create.mock.calls[0]); expect(options.commandId).toHaveBeenCalledOnce();expect(fake.start).not.toHaveBeenCalled();
});
test('a failed comparison read does not turn a rejected write into an uncertain retry',async()=>{
  const {controller,fake}=await setup();fake.edit.mockRejectedValueOnce(new ApiFailure(409,'CLASS_VERSION_CONFLICT','Cambió'));await controller.save();
  fake.session.mockRejectedValueOnce(new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Indisponible'));await controller.compare();await controller.retry();
  expect(controller.snapshot().phase).toBe('CONFLICT');expect(fake.edit).toHaveBeenCalledOnce();expect(fake.command).not.toHaveBeenCalled();
});
test('conflict retains the local draft and requires comparison and explicit adoption',async()=>{
  const {controller,fake}=await setup(); controller.setTitle('Mi borrador'); fake.edit.mockRejectedValueOnce(new ApiFailure(409,'CLASS_VERSION_CONFLICT','Cambió'));
  fake.session.mockResolvedValueOnce({...resource,title:'Remoto',revision:'2'}); await controller.save(); await controller.compare();
  expect(controller.snapshot()).toMatchObject({phase:'CONFLICT',title:'Mi borrador',comparison:{title:'Remoto',revision:'2'}});
  await controller.save(); expect(fake.edit).toHaveBeenCalledOnce(); controller.adopt(); await controller.save();
  expect(fake.edit.mock.calls[1][1]).toMatchObject({title:'Mi borrador',expectedRevision:'2'});
});
test.each([401,403,404])('authority failure %s clears resource, draft and pending command',async status=>{
  const {controller,fake,options}=await setup(); fake.edit.mockRejectedValueOnce(new ApiFailure(status,status===401?'AUTH_REQUIRED':status===403?'FORBIDDEN':'NOT_FOUND','No disponible'));
  controller.setTitle('Privado'); await controller.save(); expect(controller.snapshot()).toMatchObject({phase:'DENIED',resource:null,title:'',description:'',commandId:null}); expect(options.onDenied).toHaveBeenCalledOnce();
});
test('disposal and duplicate clicks cannot publish late results into another screen',async()=>{
  const {controller,fake}=await setup(); let resolve!:(v:unknown)=>void; fake.edit.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  const pending=controller.save(); await controller.save(); expect(fake.edit).toHaveBeenCalledOnce(); controller.dispose(); resolve(result); await pending;
  expect(controller.snapshot()).toMatchObject({phase:'DISPOSED',resource:null,title:'',description:''});
});
test('rendered editor separates state from signal, labels fields and exposes confirmation with cancel first',async()=>{
  const {controller,ClassEditor}=await setup(); controller.ask('start');
  const html=renderToStaticMarkup(createElement(ClassEditor,{controller}));
  expect(html).toContain('Confirmar inicio'); expect(html).toContain('Volver sin cambios'); expect(html).toContain('no confirma una señal de video');
  expect(html).toContain('for="class-title"'); expect(html).toContain('for="class-description"'); expect(html).not.toContain('<iframe');
});
test.each(['FINISHED','CANCELLED'] as const)('terminal %s never offers start or reopening',async state=>{
  const {controller,ClassEditor}=await setup({...resource,state,actions:{edit:true,start:false,finish:false,cancel:false}});
  const html=renderToStaticMarkup(createElement(ClassEditor,{controller})); expect(html).not.toContain('Iniciar clase'); expect(html).toContain('Guardar corrección');
});
