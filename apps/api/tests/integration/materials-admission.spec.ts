import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { materialsFixture } from '../support/materials.js';
import type { MaterialsFixture } from '../support/materials.js';
import { foundation } from '../support/materials-foundation.js';
import { loadEnvironment } from '../../src/infrastructure/config/environment.js';

let f: MaterialsFixture;
beforeAll(async () => { f = await materialsFixture(); }, 120000);
afterAll(async () => { await f?.cleanup(); });

test('two process slots, one per actor, immediate rejection and idempotent release', () => {
  const admission = foundation(f.environment, f.pool).transfers;
  const a = randomUUID(), b = randomUUID(), c = randomUUID();
  const first = admission.acquire(a);
  expect(() => admission.acquire(a)).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }));
  const second = admission.acquire(b);
  expect(() => admission.acquire(c)).toThrow(expect.objectContaining({ code: 'TEMPORARILY_UNAVAILABLE' }));
  first.release(); first.release();
  const third = admission.acquire(c);
  expect(() => admission.acquire(a)).toThrow(expect.objectContaining({ code: 'TEMPORARILY_UNAVAILABLE' }));
  third.release(); second.release();
  admission.acquire(a).release();
});

test('separate compositions share the process budget and case-insensitive actor identity', () => {
  const first = foundation(f.environment, f.pool).transfers, second = foundation(f.environment, f.pool).transfers;
  const actor = randomUUID(), a = first.acquire(actor);
  try {
    expect(() => second.acquire(actor.toUpperCase())).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }));
    const b = second.acquire(randomUUID());
    try { expect(() => first.acquire(randomUUID())).toThrow(expect.objectContaining({ code: 'TEMPORARILY_UNAVAILABLE' })); }
    finally { b.release(); }
  } finally { a.release(); }
});

test.each(['finish', 'close', 'error', 'aborted'])('%s releases admission and unbinds all terminal listeners', async event => {
  const admission = foundation(f.environment, f.pool).transfers, actor = randomUUID();
  const request = new EventEmitter(), response = new EventEmitter();
  await admission.admit(actor, async () => {}, [request, response]);
  expect(() => admission.acquire(actor)).toThrow();
  request.emit(event, new Error('Synthetic transfer failure'));
  expect(request.eventNames()).toEqual([]); expect(response.eventNames()).toEqual([]);
  admission.acquire(actor).release();
});

test('authorization precedes admission, listeners and any content consumption', async () => {
  const admission = foundation(f.environment, f.pool).transfers, actor = randomUUID();
  const request = new EventEmitter(); let consumed = false;
  await expect((async () => {
    await admission.admit(actor, async () => { throw new Error('permission denied'); }, [request]);
    consumed = true;
  })()).rejects.toThrow('permission denied');
  expect(consumed).toBe(false); expect(request.eventNames()).toEqual([]);
  admission.acquire(actor).release();
});

test('terminal binding errors release the slot and do not leave partial listeners', async () => {
  const admission = foundation(f.environment, f.pool).transfers, actor = randomUUID();
  const first = new EventEmitter(), broken = new EventEmitter();
  broken.once = () => { throw new Error('Synthetic binding failure'); };
  await expect(admission.admit(actor, async () => {}, [first, broken])).rejects.toThrow();
  expect(first.eventNames()).toEqual([]); admission.acquire(actor).release();
});

test('a request aborted while authorization was pending cannot leave a slot waiting for a past event', async () => {
  const admission = foundation(f.environment, f.pool).transfers, actor = randomUUID();
  const request = Object.assign(new EventEmitter(), { aborted: false });
  await expect(admission.admit(actor, async () => {
    request.aborted = true; request.emit('aborted');
  }, [request])).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  expect(request.eventNames()).toEqual([]); admission.acquire(actor).release();
});

test('configuration validates technical limits and defaults without changing real environment', () => {
  const env = { ...process.env, APP_ENV: 'test' };
  const read = (input: NodeJS.ProcessEnv) => Reflect.get(loadEnvironment(input), 'materials');
  expect(read(env)).toEqual({ transferLimit: 2, actorTransferLimit: 1, uploadTimeoutMs: 60000 });
  expect(read({ ...env, MATERIALS_UPLOAD_TIMEOUT_MS: '30000' })).toMatchObject({ uploadTimeoutMs: 30000 });
  for (const [key, value] of [['MATERIALS_TRANSFER_LIMIT', '0'], ['MATERIALS_TRANSFER_LIMIT', '3'],
    ['MATERIALS_ACTOR_TRANSFER_LIMIT', '2'], ['MATERIALS_UPLOAD_TIMEOUT_MS', 'NaN'],
    ['MATERIALS_UPLOAD_TIMEOUT_MS', '0'], ['MATERIALS_UPLOAD_TIMEOUT_MS', '300001']]) {
    expect(() => read({ ...env, [key]: value })).toThrow();
  }
});
