import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ApiFailure } from '../../shared/api-client';

const modules = import.meta.glob<Record<string, unknown>>('./student-page.tsx');
const groupId = '11111111-1111-4111-8111-111111111111', materialId = '33333333-3333-4333-8333-333333333333';
const group = { id: groupId, name: 'Grupo propio', courseName: 'Curso de ensayo' };
const item = { id: materialId, groupId, title: 'Lectura', description: null, mediaType: 'application/pdf', byteSize: 5, downloadName: 'lectura.pdf', publishedAt: '2026-11-16T10:00:00.123456Z' };
type Snapshot = { state: string; items: readonly typeof item[]; group: typeof group | null; download: { url: string; name: string } | null };
type Controller = { load(): Promise<void>; download(id: string): Promise<void>; releaseDownload(): void; dispose(): void; snapshot(): Snapshot };
async function setup() {
  const load = modules['./student-page.tsx'];
  if (!load) throw new Error('T044 pending: student materials controller/page not implemented');
  const exports = await load();
  expect(exports.createMaterialsStudentController).toBeTypeOf('function'); expect(exports.MaterialsStudentPage).toBeTypeOf('function');
  const implementation = exports as unknown as {
    createMaterialsStudentController(client: typeof api, options: { groupId: string; urls: typeof urls }): Controller;
    MaterialsStudentPage: ComponentType<{ controller: Controller }>;
  };
  const api = { group: vi.fn().mockResolvedValue(group), items: vi.fn().mockResolvedValue({ items: [item], page: 1, pageSize: 20, total: 1 }),
    download: vi.fn().mockResolvedValue({ blob: new Blob(['%PDF-'], { type: 'application/pdf' }), downloadName: item.downloadName }) };
  const urls = { createObjectURL: vi.fn().mockReturnValue('blob:synthetic-one'), revokeObjectURL: vi.fn() };
  return { ...implementation, api, urls, controller: implementation.createMaterialsStudentController(api, { groupId, urls }) };
}

test('MS01 authorized empty is EMPTY and renders an empty message instead of a permission/error state', async () => {
  const { api, controller, MaterialsStudentPage } = await setup();
  api.items.mockResolvedValueOnce({ items: [], page: 1, pageSize: 20, total: 0 }); await controller.load();
  expect(controller.snapshot()).toMatchObject({ state: 'EMPTY', group, items: [] });
  expect(renderToStaticMarkup(createElement(MaterialsStudentPage, { controller }))).toMatch(/no hay materiales|sin materiales/i);
});
test('MS02 recoverable error is never converted into an empty successful list; retry is manual', async () => {
  const { api, controller, MaterialsStudentPage } = await setup();
  api.items.mockRejectedValueOnce(new ApiFailure(503, 'TEMPORARILY_UNAVAILABLE', 'Servicio temporalmente no disponible.'));
  await controller.load(); expect(controller.snapshot()).toMatchObject({ state: 'ERROR', items: [] });
  expect(renderToStaticMarkup(createElement(MaterialsStudentPage, { controller }))).toMatch(/reintentar/i);
  expect(api.items).toHaveBeenCalledTimes(1); await controller.load(); expect(controller.snapshot()).toMatchObject({ state: 'READY', items: [item] });
});
test.each([401, 403, 404])('MS03 %s clears old content and links instead of showing an empty authorized list', async status => {
  const { api, controller, urls } = await setup(); await controller.load(); await controller.download(materialId);
  api.items.mockRejectedValueOnce(new ApiFailure(status, status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : 'NOT_FOUND', 'Acceso no permitido.'));
  await controller.load(); expect(controller.snapshot()).toMatchObject({ state: status === 401 ? 'AUTH_REQUIRED' : 'DENIED', items: [], download: null });
  expect(urls.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:synthetic-one');
});
test('MS04 valid complete download creates a transient attachment link; use releases its URL', async () => {
  const { controller, api, urls, MaterialsStudentPage } = await setup(); await controller.load(); await controller.download(materialId);
  expect(api.download).toHaveBeenCalledExactlyOnceWith(materialId); expect(urls.createObjectURL).toHaveBeenCalledOnce();
  expect(controller.snapshot().download).toEqual({ url: 'blob:synthetic-one', name: item.downloadName });
  const html = renderToStaticMarkup(createElement(MaterialsStudentPage, { controller }));
  expect(html).toContain('download="lectura.pdf"'); expect(html).toContain('Lectura');
  controller.releaseDownload(); expect(controller.snapshot().download).toBeNull(); expect(urls.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:synthetic-one');
  controller.dispose(); expect(urls.revokeObjectURL).toHaveBeenCalledTimes(1);
});
test('MS05 incompatible byte length never creates a Blob URL or announces a complete download', async () => {
  const { controller, api, urls } = await setup(); await controller.load();
  api.download.mockResolvedValueOnce({ blob: new Blob(['cut'], { type: 'application/pdf' }), downloadName: item.downloadName });
  await controller.download(materialId); expect(urls.createObjectURL).not.toHaveBeenCalled();
  expect(controller.snapshot().download).toBeNull(); expect(controller.snapshot().state).toBe('ERROR'); expect(api.download).toHaveBeenCalledTimes(1);
});
test('MS06 account change disposes the old scope; late list cannot populate either account', async () => {
  const old = await setup(); let resolve!: (value: unknown) => void;
  old.api.items.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const pending = old.controller.load(); await vi.waitFor(() => expect(old.api.items).toHaveBeenCalledOnce()); old.controller.dispose();
  const next = await setup(); next.api.items.mockResolvedValueOnce({ items: [], page: 1, pageSize: 20, total: 0 }); await next.controller.load();
  resolve({ items: [item], page: 1, pageSize: 20, total: 1 }); await pending;
  expect(old.controller.snapshot()).toMatchObject({ state: 'DISPOSED', items: [], download: null });
  expect(next.controller.snapshot()).toMatchObject({ state: 'EMPTY', items: [] }); expect(old.urls.createObjectURL).not.toHaveBeenCalled();
});
test('MS07 late binary body after logout/disposal creates no URL even if transport ignores cancellation', async () => {
  const { controller, api, urls } = await setup(); await controller.load(); let resolve!: (value: unknown) => void;
  api.download.mockReturnValueOnce(new Promise(done => { resolve = done; })); const pending = controller.download(materialId);
  controller.dispose(); resolve({ blob: new Blob(['%PDF-']), downloadName: item.downloadName }); await pending;
  expect(controller.snapshot()).toMatchObject({ state: 'DISPOSED', items: [], download: null }); expect(urls.createObjectURL).not.toHaveBeenCalled();
});
test('MS08 replacement and unmount revoke each URL once, without persisting a prior link', async () => {
  const { controller, urls } = await setup(); await controller.load(); await controller.download(materialId);
  urls.createObjectURL.mockReturnValueOnce('blob:synthetic-two'); await controller.download(materialId);
  expect(urls.revokeObjectURL.mock.calls).toEqual([['blob:synthetic-one']]); controller.dispose(); controller.dispose();
  expect(urls.revokeObjectURL.mock.calls).toEqual([['blob:synthetic-one'], ['blob:synthetic-two']]); expect(controller.snapshot().download).toBeNull();
});
test('MS09 a fabricated material reference cannot initiate a download outside the current authorized list', async () => {
  const { controller, api, urls } = await setup(); await controller.load(); await controller.download(groupId);
  expect(api.download).not.toHaveBeenCalled(); expect(urls.createObjectURL).not.toHaveBeenCalled();
});
