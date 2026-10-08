import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { PostgresRateStore, RateStoreUnavailable } from '../../src/infrastructure/limits/rate-store.js';
import type { LoginAdmission, LoginReservation } from '../../src/infrastructure/limits/rate-store.js';
import { createDatabase } from '../../src/infrastructure/database/database.js';
import { normalizeEmail } from '../../src/modules/users/public/account.js';
import { accessSecrets, createPasswordCredentials } from '../../src/modules/identity/infrastructure/credentials.js';
import { identityDatabase } from '../support/identity-database.js';

let fixture: Awaited<ReturnType<typeof identityDatabase>>;
let store: PostgresRateStore;
const key = randomBytes(32);
const email = () => `${randomUUID()}@example.test`;
const origin = () => `2001:db8:${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}::1`;
const reservation = (result: LoginAdmission): LoginReservation => {
  if (!result.allowed) throw new Error('Reserva esperada no admitida.');
  return result.reservation;
};
beforeAll(async () => { fixture = await identityDatabase('rate_limits'); store = new PostgresRateStore(fixture.database.pool, key); }, 120000);
afterAll(async () => fixture?.cleanup());

test('normalización de correo coincide con lower() de PostgreSQL, incluidos alias y Unicode', async () => {
  for (const input of [' ANA+Curso@EXAMPLE.TEST ', 'ΟΣİ@EXAMPLE.TEST', 'ẞ@EXAMPLE.TEST', 'École@EXAMPLE.TEST']) {
    const normalized = normalizeEmail(input);
    const result = await fixture.database.pool.query('SELECT lower($1::text) AS canonical', [normalized.email]);
    expect(result.rows[0].canonical === normalized.emailCanonical).toBe(true);
    await fixture.database.pool.query(`INSERT INTO "User"(name,email,"emailCanonical",role,"mustSetPassword") VALUES('Ficticio',$1,$2,'STUDENT',true)`, [normalized.email, normalized.emailCanonical]);
  }
});

test('fallos entre solicitudes: quinto bloquea, no se prolonga y otra pareja sigue libre', async () => {
  const target = email(); const sender = origin();
  let reference: LoginReservation;
  for (let i = 0; i < 5; i++) {
    reference = reservation(await store.reserveLogin(target, sender));
    expect(await store.finishLogin(reference, false)).toBe(true);
  }
  const before = (await fixture.database.pool.query('SELECT "blockedUntil" FROM "RateBucket" WHERE key=$1', [reference!.bucketKey])).rows[0].blockedUntil;
  const limited = await store.reserveLogin(target.toUpperCase(), sender);
  expect(limited.allowed).toBe(false);
  expect(limited.retryAfterSeconds > 0 && limited.retryAfterSeconds <= 900).toBe(true);
  const after = (await fixture.database.pool.query('SELECT "blockedUntil" FROM "RateBucket" WHERE key=$1', [reference!.bucketKey])).rows[0].blockedUntil;
  expect(after.getTime() === before.getTime()).toBe(true);
  expect((await store.reserveLogin(target, origin())).allowed).toBe(true);
});

test('éxito borra fallos; finalizar dos veces o inventar una reserva no cambia cuotas', async () => {
  const target = email(); const sender = origin();
  const failed = reservation(await store.reserveLogin(target, sender));
  await store.finishLogin(failed, false);
  const success = reservation(await store.reserveLogin(target, sender));
  const inFlight = reservation(await store.reserveLogin(target, sender));
  expect(await store.finishLogin(success, true)).toBe(true);
  expect(await store.finishLogin(success, false)).toBe(false);
  expect(await store.finishLogin({ ...success, eventId: randomUUID() }, true)).toBe(false);
  const state = await fixture.database.pool.query('SELECT status FROM "RateEvent" WHERE "bucketKey"=$1', [success.bucketKey]);
  expect(state.rows.filter(row => row.status === 'FAILED')).toHaveLength(0);
  expect(state.rows.filter(row => row.status === 'RESERVED')).toHaveLength(1);
  expect(await store.finishLogin(inFlight, false)).toBe(true);
});

test('concurrencia no supera cinco reservas tanto para correo existente como inexistente', async () => {
  const known = email(); const unknown = email(); const senders = [origin(), origin()];
  await fixture.database.pool.query(`INSERT INTO "User"(name,email,"emailCanonical",role,"mustSetPassword") VALUES('Ficticio',$1,$1,'STUDENT',true)`, [known]);
  for (const [index, target] of [known, unknown].entries()) {
    const results = await Promise.all(Array.from({ length: 12 }, () => store.reserveLogin(target, senders[index])));
    const admitted = results.filter(result => result.allowed);
    expect(admitted).toHaveLength(5);
    expect(results.filter(result => !result.allowed)).toHaveLength(7);
    for (const result of admitted) await store.finishLogin(reservation(result), false);
    const blocked = await store.reserveLogin(target, senders[index]);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 900).toBe(true);
  }
});

