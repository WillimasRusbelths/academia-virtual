import { createHash, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { materialsFixture, type MaterialsFixture } from '../support/materials.js';
import { us1Http } from '../support/us1-http.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';

let f: MaterialsFixture, http: Awaited<ReturnType<typeof us1Http>>, financial: string;
beforeAll(async () => { f = await materialsFixture(); http = await us1Http({ context: f }); }, 120000);
afterAll(async () => { try { await http?.close(); } finally { await f?.cleanup(); } });
beforeEach(async () => { financial = await financialFingerprint(f.pool); });
afterEach(async () => { expect(await financialFingerprint(f.pool)).toBe(financial); });
const identity = (expectedRevision = '1') => ({ commandId: randomUUID(), expectedRevision });
function request(id: string, action: 'edit'|'withdraw'|'publish', body: unknown, secret = f.teacher.secret,
  headers: Record<string, string> = {}, search = '') {
  return fetch(http.url+'/api/v1/materials/items/'+id+(action === 'edit' ? '' : '/'+action)+search, {
    method: action === 'edit' ? 'PATCH' : 'POST', headers: { ...http.headers(secret), ...headers }, body: JSON.stringify(body) });
}
async function resource(id: string) {
  const response = await http.get('/materials/items/'+id, f.teacher.secret); expect(response.status).toBe(200);
  return (await response.json()).data;
}
async function absentReceipt(commandId: string) {
  expect((await f.pool.query(`SELECT (SELECT count(*)::int FROM "MaterialCommand" WHERE "commandId"=$1) AS commands,
    (SELECT count(*)::int FROM "MaterialAuditEvent" WHERE "commandId"=$1) AS audits`, [commandId])).rows[0])
    .toEqual({ commands: 0, audits: 0 });
}
test('HTTP normalizes canonical edit intent before digest, then replays without a second change', async () => {
  const item = await f.seedMaterial('PREPARED'), body = { ...identity(), title: '  Correccion  ', description: ' \t\n' };
  const first = await request(item.id, 'edit', body); expect(first.status).toBe(200);
  const applied = (await first.json()).data;
  expect(applied).toMatchObject({ resource: { title: 'Correccion', description: null, state: 'PREPARED', revision: '2' },
    command: { result: 'APPLIED', replayed: false } });
  const second = await request(item.id, 'edit', { ...body, title: 'Correccion', description: null }); expect(second.status).toBe(200);
  expect((await second.json()).data).toEqual({ ...applied, command: { ...applied.command, replayed: true } });
});
test('HTTP NO_CHANGE leaves timestamps and revision intact and stale NO_CHANGE produces no receipt', async () => {
  const item = await f.seedMaterial('PUBLISHED'), before = await resource(item.id);
  const body = { ...identity('2'), title: before.title, description: before.description };
  const unchanged = await request(item.id, 'edit', body); expect(unchanged.status).toBe(200);
  expect((await unchanged.json()).data).toMatchObject({ resource: before, command: { result: 'NO_CHANGE', appliedRevision: '2' } });
  const stale = { ...body, ...identity('1') }, response = await request(item.id, 'edit', stale);
  expect(response.status).toBe(409); expect((await response.json()).error.code).toBe('MATERIAL_VERSION_CONFLICT');
  expect(await resource(item.id)).toEqual(before); await absentReceipt(stale.commandId);
});
test('HTTP withdrawal, NO_CHANGE and explicit republication restore only new authorized downloads', async () => {
  const item = await f.seedMaterial('PUBLISHED');
  const withdrawn = await request(item.id, 'withdraw', identity('2')); expect(withdrawn.status).toBe(200);
  const retired = (await withdrawn.json()).data.resource;
  expect(retired).toMatchObject({ state: 'WITHDRAWN', revision: '3' }); expect(retired.withdrawnAt).toBe(retired.updatedAt);
  expect((await http.get('/materials/items/'+item.id+'/content', f.student.secret)).status).toBe(404);
  const again = await request(item.id, 'withdraw', identity('3')); expect(again.status).toBe(200);
  expect((await again.json()).data).toMatchObject({ resource: retired, command: { result: 'NO_CHANGE', appliedRevision: '3' } });
  const published = await request(item.id, 'publish', identity('3')); expect(published.status).toBe(200);
  expect((await published.json()).data.resource).toMatchObject({ state: 'PUBLISHED', revision: '4', withdrawnAt: retired.withdrawnAt });
  const download = await http.get('/materials/items/'+item.id+'/content', f.student.secret);
  expect(download.status).toBe(200); await download.arrayBuffer();
});
test('publication still writes the original v1 digest and old command replays current withdrawn view', async () => {
  const item = await f.seedMaterial('PREPARED'), body = identity();
  expect((await request(item.id, 'publish', body)).status).toBe(200);
  const digest = createHash('sha256').update(JSON.stringify(['materials.command.v1', f.teacher.userId, item.id,
    'PUBLISH', body.commandId, body.expectedRevision])).digest('hex');
  expect((await f.pool.query('SELECT encode("payloadDigest",\'hex\') AS digest FROM "MaterialCommand" WHERE "actorId"=$1 AND "commandId"=$2',
    [f.teacher.userId, body.commandId])).rows[0].digest).toBe(digest);
  expect((await request(item.id, 'withdraw', identity('2'))).status).toBe(200);
  const replay = await request(item.id, 'publish', body); expect(replay.status).toBe(200);
  expect((await replay.json()).data).toMatchObject({ resource: { state: 'WITHDRAWN', revision: '3' },
    command: { replayed: true, appliedRevision: '2', result: 'APPLIED' } });
});
test.each(['0','01','-1','1.0','9223372036854775808',1,null])('HTTP edit/withdraw reject noncanonical revision %j without writes', async expectedRevision => {
  const before = await resource(f.prepared.id);
  for (const action of ['edit','withdraw'] as const) {
    const body = { ...identity(), expectedRevision, ...(action === 'edit' ? { title: 'Texto', description: null } : {}) };
    const response = await request(f.prepared.id, action, body); expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ code: 'VALIDATION_ERROR', fields: [{ field: 'expectedRevision', message: 'Campo inválido.' }] });
    await absentReceipt(body.commandId);
  }
  expect(await resource(f.prepared.id)).toEqual(before);
});
test('HTTP enforces Unicode text boundaries without coercion and returns only safe validation fields', async () => {
  const item = await f.seedMaterial('PREPARED');
  for (const invalid of [{ title: '', description: null, field: 'title' }, { title: 'x'.repeat(201), description: null, field: 'title' },
    { title: 42, description: null, field: 'title' }, { title: 'Valido', description: 'x'.repeat(2001), field: 'description' }]) {
    const body = { ...identity(), title: invalid.title, description: invalid.description }, response = await request(item.id, 'edit', body); expect(response.status).toBe(400);
    const error = (await response.json()).error; expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.fields).toEqual([{ field: invalid.field, message: 'Campo inválido.' }]);
    expect(JSON.stringify(error)).not.toContain('x'.repeat(201)); await absentReceipt(body.commandId);
  }
  const valid = await request(item.id, 'edit', { ...identity(), title: '🎓'.repeat(200), description: 'ñ'.repeat(2000) });
  expect(valid.status).toBe(200); expect((await valid.json()).data.resource.revision).toBe('2');
});
test('new command routes preserve origin/CSRF, authentication, closed query and closed withdrawal body', async () => {
  for (const action of ['edit','withdraw'] as const) {
    const body = { ...identity(), ...(action === 'edit' ? { title: 'Correccion', description: null } : {}) };
    expect((await request(f.prepared.id, action, body, '')).status).toBe(401);
    expect((await request(f.prepared.id, action, body, f.teacher.secret, { origin: 'https://foreign.example' })).status).toBe(403);
    expect((await request(f.prepared.id, action, body, f.teacher.secret, { 'x-csrf-protection': '' })).status).toBe(403);
    expect((await request(f.prepared.id, action, body, f.teacher.secret, {}, '?extra=1')).status).toBe(400);
    await absentReceipt(body.commandId);
  }
  const body = { ...identity(), title: 'Forbidden on withdrawal' };
  expect((await request(f.prepared.id, 'withdraw', body)).status).toBe(400); await absentReceipt(body.commandId);
});
test('cancelled group HTTP rejects admin edit/publish and teacher withdrawal, permits admin withdrawal', async () => {
  expect((await request(f.cancelledPublished.id, 'edit', { ...identity('2'), title: 'Correccion', description: null }, f.admin.secret)).status).toBe(409);
  expect((await request(f.cancelledPublished.id, 'publish', identity('2'), f.admin.secret)).status).toBe(409);
  expect((await request(f.cancelledPublished.id, 'withdraw', identity('2'))).status).toBe(404);
  const response = await request(f.cancelledPublished.id, 'withdraw', identity('2'), f.admin.secret);
  expect(response.status).toBe(200); expect((await response.json()).data.resource).toMatchObject({ state: 'WITHDRAWN', revision: '3' });
});
