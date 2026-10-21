import type { Pool, PoolClient } from 'pg';
import type { SessionRepository } from '../../authorization/public/session.js';
import { AdministrativeQueries } from '../application/queries.js';
import type { AdministrativeReads } from '../application/queries.js';
import type { NameQuery } from '../application/offering-store.js';
import { OfferingError } from '../public/offer.js';
import type { AdminCourse, AdminGroup, Page, TeacherCandidate } from '../public/offer.js';

// Superficie pública SQL de usuarios. Nunca consultar columnas privadas de User.
const visible = `g.state='PUBLISHED' AND g."teacherUserId"=g."publishedTeacherUserId"
  AND d.eligible AND d."eligibilityVersion"=g."publishedTeacherEligibilityVersion"`;
const instant = (column: string) => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
export const courseProjection = `SELECT c.id,c.name,c.description,c.state,c.revision::text,
  (c.state='PUBLISHED' AND EXISTS (SELECT 1 FROM "AcademicGroup" g
    LEFT JOIN "AcademicTeacherDirectory" d ON d."userId"=g."teacherUserId"
    WHERE g."courseId"=c.id AND ${visible})) AS "studentVisible",
  ${instant('c."createdAt"')} AS "createdAt",${instant('c."updatedAt"')} AS "updatedAt"
  FROM "AcademicCourse" c`;
export const groupProjection = `SELECT g.id,g."courseId",g.name,g.state,g.revision::text,
  to_char(g."periodStart",'YYYY-MM-DD') AS "periodStart",to_char(g."periodEnd",'YYYY-MM-DD') AS "periodEnd",
  g."timeZone",g.capacity,NULL::integer AS occupancy,NULL::integer AS availability,'NOT_CALCULATED'::text AS "capacityStatus",
  COALESCE((SELECT jsonb_agg(jsonb_build_object('dayOfWeek',s."dayOfWeek",
    'startTime',lpad((s."startMinute"/60)::text,2,'0')||':'||lpad((s."startMinute"%60)::text,2,'0'),
    'endTime',lpad((s."endMinute"/60)::text,2,'0')||':'||lpad((s."endMinute"%60)::text,2,'0'))
    ORDER BY s."dayOfWeek",s."startMinute",s."endMinute") FROM "AcademicSlot" s WHERE s."groupId"=g.id),'[]'::jsonb) AS schedule,
  CASE WHEN d."userId" IS NULL THEN NULL ELSE jsonb_build_object('id',d."userId",'name',d.name,'eligible',d.eligible) END AS teacher,
  (g."publishedTeacherUserId" IS NOT NULL AND (g."teacherUserId" IS DISTINCT FROM g."publishedTeacherUserId"
    OR NOT COALESCE(d.eligible,false) OR d."eligibilityVersion" IS DISTINCT FROM g."publishedTeacherEligibilityVersion")) AS "teacherReviewRequired",
  COALESCE(c.state='PUBLISHED' AND ${visible},false) AS "studentVisible",
  g."cancellationReason",${instant('g."cancelledAt"')} AS "cancelledAt",g."publishedTeacherUserId" AS "lastPublishedTeacherId",
  ${instant('g."createdAt"')} AS "createdAt",${instant('g."updatedAt"')} AS "updatedAt"
  FROM "AcademicGroup" g JOIN "AcademicCourse" c ON c.id=g."courseId"
  LEFT JOIN "AcademicTeacherDirectory" d ON d."userId"=g."teacherUserId"`;

