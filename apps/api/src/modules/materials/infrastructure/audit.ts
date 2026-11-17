import type { MaterialsTransactionContext } from '../../../infrastructure/database/materials-transaction.js';
import type { MaterialsAuditRecord } from '../application/ports.js';
import { MaterialError } from '../domain/material-error.js';

export async function writeMaterialAudit(context: MaterialsTransactionContext, record: MaterialsAuditRecord): Promise<void> {
  context.assertDecision(context.decision);
  if (record.at !== context.decision.at) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
  await context.use(async () => {
    await context.client.query(`INSERT INTO "MaterialAuditEvent"
      ("actorId","groupId","materialId","intentionId","commandId",operation,result,revision,"occurredAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TIMESTAMPTZ 'epoch'+($9::text || ' microseconds')::interval)`,
    [record.actorId, record.groupId, record.materialId, record.intentionId, record.commandId,
      record.operation, record.result, record.revision, record.at.toString()]);
  });
}
