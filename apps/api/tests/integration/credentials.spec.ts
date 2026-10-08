import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from 'argon2';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { CredentialOverload, CredentialUnavailable, hashNewPassword, verifyAccountCredential, verifyProvisionalCredential } from '../../src/modules/identity/application/credentials.js';
import { ARGON2_PARAMETERS, HASH_QUEUE_MAX, HASH_WAIT_MS, accessSecrets, createPasswordCredentials } from '../../src/modules/identity/infrastructure/credentials.js';
import type { Argon2Engine } from '../../src/modules/identity/infrastructure/credentials.js';
import type { PasswordCredentials } from '../../src/modules/identity/application/credentials.js';
import type { AccountAccess } from '../../src/modules/identity/domain/access.js';

let credentials: PasswordCredentials;
let validEncoded: string;
const password = randomBytes(24).toString('base64url');
beforeAll(async () => { credentials = await createPasswordCredentials(); validEncoded = await hashNewPassword(password, credentials); });
afterEach(() => vi.useRealTimers());

test('Argon2id real, salt distinto, parámetros aprobados y verificación sin trim/truncado', async () => {
  const other = await hashNewPassword(password, credentials);
  expect(other !== validEncoded).toBe(true);
  const parts = validEncoded.split('$');
  expect(parts[1] === 'argon2id' && parts[2] === 'v=19').toBe(true);
  expect(Object.fromEntries(parts[3].split(',').map(pair => pair.split('=')))).toEqual({ m: '19456', t: '2', p: '1' });
  expect(Buffer.from(parts[4], 'base64').length >= 16).toBe(true);
  expect(await credentials.verify(password, validEncoded)).toBe(true);
  expect(await credentials.verify(randomBytes(24).toString('base64url'), validEncoded)).toBe(false);
  const unicode = ` 🎓${password} e\u0301 `;
  const encoded = await hashNewPassword(unicode, credentials);
  expect(await credentials.verify(unicode, encoded)).toBe(true);
  expect(await credentials.verify(unicode.trim(), encoded)).toBe(false);
  expect(await credentials.verify(unicode.normalize('NFC'), encoded)).toBe(false);
  const longest = '🎓'.repeat(128);
  expect(await credentials.verify(longest, await hashNewPassword(longest, credentials))).toBe(true);
});

test('se reutilizan reglas de aplicación y toda condición ineligible realiza una verificación ficticia', async () => {
  let checks = 0; let dummyChecks = 0;
  const monitored = await createPasswordCredentials({ hash: value => hash(value, ARGON2_PARAMETERS),
    async verify(encoded, value) { checks++; if (encoded !== validEncoded) dummyChecks++; return verify(encoded, value); } });
  const now = new Date();
  const account: AccountAccess = { status: 'ACTIVE', emailCanonical: 'fixture@example.test', emailVerifiedAt: now,
    createdAt: now, mustSetPassword: false, passwordHash: validEncoded, authVersion: 0n };
  expect(await verifyAccountCredential(account, password, monitored)).toBe(true);
  for (const candidate of [null, { ...account, status: 'DISABLED' as const }, { ...account, emailVerifiedAt: null },
    { ...account, mustSetPassword: true }, { ...account, passwordHash: null }]) {
    expect(await verifyAccountCredential(candidate, password, monitored)).toBe(false);
  }
  expect(checks).toBe(6); expect(dummyChecks).toBe(5);
  expect(await monitored.verify(password, 'formato-malformado')).toBe(false);
  expect(checks).toBe(7); expect(dummyChecks).toBe(6);
  const provisional = { ...account, mustSetPassword: true, passwordHash: null, provisionalPasswordHash: validEncoded,
    provisionalExpiresAt: new Date(now.getTime() + 86_400_000) };
  expect(await verifyProvisionalCredential(provisional, password, now, monitored)).toBe(true);
  expect(await verifyProvisionalCredential(provisional, password, provisional.provisionalExpiresAt, monitored)).toBe(false);
  await expect(hashNewPassword('corta', monitored)).rejects.toThrow();
});

test('hash y verificación nativos comparten el máximo de dos operaciones', async () => {
  let active = 0; let peak = 0;
  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    active++; peak = Math.max(peak, active);
    try { return await operation(); } finally { active--; }
  };
  const adapter = await createPasswordCredentials({ hash: value => run(() => hash(value, ARGON2_PARAMETERS)),
    verify: (encoded, value) => run(() => verify(encoded, value)) });
  peak = 0;
  const results = await Promise.all([adapter.hash(password), adapter.verify(password, validEncoded),
    adapter.hash(password), adapter.verify(password, validEncoded)]);
  expect(peak).toBe(2);
  expect(results[1] === true && results[3] === true).toBe(true);
});

