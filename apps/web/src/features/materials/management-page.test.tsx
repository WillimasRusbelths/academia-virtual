import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ApiFailure } from '../../shared/api-client';

// Load the future implementation without a broken import or a production stub.
const modules = import.meta.glob<Record<string, unknown>>('./management-page.tsx');
type Resource = { id: string; state: 'PREPARED' | 'PUBLISHED'; revision: string; title: string; description: string | null };
type Snapshot = { state: string; title: string; description: string; file: File | null; intentionId: string | null; material: Resource | null };
type Controller = {
  setTitle(value: string): void; setDescription(value: string): void; setFile(value: File): void;
  prepare(): Promise<void>; recover(): Promise<void>; confirmPublish(id: string, confirmed: boolean): Promise<void>;
  snapshot(): Snapshot;
};
type Api = {
  createUpload: ReturnType<typeof vi.fn>; putContent: ReturnType<typeof vi.fn>;
  uploadStatus: ReturnType<typeof vi.fn>; getMaterial: ReturnType<typeof vi.fn>; publish: ReturnType<typeof vi.fn>;
};
type Options = { groupId: string; intentionId(): string; commandId(): string; hash(file: File): Promise<string> };
async function implementation() {
  const load = modules['./management-page.tsx'];
  if (!load) throw new Error('T028 pending: materials management form is not implemented');
  const exports = await load();
  expect(typeof exports.createMaterialsManagementController).toBe('function');
  expect(typeof exports.MaterialsManagementPage).toBe('function');
  return exports as unknown as {
    createMaterialsManagementController(api: Api, options: Options): Controller;
    MaterialsManagementPage: ComponentType<{ controller: Controller }>;
  };
}
const groupId = '11111111-1111-4111-8111-111111111111';
const uploadId = '22222222-2222-4222-8222-222222222222';
const materialId = '33333333-3333-4333-8333-333333333333';
const prepared: Resource = { id: materialId, state: 'PREPARED', revision: '1', title: 'Lectura', description: 'Conservar este texto' };
async function setup() {
  const module = await implementation();
  const api: Api = {
    createUpload: vi.fn().mockResolvedValue({ uploadId, state: 'PENDING', materialId: null }),
    putContent: vi.fn().mockResolvedValue({ ...prepared }),
    uploadStatus: vi.fn().mockResolvedValue({ uploadId, state: 'COMPLETED', materialId }),
    getMaterial: vi.fn().mockResolvedValue({ ...prepared }),
    publish: vi.fn().mockResolvedValue({ resource: { ...prepared, state: 'PUBLISHED', revision: '2' },
      command: { result: 'APPLIED', appliedRevision: '2', replayed: false } }),
  };
  const options: Options = { groupId, intentionId: vi.fn().mockReturnValue('44444444-4444-4444-8444-444444444444'),
    commandId: vi.fn().mockReturnValue('55555555-5555-4555-8555-555555555555'), hash: vi.fn().mockResolvedValue('a'.repeat(64)) };
  const controller = module.createMaterialsManagementController(api, options);
  const file = new File(['%PDF-1.7\nsynthetic'], 'lectura.pdf', { type: 'application/pdf' });
  controller.setTitle('Lectura'); controller.setDescription('Conservar este texto'); controller.setFile(file);
  return { ...module, controller, api, options, file };
}

test('rejection preserves title, description and the selected File in memory', async () => {
  const { controller, api, file } = await setup();
  api.putContent.mockRejectedValueOnce(new ApiFailure(400, 'VALIDATION_ERROR', 'Archivo inválido'));
  await controller.prepare();
  expect(controller.snapshot()).toMatchObject({ state: 'REJECTED', title: 'Lectura', description: 'Conservar este texto' });
  expect(controller.snapshot().file).toBe(file);
  expect(api.publish).not.toHaveBeenCalled();
});

test('preparing distinguishes PREPARED and does not publish implicitly', async () => {
  const { controller, api, MaterialsManagementPage } = await setup();
  await controller.prepare();
  expect(controller.snapshot()).toMatchObject({ state: 'PREPARED', material: prepared });
  expect(renderToStaticMarkup(createElement(MaterialsManagementPage, { controller }))).toMatch(/preparado/i);
  expect(api.publish).not.toHaveBeenCalled();
});

