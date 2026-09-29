import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
export function probeUrl(kind = 'runtime') {
  if (!['runtime', 'migration'].includes(kind)) throw new Error('Tipo de conexión no permitido.');
  const file = fileURLToPath(new URL('../../../.env.test', import.meta.url));
  let values;
  try { values = parseEnv(readFileSync(file, 'utf8')); }
  catch { throw new Error('Falta .env.test local: consultar ops/local/native.md, sin publicar credenciales.'); }
  const key = kind === 'migration' ? 'PROBE_MIGRATION_URL' : 'PROBE_DATABASE_URL';
  let url;
  try { url = new URL(values[key]); } catch { throw new Error(`${key} no configurada correctamente; valor omitido.`); }
  const expected = kind === 'migration' ? 'academia_v00_owner' : 'academia_v00_runtime';
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '5432'
      || url.pathname !== '/academia_v00_test' || url.username !== expected || !url.password
      || url.search || url.hash) throw new Error('Conexión de prueba rechazada: exige rol exclusivo, loopback y academia_v00_test sin parámetros adicionales.');
  return url.toString();
}
