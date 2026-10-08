import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// Crear configuración privada nueva; jamás sobrescribir configuración previa.
let text = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
for (const name of ['POSTGRES_PASSWORD', 'ACADEMIA_OWNER_PASSWORD', 'ACADEMIA_RUNTIME_PASSWORD',
  'PROBE_OWNER_PASSWORD', 'PROBE_RUNTIME_PASSWORD']) {
  text = text.replace(new RegExp(`^${name}=$`, 'm'), `${name}=${randomBytes(32).toString('hex')}`);
}
writeFileSync(new URL('../../.env', import.meta.url), text, { flag: 'wx', mode: 0o600 });
console.log('Configuración privada .env creada; valores omitidos.');
