/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from 'vitest';
import { createApiClient } from './http';
const modules = import.meta.glob<{ academicOfferingApi: (api: ReturnType<typeof createApiClient>) => AcademicApi }>('../features/academic-offering/api.ts', { eager: true });
type AcademicApi = {
  courses(query?: Record<string, unknown>): Promise<unknown>;
  course(id: string): Promise<unknown>;
  groups(id: string, query?: Record<string, unknown>): Promise<unknown>;
  group(id: string): Promise<unknown>;
  teachers(query?: Record<string, unknown>): Promise<unknown>;
  prepareCourse(input: Record<string, unknown>): Intent;
  prepareCourseEdit(id: string, revision: string, input: Record<string, unknown>): Intent;
  prepareGroup(id: string, input: Record<string, unknown>): Intent;
  prepareGroupEdit(id: string, revision: string, input: Record<string, unknown>): Intent;
  prepareSchedule(id: string, revision: string, input: readonly unknown[]): Intent;
};
interface Intent { readonly commandId: string; send(): Promise<unknown> }
const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const course = { id, name: 'Curso ficticio', description: null, state: 'DRAFT', revision: '9007199254740993',
  studentVisible: false, createdAt: '2026-10-21T00:00:00.000Z', updatedAt: '2026-10-21T00:00:00.000Z' };
const group = { id: other, courseId: id, name: 'Turno', description: null, state: 'DRAFT', revision: '1', periodStart: null, periodEnd: null,
  timeZone: 'America/Lima', capacity: null, occupancy: null, availability: null, capacityStatus: 'NOT_CALCULATED', schedule: [],
  teacher: null, teacherReviewRequired: false, studentVisible: false, cancellationReason: null, cancelledAt: null,
  lastPublishedTeacherId: null, createdAt: course.createdAt, updatedAt: course.updatedAt };
function response(data: unknown) { return new Response(JSON.stringify({ data }), { status: 200 }); }
function api(transport: typeof fetch, auth = vi.fn()) {
  const factory = Object.values(modules)[0]?.academicOfferingApi;
  expect(factory, 'T027: cliente académico aún ausente').toBeTypeOf('function');
  return factory!(createApiClient(auth, transport));
}
afterEach(() => vi.unstubAllGlobals());

