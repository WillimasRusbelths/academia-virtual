import type { Pool } from 'pg';
import { isAccountId } from '../public/account.js';
import { TeachingDirectoryInvalid, TeachingDirectoryUnavailable } from '../public/teaching-directory.js';
import type { TeachingDirectory, TeacherDirectoryQuery, TeacherEligibility, TeacherSummary } from '../public/teaching-directory.js';

/** Reutiliza el pool de composición y exclusivamente la vista propiedad de usuarios.
 * Las lecturas académicas transaccionales futuras harán JOIN con la misma vista;
 * find() independiente no sustituye su instantánea ni sus locks de publicación.
 */
export class PostgresTeachingDirectory implements TeachingDirectory {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async find(userId: string): Promise<TeacherEligibility | null> {
    if (!isAccountId(userId)) throw new TeachingDirectoryInvalid();
    try {
      const row = (await this.pool.query<TeacherSummary & { eligible: boolean; eligibilityVersion: string }>(
        `SELECT "userId",name,eligible,"eligibilityVersion"::text AS "eligibilityVersion"
         FROM "AcademicTeacherDirectory" WHERE "userId"=$1`, [userId])).rows[0];
      return row ? Object.freeze({ userId: row.userId, name: row.name, eligible: row.eligible,
        eligibilityVersion: BigInt(row.eligibilityVersion) }) : null;
    } catch { throw new TeachingDirectoryUnavailable(); }
  }

  async listEligible(query: TeacherDirectoryQuery) {
    const page = query.page ?? 1; const pageSize = query.pageSize ?? 20;
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50
      || query.q !== undefined && (typeof query.q !== 'string' || query.q.includes('\0'))) throw new TeachingDirectoryInvalid();
    const q = query.q?.trim();
    const pattern = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null;
    try {
      const row = (await this.pool.query<{ total: string; items: TeacherSummary[] }>(`
        WITH filtered AS (
          SELECT "userId",name FROM "AcademicTeacherDirectory"
          WHERE eligible AND ($1::text IS NULL OR name ILIKE $1 ESCAPE '\\')
        ), page AS (SELECT "userId",name FROM filtered ORDER BY name,"userId" LIMIT $2 OFFSET $3)
        SELECT (SELECT count(*)::text FROM filtered) AS total,
          COALESCE((SELECT json_agg(page ORDER BY name,"userId") FROM page),'[]'::json) AS items`,
      [pattern, pageSize, ((BigInt(page) - 1n) * BigInt(pageSize)).toString()])).rows[0];
      return { items: row.items.map(item => Object.freeze({ userId: item.userId, name: item.name })),
        page, pageSize, total: Number(row.total) };
    } catch { throw new TeachingDirectoryUnavailable(); }
  }
}
