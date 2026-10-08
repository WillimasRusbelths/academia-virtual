import { beforeAll, afterAll, expect, test, vi } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import { sessionFixture, activity, type IdentityTestDatabase } from '../support/session-fixture.js';
import { sessionHttp } from '../support/session-http.js';
import { SessionCookie } from '../../dist/src/http/session-cookie.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../dist/src/app.module.js';
import { configureTransport } from '../../dist/src/http/transport.js';

let context: IdentityTestDatabase;
let http: Awaited<ReturnType<typeof sessionHttp>>;
beforeAll(async () => { context = await identityDatabase('http_security'); http = await sessionHttp(context); }, 120000);
afterAll(async () => { await http?.app.close(); await context?.cleanup(); });
const route = (path: string) => `${http.url}/__test/identity/${path}`;

test('cookies HTTP local y HTTPS con atributos contractuales, eliminación y sin Domain', () => {
  const secret = accessSecrets.issue().secret;
  for (const secure of [false, true]) {
    const cookie = new SessionCookie({ appEnv: secure ? 'production' : 'development',
      appOrigin: secure ? 'https://academia.example.test' : 'http://localhost:5173' });
    expect(cookie.name).toBe(secure ? '__Host-av_session' : 'av_session_dev');
    const issued = cookie.issue(secret);
    expect(issued.startsWith(`${cookie.name}=`)).toBe(true);
    expect(issued.split('; ').slice(1)).toEqual(['Path=/', 'HttpOnly', 'SameSite=Lax', ...(secure ? ['Secure'] : []), 'Max-Age=28800']);
    expect(cookie.clear()).toBe(`${cookie.name}=; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}; Max-Age=0`);
    expect(cookie.read(`${cookie.name}=${secret}`) === secret).toBe(true);
    expect(cookie.read(`otra=${secret}`) === null).toBe(true);
  }
  expect(() => new SessionCookie({ appEnv: 'production', appOrigin: 'http://localhost:5173' })).toThrow();
  expect(() => new SessionCookie({ appEnv: 'development', appOrigin: 'http://externo.example.test' })).toThrow();
});

