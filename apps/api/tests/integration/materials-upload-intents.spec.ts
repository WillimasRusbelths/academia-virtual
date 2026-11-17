import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import type { MaterialUploadInput, MaterialUploadStatus } from '../../src/modules/materials/public/materials.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { createMaterialsFoundation } from '../../src/app.module.js';
import { materialsFixture } from '../support/materials.js';
import type { MaterialsFixture } from '../support/materials.js';
import { materialFileCase } from '../support/materials-files.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';

let f: MaterialsFixture, teacher: SessionActor, admin: SessionActor, other: SessionActor, student: SessionActor;
beforeAll(async () => {
  f = await materialsFixture(); const sessions = new PostgresSessionStore(f.pool);
  teacher = (await sessions.lookup(f.teacher.secret))!; admin = (await sessions.lookup(f.admin.secret))!;
  other = (await sessions.lookup(f.otherTeacher.secret))!; student = (await sessions.lookup(f.student.secret))!;
}, 120000);
afterAll(async () => { await f?.cleanup(); });
interface Intents {
  register(actor: SessionActor, groupId: string, input: unknown): Promise<MaterialUploadStatus>;
  status(actor: SessionActor, uploadId: string): Promise<MaterialUploadStatus>;
}
function intents(): Intents {
  const capability: unknown = Reflect.get(createMaterialsFoundation(f.environment, f.pool), 'uploads');
  if (!capability || typeof capability !== 'object' || typeof Reflect.get(capability, 'register') !== 'function'
    || typeof Reflect.get(capability, 'status') !== 'function') throw new Error('T021: persistent upload intentions not implemented');
  return capability as Intents;
}
function input(): MaterialUploadInput {
  const file = materialFileCase('pdf-valid');
  return { intentionId: randomUUID(), title: 'Lectura ficticia', description: 'Texto de ensayo',
    downloadName: file.name, mediaType: 'application/pdf', byteSize: file.byteSize, sha256: file.sha256 };
}
async function businessCounts() {
  return (await f.pool.query(`SELECT (SELECT count(*)::int FROM "Material") AS materials,
    (SELECT count(*)::int FROM "MaterialContent") AS contents, (SELECT count(*)::int FROM "MaterialCommand") AS commands,
    (SELECT count(*)::int FROM "MaterialAuditEvent") AS audits`)).rows[0];
}

test('register durably stores normalized immutable expectations, returns only PENDING, and creates no material/content/history', async () => {
  const api = intents(), payload = input(), counts = await businessCounts(), financial = await financialFingerprint(f.pool);
  const result = await api.register(teacher, f.groupId, Object.freeze({ ...payload, title: '  Lectura ficticia  ', description: ' \n ' }));
  expect(result).toEqual({ uploadId: expect.any(String), state: 'PENDING', materialId: null, command: { replayed: false } });
  const persisted = (await f.pool.query('SELECT * FROM "MaterialUpload" WHERE "uploadId"=$1', [result.uploadId])).rows[0];
  expect(persisted).toMatchObject({ actorId: teacher.userId, intentionId: payload.intentionId, groupId: f.groupId,
    title: payload.title, description: null, downloadName: payload.downloadName, mediaType: payload.mediaType,
    byteSize: payload.byteSize, sha256: payload.sha256, materialId: null });
  expect(persisted.payloadDigest).toBeInstanceOf(Buffer); expect(persisted.payloadDigest).toHaveLength(32);
  expect(await businessCounts()).toEqual(counts); expect(await financialFingerprint(f.pool)).toBe(financial);
  expect(await api.status(teacher, result.uploadId)).toEqual({ ...result, command: { replayed: false } });
});

test('same normalized input recovers the same intention across composition instances without duplicate rows', async () => {
  const payload = input(); const first = await intents().register(teacher, f.groupId, { ...payload, description: null });
  const replay = await intents().register(teacher, f.groupId, { ...payload, title: '  ' + payload.title + ' ', description: ' ' });
  expect(replay).toEqual({ ...first, command: { replayed: true } });
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialUpload" WHERE "actorId"=$1 AND "intentionId"=$2',
    [teacher.userId, payload.intentionId])).rows[0].n).toBe(1);
});

test.each(['groupId', 'title', 'description', 'downloadName', 'mediaType', 'byteSize', 'sha256'] as const)(
  'changing %s conflicts and never overwrites the original expectation', async field => {
    const api = intents(), payload = input();
    const first = await api.register(admin, f.groupId, payload);
    const changes: Record<string, unknown> = { title: 'Otra lectura', description: 'Otro texto', downloadName: 'otro.pdf',
      byteSize: payload.byteSize + 1, sha256: 'f'.repeat(64), mediaType: 'image/png' };
    const changed = field === 'groupId' ? payload : field === 'mediaType'
      ? { ...payload, mediaType: 'image/png', downloadName: 'otro.png' } : { ...payload, [field]: changes[field] };
    await expect(api.register(admin, field === 'groupId' ? f.otherGroupId : f.groupId, changed))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const row = (await f.pool.query('SELECT "groupId",title,description,"downloadName","mediaType","byteSize",sha256 FROM "MaterialUpload" WHERE "uploadId"=$1', [first.uploadId])).rows[0];
    const { intentionId: _intention, ...expected } = payload; void _intention;
    expect(row).toEqual({ ...expected, groupId: f.groupId });
  });

