import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { draftGroup } from '../support/academic-migration.js';
import { sessionFixture } from '../support/session-fixture.js';
import { waitForBlockedBy } from '../support/locks.js';
import { transactionTarget, commandTarget, instrumentPool, latch } from '../support/academic-foundation-contract.js';
import type { Topology, TransactionWork, CommandWork } from '../support/academic-foundation-contract.js';
import { accountTransaction } from '../../src/infrastructure/database/account-transaction.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { OfferingError } from '../../src/modules/academic-offering/public/offer.js';
import type { AdminCourse } from '../../src/modules/academic-offering/public/offer.js';

let dataset: AcademicOfferingDataset;
let authorization: PostgresSessionStore;
let actor: SessionActor;
let teacherId: string;
let courseId: string;
let groupId: string;
const db = () => dataset.context.database.pool;
const unavailable = () => new OfferingError({ code: 'TEMPORARILY_UNAVAILABLE' });
beforeAll(async () => {
  dataset = await academicOfferingDataset('academic_transaction'); authorization = new PostgresSessionStore(db());
}, 120000);
beforeEach(async () => {
  const admin = await sessionFixture(dataset.context, 'ADMIN'); actor = (await authorization.lookup(admin.secret))!;
  teacherId = (await sessionFixture(dataset.context, 'TEACHER')).userId;
  ({ courseId, groupId } = await draftGroup(db()));
  await db().query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1', [groupId, teacherId]);
});
afterAll(async () => { await dataset?.cleanup(); });

