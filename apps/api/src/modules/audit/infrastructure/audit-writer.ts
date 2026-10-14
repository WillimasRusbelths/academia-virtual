import type { PoolClient } from 'pg';
import { auditEvent } from '../domain/audit-event.js';

export class AuditWriteUnavailable extends Error {
  constructor(readonly code?:'40001'|'40P01') { super('La operación auditada no pudo confirmarse. Detalles omitidos.'); }
}

/** Requiere la misma transacción de la mutación; no hace commit ni acepta callbacks. */
export class PostgresAuditWriter {
  async write(client: PoolClient, input: unknown): Promise<void> {
    try {
      // Falla fuera de BEGIN: nunca confirmar auditoría aparte del cambio que describe.
      await client.query('SAVEPOINT account_audit');
      const event = auditEvent(input);
      await client.query(`INSERT INTO "AuditEvent" ("actorKind","actorUserId","targetUserId",action,result,
        "requestId","oldRole","newRole","oldStatus","newStatus","occurredAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp())`,
      [event.actorKind,event.actorUserId,event.targetUserId,event.action,event.result,event.requestId,
        event.oldRole,event.newRole,event.oldStatus,event.newStatus]);
      await client.query('RELEASE SAVEPOINT account_audit');
    } catch (error) {
      // Incluso validación fallida tras una mutación fuerza rollback completo.
      await client.query('ROLLBACK').catch(() => undefined);
      // Solo conservar la señal de aborto para el protocolo de reintentos; nunca SQL/cause.
      const code=error!==null&&typeof error==='object'&&'code'in error?error.code:undefined;
      throw new AuditWriteUnavailable(code==='40001'||code==='40P01'?code:undefined);
    }
  }
}