test('reservas vencidas cuentan como fallo; éxito tardío no las limpia ni reactiva', async () => {
  const target = email(); const sender = origin();
  const results = await Promise.all(Array.from({ length: 5 }, () => store.reserveLogin(target, sender)));
  const first = reservation(results[0]);
  await fixture.database.pool.query(`UPDATE "RateEvent" SET "occurredAt"=statement_timestamp()-interval '31 seconds',
    "reservationExpiresAt"=statement_timestamp()-interval '1 second' WHERE "bucketKey"=$1`, [first.bucketKey]);
  expect((await store.reserveLogin(target, sender)).allowed).toBe(false);
  expect(await store.finishLogin(first, true)).toBe(false);
  const state = await fixture.database.pool.query('SELECT status,"reservationExpiresAt" FROM "RateEvent" WHERE "bucketKey"=$1', [first.bucketKey]);
  expect(state.rows.every(row => row.status === 'FAILED' && row.reservationExpiresAt === null)).toBe(true);
  const block = (await fixture.database.pool.query('SELECT "blockedUntil" FROM "RateBucket" WHERE key=$1', [first.bucketKey])).rows[0].blockedUntil;
  const now = (await fixture.database.pool.query('SELECT clock_timestamp() AS now')).rows[0].now;
  expect(block.getTime() > now.getTime() && block.getTime() <= now.getTime() + 900_000).toBe(true);
});

test('conexión y store nuevos conservan bloqueos y cuota de correo del mismo entorno', async () => {
  const target = email(); const sender = origin();
  for (let i = 0; i < 5; i++) await store.finishLogin(reservation(await store.reserveLogin(target, sender)), false);
  await store.admitMail(target, 'VERIFY_EMAIL', sender, 'ADMISSION');
  const restarted = createDatabase(fixture.environment);
  try {
    const other = new PostgresRateStore(restarted.pool, key);
    expect((await other.reserveLogin(target, sender)).allowed).toBe(false);
    expect((await other.admitMail(target, 'VERIFY_EMAIL', sender, 'ADMISSION')).allowed).toBe(false);
  } finally { await restarted.close(); }
});

test('admisión y SMTP independientes, propósito separado y normalización de IP/correo', async () => {
  const target = email();
  expect((await store.admitMail(target, 'VERIFY_EMAIL', '192.0.2.1', 'ADMISSION')).allowed).toBe(true);
  const duplicate = await store.admitMail(` ${target.toUpperCase()} `, 'VERIFY_EMAIL', '::ffff:192.0.2.1', 'ADMISSION');
  expect(duplicate.allowed).toBe(false); expect(duplicate.retryAfterSeconds > 0).toBe(true);
  expect((await store.admitMail(target, 'RESET_PASSWORD', '192.0.2.1', 'ADMISSION')).allowed).toBe(true);
  expect((await store.admitMail(target, 'VERIFY_EMAIL', '192.0.2.1', 'SMTP')).allowed).toBe(true);
  expect((await store.admitMail(target, 'VERIFY_EMAIL', '::ffff:c000:201', 'SMTP')).allowed).toBe(false);
});

test('correo: cinco por destinatario/hora y fronteras móviles de minuto/hora', async () => {
  const target = email(); const sender = origin();
  const first = await store.admitMail(target, 'VERIFY_EMAIL', sender, 'ADMISSION');
  expect(first.allowed).toBe(true);
  const recipient = (await fixture.database.pool.query(`SELECT "bucketKey" FROM "RateEvent" WHERE "occurredAt"=$1
    AND "bucketKey" IN (SELECT key FROM "RateBucket" WHERE scope='MAIL_RECIPIENT_PURPOSE')`, [new Date(first.nextAllowedAt)])).rows[0].bucketKey;
  await fixture.database.pool.query(`UPDATE "RateEvent" SET "occurredAt"=clock_timestamp()-interval '58 seconds' WHERE "bucketKey"=$1`, [recipient]);
  expect((await store.admitMail(target, 'VERIFY_EMAIL', sender, 'ADMISSION')).allowed).toBe(false);
  for (let i = 1; i < 5; i++) {
    await fixture.database.pool.query(`UPDATE "RateEvent" SET "occurredAt"=LEAST("occurredAt",clock_timestamp()-interval '61 seconds') WHERE "bucketKey"=$1`, [recipient]);
    expect((await store.admitMail(target, 'VERIFY_EMAIL', sender, 'ADMISSION')).allowed).toBe(true);
  }
  expect((await store.admitMail(target, 'VERIFY_EMAIL', sender, 'ADMISSION')).allowed).toBe(false);
  await fixture.database.pool.query(`UPDATE "RateEvent" SET "occurredAt"=clock_timestamp()-interval '1 hour 1 second' WHERE "bucketKey"=$1`, [recipient]);
  expect((await store.admitMail(target, 'VERIFY_EMAIL', sender, 'ADMISSION')).allowed).toBe(true);
});

