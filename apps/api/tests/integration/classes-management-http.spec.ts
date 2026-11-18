import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { classesFixture, type ClassesFixture } from '../support/classes.js';
import { us1Http } from '../support/us1-http.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import type { ClassCommandResponse, ClassSessionView } from '../../src/modules/classes/public/classes.js';
import { SecurityEvents } from '../../src/infrastructure/logging/security-events.js';

// T019 uses the real composition, transport, database and session cookies.
// No test controllers or fake authority. Until T023, the positive route probe
// fails explicitly: an unregistered route's 404 must not pass security cases.
let f: ClassesFixture, http: Awaited<ReturnType<typeof us1Http>>, financialBefore: string;
let logDirectory: string | undefined, logs: SecurityEvents | undefined;
beforeAll(async () => {
  f = await classesFixture(); financialBefore = await financialFingerprint(f.pool);
  // Keep real class security events out of other suites' global identity logs.
  logDirectory = mkdtempSync(path.join(tmpdir(), 'classes-management-'));
  logs = new SecurityEvents(logDirectory);
  http = await us1Http({ context: f }, f.environment.appOrigin, logs);
}, 120000);
afterAll(async () => {
  try {
    if (f) expect(await financialFingerprint(f.pool)).toBe(financialBefore);
  } finally {
    try { await http?.close(); } finally {
      try { await f?.cleanup(); } finally {
        logs?.onApplicationShutdown();
        if (logDirectory && path.dirname(logDirectory) === tmpdir()) rmSync(logDirectory, { recursive: true, force: true });
      }
    }
  }
});
beforeEach(async () => {
  const response = await request('GET', `/commands/${randomUUID()}`);
  expect(response.status, 'T023 pending: real GET classes/commands must be installed before testing management denials').toBe(200);
  expect(await response.json()).toEqual({ data: { result: 'NOT_CONFIRMED' } });
});
function request(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, secret = f.teacher.secret,
  overrides: Record<string, string | undefined> = {}) {
  const headers: Record<string, string> = http.headers(secret);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete headers[key]; else headers[key] = value;
  }
  return fetch(http.url + '/api/v1/classes' + path, { method, headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const input = () => ({ commandId: randomUUID(), title: 'Clase sintética', description: null });
const action = (revision = '1') => ({ commandId: randomUUID(), expectedRevision: revision });
type Response = ClassCommandResponse<ClassSessionView>;
async function confirmed(response: globalThis.Response, status = 200): Promise<Response> {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const body = await response.json(); expect(Object.keys(body)).toEqual(['data']);
  expect(Object.keys(body.data).sort()).toEqual(['command', 'resource']);
  expect(Object.keys(body.data.command).sort()).toEqual(['appliedEventSeq', 'appliedRevision', 'id', 'replayed', 'result']);
  const data: Response = body.data;
  expect(data.resource.revision).toMatch(/^[1-9]\d*$/);
  expect(data.resource.createdAt).toMatch(/\.\d{6}Z$/);
  expect(data.resource.updatedAt).toMatch(/\.\d{6}Z$/);
  for (const key of ['payloadDigest', 'email', 'passwordHash', 'tokenHash', 'streamKey']) expect(data.resource).not.toHaveProperty(key);
  return data;
}
async function rejected(response: globalThis.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body = await response.json(); expect(body).not.toHaveProperty('data');
  expect(body.error).toMatchObject({ code, requestId: expect.any(String), message: expect.any(String) });
  expect(Object.keys(body.error).every(key => ['code', 'message', 'requestId', 'fields'].includes(key))).toBe(true);
}
async function prepare(groupId = f.groupId, secret = f.teacher.secret) {
  return confirmed(await request('POST', `/groups/${groupId}/sessions`, input(), secret), 201);
}
async function facts() {
  const rows: unknown[] = [];
  for (const table of ['ClassSession', 'ClassCommand', 'ClassChange', 'ClassAuditEvent', 'ClassVideoReference']) {
    rows.push((await f.pool.query(`SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text AS value FROM "${table}" t`)).rows[0].value);
  }
  return rows;
}

test('teacher prepares PREPARED, trims inert texts, and creation replay returns the same class exactly once', async () => {
  const payload = { ...input(), title: '\u00a0 Clase de prueba \u3000', description: ' \n ' }, path = `/groups/${f.groupId}/sessions`;
  const created = await confirmed(await request('POST', path, payload), 201);
  expect(created.resource).toMatchObject({ groupId: f.groupId, state: 'PREPARED', title: 'Clase de prueba', description: null,
    revision: '1', startedAt: null, finishedAt: null, cancelledAt: null });
  expect(created.command).toMatchObject({ id: payload.commandId, result: 'APPLIED', replayed: false, appliedRevision: '1', appliedEventSeq: '1' });
  const before = await facts(), replay = await confirmed(await request('POST', path, payload));
  expect(replay.resource.id).toBe(created.resource.id);
  expect(replay.command).toEqual({ ...created.command, replayed: true }); expect(await facts()).toEqual(before);
});
test('explicit start then finish works without a video reference; neither transition claims signal availability', async () => {
  const created = await prepare(await f.seedGroup()), path = `/sessions/${created.resource.id}`;
  const started = await confirmed(await request('POST', path + '/start', action()));
  expect(started.resource).toMatchObject({ state: 'LIVE', revision: '2', finishedAt: null, cancelledAt: null });
  expect(started.resource.startedAt).toMatch(/\.\d{6}Z$/);
  const finished = await confirmed(await request('POST', path + '/finish', action('2')));
  expect(finished.resource).toMatchObject({ state: 'FINISHED', revision: '3', startedAt: started.resource.startedAt });
  expect(finished.resource.finishedAt).toMatch(/\.\d{6}Z$/);
  expect((await f.pool.query('SELECT "classId" FROM "ClassVideoReference" WHERE "classId"=$1', [created.resource.id])).rowCount).toBe(0);
});
test('cancel is terminal and keeps never-started timestamps null', async () => {
  const created = await prepare(), path = `/sessions/${created.resource.id}`;
  const cancelled = await confirmed(await request('POST', path + '/cancel', action()));
  expect(cancelled.resource).toMatchObject({ state: 'CANCELLED', revision: '2', startedAt: null, finishedAt: null });
  const before = await facts(); await rejected(await request('POST', path + '/start', action('2')), 409, 'CLASS_STATE_CONFLICT');
  expect(await facts()).toEqual(before);
});
test.each(['prepared', 'live', 'finished', 'cancelled'] as const)('PATCH edits %s texts without changing immutable or lifecycle facts', async key => {
  const current = f[key], projection = `SELECT revision::text, to_jsonb(t)-ARRAY['title','description','updatedBy','updatedAt','revision','lastEventSeq'] AS immutable
    FROM "ClassSession" t WHERE id=$1`;
  const before = (await f.pool.query(projection, [current.id])).rows[0];
  const result = await confirmed(await request('PATCH', `/sessions/${current.id}`, {
    ...action(before.revision), title: 'Texto corregido ' + key, description: '<b>Texto inerte</b>',
  }));
  expect(result.resource).toMatchObject({ id: current.id, groupId: current.groupId, state: current.state,
    title: 'Texto corregido ' + key, description: '<b>Texto inerte</b>', revision: (BigInt(before.revision) + 1n).toString() });
  expect((await f.pool.query(projection, [current.id])).rows[0].immutable).toEqual(before.immutable);
});
test('current revision plus identical texts is NO_CHANGE without a new event or date', async () => {
  const created = await prepare(), payload = { ...action(), title: created.resource.title, description: created.resource.description };
  const current = async () => (await f.pool.query('SELECT to_jsonb(t) AS value FROM "ClassSession" t WHERE id=$1', [created.resource.id])).rows[0].value;
  const before = await current(), events = (await f.pool.query('SELECT count(*)::text AS n FROM "ClassChange" WHERE "classId"=$1', [created.resource.id])).rows[0].n;
  const result = await confirmed(await request('PATCH', `/sessions/${created.resource.id}`, payload));
  expect(result.resource).toMatchObject(created.resource);
  expect(result.command).toMatchObject({ result: 'NO_CHANGE', appliedRevision: '1', appliedEventSeq: null });
  expect(await current()).toEqual(before);
  expect((await f.pool.query('SELECT count(*)::text AS n FROM "ClassChange" WHERE "classId"=$1', [created.resource.id])).rows[0].n).toBe(events);
  const replayBefore = await facts();
  expect((await confirmed(await request('PATCH', `/sessions/${created.resource.id}`, payload))).command.replayed).toBe(true);
  expect(await facts()).toEqual(replayBefore);
});
test('stale edit and stale NO_CHANGE cannot overwrite newer texts or create receipts', async () => {
  const created = await prepare(), path = `/sessions/${created.resource.id}`;
  await confirmed(await request('PATCH', path, { ...action(), title: 'Título vigente', description: null }));
  const before = await facts();
  for (const title of ['Título obsoleto', 'Título vigente'])
    await rejected(await request('PATCH', path, { ...action(), title, description: null }), 409, 'CLASS_VERSION_CONFLICT');
  expect(await facts()).toEqual(before);
});
test('replay and command lookup keep the original receipt but project the current class', async () => {
  const payload = input(), groupPath = `/groups/${f.groupId}/sessions`;
  const created = await confirmed(await request('POST', groupPath, payload), 201);
  await confirmed(await request('PATCH', `/sessions/${created.resource.id}`, { ...action(), title: 'Título actual', description: null }));
  const before = await facts(), replay = await confirmed(await request('POST', groupPath, payload));
  expect(replay.resource).toMatchObject({ id: created.resource.id, title: 'Título actual', revision: '2' });
  expect(replay.command).toEqual({ ...created.command, replayed: true });
  const lookup = await request('GET', `/commands/${payload.commandId}`); expect(lookup.status).toBe(200);
  expect((await lookup.json()).data).toEqual({ result: 'APPLIED', response: replay }); expect(await facts()).toEqual(before);
});
test('same actor/command with different texts, target or operation conflicts without side effects', async () => {
  const payload = input(); await confirmed(await request('POST', `/groups/${f.groupId}/sessions`, payload), 201);
  const group = await f.seedGroup(), current = await prepare(), before = await facts();
  await rejected(await request('POST', `/groups/${f.groupId}/sessions`, { ...payload, title: 'Distinto' }), 409, 'IDEMPOTENCY_CONFLICT');
  await rejected(await request('POST', `/groups/${group}/sessions`, payload), 409, 'IDEMPOTENCY_CONFLICT');
  await rejected(await request('POST', `/sessions/${current.resource.id}/cancel`, { ...action(), commandId: payload.commandId }), 409, 'IDEMPOTENCY_CONFLICT');
  expect(await facts()).toEqual(before);
});
test('another actor cannot look up a receipt; unknown command is NOT_CONFIRMED, not a definitive failure', async () => {
  const created = await prepare(), before = await facts();
  for (const [id, secret] of [[created.command.id, f.admin.secret], [randomUUID(), f.teacher.secret]]) {
    const result = await request('GET', `/commands/${id}`, undefined, secret); expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ data: { result: 'NOT_CONFIRMED' } });
  }
  expect(await facts()).toEqual(before);
});
test('lost current assignment denies mutation, replay and own receipt lookup before reading ledger', async () => {
  const group = await f.seedGroup(), payload = input(), path = `/groups/${group}/sessions`;
  const created = await confirmed(await request('POST', path, payload), 201);
  await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [f.otherTeacher.userId, group]);
  const before = await facts();
  await rejected(await request('POST', path, payload), 404, 'NOT_FOUND');
  await rejected(await request('POST', `/sessions/${created.resource.id}/start`, action()), 404, 'NOT_FOUND');
  await rejected(await request('GET', `/commands/${payload.commandId}`), 404, 'NOT_FOUND'); expect(await facts()).toEqual(before);
});
test('revoked session cannot replay a confirmed command or query its receipt', async () => {
  const payload = input(), path = `/groups/${f.groupId}/sessions`;
  await confirmed(await request('POST', path, payload), 201);
  await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [f.teacher.sessionId]);
  try {
    const before = await facts(); await rejected(await request('POST', path, payload), 401, 'AUTH_REQUIRED');
    await rejected(await request('GET', `/commands/${payload.commandId}`), 401, 'AUTH_REQUIRED'); expect(await facts()).toEqual(before);
  } finally { await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [f.teacher.sessionId]); }
});
test.each(['student', 'otherTeacher', 'previousTeacher', 'disabledTeacher'] as const)('denies %s without class effects', async key => {
  const status = key === 'student' ? 403 : key === 'disabledTeacher' ? 401 : 404;
  const code = status === 403 ? 'FORBIDDEN' : status === 401 ? 'AUTH_REQUIRED' : 'NOT_FOUND';
  const before = await facts();
  await rejected(await request('POST', `/groups/${f.groupId}/sessions`, input(), f[key].secret), status, code);
  for (const operation of ['start', 'finish', 'cancel'])
    await rejected(await request('POST', `/sessions/${f.prepared.id}/${operation}`, action(), f[key].secret), status, code);
  await rejected(await request('PATCH', `/sessions/${f.prepared.id}`, { ...action(), title: 'Ajeno', description: null }, f[key].secret), status, code);
  expect(await facts()).toEqual(before);
});
test('administrator can prepare for another teacher group', async () => {
  expect((await prepare(f.otherGroupId, f.admin.secret)).resource.groupId).toBe(f.otherGroupId);
});
test.each(['start', 'finish', 'cancel'] as const)('%s replay remains unique and a stale new intention never succeeds', async operation => {
  const created = await prepare(await f.seedGroup()), path = `/sessions/${created.resource.id}`;
  if (operation === 'finish') await confirmed(await request('POST', path + '/start', action()));
  const payload = action(operation === 'finish' ? '2' : '1');
  const applied = await confirmed(await request('POST', path + '/' + operation, payload)), before = await facts();
  const replay = await confirmed(await request('POST', path + '/' + operation, payload));
  expect(replay.command).toEqual({ ...applied.command, replayed: true });
  expect(replay.resource).toEqual(applied.resource);
  await rejected(await request('POST', path + '/' + operation, { ...payload, commandId: randomUUID() }), 409, 'CLASS_VERSION_CONFLICT');
  expect(await facts()).toEqual(before);
});
test('historical finished class cannot reopen and cancelled group only allows administrative closure or text correction', async () => {
  const current = await prepare(await f.seedGroup()), path = `/sessions/${current.resource.id}`;
  await confirmed(await request('POST', path + '/start', action()));
  await confirmed(await request('POST', path + '/finish', action('2')));
  const before = await facts();
  await rejected(await request('POST', path + '/start', action('3')), 409, 'CLASS_STATE_CONFLICT');
  await rejected(await request('POST', `/groups/${f.cancelledGroupId}/sessions`, input(), f.admin.secret), 409, 'CLASS_STATE_CONFLICT');
  expect(await facts()).toEqual(before);
  const row = (await f.pool.query('SELECT revision::text FROM "ClassSession" WHERE id=$1', [f.cancelledGroupLive.id])).rows[0];
  await confirmed(await request('PATCH', `/sessions/${f.cancelledGroupLive.id}`, {
    ...action(row.revision), title: 'Metadatos históricos', description: null,
  }, f.admin.secret));
  expect((await confirmed(await request('POST', `/sessions/${f.cancelledGroupLive.id}/finish`, action((BigInt(row.revision) + 1n).toString()), f.admin.secret)))
    .resource.state).toBe('FINISHED');
});
test.each(['state', 'groupId', 'createdBy', 'actorId', 'startedAt', 'revision', 'videoId'])('creation rejects extra field %s', async field => {
  const before = await facts();
  await rejected(await request('POST', `/groups/${f.groupId}/sessions`, { ...input(), [field]: 'client-supplied' }), 400, 'VALIDATION_ERROR');
  expect(await facts()).toEqual(before);
});
test.each([null, [], {}, { commandId: randomUUID(), title: 42, description: null },
  { ...input(), title: '🎓'.repeat(161) }, { ...input(), description: 'x'.repeat(2001) },
  { ...input(), title: 'a\u0000b' }, { ...input(), description: '\ud800' }, { ...input(), commandId: 'not-a-uuid' }])(
  'creation rejects invalid body %#', async payload => {
    const before = await facts(); await rejected(await request('POST', `/groups/${f.groupId}/sessions`, payload), 400, 'VALIDATION_ERROR');
    expect(await facts()).toEqual(before);
  });
