import type { Pool } from 'pg';
import { expect } from 'vitest';

/** Observar fuera de BEGIN: pg_stat_activity conserva su snapshot en la transacción retenida. */
export async function waitForBlockedBy(pool: Pool, holderPid: number) {
  await expect.poll(async () => {
    const result = await pool.query<{ waiting: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))
    ) AS waiting`, [holderPid]);
    return result.rows[0].waiting;
  }, { timeout: 3000 }).toBe(true);
}