test('dos operaciones máximas por proceso, FIFO y cola de 50 con sobrecarga tipada', async () => {
  let holding = false; let active = 0; let maximum = 0;
  let order: string[] = [];
  const release: Array<() => void> = [];
  const engine: Argon2Engine = {
    async hash(value) {
      order.push(value);
      active++; maximum = Math.max(active, maximum);
      try { if (holding) await new Promise<void>(resolve => release.push(resolve)); return validEncoded; }
      finally { active--; }
    }, verify: async () => false,
  };
  const first = await createPasswordCredentials(engine);
  const second = await createPasswordCredentials(engine);
  order = [];
  holding = true;
  const tasks = Array.from({ length: HASH_QUEUE_MAX + 2 }, (_, index) => (index % 2 ? first : second).hash(`${password}:${index}`));
  const all = Promise.allSettled(tasks);
  await vi.waitFor(() => expect(active).toBe(2));
  await expect(first.hash(password)).rejects.toBeInstanceOf(CredentialOverload);
  holding = false;
  release.splice(0).forEach(resolve => resolve());
  expect((await all).every(result => result.status === 'fulfilled')).toBe(true);
  expect(maximum).toBe(2);
  expect(order.every((value, index) => value === `${password}:${index}`)).toBe(true);
  expect(await first.hash(password) !== null).toBe(true);
});

test('cola caduca exactamente a 5 s; libera su capacidad y no ejecuta trabajo vencido', async () => {
  let holding = false; let calls = 0;
  const release: Array<() => void> = [];
  const engine: Argon2Engine = { async hash() {
    calls++; if (holding) await new Promise<void>(resolve => release.push(resolve)); return validEncoded;
  }, verify: async () => false };
  const adapter = await createPasswordCredentials(engine);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  holding = true;
  const active = [adapter.hash(password), adapter.hash(password)];
  await Promise.resolve(); await Promise.resolve();
  const expired = Array.from({ length: HASH_QUEUE_MAX }, () => adapter.hash(password));
  const results = Promise.allSettled(expired);
  await vi.advanceTimersByTimeAsync(HASH_WAIT_MS - 1);
  expect(calls).toBe(3); // Hash ficticio inicial y dos activos.
  await vi.advanceTimersByTimeAsync(1);
  expect((await results).every(result => result.status === 'rejected' && result.reason instanceof CredentialOverload)).toBe(true);
  holding = false;
  const next = adapter.hash(password);
  release.splice(0).forEach(resolve => resolve());
  await Promise.all([...active, next]);
  expect(calls).toBe(4);
});

test('errores criptográficos son tipados y omiten mensajes del proveedor', async () => {
  const adapter = await createPasswordCredentials({ hash: async () => validEncoded,
    verify: async () => { throw new Error('detalle privado del proveedor'); } });
  await expect(adapter.verify(password, validEncoded)).rejects.toBeInstanceOf(CredentialUnavailable);
  try { await adapter.verify(password, validEncoded); }
  catch (error) { expect((error as Error).message.includes('detalle privado')).toBe(false); }
});

test('secretos de 32 bytes, base64url canónico de 43 caracteres y solo huella SHA-256', () => {
  const values = Array.from({ length: 30 }, () => accessSecrets.issue());
  expect(new Set(values.map(value => value.secret)).size).toBe(30);
  for (const value of values) {
    expect(value.secret.length === 43 && /^[A-Za-z0-9_-]+$/.test(value.secret)).toBe(true);
    const bytes = Buffer.from(value.secret, 'base64url');
    expect(bytes.length === 32 && value.digest.length === 32).toBe(true);
    expect(Buffer.from(value.digest).equals(createHash('sha256').update(bytes).digest())).toBe(true);
    expect(Buffer.from(accessSecrets.digest(value.secret)!).equals(Buffer.from(value.digest))).toBe(true);
  }
  for (const malformed of ['', 'a'.repeat(42), 'a'.repeat(44), 'a'.repeat(43), 'a'.repeat(42) + '+', 'a'.repeat(42) + '=']) {
    expect(accessSecrets.digest(malformed) === null).toBe(true);
  }
});
