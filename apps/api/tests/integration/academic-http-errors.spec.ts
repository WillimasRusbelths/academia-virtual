import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ArgumentsHost } from '@nestjs/common';
import { afterAll, expect, test, vi } from 'vitest';
import { SafeErrorFilter, TransportFailure } from '../../src/http/error.filter.js';
import type { HttpRequest, HttpResponse } from '../../src/http/error.filter.js';
import { SecurityEvents } from '../../src/infrastructure/logging/security-events.js';
import { OfferingError, OFFERING_ERROR_MESSAGES } from '../../src/modules/academic-offering/public/offer.js';
import type { OfferingFailure } from '../../src/modules/academic-offering/public/offer.js';

const root = mkdtempSync(path.join(tmpdir(), 'academic-error-tests-'));
afterAll(() => { rmSync(root, { recursive: true, force: true }); });
const marker = 'PRIVATE_SQL_cookie_email@example.test_cancel_reason';
function request() {
  return { headers: {}, method: 'POST', requestId: randomUUID(), actor: { userId: randomUUID(), role: 'ADMIN' as const },
    route: { path: '/api/v1/admin/academic/groups/:id/publish' }, params: { id: randomUUID() }, commandId: randomUUID() };
}
function run(error: unknown, input: object = request()) {
  const location = path.join(root, randomUUID()); const logs = new SecurityEvents(location);
  const record = vi.spyOn(logs, 'record'); let body: { error: Record<string, unknown> };
  const response: HttpResponse = { statusCode: 200, setHeader: vi.fn(), status(code) { this.statusCode = code; return this; },
    json(value) { body = value as typeof body; } };
  const host = { switchToHttp: () => ({ getRequest: () => input, getResponse: () => response }) } as unknown as ArgumentsHost;
  new SafeErrorFilter(logs).catch(error, host);
  return { status: response.statusCode, body: body!, record, response, location };
}
const statuses = { VALIDATION_ERROR: 400, AUTH_REQUIRED: 401, FORBIDDEN: 403, REQUEST_NOT_ALLOWED: 403,
  NOT_FOUND: 404, OFFERING_VERSION_CONFLICT: 409, OFFERING_STATE_CONFLICT: 409, TEACHER_NOT_ELIGIBLE: 409,
  TEACHER_SCHEDULE_CONFLICT: 409, COURSE_PUBLICATION_BLOCKED: 409, GROUP_COMMITMENTS_BLOCK_OPERATION: 409, IDEMPOTENCY_CONFLICT: 409, TEMPORARILY_UNAVAILABLE: 503 } as const;