test('25 solicitudes simultáneas: máximo 20/origen sumando propósitos y destinatarios', async () => {
  const sender = origin();
  const results = await Promise.all(Array.from({ length: 25 }, (_, index) => store.admitMail(email(), index % 2 ? 'VERIFY_EMAIL' : 'RESET_PASSWORD', sender, 'ADMISSION')));
  expect(results.filter(result => result.allowed)).toHaveLength(20);
  expect(results.filter(result => !result.allowed)).toHaveLength(5);
  expect(results.filter(result => !result.allowed).every(result => result.retryAfterSeconds > 0)).toBe(true);
});

test('mismo destinatario concurrente admite uno y conocidos/desconocidos consumen igual cuota', async () => {
  for (const target of ['ANA+Curso@EXAMPLE.TEST', email()]) {
    const sender = origin();
    const results = await Promise.all(Array.from({ length: 8 }, () => store.admitMail(target, 'VERIFY_EMAIL', sender, 'SMTP')));
    expect(results.filter(result => result.allowed)).toHaveLength(1);
    expect(results.filter(result => !result.allowed)).toHaveLength(7);
  }
});

test('al devolver la reserva/admisión no quedan locks de cuota durante hash/SMTP', async () => {
  const target = email(); const sender = origin();
  const active = reservation(await store.reserveLogin(target, sender));
  await store.admitMail(target, 'VERIFY_EMAIL', sender, 'SMTP');
  const connection = await fixture.database.pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query('SELECT key FROM "RateBucket" FOR UPDATE NOWAIT');
    await connection.query('ROLLBACK');
  } finally { connection.release(); }
  expect(await store.finishLogin(active, true)).toBe(true);
});

test('huellas SHA-256 persistidas, claves HMAC sin IP/correo y rollback ante fallo', async () => {
  const id = randomUUID(); const target = email();
  const credentials = await createPasswordCredentials();
  const password = randomBytes(24).toString('base64url');
  const encoded = await credentials.hash(password);
  await fixture.database.pool.query(`INSERT INTO "User"(id,name,email,"emailCanonical",role,"passwordHash") VALUES($1,'Ficticio',$2,$2,'STUDENT',$3)`, [id, target, encoded]);
  const stored = (await fixture.database.pool.query('SELECT "passwordHash" FROM "User" WHERE id=$1', [id])).rows[0].passwordHash;
  expect(await credentials.verify(password, stored)).toBe(true);
  const secret = accessSecrets.issue();
  await fixture.database.pool.query(`INSERT INTO "Session"("userId","authVersion","tokenHash","absoluteExpiresAt") VALUES($1,0,$2,CURRENT_TIMESTAMP+interval '8 hours')`, [id, Buffer.from(secret.digest)]);
  const saved = (await fixture.database.pool.query('SELECT "tokenHash" FROM "Session" WHERE "userId"=$1', [id])).rows[0].tokenHash;
  expect(saved.equals(Buffer.from(secret.digest)) && saved.length === 32).toBe(true);
  const buckets = (await fixture.database.pool.query('SELECT key FROM "RateBucket"')).rows;
  expect(buckets.every(row => /^[a-f0-9]{64}$/.test(row.key))).toBe(true);
  const sender = '192.0.2.99'; const receiver = email();
  const hmac = (parts: string[]) => createHmac('sha256', key).update(JSON.stringify(parts)).digest('hex');
  const originBucket = hmac(['MAIL_ORIGIN', 'SMTP', sender]);
  const recipientBucket = hmac(['MAIL_RECIPIENT_PURPOSE', 'SMTP', receiver, 'VERIFY_EMAIL']);
  // Fallo después de insertar la cuota de destinatario; exclusivamente en el esquema de ensayo.
  await fixture.isolated.ownerQuery(`CREATE FUNCTION test_reject_origin() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW."bucketKey"='${originBucket}' THEN RAISE EXCEPTION 'Fallo de ensayo'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_reject_origin BEFORE INSERT ON "RateEvent" FOR EACH ROW EXECUTE FUNCTION test_reject_origin()`);
  try {
    await expect(store.admitMail(receiver, 'VERIFY_EMAIL', sender, 'SMTP')).rejects.toBeInstanceOf(RateStoreUnavailable);
    const rolledBack = await fixture.database.pool.query('SELECT key FROM "RateBucket" WHERE key=ANY($1)', [[originBucket, recipientBucket]]);
    expect(rolledBack.rowCount).toBe(0);
  } finally { await fixture.isolated.ownerQuery('DROP TRIGGER test_reject_origin ON "RateEvent"; DROP FUNCTION test_reject_origin()'); }
  const unused = createDatabase(fixture.environment);
  await unused.close();
  await expect(new PostgresRateStore(unused.pool, key).reserveLogin(email(), origin())).rejects.toBeInstanceOf(RateStoreUnavailable);
});
