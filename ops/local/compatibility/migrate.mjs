import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { probeUrl } from './env.mjs';
try {
  const url = probeUrl('migration');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy',
    '--config', 'ops/local/compatibility/prisma.config.ts'], {
    cwd: root, env: { ...process.env, PROBE_MIGRATION_URL: url }, encoding: 'utf8'
  });
  // Prisma puede incluir detalles de conexión; no reenviar salida bruta.
  if (result.status !== 0) throw new Error('Migración no aprobada; revisar localmente conexión/rol/schema sin compartir secretos.');
  console.log('Migración de ensayo aplicada a academia_v00_test.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