export async function projectCourse(client: PoolClient, id: string): Promise<AdminCourse> {
  const result = await client.query<AdminCourse>(`${courseProjection} WHERE c.id=$1`, [id]);
  if (!result.rows[0]) throw new OfferingError({ code: 'NOT_FOUND' });
  return result.rows[0];
}
export async function projectGroup(client: PoolClient, id: string): Promise<AdminGroup> {
  const result = await client.query<AdminGroup>(`${groupProjection} WHERE g.id=$1`, [id]);
  if (!result.rows[0]) throw new OfferingError({ code: 'NOT_FOUND' });
  return result.rows[0];
}
function page(query: NameQuery, withState = false) {
  if (Object.keys(query).some(key => !['page', 'pageSize', 'q', ...(withState ? ['state'] : [])].includes(key))) {
    throw new OfferingError({ code: 'VALIDATION_ERROR' });
  }
  if (!Number.isSafeInteger(query.page) || query.page < 1) throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['page'] });
  if (!Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 50) throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['pageSize'] });
  if (query.q !== undefined && typeof query.q !== 'string') throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['q'] });
  const offset = (query.page - 1) * query.pageSize;
  if (!Number.isSafeInteger(offset)) throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['page'] });
  return [query.q?.trim() ?? '', query.pageSize, offset];
}
function state(value: unknown, groups = false) {
  if (value !== undefined && !['DRAFT', 'PUBLISHED', 'WITHDRAWN', ...(groups ? ['CANCELLED'] : [])].includes(String(value))) {
    throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['state'] });
  }
  return value ?? null;
}
/** Une página/conteo en una instantánea, incluso cuando la página queda vacía.
 * jsonb es una allowlist explícita de proyecciones; no serializa filas físicas.
 */
const paginated = (projection: string, filter: string, parent = '') => `WITH filtered AS (${projection} WHERE ${filter}),
  selected AS (SELECT * FROM filtered ORDER BY name,id LIMIT $2 OFFSET $3)
  SELECT COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY name,id) FROM selected s),'[]'::jsonb) AS items,
    (SELECT count(*)::integer FROM filtered) AS total ${parent}`;

export function createAdministrativeQueries(pool: Pool, sessions: Pick<SessionRepository, 'accept'>): AdministrativeReads {
  async function query<T>(sql: string, values: readonly unknown[]): Promise<T> {
    try { return (await pool.query<T & Record<string, unknown>>(sql, [...values])).rows[0]; }
    catch { throw new OfferingError({ code: 'TEMPORARILY_UNAVAILABLE' }); }
  }
  const reads: AdministrativeReads = {
    async adminCourses(_actor, input) {
      const values = [...page(input, true), state(input.state)];
      const result = await query<Pick<Page<AdminCourse>, 'items' | 'total'>>(paginated(courseProjection,
        `strpos(lower(c.name),lower($1))>0 AND ($4::text IS NULL OR c.state::text=$4)`), values);
      return { ...result, page: input.page, pageSize: input.pageSize };
    },
    async adminCourse(_actor, id) {
      return (await query<{ resource: AdminCourse | null }>(`SELECT (SELECT to_jsonb(p) FROM (${courseProjection} WHERE c.id=$1) p) AS resource`, [id])).resource;
    },
    async adminGroups(_actor, id, input) {
      const values = [...page(input, true), state(input.state, true), id];
      const result = await query<Pick<Page<AdminGroup>, 'items' | 'total'> & { exists: boolean }>(paginated(groupProjection,
        `g."courseId"=$5 AND strpos(lower(g.name),lower($1))>0 AND ($4::text IS NULL OR g.state::text=$4)`,
        `,EXISTS(SELECT 1 FROM "AcademicCourse" WHERE id=$5) AS exists`), values);
      return result.exists ? { items: result.items, total: result.total, page: input.page, pageSize: input.pageSize } : null;
    },
    async adminGroup(_actor, id) {
      return (await query<{ resource: AdminGroup | null }>(`SELECT (SELECT to_jsonb(p) FROM (${groupProjection} WHERE g.id=$1) p) AS resource`, [id])).resource;
    },
    async teacherCandidates(_actor, input) {
      const result = await query<Pick<Page<TeacherCandidate>, 'items' | 'total'>>(paginated(
        `SELECT "userId" AS id,name FROM "AcademicTeacherDirectory"`, `eligible AND strpos(lower(name),lower($1))>0`), page(input));
      return { ...result, page: input.page, pageSize: input.pageSize };
    },
  };
  return new AdministrativeQueries(reads, sessions);
}
