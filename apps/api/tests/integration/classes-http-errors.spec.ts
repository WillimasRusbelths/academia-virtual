import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ArgumentsHost } from '@nestjs/common';
import { afterAll, expect, test, vi } from 'vitest';
import { ClassError, CLASS_ERROR_MESSAGES } from '../../src/modules/classes/public/errors.js';
import { SafeErrorFilter } from '../../src/http/error.filter.js';
import type { HttpResponse } from '../../src/http/error.filter.js';
import { SecurityEvents } from '../../src/infrastructure/logging/security-events.js';

const directory = mkdtempSync(path.join(tmpdir(), 'classes-safe-errors-'));
afterAll(() => { rmSync(directory, { recursive: true, force: true }); });
const marker = 'PRIVATE_SQL_cookie_email@example.test_hidden_text';
function run(error: unknown, template = '/classes/sessions/:classId/start', method = 'POST', role: 'STUDENT' | 'TEACHER' = 'TEACHER') {
  const location = path.join(directory, randomUUID()), logs = new SecurityEvents(location), record = vi.spyOn(logs, 'record');
  const request = { method, route: { path: '/api/v1' + template }, actor: { userId: randomUUID(), role },
    params: { classId: randomUUID() }, commandId: randomUUID(), headers: {}, requestId: randomUUID(), body: { text: marker } };
  let body: { error: Record<string, unknown> } | undefined;
  const response: HttpResponse = { statusCode: 200, setHeader: vi.fn(), status(code) { this.statusCode = code; return this; }, json(value) { body = value as typeof body; } };
  const host = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as unknown as ArgumentsHost;
  new SafeErrorFilter(logs).catch(error, host);
  return { request, body: body!, response, record, location };
}
const statuses = { VALIDATION_ERROR: 400, AUTH_REQUIRED: 401, FORBIDDEN: 403, REQUEST_NOT_ALLOWED: 403, NOT_FOUND: 404,
  CLASS_VERSION_CONFLICT: 409, CLASS_STATE_CONFLICT: 409, CLASS_ALREADY_LIVE: 409, IDEMPOTENCY_CONFLICT: 409,
  CHAT_SYNC_REQUIRED: 409, CHAT_MUTED: 409, UNSUPPORTED_MEDIA_TYPE: 415, RATE_LIMITED: 429, TEMPORARILY_UNAVAILABLE: 503 } as const;
test.each(Object.entries(statuses))('clases %s → %s sin serializar mensajes privados', (code, status) => {
  const error = new ClassError(code as keyof typeof statuses); error.message = marker;
  const result = code === 'CHAT_SYNC_REQUIRED' ? run(error, '/classes/sessions/:classId/changes', 'GET')
    : code === 'CHAT_MUTED' ? run(error, '/classes/sessions/:classId/messages', 'POST', 'STUDENT') : run(error);
  expect(result.response.statusCode).toBe(status);
  expect(result.body.error).toEqual({ code, message: CLASS_ERROR_MESSAGES[code as keyof typeof statuses], requestId: result.request.requestId });
  expect(JSON.stringify(result.body)).not.toContain(marker);
  for (const call of result.record.mock.calls) expect(JSON.stringify(call)).not.toContain(marker);
  for (const value of result.record.mock.results) expect(value.value).toBe(true);
});
test('campos por ruta, Retry-After seguro y conflictos de otra operación/familia ocultos', () => {
  const result = run(new ClassError('VALIDATION_ERROR', ['title', 'text', 'title']), '/classes/sessions/:classId', 'PATCH');
  expect(result.body.error.fields).toEqual([{ field: 'title', message: 'Campo inválido.' }]);
  expect(run(new ClassError('CLASS_ALREADY_LIVE'), '/classes/sessions/:classId/messages').response.statusCode).toBe(503);
  expect(run(new ClassError('CHAT_MUTED'), '/classes/sessions/:classId/messages', 'POST', 'TEACHER').response.statusCode).toBe(503);
  expect(run(new ClassError('CLASS_VERSION_CONFLICT'), '/materials/items/:materialId', 'PATCH').response.statusCode).toBe(503);
  const limited = run(new ClassError('RATE_LIMITED', undefined, 10));
  expect(limited.response.setHeader).toHaveBeenCalledWith('Retry-After', '10');
  expect(run(new ClassError('RATE_LIMITED', undefined, Number.NaN)).response.setHeader).not.toHaveBeenCalledWith('Retry-After', expect.anything());
});
test('rechazo atribuible guarda solo referencias permitidas, sin cuerpo ni original oculto', () => {
  const result = run(new ClassError('IDEMPOTENCY_CONFLICT'));
  expect(result.record).toHaveBeenCalledTimes(1);
  expect(result.record.mock.calls[0][0]).toMatchObject({ action: 'CLASS_COMMAND_REJECTED', actorUserId: result.request.actor.userId,
    targetKind: 'CLASS', requestedTargetId: result.request.params.classId, commandId: result.request.commandId });
  const files = readdirSync(result.location); expect(files).toHaveLength(1);
  const text = readFileSync(path.join(result.location, files[0]), 'utf8');
  expect(text).not.toMatch(/PRIVATE_SQL|example\.test|hidden_text|"body"|"text"|cookie/);
  expect(JSON.parse(text).actorUserId).toBe(result.request.actor.userId);
});
