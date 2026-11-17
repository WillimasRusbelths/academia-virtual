import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import { assertAcademicFixtureInputs } from '../support/academic-offering.js';
import { sessionFixture } from '../support/session-fixture.js';
import { materialFile, MATERIAL_FILE_LIMIT } from '../support/materials-files.js';

let context: Awaited<ReturnType<typeof identityDatabase>>;
let actorId: string, otherActorId: string, groupId: string, otherGroupId: string;
const sample = materialFile('pdf');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

beforeAll(async () => {
  assertAcademicFixtureInputs();
  context = await identityDatabase('materials_schema');
  actorId = (await sessionFixture(context, 'ADMIN')).userId;
  otherActorId = (await sessionFixture(context, 'TEACHER')).userId;
  const courseId = randomUUID(); groupId = randomUUID(); otherGroupId = randomUUID();
  await context.database.pool.query('INSERT INTO "AcademicCourse" (id,name) VALUES ($1,\'Curso de constraints ficticio\')', [courseId]);
  await context.database.pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name) VALUES
    ($1,$3,'Grupo A ficticio'),($2,$3,'Grupo B ficticio')`, [groupId, otherGroupId, courseId]);
}, 120000);
afterAll(async () => { await context?.cleanup(); });

async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await context.database.pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function insertMaterial(client: PoolClient, overrides: Record<string, unknown> = {}) {
  const row = { id: randomUUID(), groupId, title: 'Material ficticio', description: null,
    createdBy: actorId, updatedBy: actorId, ...overrides };
  const keys = Object.keys(row);
  await client.query(`INSERT INTO "Material" (${keys.map(k => `"${k}"`).join(',')})
    VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
  return row.id;
}
async function insertContent(client: PoolClient, materialId: string, overrides: Record<string, unknown> = {}) {
  const row = { materialId, bytes: sample, byteSize: sample.length, mediaType: 'application/pdf',
    downloadName: 'estudio.pdf', sha256: digest(sample), ...overrides };
  const keys = Object.keys(row);
  await client.query(`INSERT INTO "MaterialContent" (${keys.map(k => `"${k}"`).join(',')})
    VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
}
const complete = (overrides: Record<string, unknown> = {}) => transaction(async client => {
  const id = await insertMaterial(client, overrides); await insertContent(client, id); return id;
});
async function upload(actor = actorId, intentionId = randomUUID()) {
  const uploadId = randomUUID();
  await context.database.pool.query(`INSERT INTO "MaterialUpload"
    ("uploadId","actorId","intentionId","groupId",title,description,"downloadName","mediaType","byteSize",sha256,"payloadDigest")
    VALUES ($1,$2,$3,$4,'Texto ficticio',NULL,'estudio.pdf','application/pdf',$5,$6,$7)`,
  [uploadId, actor, intentionId, groupId, sample.length, digest(sample), randomBytes(32)]);
  return uploadId;
}

test('migration installs five private tables; runtime has DML but no schema CREATE', async () => {
  const names = ['Material', 'MaterialContent', 'MaterialUpload', 'MaterialCommand', 'MaterialAuditEvent'];
  for (const name of names) {
    const result = await context.database.pool.query('SELECT to_regclass($1)::text AS name', [`"${name}"`]);
    expect(result.rows[0].name).not.toBeNull();
  }
  const privilege = await context.database.pool.query('SELECT has_schema_privilege(current_user,$1,\'CREATE\') AS allowed', [context.isolated.schema]);
  expect(privilege.rows[0].allowed).toBe(false);
});

test('material without content fails at COMMIT and rolls back metadata', async () => {
  const id = randomUUID();
  await expect(transaction(async client => { await insertMaterial(client, { id }); })).rejects.toMatchObject({ code: '23514' });
  expect((await context.database.pool.query('SELECT id FROM "Material" WHERE id=$1', [id])).rowCount).toBe(0);
});

test('complete material defaults to PREPARED revision 1; microseconds and nullable transition times survive', async () => {
  const at = '2026-11-16T12:34:56.123456Z';
  const id = await complete({ createdAt: at, updatedAt: at });
  const { rows: [row] } = await context.database.pool.query(`SELECT state,revision::text,"publishedAt","withdrawnAt",
    to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at FROM "Material" WHERE id=$1`, [id]);
  expect(row).toEqual({ state: 'PREPARED', revision: '1', publishedAt: null, withdrawnAt: null, at });
  await expect(complete({ revision: 0 })).rejects.toMatchObject({ code: '23514' });
  await expect(complete({ revision: 2 })).rejects.toMatchObject({ code: '23514' });
});

test('foreign keys restrict group/author deletion and reject unknown parents', async () => {
  await complete();
  await expect(context.database.pool.query('DELETE FROM "AcademicGroup" WHERE id=$1', [groupId])).rejects.toMatchObject({ code: '23503' });
  // A fresh author has no session FK: rejection proves the material author FK itself.
  const freshId = randomUUID(); const email = `${freshId}@example.test`;
  await context.database.pool.query(`INSERT INTO "User" (id,name,email,"emailCanonical",role,"mustSetPassword")
    VALUES ($1,'Autor ficticio',$2,$2,'ADMIN',true)`, [freshId, email]);
  await complete({ createdBy: freshId, updatedBy: freshId });
  await expect(context.database.pool.query('DELETE FROM "User" WHERE id=$1', [freshId])).rejects.toMatchObject({ code: '23503' });
  await expect(complete({ groupId: randomUUID() })).rejects.toMatchObject({ code: '23503' });
  await expect(complete({ createdBy: randomUUID() })).rejects.toMatchObject({ code: '23503' });
});

test('material identity/group/original author and creation time are immutable; metadata stays editable', async () => {
  const id = await complete();
  for (const [column, value] of [['id', randomUUID()], ['groupId', otherGroupId], ['createdBy', otherActorId],
    ['createdAt', '2026-01-01T00:00:00.000000Z']]) {
    await expect(context.database.pool.query(`UPDATE "Material" SET "${column}"=$1 WHERE id=$2`, [value, id])).rejects.toMatchObject({ code: '23514' });
  }
  await context.database.pool.query('UPDATE "Material" SET title=$1,"updatedBy"=$2,revision=revision+1 WHERE id=$3', ['Corregido', otherActorId, id]);
  const row = (await context.database.pool.query('SELECT title,"createdBy","updatedBy",revision::text FROM "Material" WHERE id=$1', [id])).rows[0];
  expect(row).toEqual({ title: 'Corregido', createdBy: actorId, updatedBy: otherActorId, revision: '2' });
});

test('every content field is immutable, including reassociation; deleting content cannot leave a material', async () => {
  const id = await complete(), otherId = await complete();
  const changes = { materialId: otherId, bytes: Buffer.from('changed'), byteSize: 1,
    mediaType: 'image/png', downloadName: 'otro.pdf', sha256: 'a'.repeat(64) };
  for (const [column, value] of Object.entries(changes)) {
    await expect(context.database.pool.query(`UPDATE "MaterialContent" SET "${column}"=$1 WHERE "materialId"=$2`, [value, id])).rejects.toMatchObject({ code: '23514' });
  }
  await expect(context.database.pool.query('DELETE FROM "MaterialContent" WHERE "materialId"=$1', [id])).rejects.toMatchObject({ code: '23514' });
  await expect(transaction(async client => {
    await client.query('DELETE FROM "MaterialContent" WHERE "materialId"=$1', [id]);
    await insertContent(client, id);
  })).rejects.toMatchObject({ code: '23514' });
  await expect(context.database.pool.query('DELETE FROM "Material" WHERE id=$1', [id])).rejects.toMatchObject({ code: '23503' });
  expect((await context.database.pool.query('SELECT bytes FROM "MaterialContent" WHERE "materialId"=$1', [id])).rows[0].bytes).toEqual(sample);
});

test('text boundaries count Unicode characters, reject controls/untrimmed text and normalize blank description', async () => {
  await complete({ title: '🎓'.repeat(200), description: 'ñ'.repeat(2000) });
  for (const title of ['', ' ', ' sin trim', '\u00a0exterior', 'x\ncontrol', 'x\u007fcontrol', 'x'.repeat(201)]) {
    await expect(complete({ title })).rejects.toMatchObject({ code: '23514' });
  }
  await expect(complete({ description: 'x'.repeat(2001) })).rejects.toMatchObject({ code: '23514' });
  const id = await complete({ description: '  \n\t' });
  expect((await context.database.pool.query('SELECT description FROM "Material" WHERE id=$1', [id])).rows[0].description).toBeNull();
  // Text is stored literally; escaping belongs to renderers, never HTML execution.
  await complete({ description: '<script>ficticio()</script>' });
});

test('bytea length/hash/name/MIME constraints reject malformed content without retaining a partial material', async () => {
  const cases = [{ bytes: Buffer.alloc(0), byteSize: 0 }, { byteSize: sample.length + 1 },
    { sha256: 'A'.repeat(64) }, { sha256: 'f'.repeat(64) }, { downloadName: '../estudio.pdf' },
    { downloadName: 'sub\\estudio.pdf' }, { downloadName: 'injection\r\n.pdf' },
    { downloadName: 'x'.repeat(177) + '.pdf' }, { downloadName: 'estudio.png' }, { mediaType: 'text/html' }];
  for (const values of cases) await expect(transaction(async client => {
    const id = await insertMaterial(client); await insertContent(client, id, values);
  })).rejects.toMatchObject({ code: '23514' });
  const jpeg = materialFile('jpeg');
  await transaction(async client => {
    const id = await insertMaterial(client); await insertContent(client, id,
      { bytes: jpeg, byteSize: jpeg.length, sha256: digest(jpeg), mediaType: 'image/jpeg', downloadName: 'foto.JPG' });
  });
});

test('exactly 20 000 000 valid PDF bytes commit; one byte more rolls back; duplicate names do not replace', async () => {
  const bytes = materialFile('pdf', MATERIAL_FILE_LIMIT);
  const id = await transaction(async client => {
    const id = await insertMaterial(client); await insertContent(client, id, { bytes, byteSize: bytes.length, sha256: digest(bytes) }); return id;
  });
  await expect(transaction(async client => {
    const other = await insertMaterial(client); const excess = materialFile('pdf', MATERIAL_FILE_LIMIT + 1);
    await insertContent(client, other, { bytes: excess, byteSize: excess.length, sha256: digest(excess) });
  })).rejects.toMatchObject({ code: '23514' });
  await complete();
  const row = (await context.database.pool.query('SELECT octet_length(bytes) AS size,sha256 FROM "MaterialContent" WHERE "materialId"=$1', [id])).rows[0];
  expect(row).toEqual({ size: MATERIAL_FILE_LIMIT, sha256: digest(bytes) });
});

test('upload intentions are unique per actor, immutable and PENDING has no material; completion is one-way unique', async () => {
  const intentionId = randomUUID(), uploadId = await upload(actorId, intentionId);
  await expect(upload(actorId, intentionId)).rejects.toMatchObject({ code: '23505' });
  await upload(otherActorId, intentionId);
  const pending = (await context.database.pool.query('SELECT "materialId" FROM "MaterialUpload" WHERE "uploadId"=$1', [uploadId])).rows[0];
  expect(pending.materialId).toBeNull();
  for (const [column, value] of Object.entries({ actorId: otherActorId, intentionId: randomUUID(), groupId: otherGroupId,
    title: 'Cambio', downloadName: 'nuevo.pdf', sha256: 'a'.repeat(64), payloadDigest: randomBytes(32) })) {
    await expect(context.database.pool.query(`UPDATE "MaterialUpload" SET "${column}"=$1 WHERE "uploadId"=$2`, [value, uploadId])).rejects.toMatchObject({ code: '23514' });
  }
  const id = await complete();
  await context.database.pool.query('UPDATE "MaterialUpload" SET "materialId"=$1 WHERE "uploadId"=$2', [id, uploadId]);
  const second = await upload();
  await expect(context.database.pool.query('UPDATE "MaterialUpload" SET "materialId"=$1 WHERE "uploadId"=$2', [id, second])).rejects.toMatchObject({ code: '23505' });
  await expect(context.database.pool.query('UPDATE "MaterialUpload" SET "materialId"=NULL WHERE "uploadId"=$1', [uploadId])).rejects.toMatchObject({ code: '23514' });
});

test('commands are unique per actor/command, immutable and coupled rollback leaves no ledger or audit', async () => {
  const id = await complete(), commandId = randomUUID();
  const command = (client: Pick<PoolClient, 'query'>, actor: string, identity: string) => client.query(`INSERT INTO "MaterialCommand"
    ("actorId","commandId","materialId",operation,"payloadDigest","appliedRevision",result)
    VALUES ($1,$2,$3,'PUBLISH',$4,1,'NO_CHANGE')`, [actor, identity, id, randomBytes(32)]);
  await command(context.database.pool, actorId, commandId);
  await expect(command(context.database.pool, actorId, commandId)).rejects.toMatchObject({ code: '23505' });
  await command(context.database.pool, otherActorId, commandId);
  await expect(context.database.pool.query('UPDATE "MaterialCommand" SET result=\'APPLIED\' WHERE "actorId"=$1 AND "commandId"=$2', [actorId, commandId])).rejects.toMatchObject({ code: '23514' });
  const failed = randomUUID();
  await expect(transaction(async client => {
    await command(client, actorId, failed);
    await client.query(`INSERT INTO "MaterialAuditEvent" ("actorId","groupId","materialId","commandId",operation,result,revision)
      VALUES ($1,$2,$3,$4,'PUBLISH','APPLIED',1)`, [actorId, groupId, id, failed]);
    throw new Error('Injected rollback');
  })).rejects.toThrow('Injected rollback');
  expect((await context.database.pool.query('SELECT 1 FROM "MaterialCommand" WHERE "commandId"=$1', [failed])).rowCount).toBe(0);
  expect((await context.database.pool.query('SELECT 1 FROM "MaterialAuditEvent" WHERE "commandId"=$1', [failed])).rowCount).toBe(0);
});
