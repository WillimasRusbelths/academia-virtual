import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { materialsFixture } from '../support/materials.js';
import type { MaterialsFixture } from '../support/materials.js';
import { materialFileCase, materialFile } from '../support/materials-files.js';
import { createHash } from 'node:crypto';
import { us1Http } from '../support/us1-http.js';

let f: MaterialsFixture, http: Awaited<ReturnType<typeof us1Http>>;
beforeAll(async () => { f = await materialsFixture(); http = await us1Http({ context: f }); }, 120000);
afterAll(async () => { try { await http?.close(); } finally { await f?.cleanup(); } });
const file = materialFileCase('pdf-valid');
function input(bytes = file.bytes) {
  return { intentionId: randomUUID(), title: 'Material de ensayo HTTP', description: 'Texto ficticio',
    downloadName: 'estudio.pdf', mediaType: 'application/pdf', byteSize: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') };
}
const headers = (): Record<string, string> => ({ ...http.headers(f.teacher.secret) });
async function register(bytes = file.bytes) {
  const payload = input(bytes);
  const response = await fetch(http.url + `/api/v1/materials/groups/${f.groupId}/uploads`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  // Positive control prevents missing routes from masquerading as successful denial tests.
  expect(response.status).toBe(201);
  const body = await response.json() as { data: { uploadId: string; state: string; materialId: null } };
  expect(body.data).toMatchObject({ state: 'PENDING', materialId: null });
  expect(body.data.uploadId).toMatch(/^[0-9a-f-]{36}$/);
  return { uploadId: body.data.uploadId, path: `/api/v1/materials/uploads/${body.data.uploadId}/content`, payload };
}
function raw(path: string, method = 'PUT', extra: Record<string, string> = {}) {
  let request!: ReturnType<typeof httpRequest>;
  const response = new Promise<{ status: number; text: string }>((resolve, reject) => {
    request = httpRequest(http.url + path, { method, headers: { ...headers(), 'content-type': 'application/octet-stream', ...extra } }, incoming => {
      const chunks: Buffer[] = []; let size = 0;
      incoming.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 65536) incoming.destroy(new Error('Unexpected oversized test response')); else chunks.push(chunk); });
      incoming.once('error', reject);
      incoming.once('end', () => resolve({ status: incoming.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
    });
    request.once('error', reject); request.setTimeout(10000, () => request.destroy(new Error('Synthetic test request timed out')));
  });
  return { request, response };
}
async function json(path: string) {
  const response = await fetch(http.url + '/api/v1' + path, { headers: headers() });
  expect(response.status).toBe(200); return response.json() as Promise<{ data: Record<string, unknown> }>;
}

test('register/complete prepares durable bytes and publication requires a separate explicit command', async () => {
  const upload = await register();
  const transfer = raw(upload.path); transfer.request.end(file.bytes);
  expect((await transfer.response).status).toBe(201);
  const completed = (await json(`/materials/uploads/${upload.uploadId}`)).data;
  expect(completed.state).toBe('COMPLETED'); expect(typeof completed.materialId).toBe('string');
  const materialId = completed.materialId as string;
  const prepared = (await json(`/materials/items/${materialId}`)).data;
  expect(prepared).toMatchObject({ state: 'PREPARED', revision: '1', publishedAt: null });
  const persisted = (await f.pool.query('SELECT bytes FROM "MaterialContent" WHERE "materialId"=$1', [materialId])).rows[0];
  expect(persisted.bytes).toEqual(file.bytes);
  const command = { commandId: randomUUID(), expectedRevision: '1' };
  const publish = () => fetch(http.url + `/api/v1/materials/items/${materialId}/publish`, {
    method: 'POST', headers: headers(), body: JSON.stringify(command),
  });
  const response = await publish(); expect(response.status).toBe(200);
  expect((await response.json() as { data: unknown }).data).toMatchObject({ resource: { state: 'PUBLISHED', revision: '2' },
    command: { appliedRevision: '2', result: 'APPLIED', replayed: false } });
  expect((await publish()).status).toBe(200);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialCommand" WHERE "actorId"=$1 AND "commandId"=$2',
    [f.teacher.userId, command.commandId])).rows[0].n).toBe(1);
});

