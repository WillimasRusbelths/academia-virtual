import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { loadEnvironment, repositoryRoot } from '../../src/infrastructure/config/environment.js';
import { createDatabase } from '../../src/infrastructure/database/database.js';
import { createIsolatedTestEnvironment, type IsolatedTestEnvironment } from '../support/test-environment.js';

let isolated: IsolatedTestEnvironment;
let database: ReturnType<typeof createDatabase>;
const root = repositoryRoot();
const migrationNames = ['0001_identity_users', '0002_identity_access', '0003_identity_mail_limits', '0004_identity_argon2_format'];
// Datos ficticios: formato de hash, no una contraseña ni una credencial funcional.
const hash = `$argon2id$v=19$m=19456,t=2,p=1$${randomBytes(16).toString('base64').replaceAll('=', '')}$${randomBytes(32).toString('base64').replaceAll('=', '')}`;

function testInput(schema: string): NodeJS.ProcessEnv {
  const input: NodeJS.ProcessEnv = { ...process.env, APP_ENV: 'test' };
  for (const key of ['TEST_DATABASE_URL', 'TEST_MIGRATION_DATABASE_URL']) {
    const url = new URL(input[key]!);
    url.searchParams.set('schema', schema);
    input[key] = url.toString();
  }
  return input;
}

function deploy(schema: string) {
  const result = spawnSync(process.execPath, ['apps/api/scripts/database.mjs', 'deploy'],
    { cwd: root, env: testInput(schema), encoding: 'utf8', timeout: 120000 });
  expect(result.status, 'Prisma deploy debe completar las migraciones sin exponer conexiones').toBe(0);
}

beforeAll(async () => {
  isolated = await createIsolatedTestEnvironment('identity_migrations');
  deploy(isolated.schema);
  database = createDatabase(loadEnvironment(testInput(isolated.schema)));
}, 120000);

afterAll(async () => {
  await database?.close();
  await isolated?.cleanup();
});

async function user(overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  const email = `${id}@example.test`;
  const row: Record<string, unknown> = { id, name: 'Alumno ficticio', email, emailCanonical: email,
    role: 'STUDENT', passwordHash: hash, ...overrides };
  const keys = Object.keys(row);
  const sql = `INSERT INTO "User" (${keys.map(key => `"${key}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`;
  return (await database.pool.query(sql, Object.values(row))).rows[0] as { id: string; email: string; createdAt: Date; updatedAt: Date };
}

async function token(userId: string, purpose = 'VERIFY_EMAIL', created = new Date()) {
  const id = randomUUID();
  await database.pool.query(`INSERT INTO "ActionToken" ("id","userId","purpose","tokenHash","emailCanonicalSnapshot","createdAt","expiresAt")
    VALUES ($1,$2,$3,$4,'fixture@example.test',$5,$5::timestamptz + CASE WHEN $3::"TokenPurpose"='VERIFY_EMAIL' THEN interval '24 hours' ELSE interval '30 minutes' END)`,
  [id, userId, purpose, randomBytes(32), created]);
  return id;
}

