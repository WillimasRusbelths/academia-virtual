import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { sessionFixture } from '../support/session-fixture.js';
import { draftGroup } from '../support/academic-migration.js';
import { waitForBlockedBy } from '../support/locks.js';
import { instrumentPool } from '../support/academic-foundation-contract.js';
import { createAcademicTransaction } from '../../src/infrastructure/database/academic-transaction.js';
import type { AcademicTopology, AcademicTransactionWork } from '../../src/infrastructure/database/academic-transaction.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { OfferingError } from '../../src/modules/academic-offering/public/offer.js';

let dataset: AcademicOfferingDataset;
let authorization: PostgresSessionStore;
let actor: SessionActor;
let teacherId: string;
let courseId: string;
let groupId: string;
const db = () => dataset.context.database.pool;
beforeAll(async () => {
  dataset = await academicOfferingDataset('academic_protocol'); authorization = new PostgresSessionStore(db());
}, 120000);
beforeEach(async () => {
  const admin = await sessionFixture(dataset.context, 'ADMIN'); actor = (await authorization.lookup(admin.secret))!;
  teacherId = (await sessionFixture(dataset.context, 'TEACHER')).userId;
  ({ courseId, groupId } = await draftGroup(db()));
});
afterAll(async () => { await dataset?.cleanup(); });
const topology = (): AcademicTopology => ({ accountIds: [actor.userId, teacherId], courseIds: [courseId], groupIds: [groupId] });
function work<T>(apply: AcademicTransactionWork<T>['apply']): AcademicTransactionWork<T> {
  return { actor, permission: 'academic:manage', discover: async () => topology(), recheck: async () => topology(), apply };
}
async function revision() {
  return (await db().query('SELECT revision::text FROM "AcademicCourse" WHERE id=$1', [courseId])).rows[0].revision;
}

test.each(['session', 'role', 'status'] as const)('G01 pérdida de %s confirmada durante espera impide efecto y fase posterior a autorización', async loss => {
  const run = createAcademicTransaction(db(), authorization); const holder = await db().connect();
  const apply = vi.fn(async () => 'no permitido'); const afterAuthorization = vi.fn(async () => undefined);
  let pending: Promise<string> | undefined;
  try {
    await holder.query('BEGIN'); const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [actor.userId]);
    pending = run({ ...work(apply), afterAuthorization }); const settled = pending.then(value => ({ value }), error => ({ error }));
    await waitForBlockedBy(dataset.observerPool, pid);
    // Escrituras de fixture: la regresión de acceso verifica además los casos de uso reales de identidad.
    if (loss === 'session') await holder.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [actor.sessionId]);
    if (loss === 'role') await holder.query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [actor.userId]);
    if (loss === 'status') await holder.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [actor.userId]);
    await holder.query('COMMIT');
    expect(await settled).toMatchObject({ error: { code: loss === 'role' ? 'FORBIDDEN' : 'AUTH_REQUIRED' } });
  } finally { await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined); }
  expect(apply).not.toHaveBeenCalled(); expect(afterAuthorization).not.toHaveBeenCalled(); expect(await revision()).toBe('1');
});

test('G02 fase tras autorización puede devolver sin locks de recursos ni efecto; no implementa ledger', async () => {
  const trace = instrumentPool(db()); const run = createAcademicTransaction(trace.pool, authorization);
  const apply = vi.fn(async () => 'mutado'); const recheck = vi.fn(async () => topology());
  const result = await run({ ...work(apply), recheck, afterAuthorization: async (client, locked) => {
    expect(locked.accountIds).toEqual([actor.userId, teacherId].sort());
    expect(trace.statements.some(row => row.sql.includes('"Session"') && /FOR UPDATE/i.test(row.sql))).toBe(true);
    expect((await client.query('SELECT revision::text FROM "AcademicCourse" WHERE id=$1', [courseId])).rows[0].revision).toBe('1');
    return { value: 'consulta ficticia autorizada' };
  } });
  expect(result).toBe('consulta ficticia autorizada'); expect(apply).not.toHaveBeenCalled(); expect(recheck).not.toHaveBeenCalled();
  expect(trace.statements.some(row => /"Academic(Course|Group)"[\s\S]*FOR UPDATE/i.test(row.sql))).toBe(false);
  expect((await db().query('SELECT (SELECT count(*) FROM "AcademicCommand")+(SELECT count(*) FROM "AcademicAuditEvent") AS n')).rows[0].n).toBe('0');
});