test('valid HTTP chunked framing without Content-Length accepts binary above the JSON limit', async () => {
  const bytes = materialFile('pdf', 32768), upload = await register(bytes), transfer = raw(upload.path);
  expect(transfer.request.hasHeader('content-length')).toBe(false);
  transfer.request.write(bytes.subarray(0, 100)); transfer.request.end(bytes.subarray(100));
  expect((await transfer.response).status).toBe(201);
  const completed = (await json(`/materials/uploads/${upload.uploadId}`)).data;
  expect((await f.pool.query('SELECT bytes FROM "MaterialContent" WHERE "materialId"=$1', [completed.materialId])).rows[0].bytes).toEqual(bytes);
});

test('JSON keeps its 16 KiB limit and upload DTO rejects unknown fields', async () => {
  const path = http.url + `/api/v1/materials/groups/${f.groupId}/uploads`;
  const oversized = await fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify({ ...input(), title: 'x'.repeat(17 * 1024) }) });
  expect(oversized.status).toBe(413);
  const unknown = await fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify({ ...input(), bytes: [] }) });
  expect(unknown.status).toBe(400);
});

test.each(['origin', 'csrf', 'cross-site'] as const)('binary exception retains %s protection', async invalid => {
  const upload = await register(); const extra: Record<string, string> = invalid === 'origin' ? { origin: 'https://untrusted.invalid' }
    : invalid === 'csrf' ? { 'x-csrf-protection': '0' } : { 'sec-fetch-site': 'cross-site' };
  const transfer = raw(upload.path, 'PUT', extra); transfer.request.end(file.bytes);
  expect((await transfer.response).status).toBe(403);
  expect((await f.pool.query('SELECT "materialId" FROM "MaterialUpload" WHERE "uploadId"=$1', [upload.uploadId])).rows[0].materialId).toBeNull();
});

test.each(['gzip', 'deflate', 'multipart'] as const)('rejects %s input without completing the intention', async invalid => {
  const upload = await register(); const extra: Record<string, string> = invalid === 'multipart' ? { 'content-type': 'multipart/form-data; boundary=ficticio' }
    : { 'content-encoding': invalid };
  const transfer = raw(upload.path, 'PUT', extra); transfer.request.end(file.bytes);
  expect((await transfer.response).status).toBe(415);
  expect((await f.pool.query('SELECT "materialId" FROM "MaterialUpload" WHERE "uploadId"=$1', [upload.uploadId])).rows[0].materialId).toBeNull();
});

test('binary exception is exact in path and method and preserves unrelated JSON endpoints', async () => {
  for (const [method, path] of [['POST', `/api/v1/materials/uploads/${randomUUID()}/content`],
    ['PUT', '/api/v1/materials/uploads/not-a-uuid/content'], ['PUT', `/api/v1/materials/uploads/${randomUUID()}/content/`],
    ['PUT', `/api/v1/materials/items/${randomUUID()}/content`], ['POST', '/api/v1/auth/login']]) {
    const transfer = raw(path, method); transfer.request.end(file.bytes); expect((await transfer.response).status).toBe(415);
  }
});

test('session revoked after the receiver consumes its first chunk cannot commit partial bytes', async () => {
  const bytes = materialFile('pdf', 32768), upload = await register(bytes);
  const server = http.app.getHttpServer() as Server;
  let notify!: () => void; const firstData = new Promise<void>(resolve => { notify = resolve; });
  const observe = (incoming: IncomingMessage) => {
    if (incoming.method !== 'PUT' || incoming.url !== upload.path) return;
    const emit = incoming.emit;
    incoming.emit = function (this: IncomingMessage, event: string | symbol, ...args: unknown[]) {
      const result = Reflect.apply(emit, this, [event, ...args]) as boolean;
      if (event === 'data') { this.emit = emit; notify(); }
      return result;
    };
  };
  // Passive observation: no data listener, resume(), test handler or substitute authorization.
  server.prependListener('request', observe);
  const transfer = raw(upload.path); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    transfer.request.write(bytes.subarray(0, 100));
    await Promise.race([firstData, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Receiver did not reach the first-byte barrier')), 10000); })]);
    clearTimeout(timer);
    await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [f.teacher.sessionId]);
    transfer.request.end(bytes.subarray(100)); expect((await transfer.response).status).toBe(401);
    expect((await f.pool.query('SELECT "materialId" FROM "MaterialUpload" WHERE "uploadId"=$1', [upload.uploadId])).rows[0].materialId).toBeNull();
  } finally {
    clearTimeout(timer); server.off('request', observe); transfer.request.destroy(); await transfer.response.catch(() => undefined);
    await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [f.teacher.sessionId]);
  }
});
