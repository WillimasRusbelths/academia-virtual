import type { Pool, PoolClient } from 'pg';
import { retentionLimit } from '../application/retain-records.js';
import type { IdentityRetention, IdentityRetentionCounts } from '../application/retain-records.js';

const sessionEnd = `LEAST("revokedAt","absoluteExpiresAt","createdAt"+interval '8 hours',
  "lastAcceptedAt"+interval '30 minutes')`;
const tokenEnd = `LEAST("consumedAt","revokedAt","expiresAt","createdAt"+
  CASE WHEN purpose='VERIFY_EMAIL' THEN interval '24 hours' ELSE interval '30 minutes' END)`;

/** SQL por tabla; nunca borra User/SystemState ni reinicia contadores vigentes. */
export class PostgresIdentityRetention implements IdentityRetention {
  constructor(private readonly pool: Pool) {}
  async runBatch(limit: number): Promise<IdentityRetentionCounts> {
    retentionLimit(limit);
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'");
      // Texto mantiene los microsegundos de PostgreSQL; no se redondea con Date de JS.
      const now=(await client.query<{now:string}>('SELECT clock_timestamp()::text AS now')).rows[0].now;
      const sessions=await this.remove(client,'Session',`${sessionEnd} <= $1::timestamptz-interval '24 hours'`,now,limit);
      const tokens=await this.remove(client,'ActionToken',`${tokenEnd} <= $1::timestamptz-interval '24 hours'
        AND NOT EXISTS (SELECT 1 FROM "MailDelivery" d WHERE d."tokenId"="ActionToken".id AND d.status IN ('PENDING','SENDING'))`,now,limit);
      const auditEvents=await this.remove(client,'AuditEvent',`"occurredAt" <= $1::timestamptz-interval '30 days'`,now,limit);
      const rates=await this.rates(client,now,limit);
      await client.query('COMMIT');
      return {sessions,tokens,auditEvents,...rates};
    } catch {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw new Error('Limpieza de identidad no completada. Valores omitidos.');
    } finally { client.release(); }
  }
  private async remove(client: PoolClient, table: 'Session'|'ActionToken'|'AuditEvent', predicate: string, now: string, limit: number) {
    const result=await client.query(`WITH selected AS (
      SELECT id FROM "${table}" WHERE ${predicate} ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED
    ) DELETE FROM "${table}" WHERE id IN (SELECT id FROM selected)`,[now,limit]);
    return result.rowCount??0;
  }
  private async rates(client: PoolClient, now: string, limit: number) {
    // Mismo orden y lock de bucket que reserve/finish: no hay carrera con una admisión.
    const keys=(await client.query<{key:string}>(`SELECT b.key FROM "RateBucket" b WHERE
      EXISTS (SELECT 1 FROM "RateEvent" e WHERE e."bucketKey"=b.key AND e."occurredAt" <= $1::timestamptz-interval '24 hours')
      OR (b."updatedAt" <= $1::timestamptz-interval '24 hours'
        AND (b."blockedUntil" IS NULL OR b."blockedUntil" <= $1::timestamptz)
        AND NOT EXISTS (SELECT 1 FROM "RateEvent" e WHERE e."bucketKey"=b.key))
      ORDER BY b.key LIMIT $2 FOR UPDATE OF b SKIP LOCKED`,[now,limit])).rows.map(row=>row.key);
    if (!keys.length) return {rateEvents:0,rateBuckets:0};
    const events=await client.query(`WITH selected AS (
      SELECT id FROM "RateEvent" WHERE "bucketKey"=ANY($2::text[])
        AND "occurredAt" <= $1::timestamptz-interval '24 hours'
        AND NOT (status='RESERVED' AND "reservationExpiresAt">$1::timestamptz)
      ORDER BY "bucketKey",id LIMIT $3 FOR UPDATE SKIP LOCKED
    ) DELETE FROM "RateEvent" WHERE id IN (SELECT id FROM selected)`,[now,keys,limit]);
    const buckets=await client.query(`DELETE FROM "RateBucket" b WHERE b.key=ANY($2::text[])
      AND b."updatedAt" <= $1::timestamptz-interval '24 hours'
      AND (b."blockedUntil" IS NULL OR b."blockedUntil" <= $1::timestamptz)
      AND NOT EXISTS (SELECT 1 FROM "RateEvent" e WHERE e."bucketKey"=b.key)`,[now,keys]);
    return {rateEvents:events.rowCount??0,rateBuckets:buckets.rowCount??0};
  }
}
