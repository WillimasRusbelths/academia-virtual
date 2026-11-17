import type { MaterialsTransactionContext } from '../../../infrastructure/database/materials-transaction.js';
import type { MaterialFileExpectation } from '../domain/material.js';
import { MATERIAL_FILE_LIMIT } from '../domain/material.js';
import { MaterialError } from '../domain/material-error.js';
import { validateMaterialFile } from './file-validation.js';
import type { SessionActor } from '../../authorization/public/session.js';
import type { MaterialsTransaction } from '../../../infrastructure/database/materials-transaction.js';
import type { createTransferAdmission } from './transfer-admission.js';

/** Internal binary capability. Authorization, current state and enrollment use the
 * coordinator's locked decision. Admission precedes bytea; the owned pg Buffer
 * leaves the transaction before HTTP writes. This does not provide constant RAM.
 * HEAD reads only metadata and consumes no binary transfer slot.
 */
export function createMaterialsContentStore(run: MaterialsTransaction, admission: ReturnType<typeof createTransferAdmission>) {
  return async (actor: SessionActor, materialId: string, head: boolean,
    response: Parameters<ReturnType<typeof admission.acquire>['bind']>[0]) => {
    let lease: ReturnType<typeof admission.acquire> | undefined;
    try {
      const content = await run(actor, { kind: 'MATERIAL', id: materialId }, 'READ', context => context.use(async () => {
        if (!head && !lease) { lease = admission.acquire(actor.userId); lease.bind(response); }
        const row = (await context.client.query<{ body?: Buffer; byteSize: number; mediaType: string; downloadName: string }>(
          `SELECT "byteSize","mediaType","downloadName"${head ? '' : ',bytes AS body'} FROM "MaterialContent" WHERE "materialId"=$1`, [materialId])).rows[0];
        if (!row) throw new MaterialError('NOT_FOUND');
        return row;
      }));
      return { ...content, head, release: lease?.release };
    } catch (error) { lease?.release(); throw error; }
  };
}

/** Own a bounded copy outside the write transaction. The same immutable-by-ownership
 * snapshot is validated and sent to pg, regardless of later caller mutations.
 * Admission/receiving bytes is the separate T024 responsibility.
 */
export function validatedContent(expected: MaterialFileExpectation, content: Uint8Array): Buffer {
  if (!(content instanceof Uint8Array)) throw new MaterialError('VALIDATION_ERROR', ['byteSize']);
  if (content.byteLength > MATERIAL_FILE_LIMIT) throw new MaterialError('VALIDATION_ERROR', ['byteSize'], undefined, 413);
  if (content.byteLength !== expected.byteSize) throw new MaterialError('VALIDATION_ERROR', ['byteSize']);
  const bytes = Buffer.from(content); validateMaterialFile(expected, bytes); return bytes;
}
export async function insertMaterialContent(context: MaterialsTransactionContext, materialId: string,
  expected: MaterialFileExpectation, bytes: Buffer): Promise<void> {
  await context.use(async () => {
    await context.client.query(`INSERT INTO "MaterialContent" ("materialId",bytes,"byteSize","mediaType","downloadName",sha256)
      VALUES ($1,$2,$3,$4,$5,$6)`, [materialId, bytes, expected.byteSize, expected.mediaType, expected.downloadName, expected.sha256]);
  });
}
