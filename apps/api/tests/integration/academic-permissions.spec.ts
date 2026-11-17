import { beforeAll, afterAll, expect, test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { SessionLookup } from '../../src/modules/authorization/application/session-lookup.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';

let dataset: AcademicOfferingDataset;
let sessions: PostgresSessionStore;
let lookup: SessionLookup;
beforeAll(async () => {
  dataset = await academicOfferingDataset('academic_permissions');
  sessions = new PostgresSessionStore(dataset.context.database.pool); lookup = new SessionLookup(sessions);
}, 120000);
afterAll(async () => { await dataset?.cleanup(); });

const matrix = [
  ['ADMIN', 'academic:manage', true], ['ADMIN', 'academic:read-published', true], ['ADMIN', 'academic:read-own', false],
  ['STUDENT', 'academic:manage', false], ['STUDENT', 'academic:read-published', true], ['STUDENT', 'academic:read-own', false],
  ['TEACHER', 'academic:manage', false], ['TEACHER', 'academic:read-published', false], ['TEACHER', 'academic:read-own', true],
] as const;
test.each(matrix)('A01 autorización primaria y revalidación transaccional %s/%s=%s', async (role, permission, allowed) => {
  const secret = dataset.account(role).sessions[0].secret;
  const actor = (await sessions.lookup(secret))!; expect(actor.role).toBe(role);
  const authorization = lookup.authorize(secret, permission);
  if (allowed) expect(await authorization).toEqual(actor);
  else await expect(authorization).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const client = await dataset.context.database.pool.connect();
  try {
    await client.query('BEGIN');
    const check = sessions.revalidateInTransaction(client, actor, permission);
    if (allowed) await expect(check).resolves.toBeUndefined();
    else await expect(check).rejects.toMatchObject({ code: 'FORBIDDEN' });
  } finally { await client.query('ROLLBACK'); client.release(); }
});

test.each(['academic:manage', 'academic:read-published', 'academic:read-own'] as const)(
  'A02 visitante y credencial desconocida: AUTH_REQUIRED en %s', async permission => {
    await expect(lookup.authorize(null, permission)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    await expect(lookup.authorize('credencial-ficticia-inexistente', permission)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

test('A03 sesión revocada no aprovecha un actor validado anteriormente', async () => {
  const actor = (await sessions.lookup(dataset.secondAdmin.secret))!;
  await dataset.context.database.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [actor.sessionId]);
  const client = await dataset.context.database.pool.connect();
  try {
    await client.query('BEGIN');
    await expect(sessions.revalidateInTransaction(client, actor, 'academic:manage')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  } finally { await client.query('ROLLBACK'); client.release(); }
});
