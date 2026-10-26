import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { academicFingerprint, preparationSeed } from '../support/academic-preparation.js';
import { change, commandCounts, existingCommands, maintenanceSeed, resetAcademicFixture, savedGroup } from '../support/academic-maintenance.js';
import { instrumentPool } from '../support/academic-foundation-contract.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import type { OfferingCommand } from '../../src/modules/academic-offering/application/offering-store.js';
import { sessionFixture } from '../support/session-fixture.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';

let data: AcademicOfferingDataset, sessions: PostgresSessionStore, actor: SessionActor, other: SessionActor, http: Us1Http;
let seed: Awaited<ReturnType<typeof preparationSeed>>;
const db = () => data.context.database.pool;
beforeAll(async () => {
  data = await academicOfferingDataset('academic_commands'); sessions = new PostgresSessionStore(db()); http = await us1Http(data);
  actor = (await sessions.lookup(data.account('ADMIN').sessions[0].secret))!; other = (await sessions.lookup(data.secondAdmin.secret))!;
}, 120000);
beforeEach(async () => { await resetAcademicFixture(data); seed = await preparationSeed(db()); });
afterAll(async () => { try { await http?.close(); } finally { await data?.cleanup(); } });
const execute = (command: OfferingCommand, who = actor, pool = db()) => existingCommands(pool, sessions).execute(who, command, { requestId: randomUUID() });
const edit = (commandId = randomUUID(), expectedRevision = '1'): Extract<OfferingCommand, { operation: 'GROUP_EDIT' }> => ({ operation: 'GROUP_EDIT', commandId,
  groupId: seed.groupId, expectedRevision, changes: { capacity: 25 } });
