/// <reference types="vite/client" />
import { expect, test, vi } from 'vitest';
import type { ApiClient } from '../../shared/api-client';
import { academicOfferingApi } from './api';
const id = '00000000-0000-4000-8000-000000000001';
test('feature usa exclusivamente la capacidad ApiClient y propaga cancelación', async () => {
  const signal = new AbortController().signal;
  const request = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
  expect(await academicOfferingApi({ request } as ApiClient).courses({}, signal)).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  expect(request).toHaveBeenCalledWith('/admin/academic/courses', { query: {}, signal });
});
test('crear intención no escribe; payload permitido se copia antes del envío', async () => {
  const request = vi.fn().mockRejectedValue(new Error('Fallo de prueba'));
  const input = { name: 'Original' }; const intent = academicOfferingApi({ request } as ApiClient).prepareCourse(input);
  input.name = 'Cambio'; expect(request).not.toHaveBeenCalled();
  await expect(intent.send()).rejects.toThrow('Fallo de prueba');
  expect(request).toHaveBeenCalledWith('/admin/academic/courses', { method: 'POST', signal: undefined,
    body: { commandId: intent.commandId, name: 'Original' } });
  expect(request).toHaveBeenCalledTimes(1);
});
test.each(['0', '01', '9223372036854775808'])('rechaza revisión no contractual %s antes de escribir', revision => {
  const request = vi.fn();
  expect(() => academicOfferingApi({ request } as ApiClient).prepareGroupEdit(id, revision, { capacity: 1 })).toThrow();
  expect(request).not.toHaveBeenCalled();
});
test('error de autorización se propaga sin recrear ni reenviar la intención', async () => {
  const error = { code: 'AUTH_REQUIRED' }; const request = vi.fn().mockRejectedValue(error);
  const intent = academicOfferingApi({ request } as ApiClient).prepareGroup(id, { name: 'Turno' });
  await expect(intent.send()).rejects.toBe(error); expect(request).toHaveBeenCalledTimes(1);
});
