import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { ConfigurationError, loadEnvironment, repositoryRoot } from '../../src/infrastructure/config/environment.js';

const root = mkdtempSync(path.join(tmpdir(), 'academia-config-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

test('plantillas sin secretos; generador conserva configuración existente y añade solo claves faltantes', () => {
  const repository = repositoryRoot();
  for (const file of ['.env.example', '.env.test.example']) {
    const template = parseEnv(readFileSync(path.join(repository, file), 'utf8'));
    for (const [name, value] of Object.entries(template)) {
      if (/PASSWORD|_KEY$|_URL$/.test(name) && name !== 'MAILPIT_URL') expect(value).toBe('');
    }
  }
  const directory = mkdtempSync(path.join(root, 'generator-'));
  mkdirSync(path.join(directory, 'ops/docker'), { recursive: true });
  const script = path.join(directory, 'ops/docker/configure.mjs');
  writeFileSync(script, readFileSync(path.join(repository, 'ops/docker/configure.mjs')));
  const preserved = randomBytes(32).toString('base64');
  writeFileSync(path.join(directory, '.env'), `POSTGRES_PASSWORD=fixture\r\nWEB_PORT=5199\r\nMAIL_PAYLOAD_KEY=${preserved}\r\nRATE_HMAC_KEY=\r\n`);
  const run = () => spawnSync(process.execPath, [script, '--identity-keys'], { encoding: 'utf8' });
  const result = run();
  expect(result.status).toBe(0);
  expect(result.stdout).not.toContain(preserved);
  const generated = readFileSync(path.join(directory, '.env'), 'utf8');
  const values = parseEnv(generated);
  expect(values.POSTGRES_PASSWORD).toBe('fixture');
  expect(values.WEB_PORT).toBe('5199');
  expect(values.MAIL_PAYLOAD_KEY).toBe(preserved);
  const keys = ['MAIL_PAYLOAD_KEY', 'RATE_HMAC_KEY', 'TEST_MAIL_PAYLOAD_KEY', 'TEST_RATE_HMAC_KEY'].map(name => values[name]);
  expect(new Set(keys).size).toBe(4);
  for (const key of keys) expect(Buffer.from(key, 'base64').length).toBe(32);
  expect(run().status).toBe(0);
  expect(readFileSync(path.join(directory, '.env'), 'utf8')).toBe(generated);
});

function values(): NodeJS.ProcessEnv {
  return { APP_ENV: 'development', APP_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: 'postgresql://academia_runtime:dev-runtime@db:5432/academia_dev',
    MIGRATION_DATABASE_URL: 'postgresql://academia_owner:dev-owner@db:5432/academia_dev',
    TEST_DATABASE_URL: 'postgresql://academia_v00_runtime:test-runtime@db:5432/academia_v00_test',
    TEST_MIGRATION_DATABASE_URL: 'postgresql://academia_v00_owner:test-owner@db:5432/academia_v00_test',
    MAIL_PAYLOAD_KEY: randomBytes(32).toString('base64'), RATE_HMAC_KEY: randomBytes(32).toString('base64'),
    TEST_MAIL_PAYLOAD_KEY: randomBytes(32).toString('base64'), TEST_RATE_HMAC_KEY: randomBytes(32).toString('base64'),
    MAIL_KEY_ID: 'local-v1', MAIL_MODE: 'capture', SMTP_HOST: 'mailpit', SMTP_PORT: '1025',
    MAIL_FROM: 'academia@example.test' };
}

test('CLI y API encuentran la raíz desde el workspace; test elige su base y sus claves', () => {
  expect(repositoryRoot(path.join(process.cwd(), 'src'))).toBe(path.resolve(process.cwd(), '../..'));
  const input = values();
  const dev = loadEnvironment(input, root);
  const trial = loadEnvironment({ ...input, APP_ENV: 'test' }, root);
  expect(dev.databaseUrl).not.toBe(trial.databaseUrl);
  expect(dev.mailPayloadKey.equals(trial.mailPayloadKey)).toBe(false);
  expect(trial.databaseUrl).toContain('/academia_v00_test');
  expect(dev.poolMax).toBe(10);
  expect(dev.trustedProxy).toBe(false);
});

test('archivo explícito desde raíz: test no lee .env ni cae a desarrollo', () => {
  const input = values();
  const location = mkdtempSync(path.join(root, 'files-'));
  writeFileSync(path.join(location, '.env'), 'APP_ENV=development\nDATABASE_URL=privado\n');
  expect(() => loadEnvironment({ APP_ENV: 'test' }, location)).toThrow(ConfigurationError);
  writeFileSync(path.join(location, '.env.test'), Object.entries({ ...input, APP_ENV: 'test' })
    .map(([key, value]) => `${key}=${value}`).join('\n'));
  expect(loadEnvironment({ APP_ENV: 'test' }, location).appEnv).toBe('test');
  expect(() => loadEnvironment({}, location)).toThrow('APP_ENV');
});

describe('configuración insegura rechazada sin mostrar valores', () => {
  test.each([
    ['APP_ENV', undefined], ['APP_ENV', 'arbitrary'], ['APP_ORIGIN', 'http://127.0.0.1:5173'],
    ['APP_ORIGIN', 'http://localhost:5173/path'], ['DB_POOL_MAX', '0'], ['DB_POOL_MAX', 'Infinity'],
    ['MAIL_MODE', 'smtp'], ['SMTP_HOST', 'smtp.remoto.test'], ['SMTP_PORT', '25'],
    ['SMTP_USER', 'usuario-privado'], ['MAIL_FROM', 'real@example.com'],
    ['TRUSTED_PROXY', '*'], ['TRUSTED_PROXY', 'true'], ['MAIL_KEY_ID', '../key'],
    ['MAIL_PAYLOAD_KEY', 'privado'], ['RATE_HMAC_KEY', randomBytes(31).toString('base64')],
    ['DATABASE_URL', 'postgresql://user:clave-privada@remoto:5432/academia_dev'],
    ['DATABASE_URL', 'postgresql://user:clave-privada@db:5432/academia_dev?sslmode=disable'],
  ])('%s rechaza entrada inválida', (key, value) => {
    const input = { ...values(), [key]: value };
    try { loadEnvironment(input, root); throw new Error('Configuración inválida admitida'); }
    catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as Error).message).not.toContain('clave-privada');
      expect((error as Error).message).not.toContain('usuario-privado');
    }
  });
});

