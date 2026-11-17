import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { materialsTemporalFixture } from '../support/materials-temporal.js';
import type { MaterialsTemporalFixture } from '../support/materials-temporal.js';
import { foundation } from '../support/materials-foundation.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';

let f: MaterialsTemporalFixture, student: SessionActor, before: string;
beforeAll(async () => { f = await materialsTemporalFixture(); student = (await new PostgresSessionStore(f.pool).lookup(f.student.secret))!; before = await financialFingerprint(f.pool); }, 120000);
afterAll(async () => { try { if (f) expect(await financialFingerprint(f.pool)).toBe(before); } finally { await f?.cleanup(); } });
const queries = () => foundation(f.environment, f.pool).queries;
test('SQ01 student projections and counts include only current group and published materials', async () => {
  const groups = await queries().groups(student); expect(groups.total).toBe(1);
  expect(Object.keys(groups.items[0]).sort()).toEqual(['id', 'name', 'courseName'].sort());
  const page = await queries().items(student, f.groupId, { pageSize: 1 }); expect(page.total).toBe(1); expect(page.items.map(m => m.id)).toEqual([f.published.id]);
  const item = await queries().item(student, f.published.id);
  expect(Object.keys(item).sort()).toEqual(['id','groupId','title','description','mediaType','byteSize','downloadName','publishedAt'].sort());
  expect(page.items[0]).toEqual(item); expect(item.publishedAt).toMatch(/\.\d{6}Z$/);
});
test('SQ02 successful empty page stays distinct from foreign group and forbidden manager filters', async () => {
  expect(await queries().items(student, f.groupId, { page: 2 })).toMatchObject({ total: 1, items: [] });
  for (const input of [{ state: 'PUBLISHED' }, { state: undefined }, { includeBytes: true }])
    await expect(queries().items(student, f.groupId, input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  await expect(queries().items(student, f.otherGroupId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
test('SQ03 known hidden and unknown references are concealed before a public resource is returned', async () => {
  for (const id of [f.prepared.id, f.withdrawn.id, f.otherPublished.id, f.cancelledPublished.id, randomUUID()])
    await expect(queries().item(student, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
test('SQ04 metadata succeeds without SELECT privileges on bytea/hash; financial/private columns never reach DTO', async () => {
  const role = new URL(f.environment.databaseUrl).username; if (!/^[a-z][a-z0-9_]+$/.test(role)) throw new Error('Invalid test role');
  await f.isolated.ownerQuery(`REVOKE SELECT ON "MaterialContent" FROM "${role}"; GRANT SELECT ("materialId","mediaType","byteSize","downloadName") ON "MaterialContent" TO "${role}"`);
  try { expect((await queries().item(student, f.published.id)).id).toBe(f.published.id); expect((await queries().items(student, f.groupId)).total).toBe(1); }
  finally { await f.isolated.ownerQuery(`GRANT SELECT ON "MaterialContent" TO "${role}"`); }
});
test('SQ05 student only locks its own account, then session/course/group/material, without financial locks or teacher directory lookup', async () => {
  const statements: string[] = [];
  const client = await f.pool.connect(), original = client.query.bind(client), accounts: unknown[] = [];
  const release = vi.spyOn(client, 'release');
  const connect = vi.spyOn(f.pool, 'connect').mockImplementation((async () => client) as typeof f.pool.connect);
  const query = vi.spyOn(client, 'query').mockImplementation(((...args: unknown[]) => {
    const sql = typeof args[0] === 'string' ? args[0] : '';
    if (/FOR (UPDATE|SHARE)/.test(sql)) {
      statements.push(sql);
      if (/FROM "User".*ANY/.test(sql)) accounts.push(args[1]);
    }
    expect(sql).not.toMatch(/FROM "AcademicTeacherDirectory"/);
    return Reflect.apply(original, client, args);
  }) as typeof client.query);
  try { expect((await queries().item(student, f.published.id)).id).toBe(f.published.id); }
  finally { query.mockRestore(); connect.mockRestore(); if (!release.mock.calls.length) client.release(); release.mockRestore(); }
  expect(accounts).toEqual([[[student.userId]]]);
  const order = statements.map(sql => /FROM "([^"]+)"/.exec(sql)?.[1]).filter(Boolean);
  expect(order.indexOf('User')).toBeLessThan(order.indexOf('Session')); expect(order.indexOf('Session')).toBeLessThan(order.indexOf('AcademicCourse'));
  expect(order.indexOf('AcademicCourse')).toBeLessThan(order.indexOf('AcademicGroup')); expect(order.indexOf('AcademicGroup')).toBeLessThan(order.indexOf('Material'));
  expect(order.some(table => /Enrollment|Payment|Reservation|Dispatch/.test(table!))).toBe(false);
});
test('SQ06 enrolled students cannot use mutation or upload capabilities even on their own published material', async () => {
  const target = foundation(f.environment, f.pool);
  for (const action of ['PREPARE', 'EDIT', 'PUBLISH', 'WITHDRAW'] as const)
    await expect(Promise.resolve().then(() => target.run(student, { kind: 'MATERIAL', id: f.published.id }, action, async () => {}))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(Promise.resolve().then(() => target.run(student, { kind: 'UPLOAD', id: f.prepared.uploadId }, 'READ', async () => {}))).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
test('SQ07 backward decision time cannot expose a future published resource or count it as current', async () => {
  await f.set(f.base + 1000000n); const future = await f.seedMaterial('PUBLISHED'); await f.set(f.base);
  await expect(queries().items(student, f.groupId)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  await expect(queries().item(student, future.id)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
});
