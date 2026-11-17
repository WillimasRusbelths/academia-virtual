import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { AppModule, RESERVATION_DISPATCH_LIFECYCLE } from '../../dist/src/app.module.js';
import * as composition from '../../dist/src/app.module.js';
import type { createMaterialsFoundation } from '../../dist/src/app.module.js';
import { RESERVATION_EXPIRATION_LIFECYCLE } from '../../dist/src/modules/enrollment/enrollment.module.js';
import { configureTransport } from '../../dist/src/http/transport.js';
import { SessionCookie } from '../../dist/src/http/session-cookie.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import type { ManagedMaterial } from '../../src/modules/materials/public/materials.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { materialsFixture } from '../support/materials.js';
import type { MaterialsFixture } from '../support/materials.js';
import { materialFileCase } from '../support/materials-files.js';

type Receiver = (actor: SessionActor, uploadId: string, request: Request, response: Response) => Promise<{ resource: ManagedMaterial; replayed: boolean }>;
let f: MaterialsFixture, app: NestExpressApplication, root: ReturnType<typeof createMaterialsFoundation>, url: string, cookie: SessionCookie, teacher: SessionActor;
function receiver(): Receiver {
  const capability: unknown = Reflect.get(root, 'receiveContent');
  if (typeof capability !== 'function') throw new Error('T024: bounded binary receiver not implemented');
  return capability as Receiver;
}
// All requests now exercise the production MaterialsModule and its closed manager policy.
beforeAll(async () => {
  f = await materialsFixture(); teacher = (await new PostgresSessionStore(f.pool).lookup(f.teacher.secret))!;
  const environment = { ...f.environment, materials: { transferLimit: 2, actorTransferLimit: 1, uploadTimeoutMs: 1000 } };
  const factory = Reflect.get(composition, 'createMaterialsFoundation') as typeof createMaterialsFoundation;
  root = factory(environment, f.pool); cookie = new SessionCookie(environment);
  const module = await Test.createTestingModule({ imports: [AppModule.forRoot(environment, f.database)] })
    .overrideProvider(RESERVATION_DISPATCH_LIFECYCLE).useValue({})
    .overrideProvider(RESERVATION_EXPIRATION_LIFECYCLE).useValue({}).compile();
  app = module.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false });
  configureTransport(app, environment, { record() { return true; } }); await app.listen(0, '127.0.0.1'); url = await app.getUrl();
}, 120000);
afterAll(async () => { try { await app?.close(); } finally { await f?.cleanup(); } });
async function pending(fileId = 'pdf-valid') {
  receiver(); const file = materialFileCase(fileId);
  const upload = await root.uploads.register(teacher, f.groupId, { intentionId: randomUUID(), title: 'Recepción ficticia', description: null,
    downloadName: file.name, mediaType: file.mediaType, byteSize: file.byteSize, sha256: file.sha256 });
  return { file, upload, path: `/api/v1/materials/uploads/${upload.uploadId}/content` };
}
function raw(path: string, extra: Record<string, string> = {}, secret = f.teacher.secret, method = 'PUT') {
  let request!: ReturnType<typeof httpRequest>;
  const response = new Promise<{ status: number; text: string }>((resolve, reject) => {
    request = httpRequest(url + path, { method, headers: { 'content-type': 'application/octet-stream', origin: f.environment.appOrigin,
      'x-csrf-protection': '1', cookie: `${cookie.name}=${secret}`, ...extra } }, incoming => {
      const chunks: Buffer[] = []; incoming.on('data', (chunk: Buffer) => chunks.push(chunk)); incoming.once('error', reject);
      incoming.once('end', () => resolve({ status: incoming.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
    });
    request.once('error', reject); request.setTimeout(5000, () => request.destroy(new Error('Synthetic client timeout')));
  });
  // Some abort tests deliberately do not wait for a normal response.
  void response.catch(() => undefined);
  return { request, response };
}
test('chunked binary above JSON limit prepares durable bytes; identical replay returns 200', async () => {
  const { file, upload, path } = await pending('pdf-limit');
  const transfer = raw(path); expect(transfer.request.hasHeader('content-length')).toBe(false);
  transfer.request.write(file.bytes.subarray(0, 1024)); transfer.request.end(file.bytes.subarray(1024));
  expect((await transfer.response).status).toBe(201);
  const status = await root.uploads.status(teacher, upload.uploadId); expect(status.state).toBe('COMPLETED');
  const replay = raw(path, { 'content-length': String(file.byteSize), 'content-encoding': 'identity' }); replay.request.end(file.bytes);
  expect((await replay.response).status).toBe(200);
}, 60000);
test.each(['origin','csrf','cross-site','gzip','multipart'] as const)('%s cannot complete through the binary exception', async kind => {
  const { file, upload, path } = await pending();
  const headers: Record<string, string> = kind === 'origin' ? { origin: 'https://foreign.invalid' } : kind === 'csrf' ? { 'x-csrf-protection': '0' }
    : kind === 'cross-site' ? { 'sec-fetch-site': 'cross-site' } : kind === 'gzip' ? { 'content-encoding': 'gzip' } : { 'content-type': 'multipart/form-data; boundary=ficticio' };
  const transfer = raw(path, headers); transfer.request.end(file.bytes);
  expect((await transfer.response).status).toBe(['gzip','multipart'].includes(kind) ? 415 : 403);
  expect(await root.uploads.status(teacher, upload.uploadId)).toMatchObject({ state: 'PENDING', materialId: null });
});
test('exact route/method exception preserves rejection elsewhere and JSON still has its 16 KiB limit', async () => {
  receiver();
  for (const [method, path] of [['POST', `/api/v1/materials/uploads/${randomUUID()}/content`],
    ['PUT','/api/v1/materials/uploads/not-a-uuid/content'], ['PUT',`/api/v1/materials/uploads/${randomUUID()}/content/`],
    ['PUT',`/api/v1/materials/uploads/${randomUUID()}/content?extra=1`], ['POST','/api/v1/auth/login']]) {
    const transfer = raw(path, {}, f.teacher.secret, method); transfer.request.end('ficticio'); expect((await transfer.response).status).toBe(415);
  }
  const json = raw('/api/v1/auth/login', { 'content-type': 'application/json' }, f.teacher.secret, 'POST');
  json.request.end(JSON.stringify({ email: 'x'.repeat(17000) })); expect((await json.response).status).toBe(413);
});
test('foreign intention and session revocation are denied before the first data event is consumed', async () => {
  const { path, file, upload } = await pending();
  let consumedBeforeResponse = 0;
  const observe = (incoming: IncomingMessage, outgoing: ServerResponse) => {
    if (incoming.url !== path) return; const emit = incoming.emit;
    incoming.emit = function (event: string | symbol, ...args: unknown[]) {
      if (event === 'data' && !outgoing.headersSent) consumedBeforeResponse++;
      return Reflect.apply(emit, this, [event, ...args]) as boolean;
    };
  };
  const server = app.getHttpServer(); server.prependListener('request', observe);
  try {
    const foreign = raw(path, {}, f.admin.secret); foreign.request.end(file.bytes); expect((await foreign.response).status).toBe(404);
    await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [teacher.sessionId]);
    const revoked = raw(path); revoked.request.end(file.bytes); expect((await revoked.response).status).toBe(401);
  } finally {
    server.off('request', observe);
    await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [teacher.sessionId]);
  }
  expect(consumedBeforeResponse).toBe(0);
  expect(await root.uploads.status(teacher, upload.uploadId)).toMatchObject({ state: 'PENDING', materialId: null });
});

test('actor/global admission limits reject before reception and release for subsequent requests', async () => {
  const { path, file, upload } = await pending(); const actor = root.transfers.acquire(teacher.userId);
  try { const denied = raw(path); denied.request.end(file.bytes); expect((await denied.response).status).toBe(429); } finally { actor.release(); }
  const one = root.transfers.acquire(f.admin.userId), two = root.transfers.acquire(f.otherTeacher.userId);
  try { const denied = raw(path); denied.request.end(file.bytes); expect((await denied.response).status).toBe(503); } finally { one.release(); two.release(); }
  expect(await root.uploads.status(teacher, upload.uploadId)).toMatchObject({ state: 'PENDING', materialId: null });
  const accepted = raw(path); accepted.request.end(file.bytes); expect((await accepted.response).status).toBe(201);
});

test('actual chunked excess is 413, never stores partial content, even without Content-Length', async () => {
  const { path, file, upload } = await pending('pdf-limit'); const transfer = raw(path);
  transfer.request.write(file.bytes); transfer.request.end(Buffer.from('x'));
  expect((await transfer.response).status).toBe(413);
  expect(await root.uploads.status(teacher, upload.uploadId)).toMatchObject({ state: 'PENDING', materialId: null });
}, 60000);

test('revocation after the first received chunk is rechecked before any content commit', async () => {
  const { path, file, upload } = await pending(); const external = await f.pool.connect();
  let notify!: () => void; const reached = new Promise<void>(resolve => { notify = resolve; });
  const server = app.getHttpServer();
  const observe = (incoming: IncomingMessage) => {
    if (incoming.url !== path) return; const emit = incoming.emit;
    incoming.emit = function (event: string | symbol, ...args: unknown[]) {
      const result = Reflect.apply(emit, this, [event, ...args]) as boolean;
      if (event === 'data') { this.emit = emit; notify(); } return result;
    };
  };
  server.prependListener('request', observe); const transfer = raw(path); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    transfer.request.write(file.bytes.subarray(0, 10));
    await Promise.race([reached, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Receiver did not consume initial chunk')), 4000); })]);
    clearTimeout(timer);
    await external.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [teacher.sessionId]);
    transfer.request.end(file.bytes.subarray(10)); expect((await transfer.response).status).toBe(401);
  } finally {
    clearTimeout(timer); server.off('request', observe); transfer.request.destroy();
    await transfer.response.catch(() => undefined);
    await external.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [teacher.sessionId]); external.release();
  }
  expect(await root.uploads.status(teacher, upload.uploadId)).toMatchObject({ state: 'PENDING', materialId: null });
});
test('receive timeout rejects without completing and releases the actor slot for a manual retry', async () => {
  const { path, file, upload } = await pending(); const slow = raw(path); slow.request.write(file.bytes.subarray(0, 10));
  expect((await slow.response).status).toBe(503); slow.request.destroy();
  expect(await root.uploads.status(teacher, upload.uploadId)).toMatchObject({ state: 'PENDING', materialId: null });
  const retry = raw(path); retry.request.end(file.bytes); expect((await retry.response).status).toBe(201);
});
test('disconnect during reception leaves PENDING and releases admission without persisting partial bytes', async () => {
  const { path, file, upload } = await pending();
  // Wait until server has consumed a first chunk; no timing-only assumption.
  let notify!: () => void; const reached = new Promise<void>(resolve => { notify = resolve; });
  const server = app.getHttpServer();
  const observe = (incoming: IncomingMessage) => {
    if (incoming.url !== path) return; const emit = incoming.emit;
    incoming.emit = function (event: string | symbol, ...args: unknown[]) {
      const result = Reflect.apply(emit, this, [event, ...args]) as boolean;
      if (event === 'data') { this.emit = emit; notify(); } return result;
    };
  };
  server.prependListener('request', observe); const transfer = raw(path); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    transfer.request.write(file.bytes.subarray(0, 10));
    await Promise.race([reached, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('First chunk not observed')), 4000); })]);
    transfer.request.destroy(); await transfer.response.catch(() => undefined);
  } finally { clearTimeout(timer); server.off('request', observe); transfer.request.destroy(); }
  await expect.poll(async () => { try { const lease = root.transfers.acquire(teacher.userId); lease.release(); return true; } catch { return false; } }).toBe(true);
  expect(await root.uploads.status(teacher, upload.uploadId)).toMatchObject({ state: 'PENDING', materialId: null });
});
