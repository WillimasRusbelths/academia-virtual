\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database()<>'academia_v00_test' OR
    (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM 'identity-load-isolated'
  THEN RAISE EXCEPTION 'Destino de observacion no aislado'; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS load_observation;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA load_observation;
GRANT USAGE ON SCHEMA load_observation TO academia_v00_runtime;
GRANT SELECT ON load_observation.pg_stat_statements,load_observation.pg_stat_statements_info TO academia_v00_runtime;
