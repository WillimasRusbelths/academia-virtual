import { createHash, randomUUID } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ArgumentsHost } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { materialsFixture } from '../support/materials.js';
import type { MaterialsFixture } from '../support/materials.js';
import { materialFileCase } from '../support/materials-files.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { instrumentMaterialsPool, within } from '../support/materials-testing.js';
import { us1Http } from '../support/us1-http.js';
import { SafeErrorFilter } from '../../src/http/error.filter.js';
import type { HttpRequest } from '../../src/http/error.filter.js';

let f: MaterialsFixture, http: Awaited<ReturnType<typeof us1Http>>, before: string;
beforeAll(async () => { f = await materialsFixture(); http = await us1Http({ context: f }); }, 120000);
beforeEach(async () => { before = await financialFingerprint(f.pool); });
afterEach(async () => { expect(await financialFingerprint(f.pool)).toBe(before); });
afterAll(async () => { try { await http?.close(); } finally { await f?.cleanup(); } });
const path = (id: string) => `/api/v1/materials/items/${id}/content`;
const readsBytes = (sql: string) => /\bSELECT\b/i.test(sql) && /"MaterialContent"/.test(sql) && /\bbytes\b|\*/i.test(sql);
function download(id: string, secret?: string, method = 'GET', extra: Record<string, string> = {}) {
  return fetch(http.url + path(id), { method, headers: { ...http.headers(secret), ...extra }, redirect: 'manual' });
}
async function safe(response: Response, status: number, code: string) {
  expect(response.status).toBe(status); expect(response.headers.get('cache-control')).toBe('no-store');
  const text = await response.text(), body = JSON.parse(text);
  expect(Object.keys(body)).toEqual(['error']); expect(body.error).toMatchObject({ code, requestId: expect.any(String), message: expect.any(String) });
  expect(Object.keys(body.error).sort()).toEqual(['code', 'message', 'requestId']);
  expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(text).not.toMatch(/MaterialContent|EnrollmentOrder|SELECT |postgres|passwordHash|sha256|payloadDigest|fixture\/provider|Cancelación ficticia/);
  return { code: body.error.code, message: body.error.message };
}

test('MD00 fixture and real composition are healthy; manager metadata exists before testing content routes', async () => {
  expect((await fetch(http.url + '/health/ready')).status).toBe(200);
  const response = await http.get(`/materials/items/${f.published.id}`, f.teacher.secret);
  expect(response.status).toBe(200); expect((await response.json()).data.id).toBe(f.published.id);
});

for (const method of ['GET', 'HEAD']) for (const key of ['anonymous', 'revokedStudent', 'disabledStudent', 'ineligibleTeacher'] as const)
  test(`MD01 ${method}/${key}: 401 before bytea and no accepted session`, async () => {
    const secret = key === 'anonymous' ? undefined : f[key].secret;
    const sessions = (await f.pool.query('SELECT id,"lastAcceptedAt"::text AS accepted,"absoluteExpiresAt"::text AS absolute FROM "Session" ORDER BY id')).rows;
    let reads = 0; const restore = instrumentMaterialsPool(http.database.pool, async (sql, execute) => { if (readsBytes(sql)) reads++; return execute(); });
    try {
      const response = await download(f.published.id, secret, method);
      if (method === 'GET') await safe(response, 401, 'AUTH_REQUIRED');
      else { expect(response.status).toBe(401); expect(await response.text()).toBe(''); }
      expect(reads).toBe(0);
      expect((await f.pool.query('SELECT id,"lastAcceptedAt"::text AS accepted,"absoluteExpiresAt"::text AS absolute FROM "Session" ORDER BY id')).rows).toEqual(sessions);
    } finally { restore(); }
  });

test('MD02 student read capability does not grant upload management: safe 403 and no binary read', async () => {
  let reads = 0; const restore = instrumentMaterialsPool(http.database.pool, async (sql, execute) => { if (readsBytes(sql)) reads++; return execute(); });
  try { await safe(await http.get(`/materials/uploads/${f.prepared.uploadId}`, f.student.secret), 403, 'FORBIDDEN'); expect(reads).toBe(0); } finally { restore(); }
});

for (const key of ['unEnrolledStudent', 'historicalStudent', 'otherStudent', 'reservationStudent', 'pendingStudent', 'incidentStudent', 'otherTeacher'] as const)
  test(`MD03 ${key}: metadata and content of another/non-current group conceal the same reference`, async () => {
    let reads = 0; const restore = instrumentMaterialsPool(http.database.pool, async (sql, execute) => { if (readsBytes(sql)) reads++; return execute(); });
    try {
      const metadata = await safe(await http.get(`/materials/items/${f.published.id}`, f[key].secret), 404, 'NOT_FOUND');
      const hidden = await safe(await download(f.published.id, f[key].secret), 404, 'NOT_FOUND');
      expect(hidden).toEqual(metadata); expect(await safe(await download(randomUUID(), f[key].secret), 404, 'NOT_FOUND')).toEqual(hidden);
      const head = await download(f.published.id, f[key].secret, 'HEAD'); expect(head.status).toBe(404); expect(await head.text()).toBe('');
      expect(reads).toBe(0);
    } finally { restore(); }
  });

