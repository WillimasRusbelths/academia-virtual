import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { classesTemporalFixture, type ClassesTemporalFixture } from '../support/classes-temporal.js';
import { us1Http } from '../support/us1-http.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { SecurityEvents } from '../../src/infrastructure/logging/security-events.js';
import { createClassesFoundation } from '../../src/app.module.js';

let f: ClassesTemporalFixture, http: Awaited<ReturnType<typeof us1Http>>, fingerprint: string;
let directory: string | undefined, logs: SecurityEvents | undefined;
beforeAll(async () => {
  f = await classesTemporalFixture(); fingerprint = await financialFingerprint(f.pool);
  directory = mkdtempSync(path.join(tmpdir(), 'classes-access-')); logs = new SecurityEvents(directory);
  http = await us1Http({ context: f, clock: f.clock }, f.environment.appOrigin, logs);
}, 120000);
afterAll(async () => {
  try { if (f) expect(await financialFingerprint(f.pool)).toBe(fingerprint); }
  finally {
    try { await http?.close(); } finally {
      try { await f?.cleanup(); } finally {
        logs?.onApplicationShutdown();
        if (directory && path.dirname(directory) === tmpdir()) rmSync(directory, { recursive: true, force: true });
      }
    }
  }
});
function get(route: string, secret = f.student.secret) {
  return fetch(http.url + '/api/v1/classes' + route, { headers: http.headers(secret) });
}
async function data(route: string, secret = f.student.secret) {
  const response = await get(route, secret); expect(response.status, route).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const body = await response.json(); expect(Object.keys(body)).toEqual(['data']); return body.data;
}
async function denied(route: string, secret: string, status = 404, code = 'NOT_FOUND') {
  const response = await get(route, secret); expect(response.status, route).toBe(status);
  const body = await response.json(); expect(body).not.toHaveProperty('data');
  expect(body.error).toMatchObject({ code, message: expect.any(String), requestId: expect.any(String) });
  return body.error.message;
}
beforeEach(async () => {
  await f.set(f.confirmedAt + 1n);
  expect((await get('/groups', f.admin.secret)).status, 'Read handlers must exist before testing denials').toBe(200);
});
const routes = () => [`/groups/${f.groupId}`, `/groups/${f.groupId}/sessions`, `/sessions/${f.live.id}`, `/sessions/${f.live.id}/video`];

test('visitor receives AUTH_REQUIRED on every installed read', async () => {
  for (const route of ['/groups', ...routes()]) await denied(route, '', 401, 'AUTH_REQUIRED');
});
test.each(['unEnrolledStudent', 'reservationStudent', 'pendingStudent', 'incidentStudent', 'historicalStudent', 'otherStudent', 'previousTeacher', 'otherTeacher'] as const)(
  '%s cannot discover another group or its sessions/video', async actor => {
    for (const route of routes()) await denied(route, f[actor].secret);
  });
test.each(['disabledStudent', 'revokedStudent'] as const)('%s is rejected before projecting reads', async actor => {
  for (const route of ['/groups', ...routes()]) await denied(route, f[actor].secret, 401, 'AUTH_REQUIRED');
});
test.each([-1n, 0n, 1n])('original start boundary %+s microseconds is inclusive', async delta => {
  await f.set(f.confirmedAt + delta);
  for (const route of routes()) {
    if (delta < 0n) await denied(route, f.temporalStudent.secret);
    else await data(route, f.temporalStudent.secret);
  }
  const groups = await data('/groups', f.temporalStudent.secret);
  expect(groups.total).toBe(delta < 0n ? 0 : 1);
});
test.each([-1n, 0n, 1n])('original end boundary %+s microseconds is exclusive', async delta => {
  await f.set(f.validUntil + delta);
  for (const route of routes()) {
    if (delta >= 0n) await denied(route, f.temporalStudent.secret);
    else await data(route, f.temporalStudent.secret);
  }
  expect((await data('/groups', f.temporalStudent.secret)).total).toBe(delta < 0n ? 1 : 0);
});
test('student groups and pagination count only authorized groups, including an empty accessible group', async () => {
  const result = await data('/groups?pageSize=1');
  expect(result).toMatchObject({ page: 1, pageSize: 1, total: 1 });
  expect(result.items).toEqual([{ id: f.groupId, name: 'Grupo ficticio', courseName: 'Curso ficticio de clases' }]);
  expect((await data('/groups?page=2&pageSize=1')).items).toEqual([]);
  expect((await data('/groups?page=9007199254740991&pageSize=50')).items).toEqual([]);
  const empty = await f.seedGroup();
  expect(await data(`/groups/${empty}`, f.teacher.secret)).toMatchObject({ id: empty, canPrepare: true });
  expect(await data(`/groups/${empty}/sessions`, f.teacher.secret)).toMatchObject({ items: [], total: 0 });
});
test('group ordering follows PostgreSQL name then UUID before pagination', async () => {
  const expected = (await f.pool.query('SELECT id FROM "AcademicGroup" ORDER BY name,id')).rows.map(r => r.id);
  const result = await data('/groups?pageSize=50', f.admin.secret);
  expect(result.items.map((r: { id: string }) => r.id)).toEqual(expected);
  expect(result.total).toBe(expected.length);
});
test('student excludes cancelled sessions, sees minimal DTOs, stable ordering and six fractional digits', async () => {
  const expected = (await f.pool.query(`SELECT id FROM "ClassSession" WHERE "groupId"=$1 AND state<>'CANCELLED' ORDER BY "createdAt" DESC,id DESC`, [f.groupId])).rows.map(r => r.id);
  const result = await data(`/groups/${f.groupId}/sessions?pageSize=2`);
  expect(result.total).toBe(expected.length); expect(result.items.map((r: { id: string }) => r.id)).toEqual(expected.slice(0, 2));
  expect((await data(`/groups/${f.groupId}/sessions?page=2&pageSize=2`)).items.map((r: { id: string }) => r.id)).toEqual(expected.slice(2, 4));
  for (const fact of [f.prepared, f.live, f.finished]) {
    const row = await data(`/sessions/${fact.id}`);
    expect(Object.keys(row).sort()).toEqual(['id','groupId','title','description','state','revision','viewVersion','createdAt','updatedAt','startedAt','finishedAt','cancelledAt'].sort());
    expect(row.createdAt).toMatch(/\.\d{6}Z$/); expect(row.revision).toMatch(/^[1-9]\d*$/);
  }
  await denied(`/sessions/${f.cancelled.id}`, f.student.secret);
  expect((await data(`/groups/${f.groupId}/sessions?state=CANCELLED`, f.teacher.secret)).total).toBe(1);
  expect((await data(`/sessions/${f.cancelled.id}`, f.admin.secret)).actions).toMatchObject({ edit: true, start: false });
});
test.each(['page=0','page=-1','page=1.5','page=01','pageSize=0','pageSize=51','pageSize=1e1','page=1&page=2','unknown=x','state=LIVE'])(
  'closed student pagination rejects %s', async query => {
    await denied(`/groups/${f.groupId}/sessions?${query}`, f.student.secret, 400, 'VALIDATION_ERROR');
  });
