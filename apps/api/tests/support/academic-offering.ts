import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { loadEnvironment } from '../../src/infrastructure/config/environment.js';
import type { Role } from '../../src/modules/users/public/account.js';
import { probeUrl } from '../../../../ops/local/compatibility/env.mjs';
import { identityDatabase } from './identity-database.js';
import { assertFixtureEnvironment, createIdentityFixtures, readFixtureManifest } from './identity-fixtures.js';
import type { FixtureAccount } from './identity-fixtures.js';
import { sessionFixture } from './session-fixture.js';

/** Rechazar desarrollo/manual antes incluso de crear el esquema de prueba. */
export function assertAcademicFixtureInputs(input: NodeJS.ProcessEnv = process.env) {
  if (input.APP_ENV !== 'test') throw new Error('Fixtures académicas: se exige APP_ENV=test. Valores omitidos.');
  const environment = loadEnvironment(input);
  assertFixtureEnvironment(environment);
  if (environment.databaseSchema !== 'public' || environment.databaseUrl !== probeUrl('runtime')
    || environment.migrationUrl !== probeUrl('migration')) {
    throw new Error('Fixtures académicas: destino de prueba no permitido. Valores omitidos.');
  }
}

/** Solo identidad sintética. Cursos/grupos se prepararán cuando exista su migración. */
export async function academicOfferingDataset(suite = 'academic_offering') {
  assertAcademicFixtureInputs();
  const context = await identityDatabase(suite);
  let directory: string | undefined;
  let observer: Pool | undefined;
  try {
    directory = mkdtempSync(path.join(tmpdir(), 'academic-offering-private-'));
    const created = await createIdentityFixtures(context.environment, context.database.pool, directory);
    const manifest = readFixtureManifest(context.environment, created.runId, directory);
    const secondAdmin = await sessionFixture(context, 'ADMIN');
    const otherTeacher = await sessionFixture(context, 'TEACHER');
    const observerUrl = new URL(context.environment.databaseUrl);
    observerUrl.searchParams.delete('schema');
    // Pool independiente: la observación nunca espera una conexión retenida por el escritor.
    observer = new Pool({ connectionString: observerUrl.toString(), max: 2,
      connectionTimeoutMillis: 5000, options: `-c search_path=${context.isolated.schema} -c timezone=UTC` });
    observer.on('error', () => console.error('Observador de prueba interrumpido. Valores omitidos.'));
    const observerPool = observer;
    const privateDirectory = directory;
    let closed = false;
    return {
      context, observerPool, secondAdmin, otherTeacher,
      account(role: Role = 'STUDENT', variant: FixtureAccount['variant'] = 'ENABLED'): FixtureAccount {
        const account = manifest.accounts.find(value => value.role === role && value.variant === variant);
        if (!account) throw new Error('Cuenta ficticia no disponible.');
        return account;
      },
      async cleanup() {
        if (closed) return;
        closed = true;
        try { await observerPool.end(); } finally {
          try { await context.cleanup(); } finally { rmSync(privateDirectory, { recursive: true, force: true }); }
        }
      },
    };
  } catch {
    try { await observer?.end(); } finally {
      try { await context.cleanup(); } finally { if (directory) rmSync(directory, { recursive: true, force: true }); }
    }
    throw new Error('Preparación de fixtures académicas fallida. Valores omitidos.');
  }
}
export type AcademicOfferingDataset = Awaited<ReturnType<typeof academicOfferingDataset>>;