for (const state of ['prepared', 'withdrawn'] as const) test(`MD04 student never sees ${state}, including a direct known URL`, async () => {
  const expected = await safe(await http.get(`/materials/items/${f[state].id}`, f.student.secret), 404, 'NOT_FOUND');
  expect(await safe(await download(f[state].id, f.student.secret), 404, 'NOT_FOUND')).toEqual(expected);
  expect((await download(f[state].id, f.student.secret, 'HEAD')).status).toBe(404);
});

test('MD05 student list and direct detail expose only the published minimal projection before counts', async () => {
  const response = await http.get(`/materials/groups/${f.groupId}/items?page=1&pageSize=1`, f.student.secret);
  expect(response.status).toBe(200); const page = (await response.json()).data;
  expect(page).toMatchObject({ total: 1, page: 1, pageSize: 1 }); expect(page.items.map((item: { id: string }) => item.id)).toEqual([f.published.id]);
  const detail = await http.get(`/materials/items/${f.published.id}`, f.student.secret); expect(detail.status).toBe(200);
  const item = (await detail.json()).data;
  expect(Object.keys(item).sort()).toEqual(['id', 'groupId', 'title', 'description', 'mediaType', 'byteSize', 'downloadName', 'publishedAt'].sort());
  expect(page.items[0]).toEqual(item); expect(item.publishedAt).toMatch(/\.\d{6}Z$/);
  const empty = await http.get(`/materials/groups/${f.groupId}/items?page=2&pageSize=1`, f.student.secret);
  expect(empty.status).toBe(200); expect((await empty.json()).data).toMatchObject({ total: 1, items: [] });
  const filtered = await http.get(`/materials/groups/${f.groupId}/items?state=PREPARED`, f.student.secret);
  expect(filtered.status).toBe(400); expect((await filtered.json()).error.code).toBe('VALIDATION_ERROR');
});

for (const fileId of ['pdf-valid', 'jpeg-valid', 'png-valid']) test(`MD06 ${fileId}: exact binary bytes/hash and private attachment headers, never JSON Buffer`, async () => {
  const material = await f.seedMaterial('PUBLISHED', f.groupId, f.teacher.userId, fileId), file = materialFileCase(fileId);
  const response = await download(material.id, f.student.secret); expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe(file.mediaType);
  expect(response.headers.get('content-length')).toBe(String(file.byteSize));
  expect(response.headers.get('content-disposition')).toMatch(/^attachment;\s*filename="[\x20-\x7e]+";\s*filename\*=UTF-8''/i);
  expect(decodeURIComponent(response.headers.get('content-disposition')!.split(/filename\*=UTF-8''/i)[1])).toBe(file.name);
  expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  for (const header of ['etag', 'location', 'set-cookie', 'content-range']) expect(response.headers.get(header)).toBeNull();
  const bytes = Buffer.from(await response.arrayBuffer()); expect(bytes).toEqual(file.bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
});

for (const key of ['admin', 'teacher'] as const) for (const state of ['prepared', 'published', 'withdrawn'] as const)
  test(`MD07 ${key}/${state}: manager downloads without enrollment`, async () => {
    const response = await download(f[state].id, f[key].secret); expect(response.status).toBe(200);
    expect(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')).toBe(f[state].sha256);
  });

test('MD08 cancelled group: admin historical download only; teacher and student concealed', async () => {
  const response = await download(f.cancelledPublished.id, f.admin.secret); expect(response.status).toBe(200);
  expect(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')).toBe(f.cancelledPublished.sha256);
  for (const secret of [f.teacher.secret, f.student.secret]) await safe(await download(f.cancelledPublished.id, secret), 404, 'NOT_FOUND');
});

test('MD09 HEAD reauthorizes without bytea privileges, never returns bytes, and rejects a subsequently revoked session', async () => {
  const role = new URL(f.environment.databaseUrl).username;
  if (!/^[a-z][a-z0-9_]+$/.test(role)) throw new Error('Invalid test role');
  await f.isolated.ownerQuery(`REVOKE SELECT ON "MaterialContent" FROM "${role}";
    GRANT SELECT ("materialId","mediaType","byteSize","downloadName") ON "MaterialContent" TO "${role}"`);
  try {
    const response = await download(f.published.id, f.student.secret, 'HEAD'); expect(response.status).toBe(200);
    const file = materialFileCase(f.published.fileId); expect(response.headers.get('content-type')).toBe(file.mediaType);
    expect(response.headers.get('content-length')).toBe(String(file.byteSize)); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/); expect(await response.text()).toBe('');
    await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [f.student.sessionId]);
    expect((await download(f.published.id, f.student.secret, 'HEAD')).status).toBe(401);
  } finally {
    await f.isolated.ownerQuery(`GRANT SELECT ON "MaterialContent" TO "${role}"`);
    await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [f.student.sessionId]);
  }
});