const topology = (): Topology => ({ accountIds: [teacherId, actor.userId].sort(), courseIds: [courseId], groupIds: [groupId] });
function work<T>(apply: TransactionWork<T>['apply']): TransactionWork<T> {
  return { actor, permission: 'academic:manage', discover: async () => topology(), recheck: async () => topology(), apply };
}
async function projection(client: Pick<PoolClient, 'query'>): Promise<AdminCourse> {
  const row = (await client.query<{ id: string; name: string; description: string | null; state: 'DRAFT';
    revision: string; createdAt: Date; updatedAt: Date }>(
    'SELECT id,name,description,state,revision::text,"createdAt","updatedAt" FROM "AcademicCourse" WHERE id=$1', [courseId])).rows[0];
  return { ...row, studentVisible: false, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
function command(): CommandWork {
  return { ...work(async client => {
    await client.query('UPDATE "AcademicCourse" SET name=$2,revision=revision+1 WHERE id=$1', [courseId, 'Curso corregido ficticio']);
    return { resource: await projection(client), result: 'APPLIED', beforeState: 'DRAFT', beforeRevision: '1' };
  }), commandId: randomUUID(), requestId: randomUUID(), operation: 'COURSE_EDIT', targetKind: 'COURSE',
  targetId: courseId, expectedRevision: '1', payload: { name: 'Curso corregido ficticio', description: null }, project: projection };
}
async function counts(id: string) {
  const row = (await db().query<{ ledger: number; audit: number; revision: string }>(`SELECT
    (SELECT count(*)::int FROM "AcademicCommand" WHERE "actorUserId"=$1 AND "commandId"=$2) AS ledger,
    (SELECT count(*)::int FROM "AcademicAuditEvent" WHERE "actorUserId"=$1 AND "commandId"=$2) AS audit,
    (SELECT revision::text FROM "AcademicCourse" WHERE id=$3) AS revision`, [actor.userId, id, courseId])).rows[0];
  return row;
}
async function fixtureLedger(client: Pick<PoolClient, 'query'>, id: string) {
  return client.query(`INSERT INTO "AcademicCommand" ("actorUserId","commandId",operation,"targetKind","targetId","payloadDigest","resultingRevision",result)
    VALUES ($1,$2,'COURSE_EDIT','COURSE',$3,$4,2,'APPLIED') ON CONFLICT DO NOTHING RETURNING "commandId"`,
  [actor.userId, id, courseId, createHash('sha256').update('fixture-not-a-production-digest').digest()]);
}
async function fixtureAudit(client: Pick<PoolClient, 'query'>, id: string, revision = 2) {
  await client.query(`INSERT INTO "AcademicAuditEvent" ("actorUserId","resourceKind","resourceId",action,result,"commandId","requestId",
    "beforeState","afterState","beforeRevision","afterRevision") VALUES ($1,'COURSE',$2,'COURSE_EDIT','APPLIED',$3,$4,'DRAFT','DRAFT',1,$5)`,
  [actor.userId, courseId, id, randomUUID(), revision]);
}

test('B01 control PG: PK actor/commandId serializa inserts concurrentes; barrera desde tercera conexión', async () => {
  const holder = await db().connect(); const id = randomUUID(); let pending: ReturnType<typeof fixtureLedger> | undefined;
  try {
    await holder.query('BEGIN'); const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    expect((await fixtureLedger(holder, id)).rowCount).toBe(1);
    pending = fixtureLedger(db(), id); const settled = pending.then(value => ({ value }), error => ({ error }));
    await waitForBlockedBy(dataset.observerPool, pid);
    await holder.query('COMMIT');
    expect(await settled).toMatchObject({ value: { rowCount: 0 } });
    expect(await counts(id)).toEqual({ ledger: 1, audit: 0, revision: '1' });
  } finally { await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined); }
});

test('B02 control PG: agregado/ledger/auditoría confirman en una transacción existente', async () => {
  const id = randomUUID();
  await accountTransaction(db(), async client => {
    await client.query('UPDATE "AcademicCourse" SET revision=2 WHERE id=$1', [courseId]);
    await fixtureLedger(client, id); await fixtureAudit(client, id);
  }, unavailable, () => false);
  expect(await counts(id)).toEqual({ ledger: 1, audit: 1, revision: '2' });
});

test('B03 control PG: fallo real de restricción de auditoría revierte agregado y ledger', async () => {
  const id = randomUUID();
  await expect(accountTransaction(db(), async client => {
    await client.query('UPDATE "AcademicCourse" SET revision=2 WHERE id=$1', [courseId]);
    await fixtureLedger(client, id); await fixtureAudit(client, id, 0);
  }, unavailable, () => false)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect(await counts(id)).toEqual({ ledger: 0, audit: 0, revision: '1' });
});

test('B04 control PG: presupuesto compartido de señal de aborto y SQL 40001 no supera tres intentos', async () => {
  let attempts = 0;
  await accountTransaction(db(), async client => {
    attempts++;
    if (attempts === 1) throw Object.assign(new Error('Cambio de conjunto ficticio'), { transactionAborted: true });
    if (attempts === 2) await client.query(`DO $$ BEGIN RAISE EXCEPTION 'aborto ficticio' USING ERRCODE='40001'; END $$`);
    await client.query('UPDATE "AcademicCourse" SET revision=2 WHERE id=$1', [courseId]);
  }, unavailable, () => false);
  expect(attempts).toBe(3); expect((await projection(db())).revision).toBe('2');
});

test('B05 control PG: COMMIT aplicado sin acuse devuelve 503 y no repite el efecto', async () => {
  const trace = instrumentPool(db(), { after(sql) { if (sql === 'COMMIT') throw new Error('Acuse perdido ficticio'); } });
  let effects = 0;
  await expect(accountTransaction(trace.pool, async client => {
    effects++; await client.query('UPDATE "AcademicCourse" SET revision=revision+1 WHERE id=$1', [courseId]);
  }, unavailable, () => false)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect(effects).toBe(1); expect(trace.pids).toHaveLength(1); expect((await projection(db())).revision).toBe('2');
});

test('B06 control PG: rollback sin acuse confirmado descarta cliente y no reintenta', async () => {
  const trace = instrumentPool(db(), { after(sql) { if (sql === 'ROLLBACK') throw new Error('Acuse rollback perdido ficticio'); } });
  let effects = 0;
  await expect(accountTransaction(trace.pool, async client => {
    effects++; await client.query('UPDATE "AcademicCourse" SET revision=2 WHERE id=$1', [courseId]);
    throw Object.assign(new Error('Aborto ficticio'), { transactionAborted: true });
  }, unavailable, () => false)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect(effects).toBe(1); expect(trace.releases).toEqual([true]); expect((await projection(db())).revision).toBe('1');
});

test('P01 T013: User ordenados antes de sesión, Course y Group; sin SystemState ni grupos ajenos', async () => {
  const trace = instrumentPool(db()); const run = transactionTarget(trace.pool, authorization);
  const foreign = await draftGroup(db());
  await run(work(async client => {
    const observer = await dataset.observerPool.connect();
    try {
      await observer.query('BEGIN');
      await expect(observer.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE NOWAIT', [foreign.groupId]))
        .resolves.toMatchObject({ rowCount: 1 });
    } finally { await observer.query('ROLLBACK'); observer.release(); }
    await client.query('UPDATE "AcademicCourse" SET revision=2 WHERE id=$1', [courseId]);
  }));
  const locks = trace.statements.map(row => row.sql).filter(sql => /FOR UPDATE/i.test(sql));
  const first = (name: string) => locks.findIndex(sql => sql.includes(`"${name}"`));
  expect(first('User')).toBe(0); expect(first('Session')).toBeGreaterThan(first('User'));
  expect(first('AcademicCourse')).toBeGreaterThan(first('Session')); expect(first('AcademicGroup')).toBeGreaterThan(first('AcademicCourse'));
  expect(locks.some(sql => /SystemState/.test(sql))).toBe(false);
  expect(locks[0]).toMatch(/ORDER BY[^;]*id[^;]*FOR UPDATE/is);
  expect((await projection(db())).revision).toBe('2');
});

test.each(['account', 'session', 'course', 'group'] as const)('P02 T013: espera real en %s observada fuera de la transacción retenida', async kind => {
  const run = transactionTarget(db(), authorization); const holder = await db().connect();
  const queries = { account: ['User', teacherId], session: ['Session', actor.sessionId], course: ['AcademicCourse', courseId], group: ['AcademicGroup', groupId] };
  const [table, id] = queries[kind]; let pending: Promise<unknown> | undefined;
  try {
    await holder.query('BEGIN'); const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    // Nombres cerrados del fixture, nunca entrada HTTP.
    await holder.query(`SELECT id FROM "${table}" WHERE id=$1 FOR UPDATE`, [id]);
    pending = run(work(async client => { await client.query('UPDATE "AcademicCourse" SET revision=2 WHERE id=$1', [courseId]); }));
    const settled = pending.then(() => ({ ok: true }), error => ({ error }));
    await waitForBlockedBy(dataset.observerPool, pid); expect((await projection(dataset.observerPool)).revision).toBe('1');
    await holder.query('COMMIT'); expect(await settled).toEqual({ ok: true }); expect((await projection(db())).revision).toBe('2');
  } finally { await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined); }
});

test('P03 T013: consulta posterior al lock ve el commit que hizo esperar, no la instantánea anterior', async () => {
  const run = transactionTarget(db(), authorization); const holder = await db().connect(); let pending: Promise<string> | undefined;
  try {
    await holder.query('BEGIN'); const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [teacherId]);
    pending = run(work(async client => (await projection(client)).name)); const settled = pending.then(value => ({ value }), error => ({ error }));
    await waitForBlockedBy(dataset.observerPool, pid);
    await holder.query(`UPDATE "AcademicCourse" SET name='Commit precedente ficticio' WHERE id=$1`, [courseId]);
    await holder.query('COMMIT'); expect(await settled).toEqual({ value: 'Commit precedente ficticio' });
  } finally { await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined); }
});

test('P04 T013: redescubre conjunto cambiado dentro del siguiente intento y no toma User nuevos tras Course', async () => {
  const trace = instrumentPool(db()); const run = transactionTarget(trace.pool, authorization);
  const discovered: string[][] = []; let rechecks = 0; let effects = 0;
  const extra = dataset.otherTeacher.userId;
  await run({ ...work(async client => { effects++; await client.query('UPDATE "AcademicCourse" SET revision=2 WHERE id=$1', [courseId]); }),
    discover: async () => { const ids = rechecks ? [...topology().accountIds, extra].sort() : [...topology().accountIds]; discovered.push(ids); return { ...topology(), accountIds: ids }; },
    recheck: async () => { rechecks++; return { ...topology(), accountIds: [...topology().accountIds, extra].sort() }; } });
  expect(discovered).toHaveLength(2); expect(discovered[0]).not.toContain(extra); expect(discovered[1]).toContain(extra); expect(effects).toBe(1);
  const sql = trace.statements.map(row => row.sql); const rollback = sql.indexOf('ROLLBACK');
  expect(rollback).toBeGreaterThan(0);
  const firstAttempt = sql.slice(0, rollback);
  const parentLock = firstAttempt.findIndex(value => value.includes('"AcademicCourse"') && /FOR UPDATE/i.test(value));
  expect(parentLock).toBeGreaterThanOrEqual(0);
  expect(firstAttempt.slice(parentLock + 1).some(value => value.includes('"User"') && /FOR UPDATE/i.test(value))).toBe(false);
  expect((await projection(db())).revision).toBe('2');
});

test('P05 T013: cambios persistentes de conjunto y 40P01 comparten tres intentos completos, sin bucle exterior', async () => {
  const run = transactionTarget(db(), authorization); let discoveries = 0; let effects = 0;
  await expect(run({ ...work(async () => { effects++; }), discover: async client => {
    discoveries++; if (discoveries === 2) await client.query(`DO $$ BEGIN RAISE EXCEPTION 'aborto ficticio' USING ERRCODE='40P01'; END $$`);
    return topology();
  }, recheck: async () => ({ ...topology(), accountIds: [...topology().accountIds, dataset.otherTeacher.userId] }) }))
    .rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect(discoveries).toBe(3); expect(effects).toBe(0); expect((await projection(db())).revision).toBe('1');
});

test.each(['commit', 'rollback'] as const)('P06 T013: %s incierto no reejecuta el callback académico', async fault => {
  const trace = instrumentPool(db(), { after(sql) { if (sql === fault.toUpperCase()) throw new Error('Acuse incierto ficticio'); } });
  const run = transactionTarget(trace.pool, authorization); let effects = 0;
  await expect(run(work(async client => {
    effects++; await client.query('UPDATE "AcademicCourse" SET revision=2 WHERE id=$1', [courseId]);
    if (fault === 'rollback') throw Object.assign(new Error('Aborto ficticio'), { transactionAborted: true });
  }))).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect(effects).toBe(1); expect(trace.pids).toHaveLength(1);
  expect((await projection(db())).revision).toBe(fault === 'commit' ? '2' : '1');
});

test('P07 T013: espera agotada devuelve indisponibilidad, nunca falso conflicto de horario', async () => {
  const run = transactionTarget(db(), authorization); const holder = await db().connect(); let pending: Promise<unknown> | undefined;
  try {
    await holder.query('BEGIN'); const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [teacherId]);
    pending = run(work(async () => { throw new Error('No debe llegar al efecto mientras está bloqueado'); }));
    const settled = pending.then(value => ({ value }), error => ({ error }));
    await waitForBlockedBy(dataset.observerPool, pid);
    expect(await settled).toMatchObject({ error: { code: 'TEMPORARILY_UNAVAILABLE' } });
    expect((await projection(dataset.observerPool)).revision).toBe('1');
  } finally { await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined); }
});

