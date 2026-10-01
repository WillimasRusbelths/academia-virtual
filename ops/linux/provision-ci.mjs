import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';

if (process.platform !== 'linux') throw new Error('Aprovisionamiento efímero solo permitido en Linux.');
if (existsSync('.env.test')) throw new Error('Se encontró .env.test previo; usar checkout efímero limpio.');

const adminPassword = readFileSync('.cache/v00-linux/postgres-password', 'utf8').trim();
if (!/^[a-f0-9]{64}$/.test(adminPassword)) throw new Error('Secreto postgres efímero inválido.');

const roles = {
  academia_owner: randomBytes(32).toString('hex'),
  academia_runtime: randomBytes(32).toString('hex'),
  academia_v00_owner: randomBytes(32).toString('hex'),
  academia_v00_runtime: randomBytes(32).toString('hex'),
};
const quoteLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
const adminConfig = { host: '127.0.0.1', port: 5432, user: 'postgres', password: adminPassword, database: 'postgres' };

async function withClient(config, action) {
  const client = new pg.Client({ ...config, connectionTimeoutMillis: 5000 });
  try { await client.connect(); return await action(client); }
  finally { await client.end(); }
}

async function main() {
  await withClient(adminConfig, async (client) => {
    const collision = await client.query(`SELECT EXISTS (
      SELECT FROM pg_roles WHERE rolname = ANY($1::text[])
    ) OR EXISTS (
      SELECT FROM pg_database WHERE datname = ANY($2::text[])
    ) AS found`, [Object.keys(roles), ['academia_dev', 'academia_v00_test']]);
    if (collision.rows[0]?.found) throw new Error('Colisión en el entorno efímero; abortar sin sobrescribir.');
    for (const [role, password] of Object.entries(roles)) {
      if (!/^[a-z0-9_]+$/.test(role)) throw new Error('Rol no permitido.');
      await client.query(`CREATE ROLE ${role} LOGIN PASSWORD ${quoteLiteral(password)}
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    }
    await client.query('CREATE DATABASE academia_dev OWNER academia_owner');
    await client.query('CREATE DATABASE academia_v00_test OWNER academia_v00_owner');
    await client.query('REVOKE ALL ON DATABASE academia_dev FROM PUBLIC');
    await client.query('REVOKE ALL ON DATABASE academia_v00_test FROM PUBLIC');
    await client.query('GRANT CONNECT ON DATABASE academia_dev TO academia_runtime');
    await client.query('GRANT CONNECT ON DATABASE academia_v00_test TO academia_v00_runtime');
  });

  for (const [database, owner, runtime] of [
    ['academia_dev', 'academia_owner', 'academia_runtime'],
    ['academia_v00_test', 'academia_v00_owner', 'academia_v00_runtime'],
  ]) {
    await withClient({ ...adminConfig, database }, async (client) => {
      await client.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
      await client.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${owner}`);
      await client.query(`GRANT USAGE ON SCHEMA public TO ${runtime}`);
      await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${runtime}`);
      await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO ${runtime}`);
    });
  }

  const ownerUrl = new URL('postgresql://127.0.0.1:5432/academia_v00_test');
  ownerUrl.username = 'academia_v00_owner';
  ownerUrl.password = roles.academia_v00_owner;
  const runtimeUrl = new URL('postgresql://127.0.0.1:5432/academia_v00_test');
  runtimeUrl.username = 'academia_v00_runtime';
  runtimeUrl.password = roles.academia_v00_runtime;
  writeFileSync('.env.test', `PROBE_MIGRATION_URL=${ownerUrl}\nPROBE_DATABASE_URL=${runtimeUrl}\n`, { flag: 'wx', mode: 0o600 });
  chmodSync('.env.test', 0o600);
  console.log('Roles, bases y configuración efímera creados; valores privados omitidos.');
}

main().catch((error) => {
  const code = /^[0-9A-Z]{5}$/.test(error?.code) ? error.code : 'PROVISION_FAILED';
  console.error(`Aprovisionamiento Linux falló (${code}); detalles privados omitidos.`);
  process.exitCode = 1;
});