test.each([null,'Descripción normalizada'])('W12 grupo administrativo conserva descripción %s y NOT_CALCULATED',async description=>{
  const client=api(vi.fn<typeof fetch>().mockResolvedValue(response({...group,description})));
  await expect(client.group(other)).resolves.toMatchObject({description,occupancy:null,availability:null,capacityStatus:'NOT_CALCULATED'});
});
test.each([undefined,42,' sin normalizar ',''])('W13 lector cerrado rechaza descripción inválida %s',async description=>{
  const client=api(vi.fn<typeof fetch>().mockResolvedValue(response({...group,description})));
  await expect(client.group(other)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('W14 descripción editable usa la ruta existente y conserva intención',async()=>{
  const transport=vi.fn<typeof fetch>().mockImplementation(async(_url,options)=>response({resource:{...group,description:'Texto'},command:{id:JSON.parse(String(options?.body)).commandId,replayed:false,appliedRevision:'2',result:'APPLIED'}}));
  const intent=api(transport).prepareGroupEdit(other,'1',{description:'Texto'});await intent.send();
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({commandId:intent.commandId,expectedRevision:'1',description:'Texto'});
});
test.each(['', '/cancel','/schedule'])('W15 error de compromisos llega seguro a administración %s',async suffix=>{
  const client=createApiClient(vi.fn(),vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({error:{code:'GROUP_COMMITMENTS_BLOCK_OPERATION',message:'privado',requestId:id,studentId:id,conflictingGroupIds:[id]}}),{status:409})));
  await expect(client.request(`/admin/academic/groups/${other}${suffix}`,{method:'POST',body:{}})).rejects.toMatchObject({code:'GROUP_COMMITMENTS_BLOCK_OPERATION',status:409,conflictingGroupIds:[]});
});

test.each(['courses','groups','teachers'] as const)('W01 %s codifica solo filtros de su ruta', async kind => {
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => response({ items: [], page: 2, pageSize: 10, total: 0 }));
  const client = api(transport); const query = { q: '%_ &+', page: 2, pageSize: 10 };
  await (kind === 'groups' ? client.groups(id, query) : client[kind](query));
  const url = new URL(String(transport.mock.calls[0][0]), 'http://localhost');
  expect(url.pathname).toBe(`/api/v1/admin/academic/${kind === 'groups' ? `courses/${id}/groups` : kind}`);
  expect(url.searchParams.get('q')).toBe('%_ &+'); expect(url.searchParams.get('page')).toBe('2');
  expect(transport.mock.calls[0][1]?.body).toBeUndefined();
});
test('W02 acepta curso/grupo incompletos y revisión decimal exacta, sin disponibilidad', async () => {
  const transport = vi.fn<typeof fetch>().mockImplementationOnce(async () => response(course)).mockImplementationOnce(async () => response(group));
  const client = api(transport);
  expect(await client.course(id)).toEqual(course); expect(await client.group(other)).toEqual(group);
});
test.each([
  { ...course, passwordHash: 'no permitido' }, { ...course, revision: Number('9007199254740993') },
  { ...course, revision: '01' }, { ...course, revision: '9223372036854775808' }, { ...course, createdAt: 'ayer' },
  { ...course, state: 'CANCELLED' }, { ...course, studentVisible: 'false' },
])('W03 rechaza curso inesperado %#', async value => {
  await expect(api(vi.fn<typeof fetch>().mockImplementation(async () => response(value))).course(id))
    .rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
});
test.each([
  { ...group, teacher: { id, name: 'Docente', eligible: true, email: 'privado@example.test' } },
  { ...group, publishedTeacherEligibilityVersion: '1' }, { ...group, availability: 50 }, { ...group, occupancy: 0 },
  { ...group, capacity: 51 }, { ...group, capacity: '20' }, { ...group, timeZone: 'UTC' },
  { ...group, periodStart: '2026-02-30' }, { ...group, schedule: [{ dayOfWeek: 1, startTime: '23:00', endTime: '01:00' }] },
  { ...group, schedule: [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00', secret: true }] },
])('W04 rechaza grupo inesperado %#', async value => {
  await expect(api(vi.fn<typeof fetch>().mockImplementation(async () => response(value))).group(other))
    .rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
});
test.each([
  { items: [course], page: 1, pageSize: 20, total: 1, secret: true }, { items: [course], page: 0, pageSize: 20, total: 1 },
  { items: [course], page: 1, pageSize: 51, total: 1 }, { items: [course], page: 1, pageSize: 20, total: 0 },
  { items: [{ id, name: 'Docente', email: 'privado@example.test' }], page: 1, pageSize: 20, total: 1 },
])('W05 página/selector cerrado %#', async value => {
  const client = api(vi.fn<typeof fetch>().mockImplementation(async () => response(value)));
  await expect(value.items[0] && 'email' in value.items[0] ? client.teachers() : client.courses())
    .rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
});
test('W06 una intención, dos envíos manuales idénticos y datos editados con ID nuevo', async () => {
  const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    return response({ resource: course, command: { id: body.commandId, replayed: transport.mock.calls.length > 1,
      appliedRevision: '9007199254740993', result: 'APPLIED' } });
  });
  const storage = { setItem: vi.fn(), getItem: vi.fn() }; vi.stubGlobal('localStorage', storage); vi.stubGlobal('sessionStorage', storage);
  const client = api(transport); const input = { name: 'Nombre inicial' }; const intent = client.prepareCourse(input);
  input.name = 'Modificado después'; expect(transport).not.toHaveBeenCalled();
  await intent.send(); await intent.send();
  expect(transport.mock.calls[0][1]?.body).toBe(transport.mock.calls[1][1]?.body);
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({ commandId: intent.commandId, name: 'Nombre inicial' });
  expect(client.prepareCourse(input).commandId).not.toBe(intent.commandId);
  expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.getItem).not.toHaveBeenCalled();
});
test('W07 cinco comandos usan método/ruta/revisión previstos; horario se copia', async () => {
  const transport = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
    const body = JSON.parse(String(options?.body)); const resource = String(url).includes('/groups') ? group : course;
    return response({ resource, command: { id: body.commandId, replayed: false, appliedRevision: resource.revision, result: 'APPLIED' } });
  });
  const client = api(transport); const slots = [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }];
  const intents = [client.prepareCourse({ name: 'Curso' }), client.prepareCourseEdit(id, '9007199254740993', { description: 'Nuevo' }),
    client.prepareGroup(id, { name: 'Grupo', capacity: 50 }), client.prepareGroupEdit(other, '1', { capacity: 1 }), client.prepareSchedule(other, '1', slots)];
  slots[0].endTime = '20:00'; for (const intent of intents) await intent.send();
  expect(transport.mock.calls.map(call => call[1]?.method)).toEqual(['POST','PATCH','POST','PATCH','PUT']);
  expect(JSON.parse(String(transport.mock.calls[1][1]?.body)).expectedRevision).toBe('9007199254740993');
  expect(JSON.parse(String(transport.mock.calls[4][1]?.body)).schedule[0].endTime).toBe('19:00');
  expect(new Set(intents.map(intent => intent.commandId)).size).toBe(5);
});
test('W08 AUTH_REQUIRED no encola ni reenvía al iniciar sesión; reintento explícito conserva ID', async () => {
  const auth = vi.fn(); const transport = vi.fn<typeof fetch>()
    .mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code: 'AUTH_REQUIRED' } }), { status: 401 }))
    .mockImplementationOnce(async () => response(course))
    .mockImplementationOnce(async (_url, options) => response({ resource: course,
      command: { id: JSON.parse(String(options?.body)).commandId, replayed: true, appliedRevision: '1', result: 'APPLIED' } }));
  const client = api(transport, auth); const intent = client.prepareCourse({ name: 'Curso' });
  await expect(intent.send()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); expect(auth).toHaveBeenCalledTimes(1);
  await createApiClient(vi.fn(), transport).request('/auth/login', { method: 'POST', body: {} });
  await Promise.resolve(); expect(transport).toHaveBeenCalledTimes(2);
  expect(String(transport.mock.calls[1][0])).toBe('/api/v1/auth/login');
  await intent.send(); expect(transport).toHaveBeenCalledTimes(3);
  expect(transport.mock.calls[0][1]?.body).toBe(transport.mock.calls[2][1]?.body);
});
test('W10 nueva revisión exige nueva intención; PATCH vacío/atributos ajenos no salen al transporte', () => {
  const transport = vi.fn<typeof fetch>(); const client = api(transport);
  const first = client.prepareGroupEdit(other, '1', { capacity: 20 });
  const second = client.prepareGroupEdit(other, '2', { capacity: 20 });
  expect(first.commandId).not.toBe(second.commandId);
  expect(() => client.prepareGroupEdit(other, '1', {})).toThrow();
  expect(() => client.prepareGroupEdit(other, '1', { courseId: id })).toThrow();
  expect(() => client.prepareCourse({ name: 'Curso', teacherEligibilityVersion: '1' })).toThrow();
  expect(transport).not.toHaveBeenCalled();
});
test('W11 respuesta perdida permite solo reintento manual con ID, revisión y payload idénticos', async () => {
  const transport = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('Conexión interrumpida'))
    .mockImplementationOnce(async (_url, options) => response({ resource: group, command: {
      id: JSON.parse(String(options?.body)).commandId, replayed: true, appliedRevision: '1', result: 'NO_CHANGE' } }));
  const intent = api(transport).prepareGroupEdit(other, '1', { capacity: 50 });
  await expect(intent.send()).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect(transport).toHaveBeenCalledTimes(1); await intent.send();
  expect(transport).toHaveBeenCalledTimes(2); expect(transport.mock.calls[0][1]?.body).toBe(transport.mock.calls[1][1]?.body);
});
test.each(['id','resource','revision','unknown'] as const)('W09 rechaza resultado de comando incompatible: %s', async fault => {
  const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    return response({ resource: fault === 'resource' ? group : course, command: { id: fault === 'id' ? other : body.commandId,
      replayed: false, appliedRevision: fault === 'revision' ? 1 : '1', result: 'APPLIED', ...(fault === 'unknown' ? { secret: true } : {}) } });
  });
  await expect(api(transport).prepareCourse({ name: 'Curso' }).send()).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
});