test('P08 T013: efecto y comprobaciones usan READ COMMITTED en la misma conexión', async () => {
  const run = transactionTarget(db(), authorization); const connections: number[] = [];
  const probe = async (client: PoolClient) => { connections.push((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid); };
  const isolation = await run({ ...work(async client => { await probe(client);
    return (await client.query('SHOW transaction_isolation')).rows[0].transaction_isolation;
  }), discover: async client => { await probe(client); return topology(); }, recheck: async client => { await probe(client); return topology(); } });
  expect(isolation).toBe('read committed'); expect(connections).toHaveLength(3); expect(new Set(connections).size).toBe(1);
});

test('L01 T014: comando aceptado confirma agregado, ledger y auditoría con IDs distintos', async () => {
  const write = commandTarget(db(), authorization); const input = command(); const result = await write(input);
  expect(result.command).toEqual({ id: input.commandId, replayed: false, appliedRevision: '2', result: 'APPLIED' });
  expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '2' });
  const row = (await db().query('SELECT "requestId","commandId","resourceId","resourceKind" FROM "AcademicAuditEvent" WHERE "commandId"=$1', [input.commandId])).rows[0];
  expect(row).toEqual({ requestId: input.requestId, commandId: input.commandId, resourceId: courseId, resourceKind: 'COURSE' });
});

