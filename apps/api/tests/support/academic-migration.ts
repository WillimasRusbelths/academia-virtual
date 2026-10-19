import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { expect } from 'vitest';
import { loadEnvironment, repositoryRoot } from '../../src/infrastructure/config/environment.js';
import { createDatabase } from '../../src/infrastructure/database/database.js';
import { assertAcademicFixtureInputs } from './academic-offering.js';
import { createIsolatedTestEnvironment } from './test-environment.js';
import type { identityDatabase } from './identity-database.js';

export const identityMigrations = ['0001_identity_users', '0002_identity_access',
  '0003_identity_mail_limits', '0004_identity_argon2_format'];
const migrationRoot = path.join(repositoryRoot(), 'apps/api/prisma/migrations');
export function academicMigrations() {
  return readdirSync(migrationRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()
    && !identityMigrations.includes(entry.name)).map(entry => entry.name).sort();
}

/** Reproduce la actualización de 0001–0004; no genera SQL ni modifica migraciones. */
export async function preAcademicDatabase() {
  assertAcademicFixtureInputs();
  const isolated = await createIsolatedTestEnvironment('academic_upgrade');
  try {
    for (const name of identityMigrations) {
      await isolated.ownerQuery(readFileSync(path.join(migrationRoot, name, 'migration.sql'), 'utf8'));
    }
    const input: NodeJS.ProcessEnv = { ...process.env, APP_ENV: 'test' };
    for (const key of ['TEST_DATABASE_URL', 'TEST_MIGRATION_DATABASE_URL']) {
      const url = new URL(input[key]!); url.searchParams.set('schema', isolated.schema); input[key] = url.toString();
    }
    const environment = loadEnvironment(input);
    const database = createDatabase(environment);
    return { isolated, environment, database,
      async applyAcademic() {
        const names = academicMigrations();
        expect(names.length, 'T008 pendiente: debe existir la migración académica aditiva').toBeGreaterThan(0);
        for (const name of names) await isolated.ownerQuery(readFileSync(path.join(migrationRoot, name, 'migration.sql'), 'utf8'));
      },
      async cleanup() { try { await database.close(); } finally { await isolated.cleanup(); } },
    };
  } catch (error) { await isolated.cleanup(); throw error; }
}
export type MigrationContext = Awaited<ReturnType<typeof identityDatabase>>;

/** No imprime filas, credenciales ni sus huellas; se comparan booleanos en los tests. */
export async function identityFingerprint(pool: Pool) {
  const values: unknown[] = [];
  for (const table of ['User', 'Session', 'ActionToken', 'AuditEvent', 'SystemState', 'MailDelivery', 'RateBucket', 'RateEvent']) {
    const rows = await pool.query(`SELECT to_jsonb(t) ${table === 'User' ? "- 'teacherEligibilityVersion'" : ''} AS item
      FROM "${table}" t ORDER BY to_jsonb(t)::text`);
    values.push([table, rows.rows]);
  }
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

export async function requireAcademicTables(pool: Pool, ...names: string[]) {
  const result = await pool.query<{ table_name: string }>(
    'SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema()');
  for (const name of names) {
    expect(result.rows.map(row => row.table_name), `T007/T008 pendientes: falta ${name} en el esquema exclusivo`).toContain(name);
  }
}
export async function requireGeneration(pool: Pool) {
  const result = await pool.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='User' AND column_name='teacherEligibilityVersion'`);
  expect(result.rowCount, 'T007/T008 pendientes: falta User.teacherEligibilityVersion').toBe(1);
}

/** Lectura compatible con la etapa en rojo: ausencia devuelve null, nunca error 42703. */
export async function teacherState(pool: Pool, id: string) {
  const result = await pool.query<{ generation: string | null; role: string; status: string; verified: boolean; authVersion: string }>(
    `SELECT to_jsonb(u)->>'teacherEligibilityVersion' AS generation,role,status,
      "emailVerifiedAt" IS NOT NULL AS verified,"authVersion" FROM "User" u WHERE id=$1`, [id]);
  expect(result.rowCount, 'La cuenta ficticia debe existir').toBe(1);
  return result.rows[0];
}

/** Filas de fixture, nunca endpoints ni reglas académicas de producto. */
export async function draftGroup(pool: Pool) {
  await requireAcademicTables(pool, 'AcademicCourse', 'AcademicGroup');
  const courseId = randomUUID(); const groupId = randomUUID();
  await pool.query(`INSERT INTO "AcademicCourse" (id,name,description,state,revision,"createdAt","updatedAt")
    VALUES ($1,'Curso ficticio',NULL,'DRAFT',1,clock_timestamp(),clock_timestamp())`, [courseId]);
  await pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,state,"timeZone",revision,"createdAt","updatedAt")
    VALUES ($1,$2,'Grupo ficticio','DRAFT','America/Lima',1,clock_timestamp(),clock_timestamp())`, [groupId, courseId]);
  return { courseId, groupId };
}
