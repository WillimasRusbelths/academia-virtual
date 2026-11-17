import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { createMaterialsFoundation } from '../../src/app.module.js';
import type { MaterialCommandResponse, MaterialState } from '../../src/modules/materials/public/materials.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { materialsFixture, type MaterialsFixture } from '../support/materials.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { instrumentMaterialsPool } from '../support/materials-testing.js';
import { us1Http } from '../support/us1-http.js';

let f: MaterialsFixture, teacher: SessionActor, successor: SessionActor, admin: SessionActor;
let http: Awaited<ReturnType<typeof us1Http>>, financial: Awaited<ReturnType<typeof financialFingerprint>>;
beforeAll(async () => {
  f = await materialsFixture(); const sessions = new PostgresSessionStore(f.pool);
  teacher = (await sessions.lookup(f.teacher.secret))!; successor = (await sessions.lookup(f.otherTeacher.secret))!;
  admin = (await sessions.lookup(f.admin.secret))!; http = await us1Http({ context: f });
}, 120000);
afterAll(async () => { try { await http?.close(); } finally { await f?.cleanup(); } });
beforeEach(async () => { financial = await financialFingerprint(f.pool); });
afterEach(async () => { expect(await financialFingerprint(f.pool)).toEqual(financial); });
type Execute = (actor: SessionActor, id: string, input: unknown) => Promise<MaterialCommandResponse>;
function commands() {
  const candidate = createMaterialsFoundation(f.environment, f.pool).commands;
  for (const name of ['edit','withdraw']) if (typeof Reflect.get(candidate, name) !== 'function')
    throw new Error('T051/T052 pending: materials edit/withdraw commands are not implemented');
  return candidate as unknown as { edit: Execute; withdraw: Execute; publish: Execute };
}
const input = (expectedRevision = '1') => ({ commandId: randomUUID(), expectedRevision });
const edit = (expectedRevision = '1') => ({ ...input(expectedRevision), title: 'Correccion', description: 'Texto corregido' });
async function facts(id: string) {
  return (await f.pool.query(`SELECT to_jsonb(m)||jsonb_build_object('revision',m.revision::text) AS material,row_to_json(c) AS content FROM "Material" m
    JOIN "MaterialContent" c ON c."materialId"=m.id WHERE m.id=$1`, [id])).rows[0];
}
async function receipts(commandId: string) {
  return (await f.pool.query(`SELECT (SELECT count(*)::int FROM "MaterialCommand" WHERE "commandId"=$1) AS commands,
    (SELECT count(*)::int FROM "MaterialAuditEvent" WHERE "commandId"=$1) AS audits`, [commandId])).rows[0];
}
test.each<MaterialState>(['PREPARED','PUBLISHED','WITHDRAWN'])('edit %s preserves binary, group and original authorship and does not publish', async state => {
  const api = commands(), item = await f.seedMaterial(state), before = await facts(item.id), revision = before.material.revision;
  const request = edit(revision), result = await api.edit(teacher, item.id, request), after = await facts(item.id);
  expect(result).toMatchObject({ resource: { state, revision: String(BigInt(revision)+1n), title: request.title, createdBy: teacher.userId, groupId: item.groupId },
    command: { id: request.commandId, result: 'APPLIED', replayed: false } });
  expect(after.content).toEqual(before.content);
  expect(after.material.publishedAt).toEqual(before.material.publishedAt); expect(after.material.withdrawnAt).toEqual(before.material.withdrawnAt);
  expect(await receipts(request.commandId)).toEqual({ commands: 1, audits: 1 });
});
test('withdraw and republish are explicit transitions, with authorized replay returning the current view', async () => {
  const api = commands(), item = await f.seedMaterial('PUBLISHED'), request = input('2'), before = await facts(item.id);
  const result = await api.withdraw(teacher, item.id, request);
  expect(result).toMatchObject({ resource: { state: 'WITHDRAWN', revision: '3' }, command: { result: 'APPLIED' } });
  expect(result.resource.withdrawnAt).toBe(result.resource.updatedAt);
  await api.publish(teacher, item.id, input('3'));
  expect(await api.withdraw(teacher, item.id, request)).toMatchObject({ resource: { state: 'PUBLISHED', revision: '4' },
    command: { replayed: true, appliedRevision: '3', result: 'APPLIED' } });
  expect((await facts(item.id)).content).toEqual(before.content); expect(await receipts(request.commandId)).toEqual({ commands: 1, audits: 1 });
});
test.each(['edit','withdraw'] as const)('%s NO_CHANGE preserves resource and still checks stale revisions', async operation => {
  const api = commands(), item = await f.seedMaterial('WITHDRAWN'), current = await createMaterialsFoundation(f.environment, f.pool).queries.item(teacher, item.id);
  if (!('revision' in current)) throw new Error('Expected managed resource');
  const request = { ...input(current.revision), ...(operation === 'edit' ? { title: current.title, description: current.description } : {}) };
  expect(await api[operation](teacher, item.id, request)).toMatchObject({ resource: current, command: { result: 'NO_CHANGE', appliedRevision: current.revision } });
  await expect(api[operation](teacher, item.id, { ...request, commandId: randomUUID(), expectedRevision: '1' }))
    .rejects.toMatchObject({ code: 'MATERIAL_VERSION_CONFLICT' });
});
test('edit digest binds texts, revision, operation and material before stale-version evaluation', async () => {
  const api = commands(), item = await f.seedMaterial('PREPARED'), other = await f.seedMaterial('PREPARED'), request = edit();
  await api.edit(teacher, item.id, request);
  for (const changed of [{ ...request, title: 'Distinto' }, { ...request, description: 'Distinto' }, { ...request, expectedRevision: '2' }])
    await expect(api.edit(teacher, item.id, changed)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(api.edit(teacher, other.id, request)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(api.withdraw(teacher, item.id, { commandId: request.commandId, expectedRevision: '1' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  expect(await receipts(request.commandId)).toEqual({ commands: 1, audits: 1 });
});
test('reassignment attributes new edits without appropriating authorship and denies former teacher replay', async () => {
  const api = commands(), item = await f.seedMaterial('PREPARED'), request = edit(); await api.edit(teacher, item.id, request);
  await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [successor.userId, f.groupId]);
  try {
    await expect(api.edit(teacher, item.id, request)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await api.edit(successor, item.id, { ...edit('2'), title: 'Nuevo docente' });
    const after = await facts(item.id); expect(after.material).toMatchObject({ createdBy: teacher.userId, updatedBy: successor.userId, revision: '3' });
    expect((await f.pool.query('SELECT "actorId" FROM "MaterialAuditEvent" WHERE "materialId"=$1 AND revision=3', [item.id])).rows)
      .toEqual([{ actorId: successor.userId }]);
  } finally { await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [teacher.userId, f.groupId]); }
});
test('cancelled group allows only administrative withdrawal', async () => {
  const api = commands();
  await expect(api.edit(admin, f.cancelledPublished.id, edit('2'))).rejects.toMatchObject({ code: 'MATERIAL_STATE_CONFLICT' });
  await expect(api.withdraw(teacher, f.cancelledPublished.id, input('2'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(await api.withdraw(admin, f.cancelledPublished.id, input('2'))).toMatchObject({ resource: { state: 'WITHDRAWN', revision: '3' } });
});
test.each(['edit','withdraw'] as const)('%s audit failure rolls back resource, content and receipt', async operation => {
  const api = commands(), item = await f.seedMaterial('PREPARED'), before = await facts(item.id), request = operation === 'edit' ? edit() : input();
  const restore = instrumentMaterialsPool(f.pool, async (sql, execute) => {
    if (sql.includes('INSERT INTO "MaterialAuditEvent"')) throw new Error('Synthetic US3 audit failure'); return execute();
  });
  try { await expect(api[operation](teacher, item.id, request)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' }); }
  finally { restore(); }
  expect(await facts(item.id)).toEqual(before); expect(await receipts(request.commandId)).toEqual({ commands: 0, audits: 0 });
});
test('lost edit COMMIT acknowledgement recovers one durable receipt', async () => {
  const api = commands(), item = await f.seedMaterial('PREPARED'), request = edit(); let commits = 0;
  const restore = instrumentMaterialsPool(f.pool, async (sql, execute) => {
    const result = await execute(); if (sql === 'COMMIT') { commits++; throw Object.assign(new Error('Synthetic lost acknowledgement'), { code: '08006' }); } return result;
  });
  try { await expect(api.edit(teacher, item.id, request)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' }); } finally { restore(); }
  expect(commits).toBe(1);
  expect(await commands().edit(teacher, item.id, request)).toMatchObject({ resource: { revision: '2' }, command: { replayed: true, appliedRevision: '2' } });
  expect(await receipts(request.commandId)).toEqual({ commands: 1, audits: 1 });
});
async function request(method: 'PATCH'|'POST', id: string, body: unknown, secret = f.teacher.secret) {
  return fetch(http.url+'/api/v1/materials/items/'+id+(method === 'POST' ? '/withdraw' : ''), {
    method, headers: http.headers(secret), body: JSON.stringify(body) });
}
test('positive control: real HTTP fixture reads a managed material before US3 commands', async () => {
  const response = await http.get('/materials/items/'+f.prepared.id, f.teacher.secret);
  expect(response.status).toBe(200); expect((await response.json()).data).toMatchObject({ id: f.prepared.id, state: 'PREPARED', revision: '1' });
});
test('HTTP edit replays one receipt and distinguishes stale revision from changed command digest', async () => {
  const item = await f.seedMaterial('PREPARED'), body = edit();
  expect((await request('PATCH', item.id, body)).status).toBe(200);
  const replay = await request('PATCH', item.id, body); expect(replay.status).toBe(200);
  expect((await replay.json()).data).toMatchObject({ resource: { revision: '2' }, command: { replayed: true, appliedRevision: '2' } });
  const stale = await request('PATCH', item.id, edit()); expect(stale.status).toBe(409);
  expect((await stale.json()).error).toMatchObject({ code: 'MATERIAL_VERSION_CONFLICT' });
  const mismatch = await request('PATCH', item.id, { ...body, title: 'Distinto' }); expect(mismatch.status).toBe(409);
  expect((await mismatch.json()).error).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  expect(await receipts(body.commandId)).toEqual({ commands: 1, audits: 1 });
});
test('revoked session cannot replay a previously committed edit', async () => {
  const api = commands(), item = await f.seedMaterial('PREPARED'), body = edit(); await api.edit(teacher, item.id, body);
  await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [teacher.sessionId]);
  try { await expect(api.edit(teacher, item.id, body)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); }
  finally { await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [teacher.sessionId]); }
  expect(await receipts(body.commandId)).toEqual({ commands: 1, audits: 1 });
});
test('HTTP edit and withdrawal use real handlers and immediately remove student visibility', async () => {
  const item = await f.seedMaterial('PUBLISHED');
  const edited = await request('PATCH', item.id, edit('2')); expect(edited.status).toBe(200);
  expect((await edited.json()).data).toMatchObject({ resource: { state: 'PUBLISHED', revision: '3' } });
  const withdrawn = await request('POST', item.id, input('3')); expect(withdrawn.status).toBe(200);
  const response = await http.get('/materials/items/'+item.id+'/content', f.student.secret); expect(response.status).toBe(404);
});
test.each(['groupId','createdBy','downloadName','mediaType','byteSize','sha256','content','state'])('HTTP edit rejects immutable/unknown field %s without a receipt', async field => {
  const item = await f.seedMaterial('PREPARED'), body = { ...edit(), [field]: 'forbidden' }, before = await facts(item.id);
  expect((await request('PATCH', item.id, body)).status).toBe(400);
  expect(await facts(item.id)).toEqual(before); expect(await receipts(body.commandId)).toEqual({ commands: 0, audits: 0 });
});
test('HTTP student cannot edit; foreign teacher cannot discover or withdraw', async () => {
  expect((await request('PATCH', f.prepared.id, edit(), f.student.secret)).status).toBe(403);
  expect((await request('POST', f.prepared.id, input(), f.otherTeacher.secret)).status).toBe(404);
});
