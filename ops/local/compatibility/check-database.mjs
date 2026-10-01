import pg from 'pg';
import { probeUrl } from './env.mjs';

// Solo lectura. No imprimir errores del driver, conexiones, contraseñas o resultados arbitrarios.
for (const kind of ['migration', 'runtime']) {
  let client;
  try {
    client = new pg.Client({ connectionString: probeUrl(kind), connectionTimeoutMillis: 5000 });
    await client.connect();
    const { rows: [row] } = await client.query(`
      SELECT current_setting('server_version') AS version,
        current_database() = 'academia_v00_test' AS isolated,
        current_user = $1 AS expected_role,
        rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls,
        has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
        has_database_privilege(current_user, 'academia_dev', 'CONNECT') AS can_dev
      FROM pg_roles WHERE rolname = current_user`,
      [kind === 'migration' ? 'academia_v00_owner' : 'academia_v00_runtime']);
    const good = row?.isolated && row.expected_role && !row.rolsuper && !row.rolcreatedb
      && !row.rolcreaterole && !row.rolreplication && !row.rolbypassrls
      && row.can_create === (kind === 'migration') && !row.can_dev;
    console.log(`${kind}: ${good ? 'conexión y permisos básicos aprobados' : 'permisos inesperados'}; PostgreSQL ${/^\d+(\.\d+)*$/.test(row?.version) ? row.version : '(versión omitida)'}`);
    if (!good) process.exitCode = 1;
  } catch (error) {
    const code = /^[0-9A-Z]{5}$/.test(error.code) ? error.code : 'CONFIG_OR_CONNECTION';
    console.error(`${kind}: comprobación fallida (${code}); detalles privados omitidos.`);
    process.exitCode = 1;
  } finally { if (client) await client.end(); }
}
