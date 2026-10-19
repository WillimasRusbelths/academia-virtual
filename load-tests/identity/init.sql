\set ON_ERROR_STOP on
\getenv owner_password PROBE_OWNER_PASSWORD
\getenv runtime_password PROBE_RUNTIME_PASSWORD
CREATE ROLE academia_v00_owner LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE academia_v00_runtime LOGIN PASSWORD :'runtime_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE DATABASE academia_v00_test OWNER academia_v00_owner;
REVOKE ALL ON DATABASE academia_v00_test FROM PUBLIC;
GRANT CONNECT ON DATABASE academia_v00_test TO academia_v00_runtime;
COMMENT ON DATABASE academia_v00_test IS 'identity-load-isolated';
\connect academia_v00_test
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA t_load_identity AUTHORIZATION academia_v00_owner;
GRANT USAGE ON SCHEMA t_load_identity TO academia_v00_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE academia_v00_owner IN SCHEMA t_load_identity GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO academia_v00_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE academia_v00_owner IN SCHEMA t_load_identity GRANT USAGE,SELECT ON SEQUENCES TO academia_v00_runtime;