test('withdrawn offering preserves the original student right', async () => {
  expect((await data('/groups', f.withdrawnStudent.secret)).items.map((g: { id: string }) => g.id)).toContain(f.withdrawnGroupId);
  await data(`/sessions/${f.withdrawnLive.id}`, f.withdrawnStudent.secret);
});
test('reassignment and ineligible teacher do not revoke enrolled students', async () => {
  await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1', [f.groupId, f.disabledTeacher.userId]);
  try {
    for (const route of routes()) await data(route);
    for (const route of routes()) await denied(route, f.teacher.secret);
    expect((await data('/groups', f.teacher.secret)).items.some((g: { id: string }) => g.id === f.groupId)).toBe(false);
  } finally { await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1', [f.groupId, f.teacher.userId]); }
});
test('cancelled group is hidden from student and teacher, admin retains historical metadata only', async () => {
  for (const secret of [f.cancelledStudent.secret, f.teacher.secret]) {
    for (const route of [`/groups/${f.cancelledGroupId}`, `/groups/${f.cancelledGroupId}/sessions`, `/sessions/${f.cancelledGroupLive.id}`]) await denied(route, secret);
  }
  expect(await data(`/groups/${f.cancelledGroupId}`, f.admin.secret)).toMatchObject({ canPrepare: false });
  await denied(`/sessions/${f.cancelledGroupLive.id}/video`, f.admin.secret);
});
test('unknown, malformed, foreign and cancelled references have indistinguishable safe errors', async () => {
  const messages = [];
  for (const id of [randomUUID(), 'invalid', f.otherLive.id, f.cancelled.id]) messages.push(await denied(`/sessions/${id}`, f.student.secret));
  expect(new Set(messages).size).toBe(1);
});
test('disabled video is passive, returns no reference, and non-live context has no playback', async () => {
  const activity = async () => (await f.pool.query('SELECT "lastAcceptedAt"::text,"absoluteExpiresAt"::text FROM "Session" WHERE id=$1', [f.student.sessionId])).rows[0];
  const before = await activity();
  expect(await data(`/sessions/${f.live.id}/video`)).toEqual({ status: 'NOT_CONFIGURED' });
  expect(await activity()).toEqual(before);
  for (const fact of [f.prepared, f.finished]) expect(await data(`/sessions/${fact.id}/video`)).toEqual({ status: 'CLASS_NOT_LIVE' });
  await denied(`/sessions/${f.cancelled.id}/video`, f.admin.secret);
});
test('database unavailability is an error rather than a successful empty group page', async () => {
  const foundation = createClassesFoundation(f.environment, f.pool);
  const connection = vi.spyOn(f.pool, 'connect').mockRejectedValueOnce(new Error('Synthetic connection loss'));
  try {
    await expect(foundation.queries.groups({ userId: f.student.userId, sessionId: f.student.sessionId, authVersion: 0n, role: 'STUDENT' }))
      .rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  } finally { connection.mockRestore(); }
});
test('a previously authorized session is revalidated on the next read after revocation', async () => {
  await data(`/sessions/${f.live.id}`, f.secondStudent.secret);
  await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [f.secondStudent.sessionId]);
  try { for (const route of routes()) await denied(route, f.secondStudent.secret, 401, 'AUTH_REQUIRED'); }
  finally { await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [f.secondStudent.sessionId]); }
});
test('metadata viewVersion stays separate from later chat events and preserves exact timestamps', async () => {
  const edited = await fetch(http.url + `/api/v1/classes/sessions/${f.live.id}`, {
    method: 'PATCH', headers: http.headers(f.teacher.secret),
    body: JSON.stringify({ commandId: randomUUID(), expectedRevision: '2', title: 'Metadata visible', description: null }),
  });
  expect(edited.status).toBe(200); const resource = (await edited.json()).data.resource;
  await f.seedMessage(resource.id);
  const view = await data(`/sessions/${resource.id}`);
  expect(view).toMatchObject({ revision: resource.revision, viewVersion: resource.viewVersion, createdAt: resource.createdAt, updatedAt: resource.updatedAt });
  expect((await f.pool.query('SELECT "lastEventSeq"::text AS seq FROM "ClassSession" WHERE id=$1', [resource.id])).rows[0].seq)
    .toBe((BigInt(resource.viewVersion) + 1n).toString());
});