test('Prisma deploy en esquema vacío crea ocho tablas, cuatro migraciones y singleton sin usuarios', async () => {
  expect(await database.prisma.user.count()).toBe(0);
  const result = await database.pool.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name');
  expect(result.rows.map(row => row.migration_name)).toEqual(migrationNames);
  expect(await database.prisma.systemState.findMany()).toEqual([{ id: 1, bootstrapCompletedAt: null, firstAdminUserId: null }]);
  const tables = await database.pool.query(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema=$1 AND table_name <> '_prisma_migrations'`, [isolated.schema]);
  expect(tables.rows[0].count).toBe(8);
  const privilege = await database.pool.query('SELECT has_schema_privilege(current_user, $1, $2) AS allowed', [isolated.schema, 'CREATE']);
  expect(privilege.rows[0].allowed).toBe(false);
});

test('aplicar SQL incremental sobre copia ficticia conserva usuarios y datos', async () => {
  const copy = await createIsolatedTestEnvironment('identity_copy');
  try {
    const sql = (name: string) => readFileSync(path.join(root, 'apps/api/prisma/migrations', name, 'migration.sql'), 'utf8');
    await copy.ownerQuery(sql(migrationNames[0]));
    await copy.ownerQuery(`INSERT INTO "User" (name,email,"emailCanonical",role,"mustSetPassword","passwordHash") VALUES ('Copia ficticia','copy@example.test','copy@example.test','STUDENT',true,'${hash}')`);
    for (const name of migrationNames.slice(1)) await copy.ownerQuery(sql(name));
    const result = await copy.runtimeQuery<{ name: string }>('SELECT name FROM "User"');
    expect(result.rows).toEqual([{ name: 'Copia ficticia' }]);
    const kept = await copy.runtimeQuery<{ passwordHash: string }>('SELECT "passwordHash" FROM "User"');
    expect(kept.rows[0].passwordHash === hash).toBe(true);
  } finally { await copy.cleanup(); }
});

test('migraciones son idempotentes mediante el historial de Prisma y no reinicializan datos', async () => {
  const account = await user();
  deploy(isolated.schema);
  expect(await database.prisma.user.findUnique({ where: { id: account.id } })).not.toBeNull();
  const result = await database.pool.query('SELECT count(*)::int AS count FROM "_prisma_migrations"');
  expect(result.rows[0].count).toBe(migrationNames.length);
}, 120000); // Incluye arranque de la CLI de Prisma; no mide latencia de la aplicación.

test('restricciones de cuenta: Unicode, trim, correo canónico, enum, versión y credenciales', async () => {
  await user({ name: '🎓'.repeat(100) });
  const accepted = await database.pool.query(`SELECT char_length(name)::int AS size FROM "User" WHERE name=$1`, ['🎓'.repeat(100)]);
  expect(accepted.rows[0].size).toBe(100);
  for (const overrides of [{ name: '' }, { name: '🎓'.repeat(101) }, { name: '\u00a0Alumno' },
    { emailCanonical: 'otro@example.test' }, { email: 'sin-correo' }, { authVersion: -1 },
    { passwordHash: null }, { passwordHash: 'texto-claro' },
    { provisionalPasswordHash: hash }, { provisionalExpiresAt: new Date() },
    { status: 'DISABLED' }, { disabledAt: new Date() }]) {
    await expect(user(overrides)).rejects.toMatchObject({ code: '23514' });
  }
  await expect(user({ role: 'STUDENT,ADMIN' })).rejects.toMatchObject({ code: '22P02' });
  await expect(user({ role: null })).rejects.toMatchObject({ code: '23502' });
});

test('unicidad canónica ante veinte escrituras concurrentes y desactivación sin liberar correo', async () => {
  const email = `${randomUUID()}@example.test`;
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => user({ email, emailCanonical: email })));
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  for (const result of results) if (result.status === 'rejected') expect(result.reason.code).toBe('23505');
  await database.pool.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=CURRENT_TIMESTAMP WHERE "emailCanonical"=$1`, [email]);
  await expect(user({ email, emailCanonical: email })).rejects.toMatchObject({ code: '23505' });
  const kept = await database.pool.query('SELECT "passwordHash" FROM "User" WHERE "emailCanonical"=$1', [email]);
  expect(kept.rows[0].passwordHash).toBe(hash);
});

