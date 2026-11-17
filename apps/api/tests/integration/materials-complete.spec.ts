import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { createMaterialsFoundation } from '../../src/app.module.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import type { ManagedMaterial } from '../../src/modules/materials/public/materials.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { materialsFixture } from '../support/materials.js';
import type { MaterialsFixture } from '../support/materials.js';
import { materialFileCase } from '../support/materials-files.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';

let f: MaterialsFixture, teacher: SessionActor, admin: SessionActor;
beforeAll(async () => {
  f = await materialsFixture(); const sessions = new PostgresSessionStore(f.pool);
  teacher = (await sessions.lookup(f.teacher.secret))!; admin = (await sessions.lookup(f.admin.secret))!;
}, 120000);
afterAll(async () => { await f?.cleanup(); });
function api() {
  const root = createMaterialsFoundation(f.environment, f.pool);
  const complete: unknown = Reflect.get(root.uploads, 'complete');
  if (typeof complete !== 'function') throw new Error('T022: atomic upload completion not implemented');
  return { ...root.uploads, complete: complete as (actor: SessionActor, uploadId: string, bytes: Uint8Array) => Promise<{ resource: ManagedMaterial; replayed: boolean }> };
}
async function pending(format = 'pdf-valid', groupId = f.groupId) {
  const target = api(), file = materialFileCase(format);
  const input = { intentionId: randomUUID(), title: 'Lectura atómica ficticia', description: 'Conservar íntegro',
    downloadName: file.name, mediaType: file.mediaType, byteSize: file.byteSize, sha256: file.sha256 };
  const upload = await target.register(teacher, groupId, input);
  return { target, file, upload };
}
async function counts() {
  return (await f.pool.query(`SELECT (SELECT count(*)::int FROM "Material") AS materials,
    (SELECT count(*)::int FROM "MaterialContent") AS contents,(SELECT count(*)::int FROM "MaterialAuditEvent") AS audits,
    (SELECT count(*)::int FROM "MaterialCommand") AS commands`)).rows[0] as Record<string, number>;
}
/** Instrument the real pg client; no production fault hooks or substitute persistence. */
function instrument(intercept: (sql: string, execute: () => Promise<unknown>, client: PoolClient) => Promise<unknown>) {
  const original = f.pool.connect.bind(f.pool), seen = new Set<PoolClient>(), restores: (() => void)[] = [];
  const connect = vi.spyOn(f.pool, 'connect').mockImplementation((async () => {
    const client = await original();
    if (!seen.has(client)) {
      seen.add(client); const query = client.query.bind(client);
      const spy = vi.spyOn(client, 'query').mockImplementation(((...args: unknown[]) =>
        intercept(typeof args[0] === 'string' ? args[0] : '', async () => Reflect.apply(query, client, args), client)) as typeof client.query);
      restores.push(() => spy.mockRestore());
    }
    return client;
  }) as typeof f.pool.connect);
  return () => { connect.mockRestore(); restores.forEach(restore => restore()); };
}