test.each(Object.entries(statuses))('S01 catálogo académico cerrado: %s → %s, mensaje seguro y requestId', (code, status) => {
  const error = new OfferingError({ code } as OfferingFailure); error.message = marker;
  const input = request(); const result = run(error, input);
  expect(result.status).toBe(status);
  expect(result.body.error).toEqual({ code, message: OFFERING_ERROR_MESSAGES[code as keyof typeof statuses], requestId: input.requestId });
  expect(result.response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  expect(result.response.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
  expect(JSON.stringify(result.body)).not.toContain(marker);
});

test('S02 campos académicos permitidos, mensajes reemplazados y extras descartados', () => {
  const fields = ['name','description','periodStart','periodEnd','timeZone','capacity','teacherUserId','schedule',
    'cancellationReason','expectedRevision','commandId','q','state','page','pageSize'];
  const input = request();
  const failure = { code: 'VALIDATION_ERROR', fields: [...fields, marker, 'password', 'email', null, { field: 'name', message: marker }] };
  const result = run(new OfferingError(failure as unknown as OfferingFailure), input);
  expect(result.status).toBe(400);
  expect(result.body.error.fields).toEqual(fields.map(field => ({ field, message: 'Campo inválido.' })));
  expect(JSON.stringify(result.body)).not.toContain(marker);
  const transport = run(new TransportFailure(400, 'VALIDATION_ERROR', fields.map(field => ({ field, message: marker }))), input);
  expect(transport.body.error.fields).toEqual(result.body.error.fields);
});

test.each(['TEACHER_SCHEDULE_CONFLICT','COURSE_PUBLICATION_BLOCKED'] as const)('S03 %s: solo ADMIN en ruta administrativa recibe UUID válidos', code => {
  const id = randomUUID(); const input = request();
  const error = new OfferingError({ code, conflictingGroupIds: [id, marker, id, null] } as unknown as OfferingFailure);
  expect(run(error, input).body.error.conflictingGroupIds).toEqual([id]);
  for (const role of ['STUDENT','TEACHER',undefined]) {
    expect(run(error, { ...input, actor: role ? { ...input.actor, role } : undefined }).body.error).not.toHaveProperty('conflictingGroupIds');
  }
  expect(run(error, { ...input, route: { path: '/api/v1/academic/courses/:courseId/groups/:id' } }).body.error).not.toHaveProperty('conflictingGroupIds');
});

test.each(['AUTH_REQUIRED','FORBIDDEN','NOT_FOUND','OFFERING_VERSION_CONFLICT','IDEMPOTENCY_CONFLICT'] as const)('S04 %s nunca serializa detalles inyectados', code => {
  const error = new OfferingError({ code, conflictingGroupIds: [randomUUID()], fields: ['name'], cause: marker } as unknown as OfferingFailure);
  expect(run(error).body.error).toEqual({ code, message: OFFERING_ERROR_MESSAGES[code], requestId: expect.any(String) });
});

test('S05 habilitación docente devuelve solo el campo permitido, sin motivos de cuenta', () => {
  const error = new OfferingError({ code: 'TEACHER_NOT_ELIGIBLE', fields: ['teacherUserId', marker, 'email'] } as unknown as OfferingFailure);
  expect(run(error).body.error.fields).toEqual([{ field: 'teacherUserId', message: 'Campo inválido.' }]);
  expect(run(new TransportFailure(409, 'TEACHER_NOT_ELIGIBLE', [{ field: 'name', message: marker },
    { field: 'teacherUserId', message: marker }])).body.error.fields).toEqual([{ field: 'teacherUserId', message: 'Campo inválido.' }]);
});

test('S06 log real: COURSE/GROUP, comando separado de correlación, sin cuerpo ni USER_REFERENCE', () => {
  for (const kind of ['COURSE','GROUP']) {
    const input = request(); input.route.path = `/api/v1/admin/academic/${kind === 'COURSE' ? 'courses' : 'groups'}/:id/publish`;
    const result = run(new OfferingError({ code: 'OFFERING_STATE_CONFLICT' }), { ...input, body: { commandId: randomUUID(), name: marker }, headers: { cookie: marker } });
    expect(result.record).toHaveBeenCalledWith(expect.objectContaining({ targetKind: kind, requestedTargetId: input.params.id,
      commandId: input.commandId, routeTemplate: input.route.path.replace('/api/v1', '') }), input.requestId);
    const location = result.location;
    const saved = readdirSync(location).map(file => JSON.parse(readFileSync(path.join(location, file), 'utf8')));
    expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({ correlationId: input.requestId, commandId: input.commandId, targetKind: kind });
    expect(saved[0].correlationId).not.toBe(saved[0].commandId); expect(JSON.stringify(saved)).not.toContain(marker);
    expect(result.body.error).not.toHaveProperty('commandId');
  }
});

test('S07 contexto inválido falla cerrado: no se extraen IDs desde cuerpos o URLs recibidas', () => {
  const input = request();
  const result = run(new OfferingError({ code: 'TEMPORARILY_UNAVAILABLE' }), { ...input, commandId: marker,
    route: { path: '/admin/academic/groups/' + input.params.id + '?token=' + marker }, body: { commandId: input.commandId } });
  expect(result.record).toHaveBeenCalledWith(expect.objectContaining({ targetKind: 'NONE' }), input.requestId);
  expect(result.record.mock.calls[0][0]).not.toHaveProperty('commandId');
  expect(result.record.mock.calls[0][0]).not.toHaveProperty('requestedTargetId');
});

test('S08 canal privado rechaza cuerpos/campos/UUID no permitidos y conserva identidad', () => {
  const logs = new SecurityEvents(path.join(root, randomUUID())); const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const base = { category: 'SECURITY', action: 'ADMIN_COMMAND_REJECTED', result: 'DENIED', reasonCode: 'IDEMPOTENCY_CONFLICT',
      actorKind: 'ACCOUNT', actorUserId: randomUUID(), targetKind: 'GROUP', requestedTargetId: randomUUID(), commandId: randomUUID() };
    expect(logs.record(base, randomUUID())).toBe(true);
    for (const extra of [{ body: marker }, { email: marker }, { commandId: marker }, { requestId: randomUUID() }, { targetKind: 'USER_REFERENCE' }]) {
      expect(logs.record({ ...base, ...extra }, randomUUID())).toBe(false);
    }
    expect(logs.record({ ...base, commandId: undefined, targetKind: 'USER_REFERENCE', reasonCode: 'ADMIN_INVARIANT' }, randomUUID())).toBe(true);
  } finally { warn.mockRestore(); }
});

test('S09 canal privado rechaza códigos académicos con destino de identidad y plantillas con clase distinta', () => {
  const logs = new SecurityEvents(path.join(root, randomUUID())); const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const base = { category: 'SECURITY', action: 'ADMIN_COMMAND_REJECTED', result: 'DENIED', reasonCode: 'IDEMPOTENCY_CONFLICT',
    actorKind: 'ACCOUNT', actorUserId: randomUUID(), targetKind: 'GROUP', requestedTargetId: randomUUID() };
  try {
    for (const targetKind of ['USER_REFERENCE','IDENTITY_SCOPE']) {
      expect(logs.record({ ...base, targetKind }, randomUUID())).toBe(false);
    }
    expect(logs.record({ ...base, targetKind: 'COURSE', routeTemplate: '/admin/academic/groups/:id' }, randomUUID())).toBe(false);
    expect(logs.record({ ...base, routeTemplate: '/admin/academic/groups/:id' }, randomUUID())).toBe(true);
  } finally { warn.mockRestore(); }
});

// Contrato tipado: el contexto lo establece el servidor, no el cuerpo JSON.
const typed: HttpRequest = request(); void typed;
