import type { Pool } from 'pg';
import type { RestoredState, RestoredStateCounts } from '../../modules/identity/application/invalidate-restored-state.js';

/** Transacción transversal de recuperación, sin borrar usuarios, singleton ni auditoría. */
export class PostgresRestoredState implements RestoredState {
  constructor(private readonly pool:Pool) {}
  async invalidate():Promise<RestoredStateCounts> {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s'");
      // Serializa invocaciones y bloquea escrituras durante la transacción, no después.
      await client.query('LOCK TABLE "Session", "ActionToken", "MailDelivery" IN EXCLUSIVE MODE');
      const now=(await client.query<{now:string}>('SELECT clock_timestamp()::text AS now')).rows[0].now;
      const sessions=await client.query('UPDATE "Session" SET "revokedAt"=$1 WHERE "revokedAt" IS NULL',[now]);
      const tokens=await client.query('UPDATE "ActionToken" SET "revokedAt"=$1 WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL',[now]);
      const mail=await client.query(`UPDATE "MailDelivery" SET status='CANCELLED',"finishedAt"=$1,
        "encryptedPayload"=NULL,nonce=NULL,"authTag"=NULL,"keyId"=NULL,"leaseUntil"=NULL,"claimId"=NULL
        WHERE status IN ('PENDING','SENDING')`,[now]);
      await client.query('COMMIT');
      return {sessions:sessions.rowCount??0,tokens:tokens.rowCount??0,mail:mail.rowCount??0};
    } catch {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw new Error('Invalidación no completada. Detalles omitidos.');
    } finally {client.release();}
  }
}
