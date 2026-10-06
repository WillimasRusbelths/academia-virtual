export function probeUrl(kind = 'runtime') {
  if (!['runtime', 'migration'].includes(kind)) throw new Error('Tipo de conexión no permitido.');
  const key = kind === 'migration' ? 'PROBE_MIGRATION_URL' : 'PROBE_DATABASE_URL';
  let url;
  try { url = new URL(process.env[key]); } catch { throw new Error(`${key} no configurada por Compose; consultar ops/docker/README.md. Valor omitido.`); }
  const expected = kind === 'migration' ? 'academia_v00_owner' : 'academia_v00_runtime';
  if (url.protocol !== 'postgresql:' || url.hostname !== 'db' || url.port !== '5432'
      || url.pathname !== '/academia_v00_test' || url.username !== expected || !url.password
      || url.search || url.hash) throw new Error('Conexión de prueba rechazada: exige rol exclusivo, db:5432 y academia_v00_test sin parámetros adicionales.');
  return url.toString();
}
