import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { draftGroup } from '../support/academic-migration.js';
import { sessionFixture } from '../support/session-fixture.js';
import { createAcademicCommandWriter } from '../../src/modules/academic-offering/infrastructure/offering-store.js';
import type { AcademicCommandWork } from '../../src/modules/academic-offering/infrastructure/offering-store.js';
import { offeringAudit } from '../../src/modules/academic-offering/infrastructure/offering-audit.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import type { AdminCourse, AdminGroup } from '../../src/modules/academic-offering/public/offer.js';

let dataset: AcademicOfferingDataset;
let authorization: PostgresSessionStore;
let actor: SessionActor;
let courseId: string;
let groupId: string;
const db = () => dataset.context.database.pool;
beforeAll(async () => {
  dataset = await academicOfferingDataset('academic_writer'); authorization = new PostgresSessionStore(db());
}, 120000);
beforeEach(async () => {
  actor = (await authorization.lookup((await sessionFixture(dataset.context, 'ADMIN')).secret))!;
  ({ courseId, groupId } = await draftGroup(db()));
});
afterAll(async () => { await dataset?.cleanup(); });
async function course(client: Pick<PoolClient, 'query'>, id: string): Promise<AdminCourse> {
  const row = (await client.query<{ id: string; name: string; description: string | null; state: 'DRAFT'; revision: string;
    createdAt: Date; updatedAt: Date }>('SELECT id,name,description,state,revision::text,"createdAt","updatedAt" FROM "AcademicCourse" WHERE id=$1', [id])).rows[0];
  return { ...row, studentVisible: false, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
async function group(client: PoolClient, id: string): Promise<AdminGroup> {
  const row = (await client.query<{ id: string; courseId: string; name: string; revision: string; createdAt: Date; updatedAt: Date }>(
    'SELECT id,"courseId",name,revision::text,"createdAt","updatedAt" FROM "AcademicGroup" WHERE id=$1', [id])).rows[0];
  return { ...row, state: 'DRAFT', periodStart: null, periodEnd: null, timeZone: 'America/Lima', capacity: null,
    schedule: [], teacher: null, teacherReviewRequired: false, studentVisible: false, occupancy: null, availability: null,
    capacityStatus: 'NOT_CALCULATED', cancellationReason: null, cancelledAt: null, lastPublishedTeacherId: null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
const topology = () => ({ accountIds: [actor.userId], courseIds: [courseId], groupIds: [] });
function command(): AcademicCommandWork<AdminCourse> {
  return { actor, permission: 'academic:manage', commandId: randomUUID(), requestId: randomUUID(), operation: 'COURSE_EDIT',
    targetKind: 'COURSE', targetId: courseId, expectedRevision: '1', payload: { name: 'Edición ficticia' },
    discover: async () => topology(), recheck: async () => topology(), project: course,
    apply: async client => { await client.query('UPDATE "AcademicCourse" SET name=$2,revision=revision+1 WHERE id=$1', [courseId, 'Edición ficticia']);
      return { resource: await course(client, courseId), beforeState: 'DRAFT', beforeRevision: '1', result: 'APPLIED' }; } };
}
async function counts(id: string) {
  return (await db().query(`SELECT (SELECT count(*)::int FROM "AcademicCommand" WHERE "actorUserId"=$1 AND "commandId"=$2) AS ledger,
    (SELECT count(*)::int FROM "AcademicAuditEvent" WHERE "actorUserId"=$1 AND "commandId"=$2) AS audit,
    (SELECT revision::text FROM "AcademicCourse" WHERE id=$3) AS revision`, [actor.userId, id, courseId])).rows[0];
}

test('W01 escritor real: CHECK de auditoría falla después del ledger y revierte ambos con el agregado', async () => {
  const input = command();
  await dataset.context.isolated.ownerQuery(`ALTER TABLE "AcademicAuditEvent" ADD CONSTRAINT writer_fixture_failure CHECK ("requestId" <> '${input.requestId}'::uuid)`);
  try {
    const error = await createAcademicCommandWriter(db(), authorization)(input).catch(error => error);
    expect(error).toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
    expect(error.message).not.toMatch(/Academic|SQL|23514|fixture|CHECK/);
    expect(await counts(input.commandId)).toEqual({ ledger: 0, audit: 0, revision: '1' });
  } finally { await dataset.context.isolated.ownerQuery('ALTER TABLE "AcademicAuditEvent" DROP CONSTRAINT writer_fixture_failure'); }
  await createAcademicCommandWriter(db(), authorization)(input);
  expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '2' });
});

test('W02 revisión obsoleta se rechaza bajo locks antes del callback; la clave sigue libre', async () => {
  const input = command(); const apply = vi.fn(input.apply); const write = createAcademicCommandWriter(db(), authorization);
  await db().query('UPDATE "AcademicCourse" SET revision=2 WHERE id=$1', [courseId]);
  await expect(write({ ...input, apply })).rejects.toMatchObject({ code: 'OFFERING_VERSION_CONFLICT' });
  expect(apply).not.toHaveBeenCalled(); expect(await counts(input.commandId)).toEqual({ ledger: 0, audit: 0, revision: '2' });
});

test('W03 escritor comparte tres intentos entre redescubrimiento y aborto PG después de auditoría', async () => {
  const input = command(); let discoveries = 0; let audits = 0; let effects = 0;
  const extra = dataset.otherTeacher.userId;
  const write = createAcademicCommandWriter(db(), authorization, { audit: { async write(client, event) {
    await offeringAudit.write(client, event); audits++;
    if (audits === 1) await client.query(`DO $$ BEGIN RAISE EXCEPTION 'aborto ficticio' USING ERRCODE='40001'; END $$`);
  } } });
  await write({ ...input,
    discover: async () => { discoveries++; return { ...topology(), accountIds: discoveries === 1 ? [actor.userId] : [actor.userId, extra] }; },
    recheck: async () => ({ ...topology(), accountIds: [actor.userId, extra] }),
    apply: async client => { effects++; return input.apply(client); } });
  expect(discoveries).toBe(3); expect(effects).toBe(2); expect(audits).toBe(2);
  expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '2' });
});