test.each(['missing-origin', 'null-origin', 'foreign-origin', 'loopback-alias', 'missing-csrf', 'wrong-csrf', 'cross-site'] as const)(
  'rechaza %s sin escritura ni actividad', async (attack) => {
    const fixture = await sessionFixture(context, 'ADMIN');
    const headers: Record<string, string> = http.headers(fixture.secret);
    if (attack === 'missing-origin') delete headers.origin;
    else if (attack === 'null-origin') headers.origin = 'null';
    else if (attack === 'foreign-origin') headers.origin = 'https://externo.example.test';
    else if (attack === 'loopback-alias') headers.origin = 'http://127.0.0.1:5173';
    else if (attack === 'missing-csrf') delete headers['x-csrf-protection'];
    else if (attack === 'wrong-csrf') headers['x-csrf-protection'] = 'true';
    else headers['sec-fetch-site'] = 'cross-site';
    const before = await activity(context, fixture.sessionId);
    const effects = await http.effects();
    const response = await fetch(route('mutation'), { method: 'POST', headers, body: '{}' });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('REQUEST_NOT_ALLOWED');
    expect(await http.effects()).toBe(effects);
    expect((await activity(context, fixture.sessionId)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  });

test.each(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', 'application/json; charset=latin1'])(
  'rechaza tipo %s con 415', async (type) => {
    const response = await fetch(route('dto'), { method: 'POST', headers: { ...http.headers(), 'content-type': type }, body: '{}' });
    expect(response.status).toBe(415);
    expect((await response.json()).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

test('CORS cerrado y OPTIONS no concede acceso', async () => {
  for (const method of ['GET', 'OPTIONS']) {
    const response = await fetch(route('profile'), { method, headers: {
      origin: 'https://externo.example.test', 'access-control-request-method': 'POST',
      'access-control-request-headers': 'X-CSRF-Protection',
    } });
    expect(response.status).toBe(method === 'OPTIONS' ? 403 : 401);
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
    expect(response.headers.has('access-control-allow-credentials')).toBe(false);
  }
});

test('JSON máximo 16 KiB; forma estricta sin coerción, claves adicionales ni valores en errores', async () => {
  const fixture = await sessionFixture(context);
  for (const [body, status] of [
    ['{"name":"válido"}', 201], ['{"name":["SENTINEL_PRIVATE"]}', 400],
    ['{"name":"válido","SENTINEL_PRIVATE":"otro"}', 400], ['{}', 400], ['[]', 400], ['null', 400], ['{"', 400],
    [JSON.stringify({ name: 'x'.repeat(16373) }), 201],
    [JSON.stringify({ name: 'x'.repeat(16374) }), 413],
  ] as const) {
    const response = await fetch(route('dto'), { method: 'POST', headers: http.headers(fixture.secret), body });
    expect(response.status).toBe(status);
    const text = await response.text();
    expect(text.includes('SENTINEL_PRIVATE')).toBe(false);
    if (status >= 400) {
      const error = JSON.parse(text).error;
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.requestId).toMatch(/^[0-9a-f-]{36}$/);
      if (error.fields) expect(error.fields).toEqual([{ field: 'name', message: 'Campo inválido.' }]);
    }
  }
});

test('no-store, no-referrer y errores seguros incluso con debug y secretos señuelo', async () => {
  const fixture = await sessionFixture(context);
  const spies = ['log', 'debug', 'warn', 'error'].map((name) => vi.spyOn(console, name as 'log').mockImplementation(() => undefined));
  try {
    for (const [path, status] of [['profile', 200], ['invalid', 400], ['unavailable', 503], ['closed', 403]] as const) {
      const response = await fetch(route(path), { headers: { ...http.headers(fixture.secret),
        'x-request-id': 'SENTINEL_PRIVATE', authorization: 'SENTINEL_PRIVATE' } });
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(response.headers.has('set-cookie')).toBe(false);
      const text = await response.text();
      expect(text.includes('SENTINEL_PRIVATE') || text.includes(fixture.secret)).toBe(false);
      if (status >= 400) expect(Object.keys(JSON.parse(text).error).sort()).toEqual(['code', 'message', 'requestId']);
    }
    const response = await fetch(route('dto'), { method: 'POST', headers: http.headers(fixture.secret),
      body: '{"name":["SENTINEL_PRIVATE"],"password":"SENTINEL_PRIVATE"}' });
    expect(response.status).toBe(400);
    expect((await response.text()).includes('SENTINEL_PRIVATE')).toBe(false);
    const captured = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(captured.includes('SENTINEL_PRIVATE') || captured.includes(fixture.secret)).toBe(false);
  } finally { for (const spy of spies) spy.mockRestore(); }
});

test('salud no renueva sesiones; ready consulta BD, error 503 seguro y live permanece disponible', async () => {
  const fixture = await sessionFixture(context);
  const before = await activity(context, fixture.sessionId);
  for (const path of ['/health/live', '/health/ready']) {
    const response = await fetch(http.url + path, { headers: http.headers(fixture.secret) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.has('set-cookie')).toBe(false);
  }
  http.controls.readyFails = true;
  try {
    const response = await fetch(http.url + '/health/ready');
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text).error.code).toBe('TEMPORARILY_UNAVAILABLE');
    expect(text.includes('SENTINEL_PRIVATE')).toBe(false);
    expect((await fetch(http.url + '/health/live')).status).toBe(200);
  } finally { http.controls.readyFails = false; }
  expect((await activity(context, fixture.sessionId)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
});

test('composición productiva: ready usa pool real, BD caída da 503 y rutas de login aún no existen', async () => {
  const isolated = await identityDatabase('app_readiness');
  let app: NestExpressApplication | undefined;
  try {
    const module = await Test.createTestingModule({ imports: [AppModule.forRoot(isolated.environment, isolated.database)] }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false });
    configureTransport(app, isolated.environment);
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    expect((await fetch(url + '/health/ready')).status).toBe(200);
    expect((await fetch(url + '/api/v1/auth/login', { method: 'POST', headers: http.headers(), body: '{}' })).status).toBe(404);
    await isolated.database.close();
    const response = await fetch(url + '/health/ready');
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('TEMPORARILY_UNAVAILABLE');
    expect((await fetch(url + '/health/live')).status).toBe(200);
  } finally { await app?.close(); await isolated.cleanup(); }
}, 120000);
