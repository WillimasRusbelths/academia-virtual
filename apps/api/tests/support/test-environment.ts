import { randomBytes } from 'node:crypto';
import { Client, type QueryResult } from 'pg';
import { probeUrl } from '../../../../ops/local/compatibility/env.mjs';

const safeIdentifier = /^[a-z][a-z0-9_]{0,62}$/;

function quoteIdentifier(value: string) {
  if (!safeIdentifier.test(value)) throw new Error('Identificador de prueba no permitido.');
  return `"${value}"`;
}

export interface IsolatedTestEnvironment {
  readonly schema: string;
  ownerQuery<T extends Record<string, unknown>>(text: string): Promise<QueryResult<T>>;
  runtimeQuery<T extends Record<string, unknown>>(text: string): Promise<QueryResult<T>>;
  cleanup(): Promise<void>;
}

export async function createIsolatedTestEnvironment(suite: string): Promise<IsolatedTestEnvironment> {
  const slug = suite.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replaceAll(/^_+|_+$/g, '').slice(0, 24) || 'suite';
  const schema = `t_${slug}_${randomBytes(6).toString('hex')}`;
  const quoted = quoteIdentifier(schema);
  const ownerBaseUrl = probeUrl('migration');
  const runtimeBaseUrl = probeUrl('runtime');
  const owner = new Client({ connectionString: ownerBaseUrl, connectionTimeoutMillis: 5000 });
  await owner.connect();
  try {
    await owner.query('BEGIN');
    await owner.query(`CREATE SCHEMA ${quoted} AUTHORIZATION academia_v00_owner`);
    await owner.query(`GRANT USAGE ON SCHEMA ${quoted} TO academia_v00_runtime`);
    await owner.query(`ALTER DEFAULT PRIVILEGES FOR ROLE academia_v00_owner IN SCHEMA ${quoted}
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO academia_v00_runtime`);
    await owner.query(`ALTER DEFAULT PRIVILEGES FOR ROLE academia_v00_owner IN SCHEMA ${quoted}
      GRANT USAGE, SELECT ON SEQUENCES TO academia_v00_runtime`);
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await owner.end();
  }

  let cleaned = false;
  async function query<T extends Record<string, unknown>>(
    connectionString: string,
    text: string,
    options?: string,
  ) {
    const client = new Client({ connectionString, connectionTimeoutMillis: 5000, options });
    try {
      await client.connect();
      return await client.query<T>(text);
    } finally {
      await client.end();
    }
  }

  return {
    schema,
    ownerQuery: (text) => query(ownerBaseUrl, `SET search_path TO ${quoted}; ${text}`),
    runtimeQuery: (text) => query(runtimeBaseUrl, text, `-c search_path=${schema}`),
    async cleanup() {
      if (cleaned) return;
      if (!schema.startsWith('t_')) throw new Error('Limpieza rechazada por guarda de esquema.');
      const cleanup = new Client({ connectionString: ownerBaseUrl, connectionTimeoutMillis: 5000 });
      try {
        await cleanup.connect();
        await cleanup.query(`DROP SCHEMA ${quoted} CASCADE`);
        cleaned = true;
      } finally {
        await cleanup.end();
      }
    },
  };
}
