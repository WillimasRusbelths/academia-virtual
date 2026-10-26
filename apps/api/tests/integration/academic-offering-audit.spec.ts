import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { SecurityEvents } from '../../src/infrastructure/logging/security-events.js';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { academicFingerprint } from '../support/academic-preparation.js';
import { commandCounts, maintenanceSeed, resetAcademicFixture } from '../support/academic-maintenance-fixture.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';

let data: AcademicOfferingDataset, http: Us1Http, directory: string;
let seed: Awaited<ReturnType<typeof maintenanceSeed>>;
const canary = 'PRIVATE_OFFERING_CANARY';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const auditFields = ['id','actorUserId','resourceKind','resourceId','action','result','commandId','requestId',
  'beforeState','afterState','beforeRevision','afterRevision','occurredAt'].sort();
const ledgerFields = ['actorUserId','commandId','operation','targetKind','targetId','payloadDigest','resultingRevision','result','appliedAt'].sort();
const operations = ['COURSE_CREATE','COURSE_EDIT','COURSE_PUBLISH','COURSE_WITHDRAW','GROUP_CREATE','GROUP_EDIT',
  'GROUP_SCHEDULE','GROUP_PUBLISH','GROUP_WITHDRAW','GROUP_CANCEL'] as const;
type Operation = typeof operations[number];
type Intent = { method: string; route: string; template: string; body: Record<string, unknown> & { commandId: string }; beforeState: string | null; afterState: string; kind: 'COURSE' | 'GROUP' };
const admin = () => data.account('ADMIN').sessions[0].secret;
const db = () => data.context.database.pool;
beforeAll(async () => {
  data = await academicOfferingDataset('academic_audit');
  directory = mkdtempSync(path.join(tmpdir(), 'academic-audit-private-'));
  http = await us1Http(data, data.context.environment.appOrigin, new SecurityEvents(directory));
}, 120000);
beforeEach(async () => {
  await resetAcademicFixture(data); seed = await maintenanceSeed(data);
  for (const file of readdirSync(directory)) { expect(file).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/); unlinkSync(path.join(directory, file)); }
});
afterAll(async () => { try { await http?.close(); } finally { try { await data?.cleanup(); } finally { if (directory) rmSync(directory, { recursive: true, force: true }); } } });

