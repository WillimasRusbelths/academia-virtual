import { beforeAll, afterAll, expect, test } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import { sessionFixture, activity, type IdentityTestDatabase } from '../support/session-fixture.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';

let context: IdentityTestDatabase;
let store: PostgresSessionStore;
beforeAll(async () => { context = await identityDatabase('sessions'); store = new PostgresSessionStore(context.database.pool); }, 120000);
afterAll(async () => { await context?.cleanup(); });

test('consulta primaria en cada solicitud y conserva sesión tras recrear el adaptador', async () => {
  const fixture = await sessionFixture(context);
  expect((await store.lookup(fixture.secret))?.role).toBe('STUDENT');
  await context.database.pool.query('UPDATE "User" SET role = \'TEACHER\' WHERE id = $1', [fixture.userId]);
  expect((await store.lookup(fixture.secret))?.role).toBe('TEACHER');
  expect(await new PostgresSessionStore(context.database.pool).lookup(fixture.secret) !== null).toBe(true);
  await context.database.pool.query('UPDATE "User" SET "authVersion" = 1 WHERE id = $1', [fixture.userId]);
  expect(await store.lookup(fixture.secret) === null).toBe(true);
});

test.each(['disabled', 'unverified', 'provisional', 'no-password'] as const)('rechaza cuenta no elegible: %s', async (state) => {
  const fixture = await sessionFixture(context);
  const changes = { disabled: `status = 'DISABLED', "disabledAt" = statement_timestamp()`,
    unverified: '"emailVerifiedAt" = NULL', provisional: '"mustSetPassword" = true',
    'no-password': '"mustSetPassword" = true, "passwordHash" = NULL' };
  await context.database.pool.query(`UPDATE "User" SET ${changes[state]} WHERE id = $1`, [fixture.userId]);
  expect(await store.lookup(fixture.secret) === null).toBe(true);
});

