import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Controller, Get, Head, SetMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { AppModule, RESERVATION_DISPATCH_LIFECYCLE } from '../../dist/src/app.module.js';
import { RESERVATION_EXPIRATION_LIFECYCLE } from '../../dist/src/modules/enrollment/enrollment.module.js';
import { configureTransport } from '../../dist/src/http/transport.js';
import { SessionCookie } from '../../dist/src/http/session-cookie.js';
import { ACCESS_POLICY } from '../../src/modules/authorization/public/session.js';
import { materialsTemporalFixture } from '../support/materials-temporal.js';
import type { MaterialsTemporalFixture } from '../support/materials-temporal.js';
import { instrumentMaterialsPool } from '../support/materials-testing.js';

let f: MaterialsTemporalFixture, app: NestExpressApplication, url: string, cookie: SessionCookie;
let revoke = false; const release = vi.fn();
async function binary(head = false): Promise<unknown> {
  const location = new URL('../../dist/src/http/binary-response.js', import.meta.url);
  if (!existsSync(fileURLToPath(location))) throw new Error('T040 pending: internal binary response not implemented');
  const factory: unknown = Reflect.get(await import(location.href), 'createBinaryResponse');
  if (typeof factory !== 'function') throw new Error('T040 pending: binary factory unavailable');
  if (revoke) await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [f.student.sessionId]);
  return factory({ body: head ? undefined : Buffer.from('%PDF-'), head, byteSize: 5, mediaType: 'application/pdf', downloadName: 'lectura á.pdf', release });
}
// Transport-only probe, absent from the production composition and route policies.
class BinaryProbe {
  head() { return binary(true); }
  bytes() { return binary(); }
  raw() { return Buffer.from('%PDF-'); }
}
Controller('api/v1/binary-probe')(BinaryProbe); SetMetadata(ACCESS_POLICY, 'profile:read')(BinaryProbe);
for (const [key, decorator] of [['bytes', Get('bytes')], ['head', Head('bytes')], ['raw', Get('raw')]] as const)
  decorator(BinaryProbe.prototype, key, Object.getOwnPropertyDescriptor(BinaryProbe.prototype, key)!);
beforeAll(async () => {
  f = await materialsTemporalFixture();
  const module = await Test.createTestingModule({ imports: [AppModule.forRoot(f.environment, f.database)], controllers: [BinaryProbe] })
    .overrideProvider(RESERVATION_DISPATCH_LIFECYCLE).useValue({}).overrideProvider(RESERVATION_EXPIRATION_LIFECYCLE).useValue({}).compile();
  app = module.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false }); configureTransport(app, f.environment);
  await app.listen(0, '127.0.0.1'); url = await app.getUrl(); cookie = new SessionCookie(f.environment);
}, 120000);
beforeEach(async () => { release.mockClear(); revoke = false; await f.set(f.base); await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [f.student.sessionId]); });
afterAll(async () => { try { await app?.close(); } finally { await f?.cleanup(); } });
const get = (method = 'GET', resource = 'bytes', authenticated = true) => fetch(`${url}/api/v1/binary-probe/${resource}`, { method,
  headers: authenticated ? { cookie: `${cookie.name}=${f.student.secret}` } : {} });
const session = async () => (await f.pool.query('SELECT "lastAcceptedAt"::text AS accepted,"absoluteExpiresAt"::text AS absolute FROM "Session" WHERE id=$1', [f.student.sessionId])).rows[0];
test('BR01 session is accepted before the first binary write, with exact bytes and unchanged absolute expiry', async () => {
  const before = await session(); let accepted = false, writtenAfterAcceptance = false;
  const restore = instrumentMaterialsPool(f.pool, async (sql, execute) => { const result = await execute(); if (/UPDATE "Session" SET "lastAcceptedAt"/.test(sql)) accepted = true; return result; });
  const server = app.getHttpServer();
  const observe = (_request: unknown, response: { write: (...args: unknown[]) => unknown }) => {
    const write = response.write; response.write = function (...args: unknown[]) { writtenAfterAcceptance = accepted; return Reflect.apply(write, this, args); };
  };
  server.prependListener('request', observe);
  try { const response = await get(); expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from('%PDF-')); expect(writtenAfterAcceptance).toBe(true);
    const after = await session(); expect(after.absolute).toBe(before.absolute); expect(after.accepted).not.toBe(before.accepted);
    await expect.poll(() => release.mock.calls.length).toBe(1);
  } finally { server.off('request', observe); restore(); }
});
test('BR02 binary response has private attachment headers and never returns Buffer JSON or a new cookie', async () => {
  const response = await get(); expect(response.status).toBe(200); expect(response.headers.get('content-length')).toBe('5');
  expect(response.headers.get('content-disposition')).toMatch(/^attachment;.*filename\*=UTF-8''lectura%20%C3%A1\.pdf$/);
  expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer'); expect(response.headers.get('set-cookie')).toBeNull(); expect(response.headers.get('etag')).toBeNull();
  expect(await response.text()).toBe('%PDF-');
});
test('BR03 HEAD accepts the session and emits metadata without a binary body', async () => {
  const response = await get('HEAD'); expect(response.status).toBe(200); expect(response.headers.get('content-length')).toBe('5'); expect(await response.text()).toBe('');
  await expect.poll(() => release.mock.calls.length).toBe(1);
});
test('BR04 session revoked after authorization but before acceptance produces 401 without bytes and releases once', async () => {
  const before = await session(); revoke = true; const response = await get(); expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe('AUTH_REQUIRED'); expect((await session()).accepted).toBe(before.accepted);
  expect(response.headers.get('content-disposition')).toBeNull(); expect(release).toHaveBeenCalledOnce();
});
test('BR05 acceptance store failure produces safe 503 before attachment headers and releases once', async () => {
  const before = await session(); let injected = false;
  const restore = instrumentMaterialsPool(f.pool, async (sql, execute) => {
    if (/UPDATE "Session" SET "lastAcceptedAt"/.test(sql)) { injected = true; throw new Error('PRIVATE_SQL_BYTES_cookie@example.test'); } return execute();
  });
  try { const response = await get(); expect(response.status).toBe(503); const text = await response.text(); expect(JSON.parse(text).error.code).toBe('TEMPORARILY_UNAVAILABLE');
    expect(text).not.toContain('PRIVATE_SQL'); expect(response.headers.get('content-disposition')).toBeNull(); expect(injected).toBe(true);
    expect((await session()).accepted).toBe(before.accepted); expect(release).toHaveBeenCalledOnce();
  } finally { restore(); }
});
test('BR06 anonymous requests cannot reach binary construction', async () => {
  expect((await get('GET', 'bytes', false)).status).toBe(401); expect(release).not.toHaveBeenCalled();
});
test('BR07 unwrapped Buffer cannot become successful protected JSON or renew session', async () => {
  const before = await session(), response = await get('GET', 'raw'); expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe('TEMPORARILY_UNAVAILABLE'); expect((await session()).accepted).toBe(before.accepted);
});
