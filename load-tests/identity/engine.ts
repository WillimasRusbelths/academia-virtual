import type { Pool } from 'pg';

/** Solo cantidades agregadas: no exportar query, queryid, parámetros, filas ni identidades. */
export async function engineSnapshot(pool:Pool):Promise<Record<string,unknown>> {
  const settings=(await pool.query(`SELECT current_setting('track_io_timing') AS io,current_setting('track_wal_io_timing') AS wal,
    current_setting('pg_stat_statements.track_planning',true) AS planning,
    EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements') AS installed`)).rows[0];
  // La consulta efectiva a la extensión verifica su preload; el runtime no tiene
  // permiso para leer shared_preload_libraries y no se amplían sus roles.
  if(!settings.installed||settings.io!=='on'||settings.wal!=='on'||settings.planning!=='on')throw new Error('Instrumentación de motor no preparada.');
  const result=(await pool.query(`SELECT json_build_object('at',clock_timestamp(),
    'statementsInfo',(SELECT row_to_json(i) FROM load_observation.pg_stat_statements_info i),
    'database',(SELECT to_jsonb(d)-'datid'-'datname' FROM pg_stat_database d WHERE datname=current_database()),
    'wal',(SELECT row_to_json(w) FROM pg_stat_wal w),
    'io',(SELECT json_agg(row_to_json(i)) FROM pg_stat_io i),
    'waits',(SELECT json_agg(w) FROM (SELECT state,wait_event_type,wait_event,count(*)::int AS count
      FROM pg_stat_activity WHERE datname=current_database() GROUP BY state,wait_event_type,wait_event) w),
    'statements',(SELECT json_agg(q) FROM (SELECT CASE
      WHEN query LIKE '%count(DISTINCT%' THEN 'OBSERVER'
      WHEN query LIKE '%json_build_object%' AND query LIKE '%"Session" s%' THEN 'SNAPSHOT'
      WHEN query LIKE '%FOR UPDATE%' AND query LIKE '%locked_user%' THEN 'LOCK_BOTH'
      WHEN query LIKE '%FOR UPDATE%' AND query LIKE '%FROM "User"%' THEN 'LOCK_USER'
      WHEN query LIKE '%FOR UPDATE%' AND query LIKE '%FROM "Session"%' THEN 'LOCK_SESSION'
      WHEN query LIKE 'UPDATE "Session" SET "lastAcceptedAt"%' THEN 'ACCEPT'
      WHEN query LIKE '%sessionVersion%' AND query LIKE '%sessionCreatedAt%' THEN 'OWN_PROFILE'
      WHEN query IN ('BEGIN','COMMIT','ROLLBACK') THEN query
      ELSE 'OTHER' END AS kind,
      sum(calls)::float8 AS calls,sum(plans)::float8 AS plans,
      sum(total_exec_time)::float8 AS "executionMs",sum(total_plan_time)::float8 AS "planningMs",
      max(max_exec_time)::float8 AS "maxExecutionMs",sum(rows)::float8 AS rows,
      sum(shared_blks_hit)::float8 AS hits,sum(shared_blks_read)::float8 AS reads,
      sum(blk_read_time)::float8 AS "readMs",sum(blk_write_time)::float8 AS "writeMs",
      sum(wal_bytes)::float8 AS "walBytes",sum(temp_blks_written)::float8 AS "tempBlocks"
      FROM load_observation.pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND userid=(SELECT oid FROM pg_roles WHERE rolname=current_user)
      AND query NOT LIKE '%pg_stat_%' AND query NOT LIKE '%pg_extension%' GROUP BY 1) q)) AS sample`)).rows[0].sample;
  return {settings,...result};
}
