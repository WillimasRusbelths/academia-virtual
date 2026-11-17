import type { IdentityTestDatabase } from './session-fixture.js';

/** Conserva el TRUNCATE explícito de fixtures anteriores al módulo de matrícula.
 * Solo añade tablas dependientes vacías del mismo esquema aleatorio de pruebas.
 * No usa CASCADE ni borra compromisos financieros para hacer pasar una prueba. */
export async function truncateFixtureTables(context: IdentityTestDatabase, sql: string) {
  const schema = context.isolated.schema;
  if (context.environment.appEnv !== 'test' || !/^t_[a-z0-9_]+$/.test(schema)) {
    throw new Error('Limpieza de fixture fuera de esquema aislado de test.');
  }
  const match = /\bTRUNCATE\s+((?:"[A-Za-z][A-Za-z0-9_]*"\s*,\s*)*"[A-Za-z][A-Za-z0-9_]*")\s*(?=;|$)/.exec(sql);
  if (!match || (sql.match(/\bTRUNCATE\b/g) ?? []).length !== 1) {
    throw new Error('Limpieza de fixture requiere un TRUNCATE explícito sin CASCADE.');
  }
  const requested = [...match[1].matchAll(/"([A-Za-z][A-Za-z0-9_]*)"/g)].map(item => item[1]);
  const { rows } = await context.database.pool.query<{ name: string; schema: string }>(`
    WITH RECURSIVE dependencies(oid) AS (
      SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relname=ANY($2::text[])
      UNION
      SELECT fk.conrelid FROM pg_constraint fk JOIN dependencies d ON fk.confrelid=d.oid
      WHERE fk.contype='f'
    )
    SELECT c.relname AS name,n.nspname AS schema FROM dependencies d
    JOIN pg_class c ON c.oid=d.oid JOIN pg_namespace n ON n.oid=c.relnamespace
    ORDER BY c.relname`, [schema, requested]);
  if (rows.some(row => row.schema !== schema || !/^[A-Za-z][A-Za-z0-9_]*$/.test(row.name)) ||
      requested.some(name => !rows.some(row => row.name === name))) {
    throw new Error('Dependencia de fixture fuera del esquema o tabla ausente.');
  }
  for (const row of rows.filter(row => !requested.includes(row.name))) {
    if ((await context.database.pool.query(`SELECT 1 FROM "${schema}"."${row.name}" LIMIT 1`)).rowCount) {
      throw new Error('La limpieza de fixture no puede descartar filas dependientes.');
    }
  }
  const expanded = 'TRUNCATE ' + rows.map(row => `"${row.name}"`).join(',');
  return context.isolated.ownerQuery(sql.replace(match[0], expanded));
}
