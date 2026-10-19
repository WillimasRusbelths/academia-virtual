import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { parseEnv } from 'node:util';

export type AppEnvironment = 'development' | 'test' | 'demo' | 'production';

export class ConfigurationError extends Error {
  constructor(field: string) {
    super(`Configuración inválida: ${field}. Valores omitidos.`);
    this.name = 'ConfigurationError';
  }
}

export interface Environment {
  readonly appEnv: AppEnvironment;
  readonly appOrigin: string;
  readonly databaseUrl: string;
  readonly migrationUrl: string;
  readonly databaseSchema: string;
  readonly databaseTls: boolean;
  readonly poolMax: number;
  readonly mailMode: 'capture' | 'smtp';
  readonly smtp: Readonly<{ host: string; port: number; secure: boolean; requireTls: boolean;
    user?: string; password?: string; from: string }>;
  readonly mailPayloadKey: Buffer;
  readonly rateHmacKey: Buffer;
  readonly mailKeyId: string;
  readonly trustedProxy: string | false;
}

export function repositoryRoot(start = process.cwd()): string {
  let directory = path.resolve(start);
  while (true) {
    const manifest = path.join(directory, 'package.json');
    if (existsSync(manifest)) {
      const json = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string; workspaces?: unknown };
      if (json.name === 'academia-virtual' && Array.isArray(json.workspaces)) return directory;
    }
    const parent = path.dirname(directory);
    if (parent === directory) throw new ConfigurationError('raíz del repositorio');
    directory = parent;
  }
}

function required(input: NodeJS.ProcessEnv, name: string): string {
  const value = input[name];
  if (!value) throw new ConfigurationError(name);
  return value;
}

function integer(value: string, field: string, min: number, max: number): number {
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw new ConfigurationError(field);
  return Number(value);
}

function boolean(value: string | undefined, field: string): boolean {
  if (value === 'true') return true;
  if (value === 'false' || value === undefined) return false;
  throw new ConfigurationError(field);
}

function secret(input: NodeJS.ProcessEnv, name: string): Buffer {
  const raw = required(input, name);
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== raw) throw new ConfigurationError(name);
  return decoded;
}

function connection(raw: string, field: string, mode: AppEnvironment): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ConfigurationError(field); }
  if (url.protocol !== 'postgresql:' || !url.username || !url.password || url.hash
      || !/^\/[a-z][a-z0-9_]{0,62}$/.test(url.pathname)) throw new ConfigurationError(field);
  if ([...url.searchParams.keys()].some(key => !['schema', 'sslmode'].includes(key))) throw new ConfigurationError(field);
  if (['schema', 'sslmode'].some(key => url.searchParams.getAll(key).length > 1)) throw new ConfigurationError(field);
  const schema = url.searchParams.get('schema') ?? 'public';
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new ConfigurationError(field);
  if (mode === 'development' || mode === 'test') {
    if (url.hostname !== 'db' || url.port !== '5432' || url.searchParams.has('sslmode')) throw new ConfigurationError(field);
    if ((mode === 'test') !== url.pathname.endsWith('_test')) throw new ConfigurationError(field);
  } else if (url.pathname.endsWith('_test') || url.pathname === '/academia_dev'
      || url.searchParams.get('sslmode') !== 'verify-full') throw new ConfigurationError(field);
  return url;
}

