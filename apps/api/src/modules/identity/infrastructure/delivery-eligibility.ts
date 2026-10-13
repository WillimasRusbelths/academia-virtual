import type { Pool } from 'pg';
import type { DeliveryEligibility } from '../../mail/public/delivery.js';
import { canConsumeAction, actionExpiresAt } from '../domain/access.js';
import type { AccountAccess, ActionAccess } from '../domain/access.js';

export class PostgresDeliveryEligibility implements DeliveryEligibility {
  constructor(private readonly pool: Pool) {}

  async check(tokenId: string): Promise<'ELIGIBLE' | 'EXPIRED' | 'OBSOLETE'> {
    const result = await this.pool.query<AccountAccess & ActionAccess & { now: Date; accountCreatedAt: Date }>(`SELECT
      u.status, u."emailCanonical", u."emailVerifiedAt", u."mustSetPassword", u."passwordHash",
      u."authVersion", u."createdAt" AS "accountCreatedAt", t.purpose, t."emailCanonicalSnapshot",
      t."createdAt", t."expiresAt", t."consumedAt", t."revokedAt", clock_timestamp() AS now
      FROM "ActionToken" t JOIN "User" u ON u.id=t."userId" WHERE t.id=$1`, [tokenId]);
    const row = result.rows[0];
    if (!row) return 'OBSOLETE';
    if (row.now >= row.expiresAt || row.now >= actionExpiresAt(row.purpose, row.createdAt)) return 'EXPIRED';
    if (row.purpose === 'VERIFY_EMAIL' && row.emailVerifiedAt !== null) return 'OBSOLETE';
    const account = { ...row, authVersion: BigInt(row.authVersion), createdAt: row.accountCreatedAt };
    return canConsumeAction(account, row, row.purpose, row.now) ? 'ELIGIBLE' : 'OBSOLETE';
  }
}