test('the canonical digest binds actor, group and every input field using an unambiguous versioned tuple', async () => {
  const payload = input(), api = intents(), first = await api.register(teacher, f.groupId, payload);
  const row = (await f.pool.query('SELECT "payloadDigest" FROM "MaterialUpload" WHERE "uploadId"=$1', [first.uploadId])).rows[0];
  const canonical = ['materials.upload.v1', teacher.userId, f.groupId, payload.intentionId, payload.title, payload.description,
    payload.downloadName, payload.mediaType, payload.byteSize, payload.sha256];
  expect(row.payloadDigest).toEqual(createHash('sha256').update(JSON.stringify(canonical)).digest());
});

test('two managers may use the same intention UUID and filename independently; neither can read the other intention', async () => {
  const api = intents(), payload = input();
  const own = await api.register(teacher, f.groupId, payload), independent = await api.register(admin, f.groupId, payload);
  expect(independent.uploadId).not.toBe(own.uploadId); expect(independent.command.replayed).toBe(false);
  await expect(api.status(admin, own.uploadId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(api.status(teacher, independent.uploadId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(api.status(admin, randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(api.status(admin, 'not-a-uuid')).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('racing identical registrations persist one result with exactly one fresh receipt', async () => {
  const api = intents(), payload = input();
  const results = await Promise.all(Array.from({ length: 6 }, () => api.register(teacher, f.groupId, payload)));
  expect(new Set(results.map(r => r.uploadId)).size).toBe(1);
  expect(results.filter(r => !r.command.replayed)).toHaveLength(1);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialUpload" WHERE "actorId"=$1 AND "intentionId"=$2',
    [teacher.userId, payload.intentionId])).rows[0].n).toBe(1);
});

test('racing different payloads under one identity choose one durable winner and return conflict for the loser', async () => {
  const api = intents(), payload = input();
  const results = await Promise.allSettled([api.register(teacher, f.groupId, payload),
    api.register(teacher, f.groupId, { ...payload, title: 'Alternativa ficticia' })]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const failure = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
  expect(failure.reason).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialUpload" WHERE "actorId"=$1 AND "intentionId"=$2',
    [teacher.userId, payload.intentionId])).rows[0].n).toBe(1);
});

test('completed status recovers the durable material reference and replay does not create another material', async () => {
  const api = intents(), payload = input(), pending = await api.register(teacher, f.groupId, payload);
  // Seed a durable result through the fixture, not through an unimplemented complete adapter.
  const seeded = await f.seedMaterial('PREPARED');
  await f.pool.query('DELETE FROM "MaterialUpload" WHERE "uploadId"=$1', [seeded.uploadId]);
  await f.pool.query('UPDATE "MaterialUpload" SET "materialId"=$1 WHERE "uploadId"=$2', [seeded.id, pending.uploadId]);
  const counts = await businessCounts();
  expect(await api.status(teacher, pending.uploadId)).toEqual({ uploadId: pending.uploadId, state: 'COMPLETED', materialId: seeded.id, command: { replayed: false } });
  expect(await intents().register(teacher, f.groupId, payload)).toEqual({ uploadId: pending.uploadId, state: 'COMPLETED', materialId: seeded.id, command: { replayed: true } });
  expect(await businessCounts()).toEqual(counts);
});

test('reassignment denies both replay and status to the original owner; the new teacher cannot take over an old intention', async () => {
  const api = intents(), payload = input(), pending = await api.register(teacher, f.groupId, payload);
  await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [other.userId, f.groupId]);
  try {
    await expect(api.register(teacher, f.groupId, payload)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(api.status(teacher, pending.uploadId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(api.status(other, pending.uploadId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  } finally { await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [teacher.userId, f.groupId]); }
});

test('revocation and stale role deny replay before returning the stored result', async () => {
  const api = intents(), payload = input(), pending = await api.register(teacher, f.groupId, payload);
  await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [teacher.sessionId]);
  try {
    await expect(api.register(teacher, f.groupId, payload)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    await expect(api.status(teacher, pending.uploadId)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  } finally { await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [teacher.sessionId]); }
  await expect(api.register({ ...teacher, role: 'ADMIN' }, f.groupId, payload)).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('invalid/foreign/cancelled requests leave no intention and unknown DTO fields are closed', async () => {
  const api = intents(), payload = input(), before = (await f.pool.query('SELECT count(*)::int AS n FROM "MaterialUpload"')).rows[0].n;
  for (const value of [null, [], { ...payload, intentionId: 'bad' }, { ...payload, bytes: [] },
    { ...payload, state: 'PUBLISHED' }, { ...payload, materialId: randomUUID() }, { ...payload, title: ' ' }]) {
    await expect(api.register(teacher, f.groupId, value)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
  await expect(api.register(student, f.groupId, payload)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(api.register(other, f.groupId, payload)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(api.register(admin, f.cancelledGroupId, payload)).rejects.toMatchObject({ code: 'MATERIAL_STATE_CONFLICT' });
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialUpload"')).rows[0].n).toBe(before);
});

test('a session invalidated after INSERT causes rollback before returning a fresh receipt', async () => {
  const api = intents(), payload = input(), client = await f.pool.connect();
  const connect = vi.spyOn(f.pool, 'connect').mockImplementation((async () => client) as typeof f.pool.connect);
  const original = client.query.bind(client); let invalidated = false;
  const query = vi.spyOn(client, 'query').mockImplementation((async (...args: unknown[]) => {
    const result = await Reflect.apply(original, client, args);
    if (typeof args[0] === 'string' && /INSERT INTO "MaterialUpload"/.test(args[0])) {
      invalidated = true;
      await original('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [teacher.sessionId]);
    }
    return result;
  }) as typeof client.query);
  try { await expect(api.register(teacher, f.groupId, payload)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); }
  finally { query.mockRestore(); connect.mockRestore(); }
  expect(invalidated).toBe(true);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialUpload" WHERE "actorId"=$1 AND "intentionId"=$2',
    [teacher.userId, payload.intentionId])).rows[0].n).toBe(0);
  expect((await f.pool.query('SELECT "revokedAt" FROM "Session" WHERE id=$1', [teacher.sessionId])).rows[0].revokedAt).toBeNull();
});

test('normalization snapshots mutable input and canonicalizes UUID aliases before the first asynchronous boundary', async () => {
  const api = intents(), original = input(), mutable = { ...original, intentionId: original.intentionId.toUpperCase() };
  const pending = api.register(teacher, f.groupId.toUpperCase(), mutable);
  mutable.title = 'Cambio tardío'; mutable.sha256 = 'b'.repeat(64);
  const result = await pending;
  expect(await api.register(teacher, f.groupId, original)).toEqual({ ...result, command: { replayed: true } });
  expect(await api.status(teacher, result.uploadId.toUpperCase())).toEqual({ ...result, command: { replayed: false } });
});

test('pending intentions have no implicit age expiry; future-dated facts safely block status and replay', async () => {
  const api = intents();
  for (const age of ['past', 'future'] as const) {
    const payload = input(), uploadId = randomUUID();
    const digest = createHash('sha256').update(JSON.stringify(['materials.upload.v1', teacher.userId, f.groupId,
      payload.intentionId, payload.title, payload.description, payload.downloadName, payload.mediaType, payload.byteSize, payload.sha256])).digest();
    await f.pool.query(`INSERT INTO "MaterialUpload" ("uploadId","actorId","intentionId","groupId",title,description,
      "downloadName","mediaType","byteSize",sha256,"payloadDigest","createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,clock_timestamp()+$12::interval)`,
    [uploadId, teacher.userId, payload.intentionId, f.groupId, payload.title, payload.description, payload.downloadName,
      payload.mediaType, payload.byteSize, payload.sha256, digest, age === 'past' ? '-5 years' : '1 day']);
    if (age === 'past') {
      expect(await api.status(teacher, uploadId)).toMatchObject({ state: 'PENDING', materialId: null });
      expect(await api.register(teacher, f.groupId, payload)).toMatchObject({ uploadId, command: { replayed: true } });
    } else {
      await expect(api.status(teacher, uploadId)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
      await expect(api.register(teacher, f.groupId, payload)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
    }
    expect((await f.pool.query('SELECT "materialId" FROM "MaterialUpload" WHERE "uploadId"=$1', [uploadId])).rows[0]).toEqual({ materialId: null });
  }
});

test('after cancellation, only an admin owner can consult historical intention status; registration stays blocked', async () => {
  const api = intents(), groupId = randomUUID(), payload = input();
  await f.pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,"teacherUserId")
    VALUES ($1,$2,'Cancelación ficticia de intenciones',$3)`, [groupId, f.courseId, teacher.userId]);
  const teacherUpload = await api.register(teacher, groupId, payload), adminUpload = await api.register(admin, groupId, payload);
  await f.pool.query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancelledAt"=clock_timestamp(),
    "cancellationReason"='Ensayo de intenciones',revision=revision+1 WHERE id=$1`, [groupId]);
  await expect(api.status(teacher, teacherUpload.uploadId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(api.status(admin, teacherUpload.uploadId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(await api.status(admin, adminUpload.uploadId)).toMatchObject({ state: 'PENDING', materialId: null });
  await expect(api.register(admin, groupId, payload)).rejects.toMatchObject({ code: 'MATERIAL_STATE_CONFLICT' });
});
