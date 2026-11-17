import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { academicFingerprint } from '../support/academic-preparation.js';
import { change, commandCounts, existingCommands, maintenanceSeed, resetAcademicFixture, savedGroup } from '../support/academic-maintenance.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import type { OfferingCommand } from '../../src/modules/academic-offering/application/offering-store.js';
import { LifecycleCommands } from '../../src/modules/academic-offering/application/commands.js';
import type { LifecycleCommand } from '../../src/modules/academic-offering/application/commands.js';
import { createLifecycleStore } from '../../src/modules/academic-offering/infrastructure/offering-store.js';
import { sessionFixture } from '../support/session-fixture.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';

let data: AcademicOfferingDataset, sessions: PostgresSessionStore, actor: SessionActor, http: Us1Http;
let seed: Awaited<ReturnType<typeof maintenanceSeed>>;
const db = () => data.context.database.pool;
beforeAll(async () => {
  data = await academicOfferingDataset('academic_lifecycle'); sessions = new PostgresSessionStore(db());
  actor = (await sessions.lookup(data.account('ADMIN').sessions[0].secret))!; http = await us1Http(data);
}, 120000);
beforeEach(async () => { await resetAcademicFixture(data); seed = await maintenanceSeed(data); });
afterAll(async () => { try { await http?.close(); } finally { await data?.cleanup(); } });
const execute = (input: OfferingCommand, who = actor) => existingCommands(db(), sessions).execute(who, input, { requestId: randomUUID() });
const publish = (id: string, revision = '1', course = false): OfferingCommand => course
  ? { operation: 'COURSE_PUBLISH', commandId: randomUUID(), courseId: id, expectedRevision: revision }
  : { operation: 'GROUP_PUBLISH', commandId: randomUUID(), groupId: id, expectedRevision: revision };
const get = (path: string) => http.get(path, data.account('STUDENT').sessions[0].secret);
async function unchanged(work: () => Promise<unknown>, code: string) {
  const before = await academicFingerprint(data.observerPool);
  await expect(work()).rejects.toMatchObject({ code }); expect(await academicFingerprint(data.observerPool)).toBe(before);
}
const slots = async (id: string) => (await data.observerPool.query('SELECT * FROM "AcademicSlot" WHERE "groupId"=$1 ORDER BY id', [id])).rows;

