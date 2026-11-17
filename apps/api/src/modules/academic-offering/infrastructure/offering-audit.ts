import type { PoolClient } from 'pg';
import type { OfferingOperation } from '../application/offering-store.js';
import type { GroupState, Revision, UUID } from '../public/offer.js';

/** Hecho mínimo, sin cuerpos, motivos, proyecciones o datos de identidad. */
export interface OfferingAuditEvent {
  readonly actorUserId: UUID;
  readonly resourceKind: 'COURSE' | 'GROUP';
  readonly resourceId: UUID;
  readonly action: OfferingOperation;
  readonly result: 'APPLIED' | 'NO_CHANGE';
  readonly commandId: UUID;
  readonly requestId: UUID;
  readonly beforeState: GroupState | null;
  readonly afterState: GroupState;
  readonly beforeRevision: Revision | null;
  readonly afterRevision: Revision;
}
export interface AcademicAuditWriter {
  /** Solo la conexión transaccional del llamante; un fallo debe propagarse. */
  write(client: PoolClient, event: OfferingAuditEvent): Promise<void>;
}

export const offeringAudit: AcademicAuditWriter = {
  async write(client, event) {
    await client.query(`INSERT INTO "AcademicAuditEvent"
      ("actorUserId","resourceKind","resourceId",action,result,"commandId","requestId",
       "beforeState","afterState","beforeRevision","afterRevision")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [event.actorUserId, event.resourceKind, event.resourceId, event.action, event.result,
      event.commandId, event.requestId, event.beforeState, event.afterState, event.beforeRevision, event.afterRevision]);
  },
};
