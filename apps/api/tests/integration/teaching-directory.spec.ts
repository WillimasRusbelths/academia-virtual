import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { PostgresTeachingDirectory } from '../../src/modules/users/infrastructure/teaching-directory.js';
import { TeachingDirectoryInvalid, TeachingDirectoryUnavailable } from '../../src/modules/users/public/teaching-directory.js';

let dataset: AcademicOfferingDataset;
let directory: PostgresTeachingDirectory;
beforeAll(async () => {
  dataset = await academicOfferingDataset('academic_directory');
  directory = new PostgresTeachingDirectory(dataset.context.database.pool);
  // La fixture provisional genérica aún no está verificada. Completar solo esa
  // condición para demostrar que mustSetPassword no decide elegibilidad académica.
  await dataset.context.database.pool.query('UPDATE "User" SET "emailVerifiedAt"=clock_timestamp() WHERE id=$1',
    [dataset.account('TEACHER', 'PROVISIONAL').id]);
}, 120000);
afterAll(async () => { await dataset?.cleanup(); });

test('D01 find proyecta solo cuatro campos y bigint, incluso cuenta no elegible', async () => {
  const account = dataset.account('TEACHER', 'DISABLED');
  const result = await directory.find(account.id);
  expect(result).toEqual({ userId: account.id, name: account.name, eligible: false, eligibilityVersion: 0n });
  expect(Object.keys(result!).sort()).toEqual(['eligible', 'eligibilityVersion', 'name', 'userId'].sort());
  expect(await directory.find(randomUUID())).toBeNull();
});

test('D02 selector excluye otros roles, deshabilitados y no verificados; provisional no es condición académica', async () => {
  const provisional = await dataset.context.database.pool.query<{ mustSetPassword: boolean; verified: boolean }>(
    `SELECT "mustSetPassword","emailVerifiedAt" IS NOT NULL AS verified FROM "User" WHERE id=$1`,
    [dataset.account('TEACHER', 'PROVISIONAL').id]);
  expect(provisional.rows[0]).toEqual({ mustSetPassword: true, verified: true });
  const result = await directory.listEligible({});
  const eligible = [dataset.account('TEACHER', 'ENABLED').id,
    dataset.account('TEACHER', 'PROVISIONAL').id, dataset.otherTeacher.userId];
  expect(result.items.map(row => row.userId).sort()).toEqual(eligible.sort());
  expect(result.total).toBe(3); expect(result.page).toBe(1); expect(result.pageSize).toBe(20);
  for (const item of result.items) expect(Object.keys(item).sort()).toEqual(['name', 'userId']);
  const ordered = await dataset.context.database.pool.query<{ userId: string }>(
    `SELECT "userId" FROM "AcademicTeacherDirectory" WHERE eligible ORDER BY name,"userId"`);
  expect(result.items.map(row => row.userId)).toEqual(ordered.rows.map(row => row.userId));
  const pages = await Promise.all([1, 2, 3].map(page => directory.listEligible({ page, pageSize: 1 })));
  expect(pages.flatMap(page => page.items)).toEqual(result.items);
  expect(pages.map(page => page.total)).toEqual([3, 3, 3]);
  expect(await directory.listEligible({ page: 99 })).toEqual({ items: [], page: 99, pageSize: 20, total: 3 });
});

test('D03 búsqueda parametrizada por nombre, sin email, comodines literales y conteo filtrado', async () => {
  const id = dataset.otherTeacher.userId;
  await dataset.context.database.pool.query('UPDATE "User" SET name=$2 WHERE id=$1', [id, 'Docente %_\\ de Ensayo']);
  try {
    const found = await directory.listEligible({ q: '  DOCENTE %_\\  ', pageSize: 1 });
    expect(found.items).toEqual([{ userId: id, name: 'Docente %_\\ de Ensayo' }]); expect(found.total).toBe(1);
    expect((await directory.listEligible({ q: dataset.account('TEACHER', 'ENABLED').email })).items).toEqual([]);
    expect((await directory.listEligible({ q: "' OR true --" })).total).toBe(0);
    expect((await directory.listEligible({ q: '   ' })).total).toBe(3);
  } finally { await dataset.context.database.pool.query(`UPDATE "User" SET name='Persona de ensayo' WHERE id=$1`, [id]); }
});

test('D04 perder y recuperar habilitación cambia generación sin autorizar el snapshot anterior', async () => {
  const id = dataset.otherTeacher.userId;
  const publishedSnapshot = (await directory.find(id))!.eligibilityVersion;
  await dataset.context.database.pool.query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [id]);
  expect((await directory.find(id))!.eligible).toBe(false);
  expect((await directory.listEligible({})).items.some(row => row.userId === id)).toBe(false);
  await dataset.context.database.pool.query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`, [id]);
  const restored = await directory.find(id);
  expect(restored!.eligible).toBe(true); expect(restored!.eligibilityVersion).toBe(publishedSnapshot + 1n);
  expect(restored!.eligibilityVersion).not.toBe(publishedSnapshot);
  expect((await directory.listEligible({})).items.some(row => row.userId === id)).toBe(true);
});

test('D05 generación mayor que MAX_SAFE_INTEGER conserva precisión', async () => {
  const email = `${randomUUID()}@example.test`;
  const row = await dataset.context.database.pool.query<{ id: string }>(`INSERT INTO "User"
    (name,email,"emailCanonical",role,"emailVerifiedAt","teacherEligibilityVersion","passwordHash")
    SELECT 'Docente bigint',$1,$1,'TEACHER',clock_timestamp(),9223372036854775807,"passwordHash"
    FROM "User" WHERE id=$2 RETURNING id`, [email, dataset.otherTeacher.userId]);
  expect((await directory.find(row.rows[0].id))!.eligibilityVersion).toBe(9223372036854775807n);
});

test.each([{ page: 0 }, { page: 1.5 }, { pageSize: 51 }, { pageSize: 0 }, { q: '\0' }])(
  'D06 consulta inválida rechazada antes de SQL: %j', async query => {
    await expect(directory.listEligible(query)).rejects.toBeInstanceOf(TeachingDirectoryInvalid);
  });

test('D07 identificador inválido se rechaza y fallo SQL no se convierte en vacío ni filtra detalles', async () => {
  await expect(directory.find('inválido')).rejects.toBeInstanceOf(TeachingDirectoryInvalid);
  const client = await dataset.context.database.pool.connect();
  try {
    // Forzar relación ausente solo para esta conexión, sin DDL ni cerrar el pool.
    await client.query('BEGIN');
    await client.query('SET LOCAL search_path=pg_catalog');
    // Inyectar la misma capacidad query sin crear otro pool; la consulta usa esa transacción.
    const failing = new PostgresTeachingDirectory(client);
    await expect(failing.find(dataset.otherTeacher.userId)).rejects.toMatchObject({
      code: 'TEMPORARILY_UNAVAILABLE', message: 'Directorio docente temporalmente no disponible.',
    });
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    await client.query('SET LOCAL search_path=pg_catalog');
    await expect(failing.listEligible({})).rejects.toBeInstanceOf(TeachingDirectoryUnavailable);
  } finally { await client.query('ROLLBACK'); client.release(); }
});