test('MD10 Range and cache validators still yield 200 complete with new authorization; no 206/304', async () => {
  const file = materialFileCase(f.published.fileId);
  const headers: Record<string, string>[] = [{ range: 'bytes=0-1' }, { range: 'bytes=999999999-' }, { 'if-none-match': '*', 'if-modified-since': 'Wed, 01 Jan 2099 00:00:00 GMT' }];
  for (const extra of headers) {
    const response = await download(f.published.id, f.student.secret, 'GET', extra);
    expect(response.status).toBe(200); expect(response.headers.get('content-range')).toBeNull();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(file.bytes);
  }
  await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [f.student.sessionId]);
  try { await safe(await download(f.published.id, f.student.secret, 'GET', { range: 'bytes=0-1' }), 401, 'AUTH_REQUIRED'); }
  finally { await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [f.student.sessionId]); }
});

test('MD11 denied DB read before headers is safe 503, no bytes and no accepted session', async () => {
  const session = async () => (await f.pool.query('SELECT "lastAcceptedAt"::text AS accepted,"absoluteExpiresAt"::text AS absolute FROM "Session" WHERE id=$1', [f.student.sessionId])).rows[0];
  const initial = await session(); let injected = false;
  const restore = instrumentMaterialsPool(http.database.pool, async (sql, execute) => {
    if (readsBytes(sql)) { injected = true; throw Object.assign(new Error('PRIVATE_SQL_BYTES_cookie@example.test'), { code: '53100' }); }
    return execute();
  });
  try {
    await safe(await download(f.published.id, f.student.secret), 503, 'TEMPORARILY_UNAVAILABLE');
    expect(injected).toBe(true); expect(await session()).toEqual(initial);
  } finally { restore(); }
});

test('MD12 production error filter after actual committed headers closes an incomplete transfer without second JSON', async () => {
  const prefix = materialFileCase('pdf-valid').bytes.subarray(0, 8), chunks: Buffer[] = [], records: unknown[] = [];
  let outgoing: ServerResponse | undefined, request: IncomingMessage | undefined;
  const server = createServer((incoming, response) => { request = incoming; outgoing = response;
    response.writeHead(200, { 'content-type': 'application/pdf', 'content-length': '1000', 'cache-control': 'no-store' }); response.write(prefix); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test socket');
  let notify!: () => void; const first = new Promise<void>(resolve => { notify = resolve; });
  let complete = false;
  const client = httpRequest(`http://127.0.0.1:${address.port}${path(f.published.id)}`);
  const closed = new Promise<void>(resolve => { client.once('error', () => resolve()); client.once('response', incoming => {
    incoming.on('data', (chunk: Buffer) => { chunks.push(chunk); notify(); });
    incoming.once('end', () => { complete = incoming.complete; resolve(); }); incoming.once('error', () => resolve()); incoming.once('close', () => resolve());
  }); });
  client.end();
  try {
    await within(first); expect(outgoing!.headersSent).toBe(true);
    const input: HttpRequest = { method: 'GET', headers: {}, url: request!.url, route: { path: '/api/v1/materials/items/:materialId/content' }, requestId: randomUUID() };
    const host = { switchToHttp: () => ({ getRequest: () => input, getResponse: () => outgoing }) } as unknown as ArgumentsHost;
    expect(() => new SafeErrorFilter({ record(event) { records.push(event); return true; } }).catch(new Error('PRIVATE_SQL_BYTES_cookie@example.test'), host)).not.toThrow();
    await within(closed); expect(complete).toBe(false); expect(Buffer.concat(chunks)).toEqual(prefix);
    expect(outgoing!.destroyed).toBe(true); expect(JSON.stringify(records)).not.toContain('PRIVATE_SQL_BYTES');
    expect(records).toHaveLength(1); expect(records[0]).toMatchObject({ category: 'OPERATION', action: 'RUNTIME_FAILURE', reasonCode: 'TEMPORARILY_UNAVAILABLE', targetKind: 'NONE' });
  } finally { client.destroy(); outgoing?.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
