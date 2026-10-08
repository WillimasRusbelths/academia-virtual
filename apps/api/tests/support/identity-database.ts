import { spawnSync } from 'node:child_process';
import { loadEnvironment, repositoryRoot } from '../../src/infrastructure/config/environment.js';
import { createDatabase } from '../../src/infrastructure/database/database.js';
import { createIsolatedTestEnvironment } from './test-environment.js';

export async function identityDatabase(suite: string) {
  const isolated = await createIsolatedTestEnvironment(suite);
  try {
    const input: NodeJS.ProcessEnv = { ...process.env, APP_ENV: 'test' };
    for (const name of ['TEST_DATABASE_URL', 'TEST_MIGRATION_DATABASE_URL']) {
      const url = new URL(input[name]!);
      url.searchParams.set('schema', isolated.schema);
      input[name] = url.toString();
    }
    const result = spawnSync(process.execPath, ['apps/api/scripts/database.mjs', 'deploy'],
      { cwd: repositoryRoot(), env: input, encoding: 'utf8', timeout: 120000 });
    if (result.status !== 0) throw new Error('Migraciones de la suite no completadas. Valores omitidos.');
    const environment = loadEnvironment(input);
    const database = createDatabase(environment);
    return { isolated, environment, database, async cleanup() { await database.close(); await isolated.cleanup(); } };
  } catch (error) { await isolated.cleanup(); throw error; }
}
