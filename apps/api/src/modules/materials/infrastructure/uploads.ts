import { createHash } from 'node:crypto';
import type { MaterialsTransaction } from '../../../infrastructure/database/materials-transaction.js';
import type { MaterialUploadInput, MaterialUploadStatus } from '../public/materials.js';
import type { MaterialsUploadIntentStore } from '../application/ports.js';
import { MaterialError } from '../domain/material-error.js';

type UploadRow = { uploadId: string; materialId: string | null; payloadDigest: Buffer; at: string };
const columns = `"uploadId","materialId","payloadDigest",
  (extract(epoch FROM "createdAt")*1000000)::numeric(30,0)::text AS at`;
function digest(actorId: string, groupId: string, input: MaterialUploadInput): Buffer {
  return createHash('sha256').update(JSON.stringify(['materials.upload.v1', actorId, groupId,
    input.intentionId, input.title, input.description, input.downloadName, input.mediaType, input.byteSize, input.sha256])).digest();
}
function view(row: Pick<UploadRow, 'uploadId' | 'materialId'>, replayed: boolean): MaterialUploadStatus {
  return row.materialId === null
    ? { uploadId: row.uploadId, state: 'PENDING', materialId: null, command: { replayed } }
    : { uploadId: row.uploadId, state: 'COMPLETED', materialId: row.materialId, command: { replayed } };
}
function assertTime(row: UploadRow, at: bigint): void {
  if (!/^-?\d+$/.test(row.at) || BigInt(row.at) > at) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
}

/** The coordinator locks the actor account before course/group and intention lookup.
 * Thus registrations of this actor serialize across groups and processes before the
 * unique (actorId,intentionId) insert. No process-local mutex, purge, TTL or network IO.
 */
export function createMaterialsUploadStore(run: MaterialsTransaction): MaterialsUploadIntentStore {
  return Object.freeze<MaterialsUploadIntentStore>({
    authorizeContent: (actor, uploadId) => run(actor, { kind: 'UPLOAD', id: uploadId }, 'PREPARE', context => context.use(async () => {
      const row = (await context.client.query<{ byteSize: number }>(`SELECT "byteSize" FROM "MaterialUpload"
        WHERE "uploadId"=$1 AND "actorId"=$2`, [uploadId, actor.userId])).rows[0];
      if (!row) throw new MaterialError('NOT_FOUND'); return { byteSize: row.byteSize };
    })),
    register: (actor, groupId, input) => run(actor, { kind: 'GROUP', id: groupId }, 'PREPARE', context => context.use(async () => {
      const expected = digest(actor.userId, groupId, input);
      // Authority has already been checked. Group locks precede the existing intention lock.
      const existing = (await context.client.query<UploadRow>(`SELECT ${columns} FROM "MaterialUpload"
        WHERE "actorId"=$1 AND "intentionId"=$2 FOR UPDATE`, [actor.userId, input.intentionId])).rows[0];
      if (existing) {
        assertTime(existing, context.decision.at);
        if (!existing.payloadDigest.equals(expected)) throw new MaterialError('IDEMPOTENCY_CONFLICT');
        return view(existing, true);
      }
      // Technical policy recorded in evidence/upload-limits.md before implementation.
      // Account FOR UPDATE is held across count + insert, including other processes.
      // Replay and authority precede quota; completed rows still count until 60 s.
      const quota = (await context.client.query<{ used: number; oldest: string | null }>(`
        WITH decision AS (SELECT TIMESTAMPTZ 'epoch'+($2::text || ' microseconds')::interval AS at)
        SELECT count(*)::int AS used,
          (extract(epoch FROM min(u."createdAt"))*1000000)::numeric(30,0)::text AS oldest
        FROM "MaterialUpload" u CROSS JOIN decision d
        WHERE u."actorId"=$1 AND u."createdAt">d.at-interval '60 seconds'`,
      [actor.userId, context.decision.at.toString()])).rows[0];
      // Future facts count conservatively, without blocking an unrelated intention
      // below quota or allowing a backwards clock to reset an actor's admission.
      if (!quota) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
      if (quota.used >= 30) {
        if (quota.oldest === null || !/^-?\d+$/.test(quota.oldest)) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
        const remaining = BigInt(quota.oldest) + 60_000_000n - context.decision.at;
        const retry = Number((remaining + 999_999n) / 1_000_000n);
        if (retry < 1 || retry > 60) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
        throw new MaterialError('RATE_LIMITED', undefined, retry);
      }
      const inserted = (await context.client.query<UploadRow>(`INSERT INTO "MaterialUpload"
        ("actorId","intentionId","groupId",title,description,"downloadName","mediaType","byteSize",sha256,"payloadDigest","createdAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TIMESTAMPTZ 'epoch'+($11::text || ' microseconds')::interval)
        RETURNING ${columns}`, [actor.userId, input.intentionId, groupId, input.title, input.description,
        input.downloadName, input.mediaType, input.byteSize, input.sha256, expected, context.decision.at.toString()])).rows[0];
      if (!inserted) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
      return view(inserted, false);
    })),
    status: (actor, uploadId) => run(actor, { kind: 'UPLOAD', id: uploadId }, 'READ', context => context.use(async () => {
      // UPLOAD discovery enforces both current management and original intention ownership,
      // including for admins; it never promotes general management into ownership.
      const row = (await context.client.query<UploadRow>(`SELECT ${columns} FROM "MaterialUpload"
        WHERE "uploadId"=$1 AND "actorId"=$2`, [uploadId, actor.userId])).rows[0];
      if (!row) throw new MaterialError('NOT_FOUND');
      assertTime(row, context.decision.at); return view(row, false);
    })),
  });
}