async function unchanged(work: () => Promise<unknown>, code: string) {
  const before = await academicFingerprint(data.observerPool); await expect(work()).rejects.toMatchObject({ code });
  expect(await academicFingerprint(data.observerPool)).toBe(before);
}
test('K01 dos administradores/revisión 1: un cambio y un conflicto, cero sobrescrituras', async () => {
  const a = edit(), b = { ...edit(), changes: { capacity: 26 } };
  const results = await Promise.allSettled([execute(a), execute(b, other)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'OFFERING_VERSION_CONFLICT' } });
  const row = await savedGroup(data, seed.groupId); expect([25,26]).toContain(row.capacity); expect(row.revision).toBe(2);
  const totals = await Promise.all([commandCounts(data, a.commandId), commandCounts(data, b.commandId)]);
  expect(totals.reduce((n, r) => n + r.ledger, 0)).toBe(1); expect(totals.reduce((n, r) => n + r.audit, 0)).toBe(1);
});
test('K02 alta simultánea mismo actor/commandId recupera mismo UUID y único efecto', async () => {
  const input = { operation: 'COURSE_CREATE', commandId: randomUUID(), attributes: { name: 'Alta repetida' } } as const;
  const results = await Promise.all([execute(input), execute(input)]);
  expect(results[0].resource.id).toBe(results[1].resource.id); expect(results.map(r => r.command.replayed).sort()).toEqual([false,true]);
  expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
  expect((await db().query('SELECT count(*)::int AS n FROM "AcademicCourse" WHERE name=$1', ['Alta repetida'])).rows[0].n).toBe(1);
});
test('K03 igual payload/commandId con actor distinto corresponde a dos intenciones independientes', async () => {
  const input = { operation: 'COURSE_CREATE', commandId: randomUUID(), attributes: { name: 'No es clave de unicidad' } } as const;
  const results = await Promise.all([execute(input), execute(input, other)]);
  expect(results[0].resource.id).not.toBe(results[1].resource.id); expect(results.every(r => !r.command.replayed)).toBe(true);
  expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 2, audit: 2 });
});
test('K04 dos envíos simultáneos de edición idéntica: un ledger/evento y revisión 2', async () => {
  const input = edit(); const result = await Promise.all([execute(input), execute(input)]);
  expect(result.map(r => r.command.replayed).sort()).toEqual([false,true]); expect(result.every(r => r.command.appliedRevision === '2')).toBe(true);
  expect((await savedGroup(data, seed.groupId)).revision).toBe(2); expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
});
test('K05 NO_CHANGE conserva agregado; comando aceptado tiene un ledger y un evento NO_CHANGE', async () => {
  const before = await savedGroup(data, seed.groupId); const input = { operation: 'GROUP_EDIT', groupId: seed.groupId,
    expectedRevision: '1', commandId: randomUUID(), changes: { name: 'Turno A' } } as const;
  expect((await execute(input)).command).toMatchObject({ result: 'NO_CHANGE', appliedRevision: '1' });
  expect(await savedGroup(data, seed.groupId)).toEqual(before); expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
  expect((await db().query('SELECT result FROM "AcademicAuditEvent" WHERE "commandId"=$1', [input.commandId])).rows[0].result).toBe('NO_CHANGE');
});
test('K06 replay retorna proyección actual y revisión aplicada original sin segundo evento', async () => {
  const input = edit(); await execute(input);
  await execute({ operation: 'GROUP_EDIT', groupId: seed.groupId, expectedRevision: '2', commandId: randomUUID(), changes: { name: 'Más reciente' } });
  const replay = await execute(input); expect(replay.resource).toMatchObject({ name: 'Más reciente', revision: '3', capacity: 25 });
  expect(replay.command).toMatchObject({ replayed: true, appliedRevision: '2' }); expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
});
for (const kind of ['payload','target','operation','revision'] as const) test(`K07 digest diferencia ${kind}, sin aplicar ni reemplazar ledger`, async () => {
  const input = edit(); await execute(input);
  const changed: OfferingCommand = kind === 'payload' ? { ...input, changes: { capacity: 26 } } as OfferingCommand
    : kind === 'target' ? { ...input, groupId: seed.otherGroupId } as OfferingCommand
      : kind === 'operation' ? { operation: 'GROUP_SCHEDULE', commandId: input.commandId, groupId: seed.groupId, expectedRevision: '1', schedule: [] }
        : { ...input, expectedRevision: '2' } as OfferingCommand;
  await unchanged(() => execute(changed), 'IDEMPOTENCY_CONFLICT'); expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
});
for (const loss of ['role','session'] as const) test(`K08 replay reautoriza antes del ledger tras pérdida de ${loss}`, async () => {
  const fresh = await sessionFixture(data.context, 'ADMIN'); const who = (await sessions.lookup(fresh.secret))!; const input = edit(); await execute(input, who);
  if (loss === 'role') await db().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [who.userId]);
  else await db().query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [who.sessionId]);
  await unchanged(() => execute(input, who), loss === 'role' ? 'FORBIDDEN' : 'AUTH_REQUIRED');
  expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
});
test('K09 fallo de auditoría real revierte datos y ledger; misma intención puede confirmarse después', async () => {
  const input = edit(); await data.context.isolated.ownerQuery(`ALTER TABLE "AcademicAuditEvent" ADD CONSTRAINT maintenance_reject_audit CHECK ("commandId" <> '${input.commandId}'::uuid)`);
  try { await unchanged(() => execute(input), 'TEMPORARILY_UNAVAILABLE'); expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 0, audit: 0 }); }
  finally { await data.context.isolated.ownerQuery('ALTER TABLE "AcademicAuditEvent" DROP CONSTRAINT maintenance_reject_audit'); }
  expect((await execute(input)).command.replayed).toBe(false); expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
});
for (const phase of ['before','after'] as const) test(`K10 COMMIT ambiguo ${phase}: no replay automático, resolución manual por mismo ID`, async () => {
  const input = edit(); let injected = false;
  const fault = (sql: string) => { if (/^COMMIT\b/.test(sql) && !injected) { injected = true; throw Object.assign(new Error('Transporte ficticio'), { code: '08006' }); } };
  const trace = instrumentPool(db(), phase === 'before' ? { before: fault } : { after: fault });
  await expect(execute(input, actor, trace.pool)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect(trace.statements.filter(s => /^BEGIN\b/.test(s.sql))).toHaveLength(1);
  expect(await commandCounts(data, input.commandId)).toEqual(phase === 'before' ? { ledger: 0, audit: 0 } : { ledger: 1, audit: 1 });
  expect((await savedGroup(data, seed.groupId)).revision).toBe(phase === 'before' ? 1 : 2);
  const result = await execute(input); expect(result.command.replayed).toBe(phase === 'after');
  expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 }); expect((await savedGroup(data, seed.groupId)).revision).toBe(2);
});
test('K11 cliente descarta respuesta HTTP de alta aplicada y la recupera sin UUID ni evento nuevos', async () => {
  const input = { commandId: randomUUID(), name: 'Respuesta descartada' }; const secret = data.account('ADMIN').sessions[0].secret;
  const first = await http.post('/admin/academic/courses', input, secret); expect(first.status).toBe(201); await first.body?.cancel();
  const result = await http.post('/admin/academic/courses', input, secret); expect(result.status).toBe(201);
  expect((await result.json()).data.command.replayed).toBe(true); expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
  expect((await db().query('SELECT count(*)::int AS n FROM "AcademicCourse" WHERE name=$1', [input.name])).rows[0].n).toBe(1);
});
for (const operation of ['COURSE_WITHDRAW','GROUP_CANCEL'] as const) test(`K12 ${operation}: replay aceptado no es una segunda transición ni un segundo evento`, async () => {
  await resetAcademicFixture(data); const published = await maintenanceSeed(data);
  const input = change(operation, operation === 'COURSE_WITHDRAW' ? published.courseId : published.groupId);
  const first = await execute(input); expect(first.command).toMatchObject({ replayed: false, result: 'APPLIED', appliedRevision: '2' });
  expect((await execute(input)).command).toMatchObject({ replayed: true, appliedRevision: '2' });
  expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
  const corrected = { ...input, commandId: randomUUID(), expectedRevision: '2' };
  await unchanged(() => execute(corrected), 'OFFERING_STATE_CONFLICT'); expect(await commandCounts(data, corrected.commandId)).toEqual({ ledger: 0, audit: 0 });
});
