import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { PostgresRateStore } from '../../../infrastructure/limits/rate-store.js';
import type { DeliveryCandidate, DeliveryClaim, DeliveryFailure, DeliveryStore } from '../application/deliver-pending.js';

export class DeliveryStoreUnavailable extends Error {
  constructor() { super('Persistencia de correo no disponible. Detalles omitidos.'); }
}

const joins = `JOIN "ActionToken" t ON t.id=d."tokenId" JOIN "User" u ON u.id=t."userId"`;
const expires = `LEAST(t."expiresAt", t."createdAt" + CASE WHEN t.purpose='VERIFY_EMAIL'
  THEN interval '24 hours' ELSE interval '30 minutes' END)`;
// Misma elegibilidad que el adaptador de identidad; lecturas, sin locks de cuentas.
const eligible = `(u.status='ACTIVE' AND u."emailCanonical"=t."emailCanonicalSnapshot"
  AND t."consumedAt" IS NULL AND t."revokedAt" IS NULL AND clock_timestamp() >= t."createdAt"
  AND clock_timestamp() < ${expires} AND
  ((t.purpose='VERIFY_EMAIL' AND u."emailVerifiedAt" IS NULL)
    OR (t.purpose='RESET_PASSWORD' AND u."emailVerifiedAt" IS NOT NULL)))`;