test('sesiones: huella de 32 bytes, FK, vencimiento exacto y fechas UTC con reloj de BD', async () => {
  const account = await user();
  await database.pool.query(`INSERT INTO "Session" ("tokenHash","userId","authVersion","absoluteExpiresAt") VALUES ($1,$2,0,CURRENT_TIMESTAMP+interval '8 hours')`, [randomBytes(32), account.id]);
  await expect(database.pool.query(`INSERT INTO "Session" ("tokenHash","userId","authVersion","absoluteExpiresAt") VALUES ($1,$2,0,CURRENT_TIMESTAMP+interval '8 hours')`, [randomBytes(31), account.id])).rejects.toMatchObject({ code: '23514' });
  await expect(database.pool.query(`DELETE FROM "User" WHERE id=$1`, [account.id])).rejects.toMatchObject({ code: '23503' });
  await expect(database.pool.query(`INSERT INTO "Session" ("tokenHash","userId","authVersion","absoluteExpiresAt") VALUES ($1,$2,0,CURRENT_TIMESTAMP+interval '7 hours')`, [randomBytes(32), account.id])).rejects.toMatchObject({ code: '23514' });
  const dates = await database.pool.query('SELECT CURRENT_TIMESTAMP AS now, current_setting($1) AS zone', ['timezone']);
  expect(dates.rows[0].zone).toBe('UTC');
  expect(account.createdAt.getTime()).toBeLessThanOrEqual(dates.rows[0].now.getTime());
  await database.pool.query('UPDATE "User" SET name=$1 WHERE id=$2', ['Nombre corregido', account.id]);
  const changed = await database.prisma.user.findUniqueOrThrow({ where: { id: account.id } });
  expect(changed.updatedAt.getTime()).toBeGreaterThanOrEqual(account.updatedAt.getTime());
});

test('índice parcial de tokens no depende de now(): revoca vencido antes de reemitir', async () => {
  const account = await user();
  const first = await token(account.id, 'VERIFY_EMAIL', new Date(Date.now() - 48 * 3600000));
  await expect(token(account.id)).rejects.toMatchObject({ code: '23505' });
  await token(account.id, 'RESET_PASSWORD');
  await database.pool.query('UPDATE "ActionToken" SET "revokedAt"=CURRENT_TIMESTAMP WHERE id=$1', [first]);
  const fresh = await token(account.id);
  await expect(database.pool.query('UPDATE "ActionToken" SET "consumedAt"=CURRENT_TIMESTAMP,"revokedAt"=CURRENT_TIMESTAMP WHERE id=$1', [fresh])).rejects.toMatchObject({ code: '23514' });
  const index = await database.pool.query('SELECT indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname=$2', [isolated.schema, 'ActionToken_one_open_per_purpose']);
  expect(index.rows[0].indexdef).not.toContain('now()');
  expect(index.rows[0].indexdef).toContain('WHERE');
});

test('auditoría y singleton exigen actor/destino válidos y marca permanente de bootstrap', async () => {
  const account = await user({ role: 'ADMIN' });
  await database.pool.query(`INSERT INTO "AuditEvent" ("actorKind","targetUserId",action,result,"requestId") VALUES ('SYSTEM_BOOTSTRAP',$1,'BOOTSTRAP_ADMIN_CREATED','APPLIED',$2)`, [account.id, randomUUID()]);
  await expect(database.pool.query(`INSERT INTO "AuditEvent" ("actorKind","targetUserId",action,result,"requestId") VALUES ('ACCOUNT',$1,'ACCOUNT_CREATED','APPLIED',$2)`, [account.id, randomUUID()])).rejects.toMatchObject({ code: '23514' });
  await expect(database.pool.query(`INSERT INTO "AuditEvent" ("actorKind","targetUserId",action,result,"requestId") VALUES ('SYSTEM_BOOTSTRAP',$1,'BOOTSTRAP_ADMIN_CREATED','APPLIED',$2)`, [randomUUID(), randomUUID()])).rejects.toMatchObject({ code: '23503' });
  await expect(database.pool.query('INSERT INTO "SystemState"(id) VALUES(2)')).rejects.toMatchObject({ code: '23514' });
  await database.pool.query('UPDATE "SystemState" SET "bootstrapCompletedAt"=CURRENT_TIMESTAMP,"firstAdminUserId"=$1 WHERE id=1', [account.id]);
  await expect(database.pool.query('UPDATE "SystemState" SET "bootstrapCompletedAt"=NULL,"firstAdminUserId"=NULL WHERE id=1')).rejects.toMatchObject({ code: '23514' });
  await expect(database.pool.query('DELETE FROM "SystemState"')).rejects.toMatchObject({ code: '23514' });
});

