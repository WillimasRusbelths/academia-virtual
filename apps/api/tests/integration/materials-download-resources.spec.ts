import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { createMaterialsFoundation } from '../../src/app.module.js';
import { materialsTemporalFixture } from '../support/materials-temporal.js';
import type { MaterialsTemporalFixture } from '../support/materials-temporal.js';
import { barrier, instrumentMaterialsPool, within } from '../support/materials-testing.js';
import { us1Http } from '../support/us1-http.js';

let f: MaterialsTemporalFixture, http: Awaited<ReturnType<typeof us1Http>>, root: ReturnType<typeof createMaterialsFoundation>;
beforeAll(async () => {
  f = await materialsTemporalFixture(); http = await us1Http({ context: f, clock: f.clock });
  root = http.app.get('MATERIALS_FOUNDATION');
}, 120000);
afterAll(async () => { try { await http?.close(); } finally { await f?.cleanup(); } });
const path = (id: string) => `/api/v1/materials/items/${id}/content`;
const readsBytes = (sql: string) => /\bSELECT\b/i.test(sql) && /"MaterialContent"/.test(sql) && /\bbytes\b|\*/i.test(sql);
const get = (secret = f.student.secret, method = 'GET', id: string = f.published.id) => fetch(http.url + path(id), { method, headers: http.headers(secret) });

test('DR01 shared upload/download slots reject before bytea; authority precedes saturation and HEAD needs no binary slot', async () => {
  const first = root.transfers.acquire(f.student.userId), second = root.transfers.acquire(f.teacher.userId);
  let reads = 0; const restore = instrumentMaterialsPool(http.database.pool, async (sql, execute) => { if (readsBytes(sql)) reads++; return execute(); });
  try {
    const actor = await get(); expect(actor.status).toBe(429); expect(actor.headers.get('retry-after')).toBe('1'); await actor.text();
    const global = await get(f.admin.secret); expect(global.status).toBe(503); expect(global.headers.get('retry-after')).toBe('1'); await global.text();
    for (const [secret, id] of [[f.unEnrolledStudent.secret, f.published.id], [f.student.secret, randomUUID()], [f.student.secret, f.prepared.id]]) {
      const hidden = await get(secret, 'GET', id); expect(hidden.status).toBe(404); await hidden.text();
    }
    const head = await get(f.student.secret, 'HEAD'); expect(head.status).toBe(200); expect(await head.text()).toBe('');
    expect(reads).toBe(0);
  } finally { restore(); first.release(); second.release(); }
  const response = await get(); expect(response.status).toBe(200); await response.arrayBuffer();
});

test('DR02 bytea is selected only with the actor slot and material SHARE lock already held', async () => {
  const gate = barrier(); let reads = 0;
  const restore = instrumentMaterialsPool(http.database.pool, async (sql, execute) => {
    if (readsBytes(sql)) {
      reads++; expect(() => root.transfers.acquire(f.student.userId)).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }));
      gate.enter(); await gate.released;
    }
    return execute();
  });
  const pending = get();
  try {
    await within(gate.entered);
    await expect(f.pool.query('SELECT id FROM "Material" WHERE id=$1 FOR UPDATE NOWAIT', [f.published.id])).rejects.toMatchObject({ code: '55P03' });
  } finally { gate.release(); restore(); }
  const response = await pending; expect(response.status).toBe(200); await response.arrayBuffer(); expect(reads).toBe(1);
});

test.each(['finish', 'close'] as const)('DR03 slow response holds the slot until %s with no SQL transaction or checked-out connection', async terminal => {
  const gate = barrier(); let outgoing: ServerResponse | undefined, end: ServerResponse['end'] | undefined, endArgs: unknown[] = [];
  const observe = (request: IncomingMessage, response: ServerResponse) => {
    if (request.url !== path(f.published.id)) return;
    outgoing = response; end = response.end;
    response.end = function (this: ServerResponse, ...args: unknown[]) { endArgs = args; gate.enter(); return this; } as ServerResponse['end'];
  };
  const server = http.app.getHttpServer(); server.prependListener('request', observe);
  const pending = get(); void pending.catch(() => undefined);
  try {
    await within(gate.entered);
    expect(() => root.transfers.acquire(f.student.userId)).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }));
    expect(http.database.pool.totalCount).toBeGreaterThan(0);
    expect(http.database.pool.idleCount).toBe(http.database.pool.totalCount);
    // Both resource and account locks are gone while the real HTTP response is unfinished.
    await f.pool.query('SELECT id FROM "Material" WHERE id=$1 FOR UPDATE NOWAIT', [f.published.id]);
    await f.pool.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE NOWAIT', [f.student.userId]);
    if (terminal === 'finish') Reflect.apply(end!, outgoing, endArgs); else outgoing!.destroy();
    await expect.poll(() => { try { root.transfers.acquire(f.student.userId).release(); return true; } catch { return false; } }).toBe(true);
    try { const response = await pending; await response.arrayBuffer(); } catch (error) { if (terminal !== 'close') throw error; }
  } finally {
    server.off('request', observe);
    if (outgoing && end) outgoing.end = end;
    outgoing?.destroy();
  }
});

test('DR04 read failure releases admission before safe 503, allowing a subsequent authorized transfer', async () => {
  const restore = instrumentMaterialsPool(http.database.pool, async (sql, execute) => {
    if (readsBytes(sql)) throw Object.assign(new Error('PRIVATE_READ_FAILURE'), { code: '53100' }); return execute();
  });
  try { const response = await get(); expect(response.status).toBe(503); expect(await response.text()).not.toContain('PRIVATE_READ_FAILURE'); }
  finally { restore(); }
  root.transfers.acquire(f.student.userId).release();
  const response = await get(); expect(response.status).toBe(200); await response.arrayBuffer();
});

test('DR05 GET and HEAD use original enrollment boundaries at microsecond precision', async () => {
  try {
    for (const [at, status] of [[f.confirmedAt - 1n, 404], [f.confirmedAt, 200], [f.validUntil - 1n, 200], [f.validUntil, 404]] as const) {
      await f.set(at);
      for (const method of ['GET', 'HEAD']) {
        const response = await get(f.temporalStudent.secret, method); expect(response.status, `${method} at ${at}`).toBe(status); await response.arrayBuffer();
      }
    }
  } finally { await f.set(f.base); }
});

test('DR06 content GET/HEAD reject unknown query fields before binary selection', async () => {
  let reads = 0; const restore = instrumentMaterialsPool(http.database.pool, async (sql, execute) => { if (readsBytes(sql)) reads++; return execute(); });
  try {
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(http.url + path(f.published.id) + '?token=private', { method, headers: http.headers(f.student.secret) });
      expect(response.status).toBe(400); await response.text();
    }
    expect(reads).toBe(0);
  } finally { restore(); }
});
