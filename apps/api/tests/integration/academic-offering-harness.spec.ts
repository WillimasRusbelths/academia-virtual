import { expect, test } from 'vitest';
import { academicOfferingDataset, assertAcademicFixtureInputs } from '../support/academic-offering.js';
import { waitForBlockedBy } from '../support/locks.js';

test('rechaza modo manual antes de abrir conexiones', () => {
  expect(() => assertAcademicFixtureInputs({ APP_ENV: 'development' })).toThrow('APP_ENV=test');
});

test('dos suites separan cuentas, observador y limpieza dirigida', async () => {
  const first = await academicOfferingDataset('academic_harness_a');
  let second: Awaited<ReturnType<typeof academicOfferingDataset>> | undefined;
  try {
    second = await academicOfferingDataset('academic_harness_b');
    expect(first.context.isolated.schema).not.toBe(second.context.isolated.schema);
    expect(first.account('TEACHER').id === second.account('TEACHER').id).toBe(false);
    const count = async () => Number((await second!.context.database.pool.query<{ count: string }>(
      'SELECT count(*) AS count FROM "User"')).rows[0].count);
    expect(await count()).toBe(14);
    expect(first.account('STUDENT').email.endsWith('@example.test')).toBe(true);
    expect(first.account('TEACHER', 'DISABLED').status === 'DISABLED').toBe(true);
    expect(first.secondAdmin.userId === first.account('ADMIN').id).toBe(false);
    expect(first.otherTeacher.userId === first.account('TEACHER').id).toBe(false);
    const writer = await first.context.database.pool.connect();
    const observer = await first.observerPool.connect();
    try {
      const a = await writer.query<{ pid: number; schema: string }>('SELECT pg_backend_pid() AS pid,current_schema() AS schema');
      const b = await observer.query<{ pid: number; schema: string }>('SELECT pg_backend_pid() AS pid,current_schema() AS schema');
      expect(a.rows[0].pid === b.rows[0].pid).toBe(false);
      expect(b.rows[0].schema).toBe(first.context.isolated.schema);
    } finally { writer.release(); observer.release(); }
    const removedSchema = first.context.isolated.schema;
    await first.cleanup();
    await first.cleanup();
    expect(await count()).toBe(14);
    const removed = await second.context.database.pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [removedSchema]);
    expect(removed.rowCount).toBe(0);
    const marker = await second.context.database.pool.query<{ untouched: boolean }>(
      'SELECT "bootstrapCompletedAt" IS NULL AND "firstAdminUserId" IS NULL AS untouched FROM "SystemState" WHERE id=1');
    expect(marker.rows[0].untouched).toBe(true);
  } finally { await first.cleanup(); await second?.cleanup(); }
}, 120000);

test('la conexión observadora detecta una espera real fuera de la transacción retenida', async () => {
  const data = await academicOfferingDataset('academic_observer');
  const holder = await data.context.database.pool.connect();
  const waiter = await data.context.database.pool.connect();
  let waiting: Promise<unknown> | undefined;
  try {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [data.account('TEACHER').id]);
    const pid = (await holder.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await waiter.query('BEGIN');
    await waiter.query("SET LOCAL lock_timeout = '5s'");
    waiting = waiter.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [data.account('TEACHER').id]);
    // Registrar el rechazo evita una promesa sin manejar si la observación falla.
    void waiting.catch(() => undefined);
    await waitForBlockedBy(data.observerPool, pid);
    await holder.query('ROLLBACK');
    await waiting;
    await waiter.query('ROLLBACK');
  } finally {
    await holder.query('ROLLBACK');
    await waiting?.catch(() => undefined);
    await waiter.query('ROLLBACK');
    holder.release(); waiter.release(); await data.cleanup();
  }
}, 120000);