test('G03 validación posterior a recheck conserva error de negocio y revierte escrituras de la transacción', async () => {
  const trace = instrumentPool(db()); const run = createAcademicTransaction(trace.pool, authorization); let rechecked = false;
  const apply = vi.fn(async () => 'mutado');
  await expect(run({ ...work(apply), recheck: async () => { rechecked = true; return topology(); }, validate: async client => {
    expect(rechecked).toBe(true);
    expect(trace.statements.some(row => row.sql.includes('"AcademicGroup"') && /FOR UPDATE/i.test(row.sql))).toBe(true);
    await client.query('UPDATE "AcademicCourse" SET revision=2 WHERE id=$1', [courseId]);
    throw new OfferingError({ code: 'OFFERING_VERSION_CONFLICT' });
  } })).rejects.toMatchObject({ code: 'OFFERING_VERSION_CONFLICT' });
  expect(apply).not.toHaveBeenCalled(); expect(await revision()).toBe('1'); expect(trace.statements.at(-1)?.sql).toBe('ROLLBACK');
});

test('G04 cambio del conjunto de hijos redescubre también grupos, no solo cuentas', async () => {
  const second = await db().query<{ id: string }>(`INSERT INTO "AcademicGroup" ("courseId",name,"timeZone") VALUES ($1,'Otro grupo ficticio','America/Lima') RETURNING id`, [courseId]);
  const child = second.rows[0].id; let discoveries = 0; let rechecks = 0; let effects = 0;
  const run = createAcademicTransaction(db(), authorization);
  await run({ ...work(async client => { effects++; await client.query('UPDATE "AcademicCourse" SET revision=2 WHERE id=$1', [courseId]); }),
    discover: async () => { discoveries++; return { ...topology(), groupIds: rechecks ? [groupId, child] : [groupId] }; },
    recheck: async () => { rechecks++; return { ...topology(), groupIds: [groupId, child] }; } });
  expect(discoveries).toBe(2); expect(rechecks).toBe(2); expect(effects).toBe(1); expect(await revision()).toBe('2');
});

test('G05 nunca ejecuta efecto de grupo sin su padre bloqueado, aunque discover lo omita', async () => {
  const run = createAcademicTransaction(db(), authorization); const apply = vi.fn(async () => 'mutado');
  const missingParent = { ...topology(), courseIds: [] };
  await expect(run({ ...work(apply), discover: async () => missingParent, recheck: async () => missingParent }))
    .rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect(apply).not.toHaveBeenCalled(); expect(await revision()).toBe('1');
});

test('G06 añade actor omitido, normaliza UUID duplicados y entrega snapshot inmutable', async () => {
  const run = createAcademicTransaction(db(), authorization);
  const duplicate = { accountIds: [teacherId, teacherId.toUpperCase()], courseIds: [courseId, courseId.toUpperCase()], groupIds: [groupId, groupId.toUpperCase()] };
  const result = await run({ ...work(async () => 'verificado'), discover: async () => duplicate, recheck: async (_client, locked) => {
    expect(locked.accountIds).toEqual([actor.userId, teacherId].sort()); expect(locked.courseIds).toEqual([courseId]); expect(locked.groupIds).toEqual([groupId]);
    expect(Object.isFrozen(locked)).toBe(true); expect(Object.isFrozen(locked.accountIds)).toBe(true);
    return duplicate;
  } });
  expect(result).toBe('verificado'); expect(await revision()).toBe('1');
});
