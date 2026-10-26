import type { Pool, PoolClient } from 'pg';
import type { SessionRepository } from '../../authorization/public/session.js';
import { AdministrativeQueries, CatalogQueries, TeachingQueries } from '../application/queries.js';
import type { AdministrativeReads, CatalogReads, TeachingReads } from '../application/queries.js';
import type { NameQuery } from '../application/offering-store.js';
import { OfferingError } from '../public/offer.js';
import type { AdminCourse, AdminGroup, CatalogCourse, CatalogGroup, Page, TeacherCandidate, TeachingGroup } from '../public/offer.js';

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

// Proyecciones públicas cerradas: nunca derivarlas serializando AdminGroup/User.
// Directorio, captura, franjas y conteo comparten la instantánea de cada sentencia.
const catalogCourseProjection = `SELECT c.id,c.name,c.description FROM "AcademicCourse" c`;
const catalogCourseVisible = `c.state='PUBLISHED' AND EXISTS (SELECT 1 FROM "AcademicGroup" g
  JOIN "AcademicTeacherDirectory" d ON d."userId"=g."teacherUserId"
  WHERE g."courseId"=c.id AND ${visible})`;
const catalogGroupProjection = `SELECT g.id,g."courseId",g.name,
  to_char(g."periodStart",'YYYY-MM-DD') AS "periodStart",to_char(g."periodEnd",'YYYY-MM-DD') AS "periodEnd",
  g."timeZone",g.capacity,NULL::integer AS occupancy,NULL::integer AS availability,'NOT_CALCULATED'::text AS "capacityStatus",
  COALESCE((SELECT jsonb_agg(jsonb_build_object('dayOfWeek',s."dayOfWeek",
    'startTime',lpad((s."startMinute"/60)::text,2,'0')||':'||lpad((s."startMinute"%60)::text,2,'0'),
    'endTime',lpad((s."endMinute"/60)::text,2,'0')||':'||lpad((s."endMinute"%60)::text,2,'0'))
    ORDER BY s."dayOfWeek",s."startMinute",s."endMinute") FROM "AcademicSlot" s WHERE s."groupId"=g.id),'[]'::jsonb) AS schedule,
  jsonb_build_object('name',d.name) AS teacher
  FROM "AcademicGroup" g JOIN "AcademicCourse" c ON c.id=g."courseId"
  JOIN "AcademicTeacherDirectory" d ON d."userId"=g."teacherUserId"`;

export function createCatalogQueries(pool: Pool, sessions: Pick<SessionRepository, 'accept'>): CatalogReads {
  async function query<T>(sql: string, values: readonly unknown[]): Promise<T> {
    try { return (await pool.query<T & Record<string, unknown>>(sql, [...values])).rows[0]; }
    catch { throw new OfferingError({ code: 'TEMPORARILY_UNAVAILABLE' }); }
  }
  const reads: CatalogReads = {
    async catalogCourses(_actor, input) {
      const result = await query<Pick<Page<CatalogCourse>, 'items' | 'total'>>(paginated(catalogCourseProjection,
        `${catalogCourseVisible} AND strpos(lower(c.name),lower($1))>0`), page(input));
      return { ...result, page: input.page, pageSize: input.pageSize };
    },
    async catalogCourse(_actor, id) {
      return (await query<{ resource: CatalogCourse | null }>(`SELECT (SELECT to_jsonb(p)
        FROM (${catalogCourseProjection} WHERE c.id=$1 AND ${catalogCourseVisible}) p) AS resource`, [id])).resource;
    },
    async catalogGroups(_actor, id, input) {
      if (Object.keys(input).some(key => !['page', 'pageSize'].includes(key))) throw new OfferingError({ code: 'VALIDATION_ERROR' });
      const result = await query<Pick<Page<CatalogGroup>, 'items' | 'total'> & { exists: boolean }>(paginated(catalogGroupProjection,
        `g."courseId"=$4 AND c.state='PUBLISHED' AND ${visible} AND $1::text=''`,
        `,EXISTS(${catalogCourseProjection} WHERE c.id=$4 AND ${catalogCourseVisible}) AS exists`), [...page(input), id]);
      return result.exists ? { items: result.items, total: result.total, page: input.page, pageSize: input.pageSize } : null;
    },
    async catalogGroup(_actor, courseId, id) {
      return (await query<{ resource: CatalogGroup | null }>(`SELECT (SELECT to_jsonb(p)
        FROM (${catalogGroupProjection} WHERE g.id=$2 AND g."courseId"=$1 AND c.state='PUBLISHED' AND ${visible}) p) AS resource`,
      [courseId, id])).resource;
    },
  };
  return new CatalogQueries(reads, sessions);
}

// Contexto de curso cerrado, sin hermanos ni diagnóstico administrativo. No filtrar
// por estado, captura o elegibilidad: el docente consulta su asignación vigente.
const teachingGroupProjection = `SELECT g.id,
  jsonb_build_object('id',c.id,'name',c.name,'description',c.description) AS course,
  g.name,g.state,to_char(g."periodStart",'YYYY-MM-DD') AS "periodStart",
  to_char(g."periodEnd",'YYYY-MM-DD') AS "periodEnd",g."timeZone",g.capacity,
  NULL::integer AS occupancy,NULL::integer AS availability,'NOT_CALCULATED'::text AS "capacityStatus",
  COALESCE((SELECT jsonb_agg(jsonb_build_object('dayOfWeek',s."dayOfWeek",
    'startTime',lpad((s."startMinute"/60)::text,2,'0')||':'||lpad((s."startMinute"%60)::text,2,'0'),
    'endTime',lpad((s."endMinute"/60)::text,2,'0')||':'||lpad((s."endMinute"%60)::text,2,'0'))
    ORDER BY s."dayOfWeek",s."startMinute",s."endMinute") FROM "AcademicSlot" s WHERE s."groupId"=g.id),'[]'::jsonb) AS schedule,
  jsonb_build_object('name',d.name) AS teacher
  FROM "AcademicGroup" g JOIN "AcademicCourse" c ON c.id=g."courseId"
  JOIN "AcademicTeacherDirectory" d ON d."userId"=g."teacherUserId"`;

export function createTeachingQueries(pool: Pool, sessions: Pick<SessionRepository, 'accept'>): TeachingReads {
  async function query<T>(sql: string, values: readonly unknown[]): Promise<T> {
    try { return (await pool.query<T & Record<string, unknown>>(sql, [...values])).rows[0]; }
    catch { throw new OfferingError({ code: 'TEMPORARILY_UNAVAILABLE' }); }
  }
  const reads: TeachingReads = {
    async teachingGroups(actor, input) {
      if (Object.keys(input).some(key => !['page', 'pageSize'].includes(key))) throw new OfferingError({ code: 'VALIDATION_ERROR' });
      const result = await query<Pick<Page<TeachingGroup>, 'items' | 'total'>>(paginated(teachingGroupProjection,
        `g."teacherUserId"=$4 AND $1::text=''`), [...page(input), actor.userId]);
      return { ...result, page: input.page, pageSize: input.pageSize };
    },
    async teachingGroup(actor, id) {
      return (await query<{ resource: TeachingGroup | null }>(`SELECT (SELECT to_jsonb(p)
        FROM (${teachingGroupProjection} WHERE g.id=$1 AND g."teacherUserId"=$2) p) AS resource`, [id, actor.userId])).resource;
    },
  };
  return new TeachingQueries(reads, sessions);
}
