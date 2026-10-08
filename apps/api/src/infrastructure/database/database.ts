import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/identity/client.js';
import { loadEnvironment, type Environment } from '../config/environment.js';

/** Un pool por aplicación; sin reglas de identidad ni credenciales en los errores públicos. */
export function createDatabase(environment: Environment = loadEnvironment()) {
  const url = new URL(environment.databaseUrl);
  url.searchParams.delete('schema');
  const pool = new Pool({ connectionString: url.toString(), max: environment.poolMax,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    options: `-c search_path=${environment.databaseSchema} -c timezone=UTC`,
    ...(environment.databaseTls ? { ssl: { rejectUnauthorized: true } } : {}) });
  pool.on('error', () => console.error('Conexión de base de datos interrumpida. Detalles omitidos.'));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: environment.databaseSchema }), log: [] });
  let closed = false;
  return { prisma, pool, async close() {
    if (closed) return;
    closed = true;
    try { await prisma.$disconnect(); } finally { await pool.end(); }
  } };
}