test.each([0, 1, '0', '01', '-1', '1.5', '9223372036854775808', null])('transition rejects noncanonical revision %j', async expectedRevision => {
  const before = await facts();
  await rejected(await request('POST', `/sessions/${f.prepared.id}/start`, { ...action(), expectedRevision }), 400, 'VALIDATION_ERROR');
  expect(await facts()).toEqual(before);
});
test('PATCH and lifecycle commands reject unknown fields and queries', async () => {
  const created = await prepare(), path = `/sessions/${created.resource.id}`, before = await facts();
  await rejected(await request('PATCH', path, { ...action(), title: 'Texto', description: null, groupId: f.otherGroupId }), 400, 'VALIDATION_ERROR');
  for (const operation of ['start', 'finish', 'cancel'])
    await rejected(await request('POST', path + '/' + operation, { ...action(), state: 'LIVE' }), 400, 'VALIDATION_ERROR');
  await rejected(await request('POST', path + '/start?extra=1', action()), 400, 'VALIDATION_ERROR');
  await rejected(await request('GET', `/commands/${randomUUID()}?extra=1`), 400, 'VALIDATION_ERROR'); expect(await facts()).toEqual(before);
});
test.each([
  { origin: undefined }, { origin: 'https://foreign.invalid' }, { 'x-csrf-protection': undefined },
  { 'x-csrf-protection': '0' }, { 'sec-fetch-site': 'cross-site' },
])('write requires valid origin, CSRF and provenance %#', async headers => {
  const before = await facts();
  await rejected(await request('POST', `/groups/${f.groupId}/sessions`, input(), f.teacher.secret, headers), 403, 'REQUEST_NOT_ALLOWED');
  expect(await facts()).toEqual(before);
});
test('anonymous creation and receipt lookup require authentication', async () => {
  const before = await facts();
  await rejected(await request('POST', `/groups/${f.groupId}/sessions`, input(), ''), 401, 'AUTH_REQUIRED');
  await rejected(await request('GET', `/commands/${randomUUID()}`, undefined, ''), 401, 'AUTH_REQUIRED'); expect(await facts()).toEqual(before);
});
test('starting another session in the same group conflicts without consuming command, event or revision', async () => {
  const created = await prepare(), before = await facts();
  await rejected(await request('POST', `/sessions/${created.resource.id}/start`, action()), 409, 'CLASS_ALREADY_LIVE');
  expect(await facts()).toEqual(before);
});
