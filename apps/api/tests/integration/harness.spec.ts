import { afterAll, beforeAll, expect, test } from 'vitest';
import { Client, Pool } from 'pg';
import { probeUrl } from '../../../../ops/local/compatibility/env.mjs';
import { waitForBlockedBy } from '../support/locks.js';
import { assertMailpitAvailable } from '../support/mailpit.js';
import { createIsolatedTestEnvironment, type IsolatedTestEnvironment } from '../support/test-environment.js';

let environment: IsolatedTestEnvironment;

beforeAll(async () => {
  environment = await createIsolatedTestEnvironment('harness');
});

afterAll(async () => {
  await environment?.cleanup();
});

test('cada suite usa un schema efímero con runtime sin CREATE', async () => {
  await environment.ownerQuery('CREATE TABLE harness_item (id integer PRIMARY KEY, value text NOT NULL)');
  await environment.runtimeQuery("INSERT INTO harness_item (id, value) VALUES (1, 'aislado')");
  const result = await environment.runtimeQuery<{ value: string; schema: string }>(
    'SELECT value, current_schema() AS schema FROM harness_item WHERE id = 1',
  );
  expect(result.rows).toEqual([{ value: 'aislado', schema: environment.schema }]);
  const privileges = await environment.runtimeQuery<{ can_create: boolean }>(
    `SELECT has_schema_privilege(current_user, '${environment.schema}', 'CREATE') AS can_create`,
  );
  expect(privileges.rows[0]?.can_create).toBe(false);
});

test('Mailpit local está disponible sin borrar mensajes existentes', async () => {
  await expect(assertMailpitAvailable()).resolves.toBeUndefined();
});

test('observador detecta una conexión bloqueada nacida después del snapshot retenido', async () => {
  await environment.ownerQuery('CREATE TABLE harness_lock (id integer PRIMARY KEY); INSERT INTO harness_lock VALUES (1)');
  const pool = new Pool({ connectionString: probeUrl('runtime'),
    options: `-c search_path=${environment.schema}`, connectionTimeoutMillis: 5000 });
  const holder = await pool.connect();
  // Client nuevo garantiza que este backend no existía al tomar el snapshot del holder.
  const waiter = new Client(pool.options);
  let pending: Promise<unknown> | undefined;
  try {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM harness_lock WHERE id=1 FOR UPDATE');
    const pid = (await holder.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT pid FROM pg_stat_activity');
    await waiter.connect();
    const waiterPid = (await waiter.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    expect((await holder.query('SELECT pid FROM pg_stat_activity WHERE pid=$1', [waiterPid])).rowCount).toBe(0);
    pending = waiter.query('SELECT id FROM harness_lock WHERE id=1 FOR UPDATE');
    await waitForBlockedBy(pool, pid);
    await holder.query('COMMIT');
    await pending;
  } finally {
    await holder.query('ROLLBACK').catch(() => undefined);
    holder.release();
    await pending;
    await waiter.end();
    await pool.end();
  }
});