test('L02 T014: replay idéntico retorna proyección actual y appliedRevision original, sin efecto/auditoría duplicados', async () => {
  const write = commandTarget(db(), authorization); const input = command(); input.apply = vi.fn(input.apply);
  await write(input);
  await db().query(`UPDATE "AcademicCourse" SET name='Cambio posterior ficticio',revision=3 WHERE id=$1`, [courseId]);
  const result = await write({ ...input, requestId: randomUUID() });
  expect(result.resource.name).toBe('Cambio posterior ficticio'); expect(result.resource.revision).toBe('3');
  expect(result.command).toEqual({ id: input.commandId, replayed: true, appliedRevision: '2', result: 'APPLIED' });
  expect(input.apply).toHaveBeenCalledTimes(1); expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '3' });
});

test.each(['payload', 'target', 'revision', 'operation'] as const)('L03 T014: mismo actor/commandId con %s distinto rechaza sin consumir cambios', async kind => {
  const write = commandTarget(db(), authorization); const input = command(); await write(input);
  const changed = { ...input, requestId: randomUUID() };
  if (kind === 'payload') changed.payload = { name: 'Otra intención ficticia' };
  if (kind === 'target') changed.targetId = (await draftGroup(db())).courseId;
  if (kind === 'revision') changed.expectedRevision = '2';
  if (kind === 'operation') changed.operation = 'COURSE_PUBLISH';
  await expect(write(changed)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '2' });
});