test('W04 JSON anidado canónico conserva arrays; cambiar su orden es una intención distinta', async () => {
  const input = { ...command(), payload: { nested: { b: 2, a: 1 }, slots: [1, 2] } };
  const write = createAcademicCommandWriter(db(), authorization); await write(input);
  expect((await write({ ...input, payload: { slots: [1, 2], nested: { a: 1, b: 2 } } })).command.replayed).toBe(true);
  await expect(write({ ...input, payload: { nested: { a: 1, b: 2 }, slots: [2, 1] } })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  expect(await counts(input.commandId)).toEqual({ ledger: 1, audit: 1, revision: '2' });
});

test('W05 el escritor exige academic:manage aunque el llamante pase profile:read', async () => {
  const student = (await authorization.lookup((await sessionFixture(dataset.context, 'STUDENT')).secret))!;
  const input = command(); const apply = vi.fn(input.apply);
  await expect(createAcademicCommandWriter(db(), authorization)({ ...input, actor: student, permission: 'profile:read', apply }))
    .rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(apply).not.toHaveBeenCalled(); expect(await counts(input.commandId)).toEqual({ ledger: 0, audit: 0, revision: '1' });
});

test('W06 alta ficticia: UUID original se recupera del ledger y no se crea otro recurso', async () => {
  const input = command(); const id = randomUUID(); const apply = vi.fn(async (client: PoolClient) => {
    await client.query('INSERT INTO "AcademicCourse" (id,name) VALUES ($1,$2)', [id, 'Alta ficticia']);
    return { resource: await course(client, id), beforeState: null, beforeRevision: null, result: 'APPLIED' as const };
  });
  const create: AcademicCommandWork<AdminCourse> = { ...input, operation: 'COURSE_CREATE', targetId: id,
    expectedRevision: undefined, payload: { name: 'Alta ficticia' }, discover: async () => ({ ...topology(), courseIds: [] }),
    recheck: async () => ({ ...topology(), courseIds: [] }), apply };
  const write = createAcademicCommandWriter(db(), authorization); const first = await write(create);
  const unusedId = randomUUID(); const replay = await write({ ...create, targetId: unusedId, requestId: randomUUID() });
  expect(first.command).toMatchObject({ replayed: false, appliedRevision: '1' });
  expect(replay.resource.id).toBe(id); expect(replay.command).toMatchObject({ replayed: true, appliedRevision: '1' });
  expect(apply).toHaveBeenCalledTimes(1);
  expect((await db().query('SELECT count(*)::int AS n FROM "AcademicCourse" WHERE id=$1', [unusedId])).rows[0].n).toBe(0);
  const audit = (await db().query('SELECT "resourceId","beforeState","beforeRevision","afterRevision"::text FROM "AcademicAuditEvent" WHERE "commandId"=$1', [input.commandId])).rows;
  expect(audit).toEqual([{ resourceId: id, beforeState: null, beforeRevision: null, afterRevision: '1' }]);
  await expect(write({ ...create, payload: { name: 'Otra alta ficticia' } })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});

test('W07 escritor genérico: grupo con revisión bigint mayor que precisión JS y auditoría propia', async () => {
  const start = '9007199254740993'; const end = '9007199254740994';
  await db().query('UPDATE "AcademicGroup" SET revision=$2 WHERE id=$1', [groupId, start]);
  const input: AcademicCommandWork<AdminGroup> = { ...command(), operation: 'GROUP_EDIT', targetKind: 'GROUP', targetId: groupId,
    expectedRevision: start, discover: async () => ({ ...topology(), groupIds: [groupId] }),
    recheck: async () => ({ ...topology(), groupIds: [groupId] }), project: group,
    apply: async client => { await client.query('UPDATE "AcademicGroup" SET name=$2,revision=revision+1 WHERE id=$1', [groupId, 'Grupo corregido ficticio']);
      return { resource: await group(client, groupId), beforeState: 'DRAFT', beforeRevision: start, result: 'APPLIED' }; } };
  const write = createAcademicCommandWriter(db(), authorization);
  expect((await write(input)).command).toMatchObject({ appliedRevision: end, replayed: false });
  expect((await write(input)).resource.revision).toBe(end);
  const events = (await db().query('SELECT "resourceKind","beforeRevision"::text,"afterRevision"::text FROM "AcademicAuditEvent" WHERE "commandId"=$1', [input.commandId])).rows;
  expect(events).toEqual([{ resourceKind: 'GROUP', beforeRevision: start, afterRevision: end }]);
});