function noPrivate(text: string) {
  for (const value of [canary, data.context.environment.databaseSchema, data.secondAdmin.secret,
    ...(['ADMIN','STUDENT','TEACHER'] as const).flatMap(role => [data.account(role).email, data.account(role).sessions[0].secret])])
    expect(text).not.toContain(value);
  expect(text).not.toMatch(/\b(?:SELECT|UPDATE|INSERT|DELETE|ALTER)\b|Academic(?:Group|Course|AuditEvent|Command)|passwordHash|authVersion|eligibilityVersion|payloadDigest|cancellationReason|publishedTeacher/);
}
function logs(): Record<string, unknown>[] {
  return readdirSync(directory).flatMap(file => {
    const text = readFileSync(path.join(directory, file), 'utf8'); noPrivate(text);
    return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
  });
}
async function rows(commandId: string) {
  return (await data.observerPool.query<{ audit: Record<string, unknown>; ledger: Record<string, unknown> }>(`SELECT to_jsonb(a) AS audit,to_jsonb(c) AS ledger
    FROM "AcademicAuditEvent" a JOIN "AcademicCommand" c USING ("actorUserId","commandId") WHERE a."commandId"=$1 ORDER BY a."actorUserId"`, [commandId])).rows;
}
async function now(): Promise<number> { return (await data.observerPool.query<{ at: Date }>('SELECT clock_timestamp() AS at')).rows[0].at.getTime(); }
async function send(intent: Intent, secret = admin(), spoof = randomUUID()) {
  return fetch(`${http.url}/api/v1${intent.route}`, { method: intent.method,
    headers: { ...http.headers(secret), 'x-request-id': spoof, 'x-debug': canary }, body: JSON.stringify(intent.body) });
}
async function prepare(operation: Operation, noChange = false): Promise<Intent> {
  const course = operation.startsWith('COURSE'), create = operation.endsWith('_CREATE');
  const id = course ? seed.courseId : seed.groupId, kind = course ? 'COURSE' : 'GROUP';
  const base = `/admin/academic/${course ? 'courses' : 'groups'}`;
  let route = `${base}/${id}`, template = `${base}/:id`, method = 'POST', beforeState: string | null = 'PUBLISHED', afterState: string;
  const body: Intent['body'] = { commandId: randomUUID(), ...(create ? {} : { expectedRevision: '1' }) };
  if (create) {
    route = course ? base : `/admin/academic/courses/${seed.courseId}/groups`;
    template = course ? base : '/admin/academic/courses/:courseId/groups'; beforeState = null; afterState = 'DRAFT';
    Object.assign(body, { name: canary, ...(course ? { description: canary } : { capacity: 50 }) });
  } else if (operation.endsWith('_EDIT') || operation === 'GROUP_SCHEDULE' || operation.endsWith('_PUBLISH')) {
    await db().query(`UPDATE "${course ? 'AcademicCourse' : 'AcademicGroup'}" SET state='WITHDRAWN' WHERE id=$1`, [id]);
    beforeState = afterState = 'WITHDRAWN';
    if (operation.endsWith('_EDIT')) { method = 'PATCH'; body.name = noChange ? (course ? 'Curso preparado' : 'Turno A') : canary; }
    else if (operation === 'GROUP_SCHEDULE') {
      method = 'PUT'; route += '/schedule'; template += '/schedule';
      body.schedule = [{ dayOfWeek: noChange ? 1 : 3, startTime: '18:00', endTime: '19:00' }];
    } else { route += '/publish'; template += '/publish'; afterState = 'PUBLISHED'; }
  } else {
    const cancel = operation === 'GROUP_CANCEL'; route += cancel ? '/cancel' : '/withdraw'; template += cancel ? '/cancel' : '/withdraw';
    afterState = cancel ? 'CANCELLED' : 'WITHDRAWN'; if (cancel) body.cancellationReason = canary;
  }
  return { method, route, template, body, beforeState, afterState, kind };
}
async function accepted(intent: Intent, operation: Operation, result: 'APPLIED' | 'NO_CHANGE' = 'APPLIED') {
  const low = await now(), spoof = randomUUID();
  const response = await send(intent, admin(), spoof); expect(response.status).toBe(operation.endsWith('_CREATE') ? 201 : 200);
  const value = (await response.json()).data, high = await now();
  const stored = await rows(intent.body.commandId); expect(stored).toHaveLength(1);
  const { audit, ledger } = stored[0];
  expect(Object.keys(audit).sort()).toEqual(auditFields); expect(Object.keys(ledger).sort()).toEqual(ledgerFields);
  const revision = intent.beforeState === null ? 1 : result === 'NO_CHANGE' ? 1 : 2;
  expect(value.resource).toMatchObject({ state: intent.afterState, revision: String(revision) });
  const table = intent.kind === 'COURSE' ? 'AcademicCourse' : 'AcademicGroup';
  expect((await data.observerPool.query(`SELECT state,revision::text FROM "${table}" WHERE id=$1`, [value.resource.id])).rows)
    .toEqual([{ state: intent.afterState, revision: String(revision) }]);
  expect(audit).toMatchObject({ actorUserId: data.account('ADMIN').id, resourceKind: intent.kind, resourceId: value.resource.id,
    action: operation, result, commandId: intent.body.commandId, beforeState: intent.beforeState, afterState: intent.afterState,
    beforeRevision: intent.beforeState === null ? null : 1, afterRevision: revision });
  expect(audit.requestId).toMatch(uuid); expect(audit.requestId).not.toBe(intent.body.commandId); expect(audit.requestId).not.toBe(spoof);
  expect(audit.id).toMatch(uuid);
  expect(ledger).toMatchObject({ actorUserId: audit.actorUserId, commandId: intent.body.commandId, operation,
    targetKind: intent.kind, targetId: value.resource.id, result, resultingRevision: revision });
  expect(ledger.payloadDigest).toMatch(/^\\x[0-9a-f]{64}$/);
  for (const instant of [audit.occurredAt, ledger.appliedAt]) {
    expect(instant).toMatch(/(?:Z|\+00:00)$/); const time = Date.parse(instant as string);
    expect(time).toBeGreaterThanOrEqual(low); expect(time).toBeLessThanOrEqual(high);
  }
  expect(JSON.stringify(stored)).not.toContain(canary); expect(JSON.stringify(stored)).not.toContain(admin());
  expect(value.command).toEqual({ id: intent.body.commandId, replayed: false, result, appliedRevision: String(revision) });
  const fingerprint = await academicFingerprint(data.observerPool);
  const replay = await send(intent); expect(replay.status).toBe(response.status);
  expect((await replay.json()).data).toEqual({ ...value, command: { ...value.command, replayed: true } });
  expect(await academicFingerprint(data.observerPool)).toBe(fingerprint); expect(await rows(intent.body.commandId)).toEqual(stored);
  expect(await commandCounts(data, intent.body.commandId)).toEqual({ ledger: 1, audit: 1 }); expect(logs()).toEqual([]);
  return value;
}
for (const operation of operations) test(`A01 ${operation}: hecho mínimo actor/recurso/acción/momento/resultado y replay HTTP sin segundo APPLIED`, async () => {
  const identity = (await data.observerPool.query('SELECT count(*)::int AS n FROM "AuditEvent"')).rows;
  await accepted(await prepare(operation), operation);
  expect((await data.observerPool.query('SELECT count(*)::int AS n FROM "AuditEvent"')).rows).toEqual(identity);
});
for (const operation of ['COURSE_EDIT','GROUP_EDIT','GROUP_SCHEDULE'] as const) test(`A02 ${operation}: NO_CHANGE auditable una vez, agregado y revisión conservados`, async () => {
  const intent = await prepare(operation, true);
  const table = operation === 'COURSE_EDIT' ? 'AcademicCourse' : 'AcademicGroup', id = operation === 'COURSE_EDIT' ? seed.courseId : seed.groupId;
  const before = (await data.observerPool.query(`SELECT to_jsonb(t) AS value FROM "${table}" t WHERE id=$1`, [id])).rows;
  const slots = (await data.observerPool.query('SELECT to_jsonb(t) AS value FROM "AcademicSlot" t ORDER BY id')).rows;
  await accepted(intent, operation, 'NO_CHANGE');
  expect((await data.observerPool.query(`SELECT to_jsonb(t) AS value FROM "${table}" t WHERE id=$1`, [id])).rows).toEqual(before);
  expect((await data.observerPool.query('SELECT to_jsonb(t) AS value FROM "AcademicSlot" t ORDER BY id')).rows).toEqual(slots);
});
test('A03 replay devuelve proyección actual y revisión aplicada original, sin modificar el hecho histórico', async () => {
  const intent = await prepare('GROUP_EDIT'); await accepted(intent, 'GROUP_EDIT'); const original = await rows(intent.body.commandId);
  const next = { ...intent, body: { commandId: randomUUID(), expectedRevision: '2', name: 'Corrección posterior ficticia' } };
  expect((await send(next)).status).toBe(200); const fingerprint = await academicFingerprint(data.observerPool);
  const replay = await send(intent); expect(replay.status).toBe(200); const value = (await replay.json()).data;
  expect(value.resource).toMatchObject({ name: next.body.name, revision: '3' });
  expect(value.command).toMatchObject({ replayed: true, appliedRevision: '2', result: 'APPLIED' });
  expect(await rows(intent.body.commandId)).toEqual(original); expect(await academicFingerprint(data.observerPool)).toBe(fingerprint);
});
test('A04 retiro, sustitución y cancelación conservan snapshot docente previo e historial de transiciones', async () => {
  const snapshot = async () => (await data.observerPool.query('SELECT "publishedTeacherUserId","publishedTeacherEligibilityVersion"::text FROM "AcademicGroup" WHERE id=$1', [seed.groupId])).rows[0];
  const previous = await snapshot(); expect(previous.publishedTeacherUserId).toBe(seed.teacherId);
  const withdraw = await prepare('GROUP_WITHDRAW'); await accepted(withdraw, 'GROUP_WITHDRAW'); const first = await rows(withdraw.body.commandId);
  expect(await snapshot()).toEqual(previous);
  const edit: Intent = { ...withdraw, method: 'PATCH', route: withdraw.route.replace('/withdraw',''), template: '/admin/academic/groups/:id',
    body: { commandId: randomUUID(), expectedRevision: '2', teacherUserId: data.otherTeacher.userId } };
  expect((await send(edit)).status).toBe(200); expect(await snapshot()).toEqual(previous);
  const cancel: Intent = { ...withdraw, route: withdraw.route.replace('/withdraw','/cancel'), template: '/admin/academic/groups/:id/cancel',
    body: { commandId: randomUUID(), expectedRevision: '3', cancellationReason: canary } };
  expect((await send(cancel)).status).toBe(200); expect(await snapshot()).toEqual(previous);
  expect((await rows(edit.body.commandId))[0].audit).toMatchObject({ action: 'GROUP_EDIT', beforeState: 'WITHDRAWN', afterState: 'WITHDRAWN', beforeRevision: 2, afterRevision: 3 });
  expect((await rows(cancel.body.commandId))[0].audit).toMatchObject({ action: 'GROUP_CANCEL', beforeState: 'WITHDRAWN', afterState: 'CANCELLED', beforeRevision: 3, afterRevision: 4 });
  const fingerprint = await academicFingerprint(data.observerPool); expect((await send(withdraw)).status).toBe(200);
  expect(await rows(withdraw.body.commandId)).toEqual(first); expect(await academicFingerprint(data.observerPool)).toBe(fingerprint);
});
async function safeError(response: Response, intent: Intent, status: number, code: string, parsedCommand = true) {
  expect(response.status).toBe(status); const value = await response.json(); noPrivate(JSON.stringify(value));
  expect(Object.keys(value)).toEqual(['error']); expect(value.error).toMatchObject({ code, requestId: expect.stringMatching(uuid) });
  expect(Object.keys(value.error).sort()).toEqual(['code','message','requestId']);
  const events = logs(); expect(events).toHaveLength(1); const event = events[0];
  const allowed = ['eventId','correlationId','occurredAt','category','action','result','reasonCode','actorKind','targetKind','actorUserId','requestedTargetId','routeTemplate','commandId'];
  expect(Object.keys(event).every(key => allowed.includes(key))).toBe(true);
  expect(event).toMatchObject({ correlationId: value.error.requestId, reasonCode: code, targetKind: intent.kind,
    requestedTargetId: intent.route.split('/').at(-2), routeTemplate: intent.template,
    category: status === 503 ? 'OPERATION' : 'SECURITY', action: status === 503 ? 'RUNTIME_FAILURE' : status === 409 ? 'ADMIN_COMMAND_REJECTED' : 'ACCESS_DENIED',
    result: status === 503 ? 'FAILED' : 'DENIED' });
  expect(event.eventId).toMatch(uuid); expect(event.occurredAt).toMatch(/Z$/);
  if (parsedCommand) expect(event).toMatchObject({ actorKind: 'ACCOUNT', actorUserId: data.account('ADMIN').id, commandId: intent.body.commandId });
  else expect(event).not.toHaveProperty('commandId');
}
for (const operation of ['COURSE_WITHDRAW','GROUP_WITHDRAW','GROUP_CANCEL'] as const) for (const failure of ['AcademicCommand','AcademicAuditEvent'] as const)
  test(`A05 ${operation}/${failure}: fallo SQL revierte negocio/ledger/auditoría; log real seguro y retry explícito único`, async () => {
    const intent = await prepare(operation), before = await academicFingerprint(data.observerPool);
    await data.context.isolated.ownerQuery(`ALTER TABLE "${failure}" ADD CONSTRAINT academic_audit_failure CHECK (false)`);
    try { await safeError(await send(intent), intent, 503, 'TEMPORARILY_UNAVAILABLE');
      expect(await academicFingerprint(data.observerPool)).toBe(before); expect(await commandCounts(data, intent.body.commandId)).toEqual({ ledger: 0, audit: 0 }); }
    finally { await data.context.isolated.ownerQuery(`ALTER TABLE "${failure}" DROP CONSTRAINT academic_audit_failure`); }
    expect((await send(intent)).status).toBe(200); expect((await send(intent)).status).toBe(200);
    expect(await commandCounts(data, intent.body.commandId)).toEqual({ ledger: 1, audit: 1 }); expect(logs()).toHaveLength(1);
    const table = intent.kind === 'COURSE' ? 'AcademicCourse' : 'AcademicGroup', target = intent.route.split('/').at(-2);
    expect((await data.observerPool.query(`SELECT state,revision::text FROM "${table}" WHERE id=$1`, [target])).rows)
      .toEqual([{ state: intent.afterState, revision: '2' }]);
  });