/** Claims, cuota e intentos atómicos; ninguna transacción abarca un envío SMTP. */
export class PostgresDeliveryStore implements DeliveryStore {
  constructor(private readonly pool: Pool, private readonly rates: PostgresRateStore) {}

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect().catch(() => { throw new DeliveryStoreUnavailable(); });
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='3s'");
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new DeliveryStoreUnavailable();
    } finally { client.release(); }
  }

  private async dispatchLock(client: PoolClient, wait = false): Promise<boolean> {
    // Serializa brevemente la admisión global de dos leases, también con dos instancias.
    const statement = wait ? `SELECT pg_advisory_xact_lock(hashtext(current_database()),
      hashtext(current_schema() || ':mail-dispatch')), true AS locked`
      : `SELECT pg_try_advisory_xact_lock(hashtext(current_database()),
        hashtext(current_schema() || ':mail-dispatch')) AS locked`;
    return (await client.query<{ locked: boolean }>(statement)).rows[0].locked;
  }

  async sweep(): Promise<void> {
    await this.transaction(async client => {
      if (!await this.dispatchLock(client)) return;
      await client.query(`WITH stale AS (
        SELECT d.id, ${eligible} AS eligible, clock_timestamp() >= ${expires} AS expired
        FROM "MailDelivery" d ${joins} WHERE d.status IN ('PENDING','SENDING')
        AND (NOT ${eligible} OR d.attempts >= 3 AND d.status='PENDING'
          OR d.status='SENDING' AND d."leaseUntil" <= clock_timestamp())
        FOR UPDATE OF d SKIP LOCKED
      ) UPDATE "MailDelivery" d SET
        status=CASE WHEN NOT s.eligible THEN 'CANCELLED' WHEN d.attempts >= 3 THEN 'FAILED' ELSE 'PENDING' END::"DeliveryStatus",
        "nextAttemptAt"=CASE WHEN s.eligible AND d.attempts<3 THEN GREATEST(clock_timestamp(),
          d."leaseUntil" + CASE WHEN d.attempts=1 THEN interval '60 seconds' ELSE interval '300 seconds' END)
          ELSE d."nextAttemptAt" END,
        "finishedAt"=CASE WHEN NOT s.eligible OR d.attempts>=3 THEN clock_timestamp() ELSE NULL END,
        "encryptedPayload"=CASE WHEN NOT s.eligible OR d.attempts>=3 THEN NULL ELSE d."encryptedPayload" END,
        nonce=CASE WHEN NOT s.eligible OR d.attempts>=3 THEN NULL ELSE d.nonce END,
        "authTag"=CASE WHEN NOT s.eligible OR d.attempts>=3 THEN NULL ELSE d."authTag" END,
        "keyId"=CASE WHEN NOT s.eligible OR d.attempts>=3 THEN NULL ELSE d."keyId" END,
        "lastErrorClass"=CASE WHEN s.expired THEN 'EXPIRED' WHEN s.eligible THEN 'TIMEOUT' ELSE NULL END::"MailErrorClass",
        "leaseUntil"=NULL,"claimId"=NULL FROM stale s WHERE d.id=s.id`);
    });
  }

  async candidates(): Promise<DeliveryCandidate[]> {
    try {
      return (await this.pool.query<DeliveryCandidate>(`SELECT d.id,d."tokenId",d."encryptedPayload",d.nonce,d."authTag",d."keyId"
        FROM "MailDelivery" d WHERE d.status='PENDING' AND d.attempts<3 AND d."nextAttemptAt" <= clock_timestamp()
        ORDER BY d."nextAttemptAt",d.id LIMIT 2 FOR UPDATE OF d SKIP LOCKED`)).rows;
    } catch { throw new DeliveryStoreUnavailable(); }
  }

  async claim(candidate: DeliveryCandidate): Promise<DeliveryClaim | null> {
    return this.transaction(async client => {
      if (!await this.dispatchLock(client, true)) return null;
      const active = (await client.query<{ count: string }>(`SELECT count(*) FROM "MailDelivery"
        WHERE status='SENDING' AND "leaseUntil">clock_timestamp()`)).rows[0];
      if (Number(active.count)>=2) return null;
      const result = await client.query<{ recipientKey: string; originKey: string; expiresAt: Date }>(`SELECT
        d."recipientKey",d."originKey",${expires} AS "expiresAt" FROM "MailDelivery" d ${joins}
        WHERE d.id=$1 AND d."tokenId"=$2 AND d.status='PENDING' AND d.attempts<3
          AND d."nextAttemptAt"<=clock_timestamp() AND ${eligible}
          AND d."encryptedPayload"=$3 AND d.nonce=$4 AND d."authTag"=$5 AND d."keyId"=$6
        FOR UPDATE OF d SKIP LOCKED`, [candidate.id,candidate.tokenId,Buffer.from(candidate.encryptedPayload),
        Buffer.from(candidate.nonce),Buffer.from(candidate.authTag),candidate.keyId]);
      const row = result.rows[0];
      if (!row) return null;
      const claimId = randomUUID();
      const quota = await this.rates.reserveSmtp(client,row.recipientKey,row.originKey,claimId);
      if (!quota.allowed) {
        if (quota.nextAllowedAt>=row.expiresAt.getTime()) {
          await this.cancelIn(client,candidate,'EXPIRED');
        } else {
          await client.query('UPDATE "MailDelivery" SET "nextAttemptAt"=$2 WHERE id=$1', [candidate.id,new Date(quota.nextAllowedAt)]);
        }
        return null;
      }
      // Si el token venció esperando cuota/locks, revierte también la reserva, sin intento.
      if ((await client.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0].now>=row.expiresAt) {
        await client.query('DELETE FROM "RateEvent" WHERE "attemptId"=$1',[claimId]);
        await this.cancelIn(client,candidate,'EXPIRED'); return null;
      }
      await client.query(`UPDATE "MailDelivery" SET status='SENDING',attempts=attempts+1,
        "leaseUntil"=clock_timestamp()+interval '60 seconds',"claimId"=$2 WHERE id=$1`, [candidate.id,claimId]);
      return { id: candidate.id,claimId };
    });
  }

  private async cancelIn(client: PoolClient, candidate: DeliveryCandidate, reason: 'EXPIRED' | 'OBSOLETE' | 'PERMANENT') {
    await client.query(`UPDATE "MailDelivery" SET status=$3::"DeliveryStatus","finishedAt"=clock_timestamp(),
      "encryptedPayload"=NULL,nonce=NULL,"authTag"=NULL,"keyId"=NULL,"leaseUntil"=NULL,"claimId"=NULL,
      "lastErrorClass"=$4::"MailErrorClass" WHERE id=$1 AND "tokenId"=$2 AND status='PENDING'`,
    [candidate.id,candidate.tokenId,reason==='PERMANENT'?'FAILED':'CANCELLED',reason==='OBSOLETE'?null:reason]);
  }

  async cancel(candidate: DeliveryCandidate, reason: 'EXPIRED' | 'OBSOLETE' | 'PERMANENT'): Promise<void> {
    await this.transaction(client => this.cancelIn(client,candidate,reason));
  }

  async finish(claim: DeliveryClaim, failure: DeliveryFailure | null): Promise<boolean> {
    return this.transaction(async client => {
      const row = (await client.query<{ attempts: number; expiresAt: Date; now: Date; eligible: boolean }>(`SELECT
        d.attempts,${expires} AS "expiresAt",clock_timestamp() AS now,${eligible} AS eligible
        FROM "MailDelivery" d ${joins} WHERE d.id=$1 AND d.status='SENDING' AND d."claimId"=$2
          AND d."leaseUntil">clock_timestamp() FOR UPDATE OF d`, [claim.id,claim.claimId])).rows[0];
      if (!row) return false;
      const next = new Date(row.now.getTime()+(row.attempts===1?60_000:300_000));
      let status = !row.eligible ? 'CANCELLED' : failure===null ? 'SENT'
        : failure==='PERMANENT' || row.attempts>=3 ? 'FAILED' : 'PENDING';
      let errorClass = failure;
      if (!row.eligible && row.now>=row.expiresAt || status==='PENDING' && next>=row.expiresAt) {
        status='CANCELLED'; errorClass='EXPIRED';
      }
      const terminal = status!=='PENDING';
      const result = await client.query(`UPDATE "MailDelivery" SET status=$3::"DeliveryStatus",
        "nextAttemptAt"=$4,"lastErrorClass"=$5::"MailErrorClass","finishedAt"=$6,"sentAt"=$7,
        "encryptedPayload"=CASE WHEN $8 THEN NULL ELSE "encryptedPayload" END,
        nonce=CASE WHEN $8 THEN NULL ELSE nonce END,"authTag"=CASE WHEN $8 THEN NULL ELSE "authTag" END,
        "keyId"=CASE WHEN $8 THEN NULL ELSE "keyId" END,"leaseUntil"=NULL,"claimId"=NULL
        WHERE id=$1 AND "claimId"=$2 AND "leaseUntil">clock_timestamp()`,
      [claim.id,claim.claimId,status,next,errorClass,terminal?row.now:null,status==='SENT'?row.now:null,terminal]);
      return result.rowCount===1;
    });
  }
}
