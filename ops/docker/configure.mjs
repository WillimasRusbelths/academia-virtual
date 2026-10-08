import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const identityKeys = ['MAIL_PAYLOAD_KEY', 'RATE_HMAC_KEY', 'TEST_MAIL_PAYLOAD_KEY', 'TEST_RATE_HMAC_KEY'];
if (process.argv.length === 3 && process.argv[2] === '--identity-keys') {
  const location = new URL('../../.env', import.meta.url);
  const existing = readFileSync(location, 'utf8');
  const values = parseEnv(existing);
  const missing = identityKeys.filter(name => !values[name]);
  // No cambiar contraseñas, puertos o claves existentes de un volumen persistente.
  let updated = existing;
  for (const name of missing) {
    const entry = `${name}=${randomBytes(32).toString('base64')}`;
    const line = new RegExp(`^${name}=[^\\r\\n]*\\r?$`, 'm');
    updated = line.test(updated) ? updated.replace(line, entry) : `${updated}\n${entry}\n`;
  }
  if (missing.length) writeFileSync(location, updated, { mode: 0o600 });
  console.log(`Configuración privada: ${missing.length} claves de identidad añadidas; valores omitidos.`);
  process.exit(0);
}
if (process.argv.length !== 2) throw new Error('Opción de configuración no permitida.');

// Crear configuración privada nueva; jamás sobrescribir configuración previa.
let text = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
for (const name of ['POSTGRES_PASSWORD', 'ACADEMIA_OWNER_PASSWORD', 'ACADEMIA_RUNTIME_PASSWORD',
  'PROBE_OWNER_PASSWORD', 'PROBE_RUNTIME_PASSWORD']) {
  text = text.replace(new RegExp(`^${name}=$`, 'm'), `${name}=${randomBytes(32).toString('hex')}`);
}
for (const name of identityKeys) {
  text = text.replace(new RegExp(`^${name}=$`, 'm'), `${name}=${randomBytes(32).toString('base64')}`);
}
writeFileSync(new URL('../../.env', import.meta.url), text, { flag: 'wx', mode: 0o600 });
console.log('Configuración privada .env creada; valores omitidos.');