test('L04 T014: claves JSON en distinto orden producen el mismo comando canónico', async () => {
  const write = commandTarget(db(), authorization); const input = command(); await write(input);
  const replay = await write({ ...input, payload: { description: null, name: 'Curso corregido ficticio' } });
  expect(replay.command.replayed).toBe(true); expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '2' });
});

test.each(['session', 'role'] as const)('L05 T014: reautoriza %s antes de consultar ledger y no entrega proyección en replay denegado', async lost => {
  const trace = instrumentPool(db()); const write = commandTarget(trace.pool, authorization); const input = command();
  const project = vi.fn(input.project); input.project = project; await write(input); project.mockClear();
  if (lost === 'session') await db().query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [actor.sessionId]);
  else await db().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [actor.userId]);
  trace.statements.length = 0;
  await expect(write(input)).rejects.toMatchObject({ code: lost === 'session' ? 'AUTH_REQUIRED' : 'FORBIDDEN' });
  expect(trace.statements.some(row => /SELECT[\s\S]*AcademicCommand/i.test(row.sql))).toBe(false);
  expect(project).not.toHaveBeenCalled();
  expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '2' });
});

test('L06 T014: fallo de auditoría revierte negocio y ledger; corregir permite reutilizar commandId', async () => {
  const input = command(); const failing = commandTarget(db(), authorization, { audit: { write: async () => { throw new Error('Auditoría no disponible ficticia'); } } });
  await expect(failing(input)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect(await counts(input.commandId)).toEqual({ ledger: 0, audit: 0, revision: '1' });
  await commandTarget(db(), authorization)(input); expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '2' });
});