test('rechaza reutilizar claves y credenciales de base entre entornos o roles', () => {
  const input = values();
  expect(() => loadEnvironment({ ...input, RATE_HMAC_KEY: input.MAIL_PAYLOAD_KEY }, root)).toThrow('claves independientes');
  expect(() => loadEnvironment({ ...input, TEST_RATE_HMAC_KEY: input.MAIL_PAYLOAD_KEY }, root)).toThrow('claves independientes');
  expect(() => loadEnvironment({ ...input, TEST_MIGRATION_DATABASE_URL: input.TEST_MIGRATION_DATABASE_URL!.replace('test-owner', 'dev-owner') }, root)).toThrow('credenciales independientes');
  expect(() => loadEnvironment({ ...input, DATABASE_URL: `${input.DATABASE_URL}?schema=first&schema=second` }, root)).toThrow(ConfigurationError);
  expect(() => loadEnvironment({ ...input, MIGRATION_DATABASE_URL: input.DATABASE_URL }, root)).toThrow('roles de base');
  expect(() => loadEnvironment({ ...input, TEST_DATABASE_URL: input.DATABASE_URL, APP_ENV: 'test' }, root)).toThrow(ConfigurationError);
  expect(() => loadEnvironment({ ...input, TEST_MAIL_PAYLOAD_KEY: undefined, APP_ENV: 'test' }, root)).toThrow(ConfigurationError);
});

test('demo/producción requieren HTTPS, BD TLS, SMTP TLS autenticado y proxy concreto', () => {
  const { TEST_DATABASE_URL: _testDatabase, TEST_MIGRATION_DATABASE_URL: _testMigration, ...base } = values();
  void _testDatabase; void _testMigration;
  const production = { ...base, APP_ENV: 'production', APP_ORIGIN: 'https://academia.example.test',
    DATABASE_URL: 'postgresql://runtime:prod-runtime@database.example.test:5432/academia_prod?sslmode=verify-full',
    MIGRATION_DATABASE_URL: 'postgresql://owner:prod-owner@database.example.test:5432/academia_prod?sslmode=verify-full',
    MAIL_MODE: 'smtp', SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_REQUIRE_TLS: 'true',
    SMTP_USER: 'fixture', SMTP_PASSWORD: 'fixture', MAIL_FROM: 'academia@example.org', TRUSTED_PROXY: '10.0.0.2' };
  expect(loadEnvironment(production, root).databaseTls).toBe(true);
  expect(loadEnvironment({ ...production, APP_ENV: 'demo' }, root).appEnv).toBe('demo');
  for (const patch of [{ APP_ORIGIN: 'http://academia.example.test' }, { MAIL_MODE: 'capture' },
    { SMTP_REQUIRE_TLS: 'false' }, { SMTP_PASSWORD: '' }, { TRUSTED_PROXY: '' },
    { DATABASE_URL: production.DATABASE_URL.replace('verify-full', 'disable') }]) {
    expect(() => loadEnvironment({ ...production, ...patch }, root)).toThrow(ConfigurationError);
  }
});
