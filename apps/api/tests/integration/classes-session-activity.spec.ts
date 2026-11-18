import type { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { classesTemporalFixture, type ClassesTemporalFixture } from '../support/classes-temporal.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { SessionLookup } from '../../src/modules/authorization/application/session-lookup.js';
import { AcceptedSessionInterceptor } from '../../src/modules/authorization/entrypoints/http/access.guard.js';
import { CLASSES_PARTICIPATION_POLICY, passiveClassesRequest } from '../../src/modules/authorization/public/session.js';
import { classesRouteContracts } from '../../src/infrastructure/http/classes-contract.js';
import type { HttpResponse } from '../../src/http/error.filter.js';
import { createBinaryResponse } from '../../src/http/binary-response.js';

let f: ClassesTemporalFixture, lookup: SessionLookup;
beforeAll(async () => { f = await classesTemporalFixture(); lookup = new SessionLookup(new PostgresSessionStore(f.pool)); }, 120000);
beforeEach(async () => { await f.set(f.base + 1000001n); });
afterAll(async () => { await f?.cleanup(); });
const activity = async () => (await f.pool.query(`SELECT "lastAcceptedAt"::text AS accepted,"absoluteExpiresAt"::text AS expires
  FROM "Session" WHERE id=$1`, [f.student.sessionId])).rows[0];
async function response(method: string, route: string, extra = {}, body: unknown = { data: 'synthetic authorized result' }) {
  const actor = await lookup.authorize(f.student.secret, CLASSES_PARTICIPATION_POLICY);
  const request = { method, route: { path: route }, headers: {}, actor, ...extra };
  const output: HttpResponse = { statusCode: 200, setHeader: vi.fn(), status(code) { this.statusCode = code; return this; }, json: vi.fn() };
  const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => output }) } as unknown as ExecutionContext;
  expect(await lastValueFrom(new AcceptedSessionInterceptor(lookup).intercept(context, { handle: () => of(body) }))).toEqual(body);
  expect(output.setHeader).not.toHaveBeenCalled();
}
test.each([
  ['GET', '/api/v1/classes/sessions/:classId/changes'], ['GET', '/api/v1/classes/sessions/:classId/video'],
  ['POST', '/api/v1/classes/sessions/:classId/socket-tickets'],
])('pasiva %s %s no renueva actividad o expiración absoluta', async (method, route) => {
  const before = await activity(); await response(method, route); expect(await activity()).toEqual(before);
});
test('acción protegida activa renueva actividad; flags cliente/URL no la convierten en pasiva', async () => {
  const before = await activity();
  await response('GET', '/api/v1/classes/sessions/:classId', { url: '/api/v1/classes/sessions/fake/changes?passive=true',
    query: { passive: true }, headers: { 'x-passive': 'true' } });
  const after = await activity(); expect(after.accepted).not.toBe(before.accepted); expect(after.expires).toBe(before.expires);
});
test('pasiva sigue exigiendo sesión vigente y nunca renueva una sesión revocada', async () => {
  await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [f.student.sessionId]);
  const before = await activity();
  try { await expect(response('GET', '/api/v1/classes/sessions/:classId/changes')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); }
  finally { await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [f.student.sessionId]); }
  expect(await activity()).toEqual(before);
});
test('respuesta binaria accidental de ruta pasiva se descarta sin renovar actividad', async () => {
  const before = await activity(), release = vi.fn();
  const binary = createBinaryResponse({ body: Buffer.from([0]), byteSize: 1, mediaType: 'application/pdf', downloadName: 'ficticio.pdf', release });
  await expect(response('GET', '/api/v1/classes/sessions/:classId/video', {}, binary)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect(release).toHaveBeenCalledTimes(1); expect(await activity()).toEqual(before);
});
test('solo las tres tuplas explícitas son pasivas; método/ruta ajenos no desactivan actividad', () => {
  const passive = Object.entries(classesRouteContracts).filter(([, value]) => value.passive).map(([key]) => key);
  expect(passive).toHaveLength(3);
  for (const [key, value] of Object.entries(classesRouteContracts)) {
    const space = key.indexOf(' '); expect(passiveClassesRequest(key.slice(0, space), key.slice(space + 1))).toBe(value.passive === true);
  }
  expect(passiveClassesRequest('POST', '/classes/sessions/:classId/changes')).toBe(false);
  expect(passiveClassesRequest('GET', '/classes/sessions/real-id/video')).toBe(false);
  expect(passiveClassesRequest('GET', undefined)).toBe(false);
});
