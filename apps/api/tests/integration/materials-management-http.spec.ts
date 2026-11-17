import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { materialsFixture } from '../support/materials.js';
import type { MaterialsFixture } from '../support/materials.js';
import { materialFileCase } from '../support/materials-files.js';
import { us1Http } from '../support/us1-http.js';

let f: MaterialsFixture, http: Awaited<ReturnType<typeof us1Http>>;
beforeAll(async () => { f = await materialsFixture(); http = await us1Http({ context: f }); }, 120000);
afterAll(async () => { try { await http?.close(); } finally { await f?.cleanup(); } });
function get(path: string, secret = f.teacher.secret) {
  return fetch(http.url + '/api/v1/materials' + path, { headers: http.headers(secret) });
}
function post(path: string, body: unknown, secret = f.teacher.secret) {
  return fetch(http.url + '/api/v1/materials' + path, { method: 'POST', headers: http.headers(secret), body: JSON.stringify(body) });
}
function input() {
  const file = materialFileCase('pdf-valid');
  return { intentionId: randomUUID(), title: 'Material sintético', description: null, downloadName: file.name,
    mediaType: file.mediaType, byteSize: file.byteSize, sha256: file.sha256 };
}
test('real management queries paginate authorized groups and items without binary or private columns', async () => {
  const response = await get('/groups?page=1&pageSize=1'); expect(response.status).toBe(200);
  const body = await response.json(); expect(body.data).toMatchObject({ page: 1, pageSize: 1, total: 1 });
  expect(body.data.items).toHaveLength(1); expect(body.data.items[0].id).toBe(f.groupId);
  const admin = await get('/groups', f.admin.secret); expect(admin.status).toBe(200);
  expect((await admin.json()).data.total).toBe(3);
  const context = await get(`/groups/${f.groupId}`); expect(context.status).toBe(200);
  expect((await context.json()).data).toMatchObject({ id: f.groupId, state: 'DRAFT' });
  const items = await get(`/groups/${f.groupId}/items?state=PUBLISHED&pageSize=1`); expect(items.status).toBe(200);
  const page = (await items.json()).data; expect(page.total).toBe(1); expect(page.items[0].id).toBe(f.published.id);
  const item = await get(`/items/${f.prepared.id}`); expect(item.status).toBe(200);
  const resource = (await item.json()).data; expect(resource).toMatchObject({ id: f.prepared.id, revision: '1', state: 'PREPARED' });
  for (const privateKey of ['bytes', 'sha256', 'payloadDigest', 'email', 'actorId', 'path']) expect(resource).not.toHaveProperty(privateKey);
  const empty = await get(`/groups/${f.groupId}/items?page=999`); expect(empty.status).toBe(200);
  expect((await empty.json()).data).toMatchObject({ items: [], total: 3 });
});
test.each(['?page=0','?page=01','?page=1.5','?page=9007199254740992','?pageSize=51','?page=1&page=2','?state=PUBLISHED','?extra=1'])(
  'closed group query rejects %s', async search => {
    const response = await get('/groups' + search); expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
  });
test('shared reads admit enrolled student minimally; management stays forbidden and teacher references concealed', async () => {
  expect((await fetch(http.url + '/api/v1/materials/groups')).status).toBe(401);
  const student = await get('/groups', f.student.secret); expect(student.status).toBe(200);
  const groups = (await student.json()).data;
  expect(groups.total).toBe(1); expect(Object.keys(groups.items[0]).sort()).toEqual(['courseName', 'id', 'name']);
  const context = await get(`/groups/${f.groupId}`, f.student.secret); expect(context.status).toBe(200);
  expect((await context.json()).data).toEqual(groups.items[0]);
  expect((await post(`/groups/${f.groupId}/uploads`, input(), f.student.secret)).status).toBe(403);
  expect((await post(`/items/${f.prepared.id}/publish`, { commandId: randomUUID(), expectedRevision: '1' }, f.student.secret)).status).toBe(403);
  expect((await get('/groups', f.ineligibleTeacher.secret)).status).toBe(401);
  for (const path of [`/groups/${f.otherGroupId}`, `/groups/${f.otherGroupId}/items`, `/items/${f.otherPublished.id}`,
    `/groups/${randomUUID()}`, '/items/not-a-uuid']) {
    const response = await get(path); expect(response.status).toBe(404);
    const body = await response.json(); expect(body.error.code).toBe('NOT_FOUND'); expect(body).not.toHaveProperty('data');
  }
});
test('intention returns 201 then replay 200; foreign admin cannot inspect or repurpose it', async () => {
  const payload = input(), path = `/groups/${f.groupId}/uploads`;
  const created = await post(path, payload); expect(created.status).toBe(201);
  const data = (await created.json()).data; expect(data.command.replayed).toBe(false);
  const replay = await post(path, payload); expect(replay.status).toBe(200);
  expect((await replay.json()).data).toMatchObject({ uploadId: data.uploadId, command: { replayed: true } });
  const status = await get(`/uploads/${data.uploadId}`); expect(status.status).toBe(200);
  expect((await status.json()).data).toMatchObject({ state: 'PENDING', materialId: null });
  expect((await get(`/uploads/${data.uploadId}`, f.admin.secret)).status).toBe(404);
  const conflict = await post(path, { ...payload, title: 'Otro texto sintético' }); expect(conflict.status).toBe(409);
  expect((await conflict.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
  expect((await post(path, { ...input(), bytes: [] })).status).toBe(400);
  expect((await post(path + '?extra=1', input())).status).toBe(400);
});
test('publication uses revision and closed body, while administration can manage another teacher group', async () => {
  const material = await f.seedMaterial('PREPARED', f.otherGroupId, f.otherTeacher.userId);
  const path = `/items/${material.id}/publish`, payload = { commandId: randomUUID(), expectedRevision: '1' };
  expect((await post(path, payload)).status).toBe(404);
  expect((await post(path, { ...payload, state: 'PUBLISHED' }, f.admin.secret)).status).toBe(400);
  expect((await post(path, { ...payload, expectedRevision: 1 }, f.admin.secret)).status).toBe(400);
  const published = await post(path, payload, f.admin.secret); expect(published.status).toBe(200);
  expect((await published.json()).data).toMatchObject({ resource: { revision: '2', state: 'PUBLISHED' }, command: { replayed: false } });
  const stale = await post(path, { commandId: randomUUID(), expectedRevision: '1' }, f.admin.secret);
  expect(stale.status).toBe(409); expect((await stale.json()).error.code).toBe('MATERIAL_VERSION_CONFLICT');
  const replay = await post(path, payload, f.admin.secret); expect(replay.status).toBe(200);
  expect((await replay.json()).data.command.replayed).toBe(true);
});