/** APP_ENV es explícito. Test nunca hereda .env ni credenciales de desarrollo. */
export function loadEnvironment(input: NodeJS.ProcessEnv = process.env, root = repositoryRoot()): Environment {
  const appEnv = required(input, 'APP_ENV');
  if (!['development', 'test', 'demo', 'production'].includes(appEnv)) throw new ConfigurationError('APP_ENV');
  const mode = appEnv as AppEnvironment;
  const filename = mode === 'test' ? '.env.test' : mode === 'development' ? '.env' : null;
  let fileInput: NodeJS.ProcessEnv = {};
  if (filename && existsSync(path.join(root, filename))) {
    try { fileInput = parseEnv(readFileSync(path.join(root, filename), 'utf8')); }
    catch { throw new ConfigurationError('archivo de entorno'); }
  }
  const values = { ...fileInput, ...input };
  if (values.APP_ENV !== mode) throw new ConfigurationError('APP_ENV');
  const prefix = mode === 'test' ? 'TEST_' : '';
  const database = connection(required(values, `${prefix}DATABASE_URL`), `${prefix}DATABASE_URL`, mode);
  const migration = connection(required(values, `${prefix}MIGRATION_DATABASE_URL`), `${prefix}MIGRATION_DATABASE_URL`, mode);
  if (database.hostname !== migration.hostname || database.port !== migration.port
      || database.pathname !== migration.pathname || database.search !== migration.search
      || database.username === migration.username || database.password === migration.password) {
    throw new ConfigurationError('roles de base de datos');
  }
  if (values.DATABASE_URL && values.TEST_DATABASE_URL) {
    const dev = connection(values.DATABASE_URL, 'DATABASE_URL', 'development');
    const test = connection(values.TEST_DATABASE_URL, 'TEST_DATABASE_URL', 'test');
    if (dev.pathname === test.pathname || dev.password === test.password || dev.username === test.username) {
      throw new ConfigurationError('separación de bases y credenciales');
    }
  }
  if (mode === 'development' || mode === 'test') {
    const connections = ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'TEST_DATABASE_URL', 'TEST_MIGRATION_DATABASE_URL']
      .filter(name => values[name]).map(name => connection(values[name]!, name, name.startsWith('TEST_') ? 'test' : 'development'));
    if (new Set(connections.map(url => url.username)).size !== connections.length
        || new Set(connections.map(url => url.password)).size !== connections.length) {
      throw new ConfigurationError('credenciales independientes');
    }
  }
  const mailPayloadKey = secret(values, `${prefix}MAIL_PAYLOAD_KEY`);
  const rateHmacKey = secret(values, `${prefix}RATE_HMAC_KEY`);
  const configuredKeys = ['MAIL_PAYLOAD_KEY', 'RATE_HMAC_KEY', 'TEST_MAIL_PAYLOAD_KEY', 'TEST_RATE_HMAC_KEY']
    .filter(name => values[name]).map(name => secret(values, name).toString('base64'));
  if (new Set(configuredKeys).size !== configuredKeys.length) throw new ConfigurationError('claves independientes');
  let origin: URL;
  const appOrigin = required(values, 'APP_ORIGIN');
  try { origin = new URL(appOrigin); } catch { throw new ConfigurationError('APP_ORIGIN'); }
  const local = mode === 'test' || mode === 'development';
  if (origin.origin !== appOrigin || (local ? origin.protocol !== 'http:' || origin.hostname !== 'localhost'
    : origin.protocol !== 'https:')) throw new ConfigurationError('APP_ORIGIN');
  const mailMode = required(values, 'MAIL_MODE');
  const host = required(values, 'SMTP_HOST');
  const port = integer(required(values, 'SMTP_PORT'), 'SMTP_PORT', 1, 65535);
  const secure = boolean(values.SMTP_SECURE, 'SMTP_SECURE');
  const requireTls = boolean(values.SMTP_REQUIRE_TLS, 'SMTP_REQUIRE_TLS');
  const from = required(values, 'MAIL_FROM');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) throw new ConfigurationError('MAIL_FROM');
  if (local) {
    if (mailMode !== 'capture' || host !== 'mailpit' || port !== 1025 || secure || requireTls
        || values.SMTP_USER || values.SMTP_PASSWORD || !from.endsWith('@example.test')) throw new ConfigurationError('SMTP local');
  } else if (mailMode !== 'smtp' || !((port === 465 && secure) || (port === 587 && !secure && requireTls))
      || !values.SMTP_USER || !values.SMTP_PASSWORD || host === 'mailpit' || from.endsWith('@example.test')) {
    throw new ConfigurationError('SMTP seguro');
  }
  const proxy = values.TRUSTED_PROXY ?? '';
  if (proxy && !isIP(proxy)) throw new ConfigurationError('TRUSTED_PROXY');
  if (!local && !proxy) throw new ConfigurationError('TRUSTED_PROXY');
  const mailKeyId = required(values, 'MAIL_KEY_ID');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(mailKeyId)) throw new ConfigurationError('MAIL_KEY_ID');
  return Object.freeze({ appEnv: mode, appOrigin, databaseUrl: database.toString(), migrationUrl: migration.toString(),
    databaseSchema: database.searchParams.get('schema') ?? 'public', databaseTls: !local,
    poolMax: integer(values.DB_POOL_MAX ?? '10', 'DB_POOL_MAX', 1, 100), mailMode: mailMode as 'capture' | 'smtp',
    smtp: Object.freeze({ host, port, secure, requireTls, user: values.SMTP_USER || undefined,
      password: values.SMTP_PASSWORD || undefined, from }), mailPayloadKey, rateHmacKey, mailKeyId,
    trustedProxy: proxy || false });
}
