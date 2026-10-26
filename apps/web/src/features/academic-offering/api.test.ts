/// <reference types="vite/client" />
import { expect, test, vi } from 'vitest';
import { ApiFailure } from '../../shared/api-client';
import type { ApiClient } from '../../shared/api-client';
import type { PreparedCommand } from './api';
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

const maintenanceMethods = ['prepareCourseWithdrawal','prepareGroupWithdrawal','prepareGroupCancellation'] as const;
function maintenance(client: ReturnType<typeof academicOfferingApi>, method: typeof maintenanceMethods[number]) {
  const factory = (client as unknown as Record<string, unknown>)[method];
  expect(factory, `T050/T051: capacidad ${method} todavía ausente`).toBeTypeOf('function');
  return factory as (target: string, revision: string, reason?: string) => PreparedCommand<unknown>;
}
for (const method of maintenanceMethods) {
  test(`${method}: preparar no escribe y reintento manual conserva exactamente ID/revisión/payload`, async () => {
    const failure = new ApiFailure(503, 'TEMPORARILY_UNAVAILABLE', 'Resultado incierto');
    const request = vi.fn().mockRejectedValue(failure), client = academicOfferingApi({ request } as ApiClient);
    const factory = maintenance(client, method), intent = factory(id, '1', 'Original'); expect(request).not.toHaveBeenCalled();
    await expect(intent.send()).rejects.toBe(failure); expect(request).toHaveBeenCalledTimes(1);
    const first = request.mock.calls[0][1];
    expect(first.body).toEqual({ commandId: intent.commandId, expectedRevision: '1', ...(method === 'prepareGroupCancellation' ? { cancellationReason: 'Original' } : {}) });
    expect(first.body).not.toHaveProperty('cancelledAt'); expect(Object.isFrozen(first.body)).toBe(true);
    await expect(intent.send()).rejects.toBe(failure); expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]).toEqual(request.mock.calls[0]); expect(request.mock.calls[1][1].body).toBe(first.body);
  });
  test(`${method}: intención corregida usa otro ID y no sobrescribe el comando anterior`, async () => {
    const request = vi.fn().mockRejectedValue(new Error('Transporte ficticio')), client = academicOfferingApi({ request } as ApiClient);
    const factory = maintenance(client, method), first = factory(id, '1', 'Original');
    const next = factory(id, method === 'prepareGroupCancellation' ? '1' : '2', 'Corregido');
    expect(first.commandId).not.toBe(next.commandId); expect(request).not.toHaveBeenCalled();
    await expect(first.send()).rejects.toThrow(); await expect(next.send()).rejects.toThrow();
    expect(request.mock.calls[0][1].body).toMatchObject({ commandId: first.commandId, expectedRevision: '1' });
    expect(request.mock.calls[1][1].body).toMatchObject({ commandId: next.commandId,
      ...(method === 'prepareGroupCancellation' ? { cancellationReason: 'Corregido' } : { expectedRevision: '2' }) });
    expect(request.mock.calls[0][1].body).not.toHaveProperty('cancellationReason', 'Corregido');
  });
  test(`${method}: 401 no programa envíos y otra instancia no recupera una intención anterior`, async () => {
    const failure = new ApiFailure(401, 'AUTH_REQUIRED', 'Inicia sesión'), request = vi.fn().mockRejectedValue(failure);
    const client = academicOfferingApi({ request } as ApiClient), factory = maintenance(client, method), intent = factory(id, '1', 'Original');
    await expect(intent.send()).rejects.toBe(failure); expect(request).toHaveBeenCalledTimes(1);
    const fresh = maintenance(academicOfferingApi({ request } as ApiClient), method)(id, '1', 'Original');
    expect(fresh.commandId).not.toBe(intent.commandId); expect(request).toHaveBeenCalledTimes(1);
  });
}
test.each(['', '  ', null, undefined])('cancelación no prepara motivo inválido %#', reason => {
  const request = vi.fn(), factory = maintenance(academicOfferingApi({ request } as ApiClient), 'prepareGroupCancellation');
  expect(() => factory(id, '1', reason as unknown as string)).toThrow(); expect(request).not.toHaveBeenCalled();
});
