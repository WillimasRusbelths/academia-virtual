import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
if (process.platform !== 'linux') throw new Error('Solo para Linux remoto; no ejecutar en Windows.');
const dir = fileURLToPath(new URL('../../.cache/v00-linux/', import.meta.url));
if (existsSync(new URL('../../.env.test', import.meta.url))) {
  throw new Error('El checkout ya tiene configuración privada. Usar un checkout nuevo sin copiar .env locales.');
}
mkdirSync(dir, { recursive: true, mode: 0o700 });
writeFileSync(`${dir}/postgres-password`, randomBytes(32).toString('hex'), {flag:'wx',mode:0o600});
console.log('Secreto nuevo creado en caché privada; valor omitido. No se han iniciado servicios.');
