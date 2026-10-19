import { beforeAll, afterAll, expect, test } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import { sessionFixture, activity, type IdentityTestDatabase } from '../support/session-fixture.js';
import { sessionHttp } from '../support/session-http.js';

let context: IdentityTestDatabase;
let http: Awaited<ReturnType<typeof sessionHttp>>;
beforeAll(async () => { context = await identityDatabase('guard'); http = await sessionHttp(context); }, 120000);
afterAll(async () => { await http?.app.close(); await context?.cleanup(); });
const route = (path: string) => `${http.url}/__test/identity/${path}`;

test.each(['STUDENT', 'TEACHER', 'ADMIN'] as const)('permite perfil propio para %s y renueva actividad solo al éxito', async (role) => {
  const fixture = await sessionFixture(context, role);
  const before = await activity(context, fixture.sessionId);
  const response = await fetch(route('profile'), { headers: http.headers(fixture.secret) });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { role } });
  expect(response.headers.has('set-cookie')).toBe(false);
  const after = await activity(context, fixture.sessionId);
  expect(after.lastAcceptedAt > before.lastAcceptedAt).toBe(true);
  expect(after.absoluteExpiresAt.getTime()).toBe(before.absoluteExpiresAt.getTime());
});

test.each(['STUDENT', 'TEACHER'] as const)('deniega administración a %s antes de consultar destinos', async (role) => {
  const fixture = await sessionFixture(context, role);
  const before = await activity(context, fixture.sessionId);
  const reads = http.controls.reads;
  for (const target of [fixture.userId, '00000000-0000-0000-0000-000000000000']) {
    const response = await fetch(route(`admin/${target}`), { headers: http.headers(fixture.secret) });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('FORBIDDEN');
  }
  expect(http.controls.reads).toBe(reads);
  expect((await activity(context, fixture.sessionId)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
});

test('ADMIN accede; una operación sin política se deniega incluso a ADMIN', async () => {
  const fixture = await sessionFixture(context, 'ADMIN');
  expect((await fetch(route(`admin/${fixture.userId}`), { headers: http.headers(fixture.secret) })).status).toBe(200);
  const before = await activity(context, fixture.sessionId);
  expect((await fetch(route('closed'), { headers: http.headers(fixture.secret) })).status).toBe(403);
  expect((await activity(context, fixture.sessionId)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
});

test('ausencia, cookie inválida/desconocida y Bearer nunca sustituyen una sesión', async () => {
  const fixture = await sessionFixture(context);
  const variants = [{}, { cookie: 'av_session_dev=incorrecta' }, { cookie: `av_session_dev=${'A'.repeat(43)}` },
    { authorization: `Bearer ${fixture.secret}` },
    { cookie: `av_session_dev=${fixture.secret}; av_session_dev=${fixture.secret}` }];
  for (const headers of variants) {
    const response = await fetch(route('profile'), { headers: headers as Record<string, string> });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('AUTH_REQUIRED');
  }
});

test.each(['revoked', 'idle', 'absolute', 'version', 'disabled'] as const)('guard rechaza sesión %s sin actividad', async (state) => {
  const fixture = await sessionFixture(context);
  if (state === 'revoked') await http.store.revoke(fixture.secret);
  else if (state === 'version') await context.database.pool.query('UPDATE "User" SET "authVersion" = 1 WHERE id = $1', [fixture.userId]);
  else if (state === 'disabled') await context.database.pool.query(`UPDATE "User" SET status = 'DISABLED', "disabledAt" = statement_timestamp() WHERE id = $1`, [fixture.userId]);
  else {
    const offset = state === 'idle' ? '30 minutes' : '8 hours';
    await context.database.pool.query(`UPDATE "Session" SET "createdAt" = statement_timestamp() - interval '${offset}',
      "lastAcceptedAt" = statement_timestamp() - interval '${offset}',
      "absoluteExpiresAt" = statement_timestamp() - interval '${offset}' + interval '8 hours' WHERE id = $1`, [fixture.sessionId]);
  }
  const before = await activity(context, fixture.sessionId);
  expect((await fetch(route('profile'), { headers: http.headers(fixture.secret) })).status).toBe(401);
  expect((await activity(context, fixture.sessionId)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
});

test('400 y 503 de una operación protegida no renuevan actividad', async () => {
  const fixture = await sessionFixture(context);
  const before = await activity(context, fixture.sessionId);
  expect((await fetch(route('invalid'), { headers: http.headers(fixture.secret) })).status).toBe(400);
  expect((await fetch(route('unavailable'), { headers: http.headers(fixture.secret) })).status).toBe(503);
  expect((await fetch(route('unserializable'), { headers: http.headers(fixture.secret) })).status).toBe(503);
  expect((await activity(context, fixture.sessionId)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
});

test.each(['role', 'disabled', 'version', 'revoke'] as const)('revalida actor en transacción frente a cambio concurrente: %s', async (change) => {
  const fixture = await sessionFixture(context, 'ADMIN');
  const effects = await http.effects();
  const before = await activity(context, fixture.sessionId);
  http.controls.beforeMutation = async () => {
    if (change === 'revoke') await http.store.revoke(fixture.secret);
    else {
      const sql = { role: `role = 'STUDENT'`, disabled: `status = 'DISABLED', "disabledAt" = statement_timestamp()`,
        version: '"authVersion" = "authVersion" + 1' }[change];
      await context.database.pool.query(`UPDATE "User" SET ${sql} WHERE id = $1`, [fixture.userId]);
    }
  };
  try {
    const response = await fetch(route('mutation'), { method: 'POST', headers: http.headers(fixture.secret), body: '{}' });
    expect(response.status).toBe(change === 'role' ? 403 : 401);
    expect(await http.effects()).toBe(effects);
    expect((await activity(context, fixture.sessionId)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  } finally { delete http.controls.beforeMutation; }
});

test('mutación autorizada hace commit antes del 204 y renueva actividad', async () => {
  const fixture = await sessionFixture(context, 'ADMIN');
  const before = await activity(context, fixture.sessionId);
  const effects = await http.effects();
  const response = await fetch(route('mutation'), { method: 'POST', headers: http.headers(fixture.secret), body: '{}' });
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  expect(await http.effects()).toBe(effects + 1);
  expect((await activity(context, fixture.sessionId)).lastAcceptedAt > before.lastAcceptedAt).toBe(true);
});