test.each(['idle', 'absolute'] as const)('rechaza expiración %s sin renovar', async (expiry) => {
  const fixture = await sessionFixture(context);
  const actor = (await store.lookup(fixture.secret))!;
  const interval = expiry === 'idle' ? '30 minutes' : '8 hours';
  await context.database.pool.query(`UPDATE "Session" SET "createdAt" = statement_timestamp() - interval '${interval}',
    "lastAcceptedAt" = statement_timestamp() - interval '${interval}',
    "absoluteExpiresAt" = statement_timestamp() - interval '${interval}' + interval '8 hours' WHERE id = $1`, [fixture.sessionId]);
  const before = await activity(context, fixture.sessionId);
  expect(await store.lookup(fixture.secret) === null).toBe(true);
  expect(await store.accept(actor)).toBe(false);
  expect((await activity(context, fixture.sessionId)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
});

test('revalidación exige una transacción explícita que conserve bloqueos hasta la escritura', async () => {
  const fixture = await sessionFixture(context, 'ADMIN');
  const actor = (await store.lookup(fixture.secret))!;
  const client = await context.database.pool.connect();
  try {
    await expect(store.revalidateInTransaction(client, actor, 'users:manage')).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  } finally { client.release(); }
});

test('solo accept aumenta actividad; GREATEST conserva orden y no amplía las ocho horas', async () => {
  const fixture = await sessionFixture(context);
  const actor = (await store.lookup(fixture.secret))!;
  const before = await activity(context, fixture.sessionId);
  await store.lookup(fixture.secret);
  expect((await activity(context, fixture.sessionId)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  expect(await store.accept(actor)).toBe(true);
  const accepted = await activity(context, fixture.sessionId);
  expect(accepted.lastAcceptedAt > before.lastAcceptedAt).toBe(true);
  expect(accepted.absoluteExpiresAt.getTime()).toBe(before.absoluteExpiresAt.getTime());
  await context.database.pool.query(`UPDATE "Session" SET "lastAcceptedAt" = statement_timestamp() + interval '5 seconds' WHERE id = $1`, [fixture.sessionId]);
  const later = await activity(context, fixture.sessionId);
  expect((await Promise.all([store.accept(actor), store.accept(actor)])).every(Boolean)).toBe(true);
  expect((await activity(context, fixture.sessionId)).lastAcceptedAt.getTime()).toBe(later.lastAcceptedAt.getTime());
});

test('revocación idempotente persistida; una solicitud iniciada antes no reactiva la sesión', async () => {
  const fixture = await sessionFixture(context);
  const actor = (await store.lookup(fixture.secret))!;
  const before = await activity(context, fixture.sessionId);
  await store.revoke(fixture.secret);
  const revoked = await activity(context, fixture.sessionId);
  await store.revoke(fixture.secret);
  expect(await store.accept(actor)).toBe(false);
  expect(await store.lookup(fixture.secret) === null).toBe(true);
  const after = await activity(context, fixture.sessionId);
  expect(after.revokedAt!.getTime()).toBe(revoked.revokedAt!.getTime());
  expect(after.lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
});

test('credenciales alteradas, no canónicas, UUID o desconocidas no autentican', async () => {
  const fixture = await sessionFixture(context);
  for (const value of ['', 'incorrecta', fixture.sessionId, 'A'.repeat(42) + 'B', accessSecrets.issue().secret]) {
    expect(await store.lookup(value) === null).toBe(true);
    await store.revoke(value);
  }
  const changed = (fixture.secret.startsWith('A') ? 'B' : 'A') + fixture.secret.slice(1);
  expect(await store.lookup(changed) === null).toBe(true);
  expect(await store.lookup(fixture.secret) !== null).toBe(true);
});

test('fallo de persistencia falla cerrado sin detalles de SQL', async () => {
  const fixture = await sessionFixture(context);
  const client = await context.database.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL search_path = pg_catalog');
    const actor = (await store.lookup(fixture.secret))!;
    await expect(store.revalidateInTransaction(client, actor, 'profile:read')).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  } finally { await client.query('ROLLBACK'); client.release(); }
});

test.each([2, 3])('conflictos transitorios: %i fallos, máximo dos reintentos y rollback', async (failures) => {
  const fixture = await sessionFixture(context);
  const actor = (await store.lookup(fixture.secret))!;
  const before = await activity(context, fixture.sessionId);
  await context.isolated.ownerQuery(`CREATE SEQUENCE session_retry_probe;
    CREATE FUNCTION session_retry_probe_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF nextval('session_retry_probe') <= ${failures} THEN
      RAISE EXCEPTION 'Conflicto transitorio de ensayo.' USING ERRCODE = '40001';
    END IF; RETURN NEW; END $$;
    CREATE TRIGGER session_retry_probe BEFORE UPDATE OF "lastAcceptedAt" ON "Session"
    FOR EACH ROW EXECUTE FUNCTION session_retry_probe_trigger()`);
  try {
    if (failures === 2) expect(await store.accept(actor)).toBe(true);
    else await expect(store.accept(actor)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
    const attempts = await context.database.pool.query<{ last_value: string }>('SELECT last_value FROM session_retry_probe');
    expect(Number(attempts.rows[0]!.last_value)).toBe(3);
    const after = await activity(context, fixture.sessionId);
    expect(after.absoluteExpiresAt.getTime()).toBe(before.absoluteExpiresAt.getTime());
    if (failures === 3) expect(after.lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  } finally {
    await context.isolated.ownerQuery('DROP TRIGGER session_retry_probe ON "Session"; DROP FUNCTION session_retry_probe_trigger(); DROP SEQUENCE session_retry_probe');
  }
});

test('base no disponible deniega lookup, renovación y revocación con error seguro', async () => {
  const fixture = await sessionFixture(context);
  const actor = (await store.lookup(fixture.secret))!;
  await context.database.close();
  for (const operation of [() => store.lookup(fixture.secret), () => store.accept(actor), () => store.revoke(fixture.secret)]) {
    await expect(operation()).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE', message: 'Servicio temporalmente no disponible.' });
  }
});
