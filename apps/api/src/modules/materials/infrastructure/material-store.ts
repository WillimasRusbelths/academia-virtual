import type { MaterialsTransaction, MaterialsTransactionContext } from '../../../infrastructure/database/materials-transaction.js';
import type { MaterialsUploadCompletionStore } from '../application/ports.js';
import type { ManagedMaterial, MaterialUploadInput } from '../public/materials.js';
import { MaterialError } from '../domain/material-error.js';
import { insertMaterialContent, validatedContent } from './content-store.js';
import { writeMaterialAudit } from './audit.js';

const utc = (column: string) => `to_char(m."${column}" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
/** Metadata projection shared by list/read and write responses, without content or digests. */
export const managedMaterialProjection = `m.id,m."groupId",m.title,m.description,m.state,m.revision::text AS revision,
  m."createdBy",${utc('createdAt')} AS "createdAt",${utc('updatedAt')} AS "updatedAt",
  ${utc('publishedAt')} AS "publishedAt",${utc('withdrawnAt')} AS "withdrawnAt",c."mediaType",c."byteSize",c."downloadName"`;
export async function readManagedMaterial(context: MaterialsTransactionContext, materialId: string): Promise<ManagedMaterial> {
  return context.use(async () => {
    const row = (await context.client.query<ManagedMaterial>(`SELECT ${managedMaterialProjection} FROM "Material" m
      JOIN "MaterialContent" c ON c."materialId"=m.id WHERE m.id=$1`, [materialId])).rows[0];
    if (!row) throw new MaterialError('NOT_FOUND'); return row;
  });
}
type Expectation = MaterialUploadInput & { groupId: string; materialId: string | null };
async function intention(context: MaterialsTransactionContext, actorId: string, uploadId: string): Promise<Expectation> {
  return context.use(async () => {
    const row = (await context.client.query<Expectation>(`SELECT "intentionId","groupId",title,description,
      "downloadName","mediaType","byteSize",sha256,"materialId" FROM "MaterialUpload"
      WHERE "uploadId"=$1 AND "actorId"=$2`, [uploadId, actorId])).rows[0];
    if (!row) throw new MaterialError('NOT_FOUND'); return Object.freeze(row);
  });
}

/** Read authorization -> release -> snapshot/hash/format -> fresh authorized transaction.
 * accountTransaction is the sole retry budget and never repeats an ambiguous COMMIT.
 */
export function createMaterialsCompletionStore(run: MaterialsTransaction): MaterialsUploadCompletionStore {
  return Object.freeze<MaterialsUploadCompletionStore>({
    async complete(actor, uploadId, content) {
      const target = { kind: 'UPLOAD' as const, id: uploadId };
      const expected = await run(actor, target, 'READ', context => intention(context, actor.userId, uploadId));
      const file = { downloadName: expected.downloadName, mediaType: expected.mediaType, byteSize: expected.byteSize, sha256: expected.sha256 };
      const bytes = validatedContent(file, content);
      return run(actor, target, 'PREPARE', async context => {
        const current = await intention(context, actor.userId, uploadId);
        // SQL prevents mutation. Compare every expectation anyway before applying the validated snapshot.
        if (['intentionId','groupId','title','description','downloadName','mediaType','byteSize','sha256']
          .some(key => current[key as keyof Expectation] !== expected[key as keyof Expectation])) throw new MaterialError('IDEMPOTENCY_CONFLICT');
        if (current.materialId !== null) return { resource: await readManagedMaterial(context, current.materialId), replayed: true };
        const materialId = await context.use(async () => {
          const row = (await context.client.query<{ id: string }>(`INSERT INTO "Material"
            ("groupId",title,description,"createdBy","updatedBy","createdAt","updatedAt")
            VALUES ($1,$2,$3,$4,$4,TIMESTAMPTZ 'epoch'+($5::text || ' microseconds')::interval,
              TIMESTAMPTZ 'epoch'+($5::text || ' microseconds')::interval) RETURNING id`,
          [current.groupId, current.title, current.description, actor.userId, context.decision.at.toString()])).rows[0];
          if (!row) throw new MaterialError('TEMPORARILY_UNAVAILABLE'); return row.id;
        });
        await insertMaterialContent(context, materialId, file, bytes);
        await context.use(async () => {
          const linked = await context.client.query(`UPDATE "MaterialUpload" SET "materialId"=$1
            WHERE "uploadId"=$2 AND "actorId"=$3 AND "materialId" IS NULL`, [materialId, uploadId, actor.userId]);
          if (linked.rowCount !== 1) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
        });
        await writeMaterialAudit(context, { actorId: actor.userId, groupId: current.groupId, materialId,
          intentionId: current.intentionId, commandId: null, operation: 'UPLOAD_COMPLETE', result: 'APPLIED', revision: '1', at: context.decision.at });
        return { resource: await readManagedMaterial(context, materialId), replayed: false };
      });
    },
  });
}
