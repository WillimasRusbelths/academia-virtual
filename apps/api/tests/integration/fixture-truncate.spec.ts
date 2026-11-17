import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import { sessionFixture } from '../support/session-fixture.js';
import { truncateFixtureTables } from '../support/fixture-truncate.js';

test('FT01 limpia oferta con referencias financieras vacías y conserva coordinadoras', async () => {
  const context = await identityDatabase('fixture_truncate_empty');
  try {
    const pool = context.database.pool;
    const before = (await pool.query('SELECT to_jsonb(s) AS value FROM "AdmissionSequence" s')).rows;
    await pool.query('INSERT INTO "AcademicCourse" (id,name,description) VALUES ($1,$2,$3)', [randomUUID(),'Curso ficticio','Prueba de aislamiento']);
    await truncateFixtureTables(context, 'TRUNCATE "AcademicSlot","AcademicGroup","AcademicCourse"');
    expect((await pool.query('SELECT 1 FROM "AcademicCourse"')).rowCount).toBe(0);
    expect((await pool.query('SELECT to_jsonb(s) AS value FROM "AdmissionSequence" s')).rows).toEqual(before);
    expect((await pool.query('SELECT 1 FROM "DispatchState"')).rowCount).toBe(1);
  } finally { await context.cleanup(); }
}, 120000);

test('FT02 rechaza descartar una referencia financiera con filas y conserva ambas tablas', async () => {
  const context = await identityDatabase('fixture_truncate_rows');
  try {
    const admin = await sessionFixture(context, 'ADMIN'), course = randomUUID(), pool = context.database.pool;
    await pool.query('INSERT INTO "AcademicCourse" (id,name,description) VALUES ($1,$2,$3)', [course,'Curso ficticio','Prueba de preservación']);
    await pool.query('INSERT INTO "CoursePrice" ("courseId","amountMinor",currency,revision,"changedBy") VALUES ($1,12500,\'PEN\',1,$2)', [course,admin.userId]);
    await expect(truncateFixtureTables(context, 'TRUNCATE "AcademicSlot","AcademicGroup","AcademicCourse"')).rejects.toThrow('no puede descartar filas dependientes');
    expect((await pool.query('SELECT id FROM "AcademicCourse"')).rows).toEqual([{id:course}]);
    expect((await pool.query('SELECT "amountMinor"::text AS amount FROM "CoursePrice"')).rows).toEqual([{amount:'12500'}]);
  } finally { await context.cleanup(); }
}, 120000);

test('FT03 rechaza CASCADE y entornos ajenos antes de ejecutar limpieza', async () => {
  const context = await identityDatabase('fixture_truncate_guards');
  try {
    await expect(truncateFixtureTables(context, 'TRUNCATE "AcademicCourse" CASCADE')).rejects.toThrow('TRUNCATE explícito sin CASCADE');
    await expect(truncateFixtureTables({...context,environment:{...context.environment,appEnv:'production'}}, 'TRUNCATE "AcademicCourse"')).rejects.toThrow('fuera de esquema aislado');
    expect((await context.database.pool.query('SELECT 1 FROM "SystemState"')).rowCount).toBe(1);
  } finally { await context.cleanup(); }
}, 120000);
