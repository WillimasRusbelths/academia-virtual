\set ON_ERROR_STOP on
-- Ejecutar interactivamente con psql -X -W. Nunca incluir contraseñas en argumentos.
-- Abortar ante colisiones; no reutilizar/modificar usuarios ni bases existentes.
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname IN
    ('academia_owner','academia_runtime','academia_v00_owner','academia_v00_runtime'))
    OR EXISTS (SELECT FROM pg_database WHERE datname IN ('academia_dev','academia_v00_test')) THEN
    RAISE EXCEPTION 'Nombre ya existente: detener y revisar; no sobrescribir ni borrar';
  END IF;
END $$;
CREATE ROLE academia_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE academia_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE academia_v00_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE academia_v00_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
\password academia_owner
\password academia_runtime
\password academia_v00_owner
\password academia_v00_runtime
CREATE DATABASE academia_dev OWNER academia_owner;
CREATE DATABASE academia_v00_test OWNER academia_v00_owner;
REVOKE ALL ON DATABASE academia_dev FROM PUBLIC;
REVOKE ALL ON DATABASE academia_v00_test FROM PUBLIC;
GRANT CONNECT ON DATABASE academia_dev TO academia_runtime;
GRANT CONNECT ON DATABASE academia_v00_test TO academia_v00_runtime;
\connect academia_dev
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO academia_owner;
GRANT USAGE ON SCHEMA public TO academia_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE academia_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO academia_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE academia_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO academia_runtime;
\connect academia_v00_test
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO academia_v00_owner;
GRANT USAGE ON SCHEMA public TO academia_v00_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE academia_v00_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO academia_v00_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE academia_v00_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO academia_v00_runtime;