for (const defect of ['revision','payload','state'] as const) test(`A06 rechazo ${defect}: canal privado correlacionado sin motivo/cuerpo/SQL ni hecho aceptado`, async () => {
  let intent = await prepare('GROUP_CANCEL');
  if (defect !== 'revision') { expect((await send(intent)).status).toBe(200);
    intent = { ...intent, body: defect === 'payload' ? { ...intent.body, cancellationReason: canary+'changed' }
      : { ...intent.body, commandId: randomUUID(), expectedRevision: '2' } }; }
  else intent.body.expectedRevision = '2';
  const before = await academicFingerprint(data.observerPool);
  await safeError(await send(intent), intent, 409, defect === 'revision' ? 'OFFERING_VERSION_CONFLICT' : defect === 'payload' ? 'IDEMPOTENCY_CONFLICT' : 'OFFERING_STATE_CONFLICT');
  expect(await academicFingerprint(data.observerPool)).toBe(before);
  expect(await commandCounts(data, intent.body.commandId)).toEqual(defect === 'payload' ? { ledger: 1, audit: 1 } : { ledger: 0, audit: 0 });
});
for (const role of ['STUDENT','TEACHER','VISITOR'] as const) test(`A07 ${role}: rechazo HTTP no registra cuerpo/cookie ni fabrica commandId o hecho académico`, async () => {
  const intent = await prepare('GROUP_CANCEL'), before = await academicFingerprint(data.observerPool);
  await safeError(await send(intent, role === 'VISITOR' ? '' : data.account(role).sessions[0].secret), intent,
    role === 'VISITOR' ? 401 : 403, role === 'VISITOR' ? 'AUTH_REQUIRED' : 'FORBIDDEN', false);
  expect(await academicFingerprint(data.observerPool)).toBe(before); expect(await commandCounts(data, intent.body.commandId)).toEqual({ ledger: 0, audit: 0 });
});
test('A08 dos administradores con igual commandId/payload: hechos independientes con actor y requestId propios', async () => {
  const intent = await prepare('COURSE_CREATE');
  const first = await send(intent), second = await send(intent, data.secondAdmin.secret);
  expect(first.status).toBe(201); expect(second.status).toBe(201);
  const a = (await first.json()).data, b = (await second.json()).data; expect(a.resource.id).not.toBe(b.resource.id);
  const stored = await rows(intent.body.commandId); expect(stored).toHaveLength(2);
  expect(stored.map(s=>s.audit.actorUserId).sort()).toEqual([data.account('ADMIN').id,data.secondAdmin.userId].sort());
  expect(new Set(stored.map(s=>s.audit.requestId)).size).toBe(2);
  for (const {audit,ledger} of stored) { expect(Object.keys(audit).sort()).toEqual(auditFields); expect(Object.keys(ledger).sort()).toEqual(ledgerFields);
    const target = audit.actorUserId === data.account('ADMIN').id ? a.resource.id : b.resource.id;
    expect(audit).toMatchObject({ resourceKind: 'COURSE', resourceId: target, action: 'COURSE_CREATE', result: 'APPLIED', beforeState: null, afterState: 'DRAFT', afterRevision: 1 });
    expect(ledger).toMatchObject({ actorUserId: audit.actorUserId, targetKind: 'COURSE', targetId: target, resultingRevision: 1 });
    expect(audit.requestId).toMatch(uuid); expect(audit.requestId).not.toBe(intent.body.commandId); }
  const before = await academicFingerprint(data.observerPool); expect((await send(intent)).status).toBe(201); expect((await send(intent, data.secondAdmin.secret)).status).toBe(201);
  expect(await academicFingerprint(data.observerPool)).toBe(before); expect(await commandCounts(data, intent.body.commandId)).toEqual({ ledger: 2, audit: 2 }); expect(logs()).toEqual([]);
});
