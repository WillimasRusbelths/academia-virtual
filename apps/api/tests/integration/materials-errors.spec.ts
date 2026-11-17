import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ArgumentsHost } from '@nestjs/common';
import { afterAll, expect, test, vi } from 'vitest';
import { SafeErrorFilter, TransportFailure } from '../../src/http/error.filter.js';
import type { HttpRequest, HttpResponse } from '../../src/http/error.filter.js';
import { MaterialError } from '../../src/modules/materials/public/errors.js';
import { SecurityEvents } from '../../src/infrastructure/logging/security-events.js';

const directory = mkdtempSync(path.join(tmpdir(), 'materials-errors-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const privateText = 'PRIVATE_BYTES_SQL_cookie_digest@example.test';
function filter(error: unknown, template = '/materials/items/:materialId', method = 'PATCH', role: 'ADMIN' | 'STUDENT' = 'ADMIN') {
  let body: { error: Record<string, unknown> } | undefined;
  const input: HttpRequest = { method, headers: { cookie: privateText }, route: { path: '/api/v1' + template },
    actor: { userId: randomUUID(), role }, params: { materialId: randomUUID() }, commandId: randomUUID(), requestId: randomUUID() };
  const response: HttpResponse = { statusCode: 200, setHeader: vi.fn(), status(code) { this.statusCode = code; return this; }, json(value) { body = value as typeof body; } };
  const location = path.join(directory, randomUUID()), logs = new SecurityEvents(location), record = vi.spyOn(logs, 'record');
  const host = { switchToHttp: () => ({ getRequest: () => input, getResponse: () => response }) } as unknown as ArgumentsHost;
  new SafeErrorFilter(logs).catch(error, host); return { body: body!, response, record, location };
}
test('material conflicts use safe messages only on authorized manager command routes', () => {
  const error = new MaterialError('MATERIAL_VERSION_CONFLICT'); error.message = privateText;
  expect(filter(error).body.error).toMatchObject({ code: 'MATERIAL_VERSION_CONFLICT' });
  expect(filter(error).response.statusCode).toBe(409);
  for (const result of [filter(error, '/materials/items/:materialId', 'GET'),
    filter(error, '/materials/items/:materialId', 'PATCH', 'STUDENT'), filter(error, '/admin/users/:id')]) {
    expect(result.response.statusCode).toBe(503); expect(JSON.stringify(result.body)).not.toContain(privateText);
  }
});
test('fields are route/method allowlisted; transport field messages and unknown fields never pass through', () => {
  const error = new TransportFailure(400, 'VALIDATION_ERROR', ['title', 'description', 'sha256', 'page', 'password', privateText]
    .map(field => ({ field, message: privateText })));
  expect(filter(error).body.error.fields).toEqual([{ field: 'title', message: 'Campo inválido.' }, { field: 'description', message: 'Campo inválido.' }]);
  expect(filter(error, '/materials/items/:materialId', 'GET').body.error.fields ?? []).toEqual([]);
  expect(filter(error, '/materials/unknown', 'PATCH').body.error.fields ?? []).toEqual([]);
});
test('transfer errors have safe status/retry headers and logs never contain private data', () => {
  const limited = filter(new MaterialError('RATE_LIMITED', undefined, 1));
  expect(limited.response.statusCode).toBe(429); expect(limited.response.setHeader).toHaveBeenCalledWith('Retry-After', '1');
  const conflict = filter(new MaterialError('MATERIAL_STATE_CONFLICT'));
  expect(conflict.record.mock.results[0].value).toBe(true);
  const logs = readdirSync(conflict.location).map(name => readFileSync(path.join(conflict.location, name), 'utf8')).join('');
  expect(logs).toContain('MATERIAL_COMMAND_REJECTED'); expect(logs).not.toContain(privateText);
  expect(JSON.stringify(conflict.body)).not.toContain(privateText);
  expect(filter(new MaterialError('VALIDATION_ERROR', undefined, undefined, 413)).response.statusCode).toBe(413);
});

test.each(['headersSent', 'destroyed'] as const)('late error with %s closes the stream without writing another JSON body or headers', flag => {
  const response = { statusCode: 200, [flag]: true, destroy: vi.fn(), setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  const host = { switchToHttp: () => ({ getRequest: () => ({ method: 'PUT', headers: {} }), getResponse: () => response }) } as unknown as ArgumentsHost;
  new SafeErrorFilter({ record: () => true }).catch(new MaterialError('TEMPORARILY_UNAVAILABLE'), host);
  expect(response.destroy).toHaveBeenCalledTimes(1); expect(response.setHeader).not.toHaveBeenCalled();
  expect(response.status).not.toHaveBeenCalled(); expect(response.json).not.toHaveBeenCalled();
});
