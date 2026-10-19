import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnvironment } from '../infrastructure/config/environment.js';
import { createDatabase } from '../infrastructure/database/database.js';
import { assertFixtureEnvironment, cleanupIdentityFixtures, createIdentityFixtures, FixtureSafetyError } from '../infrastructure/testing/identity-fixtures.js';

export async function runFixtureCli(args: string[], input: NodeJS.ProcessEnv = process.env): Promise<void> {
  const create = args.length===1 && args[0]==='create';
  const cleanup = args.length===2 && args[0]==='cleanup' && /^[a-f0-9-]{36}$/.test(args[1]);
  if ((!create && !cleanup) || input.APP_ENV!=='test') throw new FixtureSafetyError();
  const environment = loadEnvironment(input);
  assertFixtureEnvironment(environment);
  const database = createDatabase(environment);
  try {
    if (create) {
      const result = await createIdentityFixtures(environment,database.pool);
      process.stdout.write(`Fixtures de prueba creados: ${result.runId}. Manifiesto privado en apps/api/.secrets/identity-fixtures/${result.runId}.json\n`);
    } else {
      const result = await cleanupIdentityFixtures(environment,database.pool,args[1]);
      process.stdout.write(`Limpieza dirigida de fixtures: ${result.runId}; cuentas eliminadas: ${result.removed}.\n`);
    }
  } finally { await database.close(); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  runFixtureCli(process.argv.slice(2)).catch(() => {
    process.stderr.write('No se completó la operación de fixtures. Revisar entorno de prueba y manifiesto privado. Valores omitidos.\n');
    process.exitCode = 1;
  });
}