test.each(['pdf-valid', 'jpeg-valid', 'png-valid'])('%s commits PREPARED, bytes, completion and safe audit together without publishing', async format => {
  const { target, file, upload } = await pending(format), before = await counts(), finance = await financialFingerprint(f.pool);
  const result = await target.complete(teacher, upload.uploadId, file.bytes);
  expect(result).toMatchObject({ replayed: false, resource: { groupId: f.groupId, title: 'Lectura atómica ficticia',
    description: 'Conservar íntegro', state: 'PREPARED', revision: '1', createdBy: teacher.userId, publishedAt: null, withdrawnAt: null } });
  expect(Object.keys(result.resource).sort()).toEqual(['id','groupId','title','description','state','revision','createdBy',
    'createdAt','updatedAt','publishedAt','withdrawnAt','mediaType','byteSize','downloadName'].sort());
  expect(result.resource.createdAt).toMatch(/\.\d{6}Z$/); expect(result.resource.updatedAt).toBe(result.resource.createdAt);
  expect(await target.status(teacher, upload.uploadId)).toMatchObject({ state: 'COMPLETED', materialId: result.resource.id });
  const stored = (await f.pool.query('SELECT bytes,sha256 FROM "MaterialContent" WHERE "materialId"=$1', [result.resource.id])).rows[0];
  expect(stored).toEqual({ bytes: file.bytes, sha256: file.sha256 });
  const audit = (await f.pool.query(`SELECT "actorId","groupId",operation,result,revision::text FROM "MaterialAuditEvent" WHERE "materialId"=$1`, [result.resource.id])).rows;
  expect(audit).toEqual([{ actorId: teacher.userId, groupId: f.groupId, operation: 'UPLOAD_COMPLETE', result: 'APPLIED', revision: '1' }]);
  expect(await counts()).toEqual({ materials: before.materials + 1, contents: before.contents + 1, audits: before.audits + 1, commands: before.commands });
  expect(await financialFingerprint(f.pool)).toBe(finance);
});

test('racing equal completions return one material, one audit and exactly one fresh result', async () => {
  const { target, file, upload } = await pending(), before = await counts();
  const results = await Promise.all([target.complete(teacher, upload.uploadId, file.bytes), target.complete(teacher, upload.uploadId, file.bytes)]);
  expect(new Set(results.map(r => r.resource.id)).size).toBe(1); expect(results.filter(r => !r.replayed)).toHaveLength(1);
  expect(await counts()).toEqual({ materials: before.materials + 1, contents: before.contents + 1, audits: before.audits + 1, commands: before.commands });
});

