import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const command = process.argv[2];
const commands = { generate: ['generate'], deploy: ['migrate', 'deploy'], dev: ['migrate', 'dev', '--create-only'] };
if (!Object.hasOwn(commands, command) || process.argv.length !== 3
    || (command === 'dev' && process.env.APP_ENV !== 'development')) {
  console.error('Comando de migración no permitido. No se ejecutó ninguna operación.');
  process.exitCode = 1;
} else {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...commands[command],
    '--config', 'apps/api/prisma.config.ts'], { cwd: root, env: process.env, encoding: 'utf8', timeout: 120000 });
  // La CLI puede incluir conexiones en errores; nunca propagar su salida bruta.
  if (result.status !== 0) {
    console.error('Operación de Prisma no aprobada. Revisar configuración y SQL localmente; valores omitidos.');
    process.exitCode = 1;
  } else console.log(`Prisma ${command}: operación completada.`);
}