test('L07 T014: dos conexiones del mismo actor/commandId esperan su lock y confirman un solo efecto', async () => {
  const write = commandTarget(db(), authorization); const input = command(); const entered = latch(); const release = latch();
  let effects = 0; let holderPid = 0;
  input.apply = async client => { effects++; holderPid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    entered.release(); await release.promise; return command().apply(client); };
  const first = write(input); const firstResult = first.then(value => ({ value }), error => ({ error }));
  let second: Promise<unknown> | undefined;
  try {
    await Promise.race([entered.promise, first.then(() => { throw new Error('No se ejecutó el efecto esperado'); })]);
    second = write({ ...input, requestId: randomUUID() }); const secondResult = second.then(value => ({ value }), error => ({ error }));
    await waitForBlockedBy(dataset.observerPool, holderPid); release.release();
    expect(await firstResult).toMatchObject({ value: { command: { replayed: false } } });
    expect(await secondResult).toMatchObject({ value: { command: { replayed: true } } });
  } finally { release.release(); await firstResult; await second?.catch(() => undefined); }
  expect(effects).toBe(1); expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '2' });
});

test('L08 T014: commandId pertenece al actor; mismo UUID de otro administrador no es replay', async () => {
  const write = commandTarget(db(), authorization); const input = command(); await write(input);
  const other = (await authorization.lookup(dataset.secondAdmin.secret))!;
  const otherResult = await write({ ...input, actor: other, expectedRevision: '2',
    apply: async client => { await client.query('UPDATE "AcademicCourse" SET revision=3 WHERE id=$1', [courseId]);
      return { resource: await projection(client), result: 'APPLIED', beforeState: 'DRAFT', beforeRevision: '2' }; } });
  expect(otherResult.command.replayed).toBe(false);
  expect((await db().query('SELECT count(*)::int AS n FROM "AcademicCommand" WHERE "commandId"=$1', [input.commandId])).rows[0].n).toBe(2);
});

test('L09 T014: NO_CHANGE conserva revisión, persiste intención y replay no agrega auditoría', async () => {
  const write = commandTarget(db(), authorization); const input = command();
  input.apply = vi.fn(async client => ({ resource: await projection(client), result: 'NO_CHANGE' as const, beforeState: 'DRAFT' as const, beforeRevision: '1' }));
  expect((await write(input)).command).toMatchObject({ appliedRevision: '1', result: 'NO_CHANGE', replayed: false });
  expect((await write(input)).command).toMatchObject({ appliedRevision: '1', result: 'NO_CHANGE', replayed: true });
  expect(input.apply).toHaveBeenCalledTimes(1); expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '1' });
});

test('L10 T014: fallo de negocio no consume commandId y error se conserva sin traducirlo a horario/503', async () => {
  const write = commandTarget(db(), authorization); const input = command();
  await expect(write({ ...input, apply: async () => { throw new OfferingError({ code: 'OFFERING_VERSION_CONFLICT' }); } }))
    .rejects.toMatchObject({ code: 'OFFERING_VERSION_CONFLICT' });
  expect(await counts(input.commandId)).toEqual({ ledger: 0, audit: 0, revision: '1' });
  await write(input); expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '2' });
});

test('L11 T014: COMMIT sin acuse conserva ledger; solo reintento manual idéntico recupera resultado sin otro efecto', async () => {
  const trace = instrumentPool(db(), { after(sql) { if (sql === 'COMMIT') throw new Error('Acuse perdido ficticio'); } });
  const write = commandTarget(trace.pool, authorization); const input = command(); input.apply = vi.fn(input.apply);
  await expect(write(input)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect(input.apply).toHaveBeenCalledTimes(1); expect(trace.pids).toHaveLength(1);
  expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '2' });
  const recovered = await commandTarget(db(), authorization)({ ...input, requestId: randomUUID() });
  expect(recovered.command).toMatchObject({ replayed: true, appliedRevision: '2' });
  expect(input.apply).toHaveBeenCalledTimes(1); expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '2' });
});
