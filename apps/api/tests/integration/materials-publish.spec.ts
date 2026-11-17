import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { createMaterialsFoundation } from '../../src/app.module.js';
import type { MaterialCommandResponse } from '../../src/modules/materials/public/materials.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { materialsFixture } from '../support/materials.js';
import type { MaterialsFixture } from '../support/materials.js';

let f: MaterialsFixture, teacher: SessionActor, admin: SessionActor;
beforeAll(async () => {
  f = await materialsFixture(); const sessions = new PostgresSessionStore(f.pool);
  teacher = (await sessions.lookup(f.teacher.secret))!; admin = (await sessions.lookup(f.admin.secret))!;
}, 120000);
afterAll(async () => { await f?.cleanup(); });
function commands() {
  const candidate: unknown = Reflect.get(createMaterialsFoundation(f.environment, f.pool), 'commands');
  if (!candidate || typeof Reflect.get(candidate as object, 'publish') !== 'function') throw new Error('T023: explicit publication not implemented');
  return candidate as { publish(actor: SessionActor, materialId: string, input: unknown): Promise<MaterialCommandResponse> };
}
const input = (revision = '1') => ({ commandId: randomUUID(), expectedRevision: revision });
test('explicit publication atomically records current resource, command and audit without replacing bytes', async () => {
  const api = commands(), item = await f.seedMaterial('PREPARED'), command = input();
  const before = (await f.pool.query('SELECT bytes,sha256 FROM "MaterialContent" WHERE "materialId"=$1', [item.id])).rows[0];
  const result = await api.publish(teacher, item.id, command);
  expect(result).toMatchObject({ resource: { id: item.id, state: 'PUBLISHED', revision: '2', createdBy: teacher.userId },
    command: { id: command.commandId, replayed: false, appliedRevision: '2', result: 'APPLIED' } });
  expect(result.resource.publishedAt).toMatch(/\.\d{6}Z$/);
  expect(result.resource.updatedAt).toBe(result.resource.publishedAt);
  expect((await f.pool.query('SELECT bytes,sha256 FROM "MaterialContent" WHERE "materialId"=$1', [item.id])).rows[0]).toEqual(before);
  expect((await f.pool.query(`SELECT operation,result,revision::text FROM "MaterialAuditEvent" WHERE "commandId"=$1`, [command.commandId])).rows)
    .toEqual([{ operation: 'PUBLISH', result: 'APPLIED', revision: '2' }]);
});
test('same command replays the historical receipt and current authorized resource', async () => {
  const api = commands(), item = await f.seedMaterial('PREPARED'), command = input();
  await api.publish(teacher, item.id, command);
  await f.pool.query(`UPDATE "Material" SET state='WITHDRAWN',revision=revision+1,"withdrawnAt"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1`, [item.id]);
  expect(await commands().publish(teacher, item.id, command)).toMatchObject({ resource: { state: 'WITHDRAWN', revision: '3' },
    command: { replayed: true, appliedRevision: '2', result: 'APPLIED' } });
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialCommand" WHERE "actorId"=$1 AND "commandId"=$2', [teacher.userId, command.commandId])).rows[0].n).toBe(1);
});
test('new command on published resource is NO_CHANGE only with the current revision and leaves timestamps unchanged', async () => {
  const api = commands(), item = await f.seedMaterial('PUBLISHED'), command = input('2');
  const before = await createMaterialsFoundation(f.environment, f.pool).queries.item(teacher, item.id);
  const result = await api.publish(teacher, item.id, command);
  expect(result.resource).toEqual(before); expect(result.command).toMatchObject({ appliedRevision: '2', result: 'NO_CHANGE', replayed: false });
  await expect(api.publish(teacher, item.id, input('1'))).rejects.toMatchObject({ code: 'MATERIAL_VERSION_CONFLICT' });
});
test('same command identity with changed revision or another material conflicts before stale-version evaluation', async () => {
  const api = commands(), first = await f.seedMaterial('PREPARED'), second = await f.seedMaterial('PREPARED'), command = input();
  await api.publish(teacher, first.id, command);
  await expect(api.publish(teacher, first.id, { ...command, expectedRevision: '2' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(api.publish(teacher, second.id, command)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});
test('concurrent identical publish has one APPLIED ledger/audit and recovers the same receipt', async () => {
  const api = commands(), item = await f.seedMaterial('PREPARED'), command = input();
  const results = await Promise.all([api.publish(teacher, item.id, command), api.publish(teacher, item.id, command)]);
  expect(results.filter(r => !r.command.replayed)).toHaveLength(1); expect(results.every(r => r.resource.revision === '2')).toBe(true);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialAuditEvent" WHERE "commandId"=$1', [command.commandId])).rows[0].n).toBe(1);
});
test('replay is denied after session revocation or reassignment and cancelled groups cannot publish', async () => {
  const api = commands(), item = await f.seedMaterial('PREPARED'), command = input(); await api.publish(teacher, item.id, command);
  await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [teacher.sessionId]);
  try { await expect(api.publish(teacher, item.id, command)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); }
  finally { await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [teacher.sessionId]); }
  await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [f.otherTeacher.userId, f.groupId]);
  try { await expect(api.publish(teacher, item.id, command)).rejects.toMatchObject({ code: 'NOT_FOUND' }); }
  finally { await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [teacher.userId, f.groupId]); }
  await expect(api.publish(admin, f.cancelledPublished.id, input('2'))).rejects.toMatchObject({ code: 'MATERIAL_STATE_CONFLICT' });
});
test('publication accepts only closed UUID/revision DTOs, never coerces or overflows int64', async () => {
  const api = commands();
  for (const invalid of [null, [], { ...input(), state: 'PUBLISHED' }, { ...input(), commandId: 'bad' },
    ...['0', '01', '-1', '1.0', '9223372036854775808', 1, null].map(expectedRevision => ({ ...input(), expectedRevision }))]) {
    await expect(api.publish(teacher, f.prepared.id, invalid)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
});
test('failed audit rolls back resource and ledger together', async () => {
  const api = commands(), item = await f.seedMaterial('PREPARED'), command = input(), client = await f.pool.connect();
  const original = client.query.bind(client), connect = vi.spyOn(f.pool, 'connect').mockImplementation((async () => client) as typeof f.pool.connect);
  const query = vi.spyOn(client, 'query').mockImplementation(((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('INSERT INTO "MaterialAuditEvent"')) throw new Error('Synthetic audit failure');
    return Reflect.apply(original, client, args);
  }) as typeof client.query);
  try { await expect(api.publish(teacher, item.id, command)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' }); }
  finally { query.mockRestore(); connect.mockRestore(); }
  expect((await f.pool.query('SELECT state,revision::text FROM "Material" WHERE id=$1', [item.id])).rows[0]).toEqual({ state: 'PREPARED', revision: '1' });
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialCommand" WHERE "commandId"=$1', [command.commandId])).rows[0].n).toBe(0);
});

test('a lost publication COMMIT response recovers one durable receipt without automatic republish', async () => {
  const api = commands(), item = await f.seedMaterial('PREPARED'), command = input(), client = await f.pool.connect();
  const original = client.query.bind(client), connect = vi.spyOn(f.pool, 'connect').mockImplementation((async () => client) as typeof f.pool.connect);
  let commits = 0;
  const query = vi.spyOn(client, 'query').mockImplementation((async (...args: unknown[]) => {
    const result = await Reflect.apply(original, client, args);
    if (args[0] === 'COMMIT') { commits++; throw Object.assign(new Error('Synthetic lost publication acknowledgement'), { code: '08006' }); }
    return result;
  }) as typeof client.query);
  try { await expect(api.publish(teacher, item.id, command)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' }); }
  finally { query.mockRestore(); connect.mockRestore(); }
  expect(commits).toBe(1);
  expect(await commands().publish(teacher, item.id, command)).toMatchObject({ resource: { revision: '2', state: 'PUBLISHED' },
    command: { replayed: true, appliedRevision: '2', result: 'APPLIED' } });
});