test('publication allocates and sends a command only after explicit confirmation', async () => {
  const { controller, api, options } = await setup(); await controller.prepare();
  await controller.confirmPublish(materialId, false);
  expect(api.publish).not.toHaveBeenCalled(); expect(options.commandId).not.toHaveBeenCalled();
  await controller.confirmPublish(materialId, true);
  expect(api.publish).toHaveBeenCalledExactlyOnceWith(materialId, {
    commandId: '55555555-5555-4555-8555-555555555555', expectedRevision: '1',
  });
  expect(controller.snapshot()).toMatchObject({ state: 'PUBLISHED', material: { revision: '2', state: 'PUBLISHED' } });
});

test('uncertain response preserves input, queries status and never automatically replays the PUT or publishes', async () => {
  const { controller, api, file } = await setup();
  api.putContent.mockRejectedValueOnce(new ApiFailure(503, 'TEMPORARILY_UNAVAILABLE', 'Respuesta incierta'));
  await controller.prepare();
  expect(controller.snapshot()).toMatchObject({ state: 'UNCERTAIN', title: 'Lectura', description: 'Conservar este texto' });
  expect(controller.snapshot().file).toBe(file);
  const intention = controller.snapshot().intentionId;
  await controller.recover();
  expect(api.uploadStatus).toHaveBeenCalledExactlyOnceWith(uploadId);
  expect(api.getMaterial).toHaveBeenCalledExactlyOnceWith(materialId);
  expect(controller.snapshot()).toMatchObject({ state: 'PREPARED', intentionId: intention, material: prepared });
  expect(api.createUpload).toHaveBeenCalledTimes(1); expect(api.putContent).toHaveBeenCalledTimes(1);
  expect(api.publish).not.toHaveBeenCalled();
});

test('PENDING recovery waits for a manual retry and reuses the unchanged intention', async () => {
  const { controller, api, options } = await setup();
  api.putContent.mockRejectedValueOnce(new ApiFailure(503, 'TEMPORARILY_UNAVAILABLE', 'Respuesta incierta'));
  api.uploadStatus.mockResolvedValueOnce({ uploadId, state: 'PENDING', materialId: null });
  await controller.prepare(); const intention = controller.snapshot().intentionId;
  await controller.recover(); expect(api.putContent).toHaveBeenCalledTimes(1);
  await controller.prepare();
  expect(controller.snapshot()).toMatchObject({ state: 'PREPARED', intentionId: intention });
  expect(options.intentionId).toHaveBeenCalledTimes(1); expect(api.putContent).toHaveBeenCalledTimes(2);
});

test('editing rejected content creates a fresh intention on the next manual attempt', async () => {
  const { controller, api, options } = await setup();
  api.putContent.mockRejectedValueOnce(new ApiFailure(400, 'VALIDATION_ERROR', 'Archivo inválido'));
  await controller.prepare();
  vi.mocked(options.intentionId).mockReturnValueOnce('66666666-6666-4666-8666-666666666666');
  controller.setTitle('Lectura corregida');
  controller.setFile(new File(['reemplazo'], 'otra.pdf', { type: 'application/pdf' }));
  expect(api.putContent).toHaveBeenCalledTimes(1);
  await controller.prepare();
  expect(options.intentionId).toHaveBeenCalledTimes(2);
  expect(controller.snapshot().intentionId).toBe('66666666-6666-4666-8666-666666666666');
});

test('in-flight preparation blocks duplicate submissions and renders no invented percentage', async () => {
  const { controller, api, MaterialsManagementPage } = await setup();
  let resolve!: (resource: Resource) => void;
  api.putContent.mockImplementationOnce(() => new Promise<Resource>(done => { resolve = done; }));
  const pending = controller.prepare();
  try {
    await vi.waitFor(() => expect(api.putContent).toHaveBeenCalledTimes(1));
    expect(controller.snapshot().state).toBe('SENDING');
    const html = renderToStaticMarkup(createElement(MaterialsManagementPage, { controller }));
    expect(html).toMatch(/enviando/i); expect(html).not.toMatch(/\d+\s*%/);
    await controller.prepare(); expect(api.putContent).toHaveBeenCalledTimes(1);
  } finally { resolve?.(prepared); await pending; }
});
