import { expect, test, vi } from 'vitest';
import { academicOfferingApi } from '../features/academic-offering/api';
import { createApiClient } from './http';
const id = '00000000-0000-4000-8000-000000000001';
const course = { id, name: 'Curso', description: 'Descripción' };
const group = { id, courseId: id, name: 'Grupo', periodStart: '2026-10-19', periodEnd: '2026-10-25', timeZone: 'America/Lima',
  capacity: 50, occupancy: null, availability: null, capacityStatus: 'NOT_CALCULATED',
  schedule: [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }], teacher: { name: 'Docente' } };
const response = (data: unknown) => new Response(JSON.stringify({ data }));
test('catálogo pagina/busca por transporte común sin filtros administrativos', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(response({ items: [course], page: 2, pageSize: 1, total: 2 }));
  const client = academicOfferingApi(createApiClient(vi.fn(), transport));
  expect(await client.catalog({ q: '%_ &+', page: 2, pageSize: 1 })).toEqual({ items: [course], page: 2, pageSize: 1, total: 2 });
  const url = new URL(String(transport.mock.calls[0][0]), 'http://localhost');
  expect(url.pathname).toBe('/api/v1/academic/courses'); expect(url.searchParams.get('q')).toBe('%_ &+');
  expect(url.searchParams.get('page')).toBe('2'); expect(transport.mock.calls[0][1]?.cache).toBe('no-store');
});
test('detalle público conserva solo docente por nombre y capacidad sin disponibilidad', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(response(group));
  expect(await academicOfferingApi(createApiClient(vi.fn(), transport)).catalogGroup(id, id)).toEqual(group);
  expect(transport.mock.calls[0][0]).toBe(`/api/v1/academic/courses/${id}/groups/${id}`);
});
test.each([{ ...group, revision: '1' }, { ...group, teacher: { name: 'Docente', email: 'privado@example.test' } },
  { ...group, availability: 50 }, { ...group, capacity: 0 }, { ...group, timeZone: 'UTC' },
  { ...group, periodEnd: '2026-10-18' }])('rechaza proyección pública ampliada o inválida %#', async value => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(response(value));
  await expect(academicOfferingApi(createApiClient(vi.fn(), transport)).catalogGroup(id, id)).rejects.toMatchObject({ status: 503 });
});
test.each(['course', 'group'] as const)('publicación %s requiere envío explícito y repite exactamente la intención', async kind => {
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ error: { code: 'TEMPORARILY_UNAVAILABLE' } }), { status: 503 }));
  const client = academicOfferingApi(createApiClient(vi.fn(), transport));
  const intent = kind === 'course' ? client.prepareCoursePublication(id, '9007199254740993') : client.prepareGroupPublication(id, '9007199254740993');
  expect(transport).not.toHaveBeenCalled();
  await expect(intent.send()).rejects.toMatchObject({ status: 503 }); await expect(intent.send()).rejects.toMatchObject({ status: 503 });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[0][1]?.body).toBe(transport.mock.calls[1][1]?.body);
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({ commandId: intent.commandId, expectedRevision: '9007199254740993' });
});
test('sesión perdida cancela la otra respuesta tardía del detalle sin mostrar datos ni repetir comandos', async () => {
  let release!: (value: Response) => void;
  const auth = vi.fn(); const signal = new AbortController().signal;
  const transport = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
    .mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code: 'AUTH_REQUIRED' } }), { status: 401 }));
  const client = academicOfferingApi(createApiClient(auth, transport));
  const late = client.catalogGroup(id, id, signal).catch(error => error);
  await expect(client.catalogCourse(id)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  release(response(group)); expect((await late).constructor.name).toBe('RequestCancelled');
  expect(auth).toHaveBeenCalledTimes(1); expect(transport).toHaveBeenCalledTimes(2);
});
test('conflictos de publicación son administrativos; catálogo no expone referencias privadas', async () => {
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ error: {
    code: 'COURSE_PUBLICATION_BLOCKED', message: 'SQL privado', conflictingGroupIds: [id] } }), { status: 409 }));
  const client = academicOfferingApi(createApiClient(vi.fn(), transport));
  await expect(client.prepareCoursePublication(id, '1').send()).rejects.toMatchObject({ code: 'COURSE_PUBLICATION_BLOCKED', conflictingGroupIds: [id] });
  await expect(client.catalogCourse(id)).rejects.toMatchObject({ status: 503, conflictingGroupIds: [] });
});