test('L01 retiro de curso conserva filas completas de hijos/franjas y no libera su agenda', async () => {
  const children = await Promise.all([savedGroup(data, seed.groupId), savedGroup(data, seed.otherGroupId)]), schedule = await slots(seed.groupId);
  const input = change('COURSE_WITHDRAW', seed.courseId); const result = await execute(input);
  expect(result.resource).toMatchObject({ state: 'WITHDRAWN', revision: '2', studentVisible: false });
  expect(await Promise.all([savedGroup(data, seed.groupId), savedGroup(data, seed.otherGroupId)])).toEqual(children);
  expect(await slots(seed.groupId)).toEqual(schedule); expect((await get(`/academic/courses/${seed.courseId}`)).status).toBe(404);
  await unchanged(() => execute(publish(seed.competitorId)), 'TEACHER_SCHEDULE_CONFLICT');
  expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
});
test('L02 retirar/editar conserva captura; solo publicar explícitamente recupera visibilidad', async () => {
  const original = await savedGroup(data, seed.groupId), sibling = await savedGroup(data, seed.otherGroupId), schedule = await slots(seed.groupId);
  await execute(change('GROUP_WITHDRAW', seed.groupId));
  const row = await savedGroup(data, seed.groupId);
  expect(row).toEqual({ ...original, state: 'WITHDRAWN', revision: 2, updatedAt: row.updatedAt });
  expect(await slots(seed.groupId)).toEqual(schedule);
  await execute({ operation: 'GROUP_EDIT', groupId: seed.groupId, commandId: randomUUID(), expectedRevision: '2', changes: { capacity: 50 } });
  expect(await savedGroup(data, seed.groupId)).toMatchObject({ state: 'WITHDRAWN', revision: 3,
    publishedTeacherUserId: original.publishedTeacherUserId, publishedTeacherEligibilityVersion: original.publishedTeacherEligibilityVersion });
  expect((await get(`/academic/courses/${seed.courseId}/groups/${seed.groupId}`)).status).toBe(404);
  expect((await execute(publish(seed.groupId, '3'))).resource).toMatchObject({ state: 'PUBLISHED', revision: '4', studentVisible: true });
  expect((await get(`/academic/courses/${seed.courseId}/groups/${seed.groupId}`)).status).toBe(200);
  expect(await savedGroup(data, seed.otherGroupId)).toEqual(sibling);
});
for (const state of ['DRAFT', 'PUBLISHED', 'WITHDRAWN'] as const) test(`L03 cancelar ${state}: datos/captura/franjas conservados, motivo privado y fecha del servidor`, async () => {
  if (state === 'DRAFT') { await resetAcademicFixture(data); seed = await maintenanceSeed(data, { firstGroupDraft: true }); }
  if (state === 'WITHDRAWN') await db().query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`, [seed.groupId]);
  const original = await savedGroup(data, seed.groupId), sibling = await savedGroup(data, seed.otherGroupId), schedule = await slots(seed.groupId);
  const start = (await db().query('SELECT clock_timestamp() AS at')).rows[0].at as Date;
  const input = { ...change('GROUP_CANCEL', seed.groupId), cancellationReason: '  Motivo ficticio privado  ' } as OfferingCommand;
  const result = await execute(input), row = await savedGroup(data, seed.groupId);
  const end = (await db().query('SELECT clock_timestamp() AS at')).rows[0].at as Date;
  expect(result.resource).toMatchObject({ state: 'CANCELLED', revision: '2', studentVisible: false, cancellationReason: 'Motivo ficticio privado' });
  expect(row).toEqual({ ...original, state: 'CANCELLED', revision: 2, cancellationReason: 'Motivo ficticio privado', cancelledAt: row.cancelledAt, updatedAt: row.updatedAt });
  expect(Date.parse(row.cancelledAt)).toBeGreaterThanOrEqual(start.getTime()); expect(Date.parse(row.cancelledAt)).toBeLessThanOrEqual(end.getTime());
  expect(await slots(seed.groupId)).toEqual(schedule); expect(await savedGroup(data, seed.otherGroupId)).toEqual(sibling);
  expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
  const hidden = await get(`/academic/courses/${seed.courseId}/groups/${seed.groupId}`); expect(hidden.status).toBe(404);
  expect(await hidden.text()).not.toContain('Motivo ficticio privado');
  const admin = await http.get(`/admin/academic/groups/${seed.groupId}`, data.account('ADMIN').sessions[0].secret);
  expect((await admin.json()).data.cancellationReason).toBe('Motivo ficticio privado');
  expect((await execute(publish(seed.competitorId))).resource.state).toBe('PUBLISHED');
  for (const operation of ['GROUP_WITHDRAW', 'GROUP_CANCEL'] as const) await unchanged(() => execute(change(operation, seed.groupId, '2')), 'OFFERING_STATE_CONFLICT');
  await unchanged(() => execute(publish(seed.groupId, '2')), 'OFFERING_STATE_CONFLICT');
});
test('L04 pérdida/recuperación docente bloquea republicar padre; retirar y republicar hijos es explícito', async () => {
  const old = await savedGroup(data, seed.groupId);
  await db().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [seed.teacherId]);
  await db().query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`, [seed.teacherId]);
  await execute(change('COURSE_WITHDRAW', seed.courseId));
  await unchanged(() => execute(publish(seed.courseId, '2', true)), 'COURSE_PUBLICATION_BLOCKED');
  for (const id of [seed.groupId, seed.otherGroupId]) await execute(change('GROUP_WITHDRAW', id));
  expect((await execute(publish(seed.courseId, '2', true))).resource.studentVisible).toBe(false);
  expect((await savedGroup(data, seed.groupId)).publishedTeacherEligibilityVersion).toBe(old.publishedTeacherEligibilityVersion);
  for (const id of [seed.groupId, seed.otherGroupId]) expect((await execute(publish(id, '2'))).resource).toMatchObject({ studentVisible: true, teacherReviewRequired: false });
  expect((await savedGroup(data, seed.groupId)).publishedTeacherEligibilityVersion).not.toBe(old.publishedTeacherEligibilityVersion);
  expect((await get(`/academic/courses/${seed.courseId}`)).status).toBe(200);
});
for (const operation of ['COURSE_WITHDRAW', 'GROUP_WITHDRAW', 'GROUP_CANCEL'] as const) test(`L05 ${operation}: fallo de auditoría revierte negocio/ledger; retry confirma una vez`, async () => {
  const input = change(operation, operation === 'COURSE_WITHDRAW' ? seed.courseId : seed.groupId);
  await data.context.isolated.ownerQuery('ALTER TABLE "AcademicAuditEvent" ADD CONSTRAINT lifecycle_audit_failure CHECK (false)');
  try { await unchanged(() => execute(input), 'TEMPORARILY_UNAVAILABLE'); expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 0, audit: 0 }); }
  finally { await data.context.isolated.ownerQuery('ALTER TABLE "AcademicAuditEvent" DROP CONSTRAINT lifecycle_audit_failure'); }
  expect((await execute(input)).command.replayed).toBe(false); expect((await execute(input)).command.replayed).toBe(true);
  expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
});
for (const operation of ['COURSE_WITHDRAW', 'GROUP_WITHDRAW', 'GROUP_CANCEL'] as const) for (const role of ['STUDENT', 'TEACHER'] as const) test(`L06 ${operation}/${role}: autorización de aplicación y escritor real sin efectos`, async () => {
  const who = (await sessions.lookup(data.account(role).sessions[0].secret))!;
  const input = change(operation, operation === 'COURSE_WITHDRAW' ? seed.courseId : seed.groupId) as LifecycleCommand;
  const store = createLifecycleStore(db(), { revalidateInTransaction: sessions.revalidateInTransaction.bind(sessions) });
  await unchanged(() => store.execute(who, input, { requestId: randomUUID() }), 'FORBIDDEN');
  await unchanged(() => new LifecycleCommands(store).execute(who, input, { requestId: randomUUID() }), 'FORBIDDEN');
});
test('L07 replay de cancelación reautoriza sesión antes de leer ledger', async () => {
  const fresh = await sessionFixture(data.context, 'ADMIN'), who = (await sessions.lookup(fresh.secret))!;
  const input = change('GROUP_CANCEL', seed.groupId); await execute(input, who);
  await db().query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [who.sessionId]);
  await unchanged(() => execute(input, who), 'AUTH_REQUIRED'); expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
});
test('L08 retirar grupo: replay mismo ID aceptado, ID nuevo no convierte transición inválida en NO_CHANGE', async () => {
  const input = change('GROUP_WITHDRAW', seed.groupId); await execute(input);
  expect((await execute(input)).command).toMatchObject({ replayed: true, appliedRevision: '2' });
  await unchanged(() => execute(change('GROUP_WITHDRAW', seed.groupId, '2')), 'OFFERING_STATE_CONFLICT');
  expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
});
for (const operation of ['GROUP_WITHDRAW', 'GROUP_CANCEL'] as const) test(`L09 docente sin habilitación no impide ${operation}`, async () => {
  const old = await savedGroup(data, seed.groupId);
  await db().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [seed.teacherId]);
  try {
    expect((await execute(change(operation, seed.groupId))).resource.studentVisible).toBe(false);
    expect(await savedGroup(data, seed.groupId)).toMatchObject({ publishedTeacherUserId: old.publishedTeacherUserId, publishedTeacherEligibilityVersion: old.publishedTeacherEligibilityVersion });
  } finally { await db().query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`, [seed.teacherId]); }
});
test('L10 borrador incompleto sin docente/franjas/capacidad se puede cancelar y conservar', async () => {
  await resetAcademicFixture(data); seed = await maintenanceSeed(data, { firstGroupDraft: true });
  await db().query('DELETE FROM "AcademicSlot" WHERE "groupId"=$1', [seed.groupId]);
  await db().query('UPDATE "AcademicGroup" SET "teacherUserId"=NULL,capacity=NULL,"periodStart"=NULL,"periodEnd"=NULL WHERE id=$1', [seed.groupId]);
  expect((await execute(change('GROUP_CANCEL', seed.groupId))).resource).toMatchObject({ state: 'CANCELLED', capacity: null, teacher: null, schedule: [] });
});
for (const defect of ['cancelledAt', 'expectedRevision'] as const) test(`L11 ${defect} inválido no pasa el escritor ni deja efectos`, async () => {
  const input = { ...change('GROUP_CANCEL', seed.groupId), [defect]: defect === 'cancelledAt' ? '2000-01-01T00:00:00.000Z' : '0' } as OfferingCommand;
  await unchanged(() => execute(input), 'VALIDATION_ERROR');
});
