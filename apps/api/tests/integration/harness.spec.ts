import { afterAll, beforeAll, expect, test } from 'vitest';
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
