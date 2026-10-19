import type { Pool } from 'pg';
import type { MailRetention, MailRetentionCounts } from '../public/retention.js';

/** Cancelación acotada, limpieza inmediata del secreto y retención de metadata desde finishedAt. */
export class PostgresMailRetention implements MailRetention {
  constructor(private readonly pool: Pool) {}
  async runBatch(limit: number): Promise<MailRetentionCounts> {
    if (!Number.isInteger(limit)||limit<1||limit>1000) throw new Error('Límite de mantenimiento inválido.');
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'");
      const now=(await client.query<{now:string}>('SELECT clock_timestamp()::text AS now')).rows[0].now;
      const cancelled=await client.query(`WITH selected AS (
        SELECT d.id FROM "MailDelivery" d JOIN "ActionToken" t ON t.id=d."tokenId"
        WHERE d.status IN ('PENDING','SENDING') AND (t."consumedAt" IS NOT NULL OR t."revokedAt" IS NOT NULL
          OR LEAST(t."expiresAt",t."createdAt"+CASE WHEN t.purpose='VERIFY_EMAIL'
            THEN interval '24 hours' ELSE interval '30 minutes' END) <= $1::timestamptz)
        ORDER BY d.id LIMIT $2 FOR UPDATE OF d SKIP LOCKED
      ) UPDATE "MailDelivery" SET status='CANCELLED',"finishedAt"=$1::timestamptz,
        "encryptedPayload"=NULL,nonce=NULL,"authTag"=NULL,"keyId"=NULL,"leaseUntil"=NULL,"claimId"=NULL
        WHERE id IN (SELECT id FROM selected)`,[now,limit]);
      const purged=await client.query(`WITH selected AS (
        SELECT id FROM "MailDelivery" WHERE status IN ('SENT','FAILED','CANCELLED')
          AND "finishedAt" <= $1::timestamptz-interval '7 days'
        ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED
      ) DELETE FROM "MailDelivery" WHERE id IN (SELECT id FROM selected)`,[now,limit]);
      await client.query('COMMIT');
      return {cancelledDeliveries:cancelled.rowCount??0,purgedDeliveries:purged.rowCount??0};
    } catch {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw new Error('Limpieza de correo no completada. Valores omitidos.');
    } finally {client.release();}
  }
}