test('replay validates bytes again, returns the current resource and cannot replace immutable content', async () => {
  const { target, file, upload } = await pending(), first = await target.complete(teacher, upload.uploadId, file.bytes);
  await f.pool.query(`UPDATE "Material" SET state='WITHDRAWN',revision=revision+1,"withdrawnAt"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1`, [first.resource.id]);
  const before = await counts();
  expect(await api().complete(teacher, upload.uploadId, file.bytes)).toMatchObject({ replayed: true,
    resource: { id: first.resource.id, state: 'WITHDRAWN', revision: '2' } });
  const changed = Buffer.from(file.bytes); changed[10] ^= 1;
  await expect(target.complete(teacher, upload.uploadId, changed)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(await counts()).toEqual(before);
  expect((await f.pool.query('SELECT bytes FROM "MaterialContent" WHERE "materialId"=$1', [first.resource.id])).rows[0].bytes).toEqual(file.bytes);
});

test('invalid bytes and another intention owner cannot complete or create partial rows', async () => {
  const { target, file, upload } = await pending(), before = await counts();
  await expect(target.complete(admin, upload.uploadId, file.bytes)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(target.complete(teacher, randomUUID(), file.bytes)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(target.complete(teacher, upload.uploadId, file.bytes.subarray(0, -1))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(await counts()).toEqual(before); expect(await target.status(teacher, upload.uploadId)).toMatchObject({ state: 'PENDING', materialId: null });
});

test.each(['content', 'link', 'audit', 'before-commit'] as const)('%s fault rolls back every new row and preserves previous material bytes', async stage => {
  const { target, file, upload } = await pending(), before = await counts(); let writing = false, injected = false;
  const restore = instrument(async (sql, execute) => {
    if (/INSERT INTO "Material"/.test(sql)) writing = true;
    const fail = stage === 'content' ? /INSERT INTO "MaterialContent"/.test(sql) : stage === 'link' ? /UPDATE "MaterialUpload"/.test(sql)
      : stage === 'audit' ? /INSERT INTO "MaterialAuditEvent"/.test(sql) : writing && sql === 'COMMIT';
    if (fail) { injected = true; throw Object.assign(new Error('Synthetic storage fault'), { code: '53100' }); }
    return execute();
  });
  try { await expect(target.complete(teacher, upload.uploadId, file.bytes)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' }); }
  finally { restore(); }
  expect(injected).toBe(true); expect(await counts()).toEqual(before);
  expect(await target.status(teacher, upload.uploadId)).toMatchObject({ state: 'PENDING', materialId: null });
  const prior = materialFileCase(f.prepared.fileId);
  expect((await f.pool.query('SELECT bytes FROM "MaterialContent" WHERE "materialId"=$1', [f.prepared.id])).rows[0].bytes).toEqual(prior.bytes);
});

test('lost COMMIT acknowledgement is not retried automatically; status recovers the single committed result', async () => {
  const { target, file, upload } = await pending(), before = await counts(); let inserts = 0, lost = false;
  const restore = instrument(async (sql, execute) => {
    if (/INSERT INTO "Material"/.test(sql)) inserts++;
    const result = await execute();
    if (inserts && sql === 'COMMIT' && !lost) { lost = true; throw Object.assign(new Error('Synthetic lost commit acknowledgement'), { code: '08006' }); }
    return result;
  });
  try { await expect(target.complete(teacher, upload.uploadId, file.bytes)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' }); }
  finally { restore(); }
  expect(lost).toBe(true); expect(inserts).toBe(1);
  const status = await api().status(teacher, upload.uploadId); expect(status.state).toBe('COMPLETED');
  expect(await api().complete(teacher, upload.uploadId, file.bytes)).toMatchObject({ replayed: true, resource: { id: status.materialId } });
  expect(await counts()).toEqual({ materials: before.materials + 1, contents: before.contents + 1, audits: before.audits + 1, commands: before.commands });
});

test.each(['revocation', 'assignment', 'cancellation', 'caller-mutation'] as const)('%s between authorized inspection and write is handled after releasing read locks', async change => {
  const groupId = change === 'cancellation' ? randomUUID() : f.groupId;
  if (change === 'cancellation') await f.pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,"teacherUserId")
    VALUES ($1,$2,'Cancelación atómica ficticia',$3)`, [groupId, f.courseId, teacher.userId]);
  const { target, file, upload } = await pending('pdf-valid', groupId), before = await counts(), bytes = Buffer.from(file.bytes);
  const external = await f.pool.connect();
  let notify!: () => void, resume!: () => void;
  const reached = new Promise<void>(resolve => { notify = resolve; }), barrier = new Promise<void>(resolve => { resume = resolve; });
  let stopped = false;
  const restore = instrument(async (sql, execute) => {
    const result = await execute();
    // A completed read COMMIT releases locks before validation and the later write.
    if (sql === 'COMMIT' && !stopped) { stopped = true; notify(); await barrier; }
    return result;
  });
  const operation = target.complete(teacher, upload.uploadId, bytes);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([reached, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Inspection barrier not reached')), 10000); })]);
    clearTimeout(timer);
    if (change === 'revocation') await external.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [teacher.sessionId]);
    if (change === 'assignment') await external.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [f.otherTeacher.userId, f.groupId]);
    if (change === 'cancellation') await external.query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancelledAt"=clock_timestamp(),"cancellationReason"='Ensayo',revision=revision+1 WHERE id=$1`, [groupId]);
    // This happens before the completion continuation snapshots input; mutated input must fail hash validation.
    if (change === 'caller-mutation') bytes[10] ^= 1;
    resume();
    await expect(operation).rejects.toMatchObject({ code: change === 'revocation' ? 'AUTH_REQUIRED' : change === 'caller-mutation' ? 'VALIDATION_ERROR' : 'NOT_FOUND' });
  } finally {
    clearTimeout(timer); resume(); await operation.catch(() => undefined); restore(); external.release();
    if (change === 'revocation') await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [teacher.sessionId]);
    if (change === 'assignment') await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [teacher.userId, f.groupId]);
  }
  expect(stopped).toBe(true); expect(await counts()).toEqual(before);
  if (change === 'cancellation') {
    await expect(target.status(teacher, upload.uploadId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await f.pool.query('SELECT "materialId" FROM "MaterialUpload" WHERE "uploadId"=$1', [upload.uploadId])).rows[0].materialId).toBeNull();
  } else expect(await target.status(teacher, upload.uploadId)).toMatchObject({ state: 'PENDING', materialId: null });
});

test('the validated private snapshot survives caller mutation after validation while the write awaits a connection', async () => {
  const { target, file, upload } = await pending(), bytes = Buffer.from(file.bytes);
  let notify!: () => void, resume!: () => void, begins = 0;
  const reached = new Promise<void>(resolve => { notify = resolve; }), barrier = new Promise<void>(resolve => { resume = resolve; });
  const restore = instrument(async (sql, execute) => {
    const result = await execute();
    if (sql === 'BEGIN' && ++begins === 2) { notify(); await barrier; }
    return result;
  });
  const operation = target.complete(teacher, upload.uploadId, bytes);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([reached, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Write barrier not reached')), 10000); })]);
    clearTimeout(timer); bytes.fill(0); resume();
    const completed = await operation;
    expect(completed.replayed).toBe(false);
    restore();
    expect((await f.pool.query('SELECT bytes FROM "MaterialContent" WHERE "materialId"=$1', [completed.resource.id])).rows[0].bytes).toEqual(file.bytes);
  } finally { clearTimeout(timer); resume(); await operation.catch(() => undefined); restore(); }
});

test('completed replay locks the linked material before the upload and preserves authority-before-projection', async () => {
  const { target, file, upload } = await pending(); await target.complete(teacher, upload.uploadId, file.bytes);
  const queries: string[] = [], restore = instrument(async (sql, execute) => { queries.push(sql); return execute(); });
  try { expect((await target.complete(teacher, upload.uploadId, file.bytes)).replayed).toBe(true); } finally { restore(); }
  for (const suffix of ['SHARE', 'UPDATE']) {
    const locks = queries.filter(sql => sql.includes('FOR ' + suffix));
    const material = locks.findIndex(sql => /FROM "Material"/.test(sql)), intention = locks.findIndex(sql => /FROM "MaterialUpload"/.test(sql));
    expect(material).toBeGreaterThanOrEqual(0); expect(intention).toBeGreaterThan(material);
  }
});

test('the exact 20 000 000 byte file commits with matching server digest and SQL octet length', async () => {
  const { target, file, upload } = await pending('pdf-limit');
  const result = await target.complete(teacher, upload.uploadId, file.bytes);
  expect(result.resource.byteSize).toBe(20_000_000);
  const row = (await f.pool.query(`SELECT octet_length(bytes) AS size,encode(sha256(bytes),'hex') AS actual,sha256 AS expected
    FROM "MaterialContent" WHERE "materialId"=$1`, [result.resource.id])).rows[0];
  expect(row).toEqual({ size: 20_000_000, actual: file.sha256, expected: file.sha256 });
}, 60000);

test('invalidating the session after the audit INSERT rolls back material/content/link/audit before COMMIT', async () => {
  const { target, file, upload } = await pending(), before = await counts(); let invalidated = false;
  const restore = instrument(async (sql, execute, client) => {
    const result = await execute();
    if (/INSERT INTO "MaterialAuditEvent"/.test(sql)) {
      invalidated = true;
      await client.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [teacher.sessionId]);
    }
    return result;
  });
  try { await expect(target.complete(teacher, upload.uploadId, file.bytes)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); }
  finally { restore(); }
  expect(invalidated).toBe(true); expect(await counts()).toEqual(before);
  expect(await target.status(teacher, upload.uploadId)).toMatchObject({ state: 'PENDING', materialId: null });
  expect((await f.pool.query('SELECT "revokedAt" FROM "Session" WHERE id=$1', [teacher.sessionId])).rows[0].revokedAt).toBeNull();
});
