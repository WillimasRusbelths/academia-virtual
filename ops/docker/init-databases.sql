\set ON_ERROR_STOP on
-- Solo se ejecuta al inicializar un volumen nuevo de PostgreSQL.
-- Las claves vienen de .env mediante Compose y nunca se imprimen.
\getenv owner_password ACADEMIA_OWNER_PASSWORD
\getenv runtime_password ACADEMIA_RUNTIME_PASSWORD
\getenv probe_owner_password PROBE_OWNER_PASSWORD
\getenv probe_runtime_password PROBE_RUNTIME_PASSWORD
CREATE ROLE academia_owner LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE academia_runtime LOGIN PASSWORD :'runtime_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE academia_v00_owner LOGIN PASSWORD :'probe_owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE academia_v00_runtime LOGIN PASSWORD :'probe_runtime_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
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