test('correo exige token/payload activo y conserva metadatos terminales al purgar el token', async () => {
  const account = await user();
  const tokenId = await token(account.id);
  const key = randomBytes(32).toString('hex');
  await expect(database.pool.query(`INSERT INTO "MailDelivery" ("tokenId","recipientKey","originKey") VALUES ($1,$2,$2)`, [tokenId, key])).rejects.toMatchObject({ code: '23514' });
  const created = await database.pool.query(`INSERT INTO "MailDelivery" ("tokenId","recipientKey","originKey","encryptedPayload",nonce,"authTag","keyId") VALUES($1,$2,$2,$3,$4,$5,'test-v1') RETURNING id`, [tokenId, key, randomBytes(20), randomBytes(12), randomBytes(16)]);
  await expect(database.pool.query('DELETE FROM "ActionToken" WHERE id=$1', [tokenId])).rejects.toMatchObject({ code: '23514' });
  await expect(database.pool.query('UPDATE "MailDelivery" SET attempts=4 WHERE id=$1', [created.rows[0].id])).rejects.toMatchObject({ code: '23514' });
  await database.pool.query(`UPDATE "MailDelivery" SET status='CANCELLED',"finishedAt"=CURRENT_TIMESTAMP,"encryptedPayload"=NULL,nonce=NULL,"authTag"=NULL,"keyId"=NULL WHERE id=$1`, [created.rows[0].id]);
  await database.pool.query('DELETE FROM "ActionToken" WHERE id=$1', [tokenId]);
  const metadata = await database.prisma.mailDelivery.findUniqueOrThrow({ where: { id: created.rows[0].id } });
  expect(metadata.tokenId).toBeNull();
  expect(metadata.encryptedPayload).toBeNull();
  expect(metadata.status).toBe('CANCELLED');
});

test('límites: claves HMAC, fases válidas, reservas de 30 s y FK sin cascada', async () => {
  const key = randomBytes(32).toString('hex');
  await database.pool.query(`INSERT INTO "RateBucket"(key,scope,phase) VALUES($1,'LOGIN_PAIR','ADMISSION')`, [key]);
  await database.pool.query(`INSERT INTO "RateEvent"("bucketKey",status,"reservationExpiresAt") VALUES($1,'RESERVED',CURRENT_TIMESTAMP+interval '30 seconds')`, [key]);
  await expect(database.pool.query(`INSERT INTO "RateBucket"(key,scope,phase) VALUES($1,'LOGIN_PAIR','SMTP')`, [randomBytes(32).toString('hex')])).rejects.toMatchObject({ code: '23514' });
  await expect(database.pool.query(`INSERT INTO "RateEvent"("bucketKey",status) VALUES($1,'RESERVED')`, [key])).rejects.toMatchObject({ code: '23514' });
  await expect(database.pool.query('DELETE FROM "RateBucket" WHERE key=$1', [key])).rejects.toMatchObject({ code: '23503' });
});

test('Prisma usa el pool restringido y revierte escritura de cuenta/auditoría en el mismo commit', async () => {
  const id = randomUUID();
  await expect(database.prisma.$transaction(async transaction => {
    await transaction.user.create({ data: { id, name: 'Rollback ficticio', email: `${id}@example.test`,
      emailCanonical: `${id}@example.test`, role: 'ADMIN', mustSetPassword: true } });
    await transaction.auditEvent.create({ data: { actorKind: 'SYSTEM_BOOTSTRAP', targetUserId: id,
      action: 'BOOTSTRAP_ADMIN_CREATED', result: 'APPLIED', requestId: randomUUID() } });
    throw new Error('Rollback esperado');
  })).rejects.toThrow('Rollback esperado');
  expect(await database.prisma.user.findUnique({ where: { id } })).toBeNull();
  expect(await database.prisma.auditEvent.count({ where: { targetUserId: id } })).toBe(0);
});
