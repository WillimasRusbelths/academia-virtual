import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ApiFailure } from '../../shared/api-client';
import type { MaterialReference } from './api';

// T054 contract: no missing import or substitute production controller.
const modules = import.meta.glob<Record<string, unknown>>('./material-actions.tsx');
type Snapshot = { state: string; title: string; description: string; material: MaterialReference|null;
  comparison: MaterialReference|null; commandId: string|null };
type Controller = { snapshot(): Snapshot; setTitle(value: string): void; setDescription(value: string): void;
  save(): Promise<void>; confirmWithdraw(confirmed: boolean): Promise<void>; confirmPublish(confirmed: boolean): Promise<void>;
  recover(): Promise<void>; retry(): Promise<void>; adoptCurrentRevision(): void; dispose(): void };
type Api = Record<'edit'|'withdraw'|'publish'|'getMaterial', ReturnType<typeof vi.fn>>;
async function implementation() {
  const load = modules['./material-actions.tsx'];
  if (!load) throw new Error('T054 pending: material correction/withdrawal actions are not implemented');
  const exports = await load();
  expect(typeof exports.createMaterialActionsController).toBe('function'); expect(typeof exports.MaterialActions).toBe('function');
  return exports as unknown as {
    createMaterialActionsController(api: Api, options: { material: MaterialReference; commandId(): string }): Controller;
    MaterialActions: ComponentType<{ controller: Controller; onPrepareNew(): void }>;
  };
}
const material: MaterialReference = { id: '33333333-3333-4333-8333-333333333333', state: 'PUBLISHED', revision: '2', title: 'Lectura', description: 'Original' };
const commandId = '55555555-5555-4555-8555-555555555555';
async function setup(state: MaterialReference['state'] = 'PUBLISHED') {
  const module = await implementation(), current = { ...material, state };
  const response = (resource: MaterialReference) => ({ resource, command: { id: commandId, result: 'APPLIED', appliedRevision: resource.revision, replayed: false } });
  const api: Api = { edit: vi.fn().mockResolvedValue(response({ ...current, title: 'Correccion', revision: '3' })),
    withdraw: vi.fn().mockResolvedValue(response({ ...current, state: 'WITHDRAWN', revision: '3' })),
    publish: vi.fn().mockResolvedValue(response({ ...current, state: 'PUBLISHED', revision: '3' })), getMaterial: vi.fn().mockResolvedValue(current) };
  const options = { material: current, commandId: vi.fn().mockReturnValue(commandId) };
  const controller = module.createMaterialActionsController(api, options);
  return { ...module, controller, api, options, current };
}
test.each(['PREPARED','PUBLISHED','WITHDRAWN'] as const)('correcting %s only submits texts and expected revision', async state => {
  const { controller, api } = await setup(state); controller.setTitle('Correccion'); await controller.save();
  expect(api.edit).toHaveBeenCalledExactlyOnceWith(material.id, { commandId, expectedRevision: '2', title: 'Correccion', description: 'Original' });
  expect(api.publish).not.toHaveBeenCalled(); expect(api.withdraw).not.toHaveBeenCalled();
  expect(controller.snapshot().material).toMatchObject({ state, revision: '3', title: 'Correccion' });
});
test.each(['withdraw','publish'] as const)('%s allocates a command only after explicit confirmation', async operation => {
  const { controller, api, options } = await setup(operation === 'publish' ? 'WITHDRAWN' : 'PUBLISHED');
  const confirm = (accepted: boolean) => operation === 'publish' ? controller.confirmPublish(accepted) : controller.confirmWithdraw(accepted);
  await confirm(false); expect(api[operation]).not.toHaveBeenCalled(); expect(options.commandId).not.toHaveBeenCalled();
  await confirm(true); expect(api[operation]).toHaveBeenCalledExactlyOnceWith(material.id, { commandId, expectedRevision: '2' });
});
test('version conflict retains local draft and compares server values until explicit revision adoption', async () => {
  const { controller, api, options } = await setup(); controller.setTitle('Mi correccion'); controller.setDescription('Mi borrador');
  api.edit.mockRejectedValueOnce(new ApiFailure(409, 'MATERIAL_VERSION_CONFLICT', 'Revision obsoleta'));
  const current = { ...material, revision: '3', title: 'Cambio remoto', description: 'Servidor' }; api.getMaterial.mockResolvedValue(current);
  await controller.save();
  expect(api.getMaterial).toHaveBeenCalledExactlyOnceWith(material.id);
  expect(controller.snapshot()).toMatchObject({ state: 'CONFLICT', title: 'Mi correccion', description: 'Mi borrador', comparison: current });
  expect(api.edit).toHaveBeenCalledTimes(1); expect(options.commandId).toHaveBeenCalledTimes(1);
  controller.adoptCurrentRevision();
  const nextId = '66666666-6666-4666-8666-666666666666'; options.commandId.mockReturnValueOnce(nextId);
  await controller.save();
  expect(api.edit).toHaveBeenLastCalledWith(material.id, { commandId: nextId, expectedRevision: '3', title: 'Mi correccion', description: 'Mi borrador' });
});
test.each(['edit','withdraw','publish'] as const)('%s uncertainty queries current view and manually retries the same immutable intention', async operation => {
  const { controller, api, options } = await setup(operation === 'publish' ? 'WITHDRAWN' : 'PUBLISHED');
  controller.setTitle('Correccion'); api[operation].mockRejectedValueOnce(new ApiFailure(503, 'TEMPORARILY_UNAVAILABLE', 'Respuesta incierta'));
  if (operation === 'edit') await controller.save(); else if (operation === 'withdraw') await controller.confirmWithdraw(true); else await controller.confirmPublish(true);
  const original = api[operation].mock.calls[0]; expect(controller.snapshot()).toMatchObject({ state: 'UNCERTAIN', commandId });
  controller.setTitle('Cambio durante incertidumbre'); await controller.recover();
  expect(api.getMaterial).toHaveBeenCalledExactlyOnceWith(material.id); expect(api[operation]).toHaveBeenCalledTimes(1);
  await controller.retry();
  expect(api[operation]).toHaveBeenCalledTimes(2); expect(api[operation].mock.calls[1]).toEqual(original);
  expect(options.commandId).toHaveBeenCalledTimes(1);
});
test('NO_CHANGE adopts server resource without inventing a revision or publication', async () => {
  const { controller, api, current } = await setup();
  api.edit.mockResolvedValueOnce({ resource: current, command: { id: commandId, result: 'NO_CHANGE', appliedRevision: '2', replayed: false } });
  await controller.save(); expect(controller.snapshot().material).toEqual(current); expect(api.publish).not.toHaveBeenCalled();
});
test.each([{ title: '', description: 'Original' }, { title: 'x'.repeat(201), description: 'Original' },
  { title: 'Valido', description: 'x'.repeat(2001) }])('invalid text retains draft without sending or allocating identity: %j', async value => {
  const { controller, api, options } = await setup(); controller.setTitle(value.title); controller.setDescription(value.description); await controller.save();
  expect(api.edit).not.toHaveBeenCalled(); expect(options.commandId).not.toHaveBeenCalled();
  expect(controller.snapshot()).toMatchObject(value);
});
test('authorization loss clears the protected resource and draft', async () => {
  const { controller, api } = await setup(); controller.setTitle('Privado');
  api.edit.mockRejectedValueOnce(new ApiFailure(404, 'NOT_FOUND', 'No disponible')); await controller.save();
  expect(controller.snapshot()).toMatchObject({ state: 'UNAVAILABLE', material: null, comparison: null, title: '', description: '', commandId: null });
});
test('duplicate save and a late response after disposal cannot update the next screen', async () => {
  const { controller, api } = await setup(); let resolve!: (value: unknown) => void;
  api.edit.mockImplementationOnce(() => new Promise(done => { resolve = done; })); controller.setTitle('Correccion');
  const pending = controller.save();
  try {
    await vi.waitFor(() => expect(api.edit).toHaveBeenCalledTimes(1)); await controller.save(); expect(api.edit).toHaveBeenCalledTimes(1);
    controller.dispose();
  } finally { resolve?.({ resource: { ...material, revision: '3' }, command: { id: commandId, result: 'APPLIED', appliedRevision: '3', replayed: false } }); await pending; }
  expect(controller.snapshot()).toMatchObject({ material: null, title: '', description: '' });
});
test('new binary is a separate preparation action; correction UI has no replacement file input', async () => {
  const { controller, api, MaterialActions } = await setup(), onPrepareNew = vi.fn();
  const html = renderToStaticMarkup(createElement(MaterialActions, { controller, onPrepareNew }));
  expect(html).toMatch(/nuevo material/i); expect(html).not.toMatch(/type="file"/);
  expect(api.edit).not.toHaveBeenCalled(); expect(api.withdraw).not.toHaveBeenCalled(); expect(api.publish).not.toHaveBeenCalled();
});
