import { afterAll, beforeAll, expect, test } from 'vitest';
import { materialsFixture } from '../support/materials.js';
import type { MaterialsFixture } from '../support/materials.js';
import { foundation } from '../support/materials-foundation.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';

let f: MaterialsFixture, admin: SessionActor, teacher: SessionActor, other: SessionActor;
beforeAll(async () => {
  f = await materialsFixture(); const sessions = new PostgresSessionStore(f.pool);
  admin = (await sessions.lookup(f.admin.secret))!; teacher = (await sessions.lookup(f.teacher.secret))!;
  other = (await sessions.lookup(f.otherTeacher.secret))!;
}, 120000);
afterAll(async () => { await f?.cleanup(); });

test('group membership precedes pagination/counts and offering visibility does not decide management', async () => {
  const queries = foundation(f.environment, f.pool).queries;
  const own = await queries.groups(teacher);
  expect(own).toMatchObject({ total: 1, page: 1, pageSize: 20 });
  expect(own.items.map(g => g.id)).toEqual([f.groupId]);
  const all = await queries.groups(admin, { page: 1, pageSize: 2 });
  expect(all.total).toBe(3); expect(all.items.map(g => g.name)).toEqual(['Grupo A ficticio', 'Grupo B ficticio']);
  expect((await queries.groups(admin, { page: 2, pageSize: 2 })).items[0].id).toBe(f.cancelledGroupId);
  expect((await queries.groups(teacher, { page: Number.MAX_SAFE_INTEGER })).items).toEqual([]);
});

test('authorized empty is distinct from denial; query fields/page bounds are closed', async () => {
  const queries = foundation(f.environment, f.pool).queries;
  expect(await queries.items(teacher, f.groupId, { state: 'PUBLISHED' })).toMatchObject({ total: 1 });
  expect(await queries.items(other, f.otherGroupId, { state: 'WITHDRAWN' })).toMatchObject({ items: [], total: 0 });
  await expect(queries.items(other, f.groupId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  for (const input of [{ page: 0 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: 51 }, { page: '1' },
    { page: null }, { pageSize: null }, { state: { toString: () => 'PREPARED' } },
    { state: 'UNKNOWN' }, { includeBytes: true }, null, []]) {
    await expect(queries.items(admin, f.groupId, input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
  await expect(queries.groups(admin, { state: 'PUBLISHED' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});

test('managed projections are minimal, exact and never select bytes, hashes or financial fields', async () => {
  const queries = foundation(f.environment, f.pool).queries;
  // This schema only: physically forbid selecting bytes/hash, not merely exposing them.
  await f.isolated.ownerQuery(`REVOKE SELECT ON "MaterialContent" FROM academia_v00_runtime;
    GRANT SELECT ("materialId","mediaType","byteSize","downloadName") ON "MaterialContent" TO academia_v00_runtime`);
  try {
    const item = await queries.item(teacher, f.published.id);
    expect(Object.keys(item).sort()).toEqual(['id', 'groupId', 'title', 'description', 'mediaType', 'byteSize',
      'downloadName', 'publishedAt', 'state', 'revision', 'createdAt', 'updatedAt', 'createdBy', 'withdrawnAt'].sort());
    expect(item.revision).toBe('2'); expect(item.publishedAt).toMatch(/\.\d{6}Z$/);
    expect((await queries.items(teacher, f.groupId)).items).toHaveLength(3);
  } finally { await f.isolated.ownerQuery('GRANT SELECT ON "MaterialContent" TO academia_v00_runtime'); }
  const group = await queries.group(teacher, f.groupId);
  expect(Object.keys(group).sort()).toEqual(['id', 'name', 'courseName', 'state', 'actions'].sort());
});
