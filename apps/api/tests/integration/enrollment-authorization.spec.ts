import { expect, test } from 'vitest';
import { preEnrollmentDatabase, seedEnrollmentGraph } from '../support/enrollment-migration.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { EnrollmentAccess } from '../../src/modules/enrollment/application/access.js';
import type { EnrollmentPermission } from '../../src/modules/enrollment/application/ports.js';
import { sessionFixture } from '../support/session-fixture.js';

/** Ensaya composición con la autoridad existente; no implementa enrollmentTransaction.
 * Cuenta/sesión y datos ficticios viven solo en un schema nuevo de esta suite.
 */
async function withAuthority(operation: (context: {
  actor: SessionActor; authorize(permission: EnrollmentPermission): Promise<SessionActor>;
  own(permission: 'enrollment:read-own' | 'enrollment:pay-own'): Promise<SessionActor | null>;
  change(sql: string): Promise<void>;
}) => Promise<void>, otherStudent = false) {
  const context = await preEnrollmentDatabase();
  try {
    await context.applyEnrollment();
    const graph = await seedEnrollmentGraph(context);
    const sessions = new PostgresSessionStore(context.database.pool);
    const account = otherStudent ? await sessionFixture(context,'STUDENT') : context.student;
    const actor = (await sessions.lookup(account.secret))!;
    expect(actor).not.toBeNull();
    const client = await context.database.pool.connect();
    try {
      await client.query('BEGIN');
      const access = new EnrollmentAccess({ revalidate: (actor,permission) => sessions.revalidateInTransaction(client,actor,permission) });
      await operation({actor, authorize: permission => access.authorize(actor,permission),
        async own(permission) {
          const row = (await client.query<{studentId:string}>('SELECT "studentId" FROM "EnrollmentOrder" WHERE id=$1', [graph.rows.EnrollmentOrder!.id])).rows[0];
          return access.authorizeOwn(actor,permission,row?.studentId ?? null);
        },
        async change(sql) { await client.query(sql,[actor.userId,actor.sessionId].slice(0,sql.includes('$2')?2:1)); },
      });
    } finally { await client.query('ROLLBACK'); client.release(); }
  } finally { await context.cleanup(); }
}

test('T012 sesión primaria permite lectura/pago propio y deniega facultades administrativas', async () => {
  await withAuthority(async ({actor,own,authorize}) => {
    expect(await own('enrollment:read-own')).toEqual(actor);
    expect(await own('enrollment:pay-own')).toEqual(actor);
    for (const permission of ['enrollment:price-manage','enrollment:read-all','enrollment:incident-follow-up'] as const) {
      await expect(authorize(permission)).rejects.toMatchObject({code:'FORBIDDEN'});
    }
  });
},120000);
test.each([
  ['revocación', 'UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE "userId"=$1 AND id=$2'],
  ['cuenta deshabilitada', `UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`],
  ['authVersion distinta', 'UPDATE "User" SET "authVersion"="authVersion"+1 WHERE id=$1'],
  ['sesión vencida', `UPDATE "Session" SET "createdAt"=statement_timestamp()-interval '10 hours',
    "lastAcceptedAt"=statement_timestamp()-interval '9 hours',"absoluteExpiresAt"=statement_timestamp()-interval '2 hours' WHERE "userId"=$1 AND id=$2`],
] as const)('T012 revalida %s antes de entregar datos propios', async (_name,sql) => {
  await withAuthority(async ({own,change}) => {
    await change(sql);
    await expect(own('enrollment:read-own')).rejects.toMatchObject({code:'AUTH_REQUIRED'});
  });
},120000);
test('T012 cambio de rol persistido invalida el actor anterior aunque conserve su ID', async () => {
  await withAuthority(async ({own,change}) => {
    await change(`UPDATE "User" SET role='TEACHER' WHERE id=$1`);
    await expect(own('enrollment:read-own')).rejects.toMatchObject({code:'FORBIDDEN'});
  });
},120000);
test('T012 alumno con sesión válida no recibe una orden persistida de otro alumno', async () => {
  await withAuthority(async ({actor,authorize,own}) => {
    expect(await authorize('enrollment:read-own')).toEqual(actor);
    expect(await own('enrollment:read-own')).toBeNull();
    expect(await own('enrollment:pay-own')).toBeNull();
  },true);
},120000);
