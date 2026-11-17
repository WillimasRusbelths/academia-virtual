import type { PoolClient } from 'pg';
import type { CourseReferenceAccess, ReservationCatalogAccess, ReservationOfferingReference, ReservationOfferingSnapshot } from '../public/reservation-boundary.js';
import type { Slot } from '../public/offer.js';

/** Consulta del dueño ligada al cliente; sin locks o BEGIN propios. */
export function createCourseReferenceParticipant(client:PoolClient):CourseReferenceAccess {
  return {async exists(courseId){return (await client.query('SELECT id FROM "AcademicCourse" WHERE id=$1',[courseId])).rowCount===1;}};
}

/** Este módulo posee las tablas de oferta y consume solo la vista pública docente.
 * Composición proporciona el cliente ya coordinado; sin BEGIN, locks propios o red.
 */
export function createReservationOfferingParticipant(client: PoolClient): ReservationCatalogAccess {
  return {
    async page(input){
      const rows=(await client.query<{groupId:string;total:string}>(`WITH visible AS (
        SELECT g.id FROM "AcademicGroup" g JOIN "AcademicCourse" c ON c.id=g."courseId"
        JOIN "AcademicTeacherDirectory" d ON d."userId"=g."teacherUserId"
        WHERE c.state='PUBLISHED' AND g.state='PUBLISHED' AND d.eligible
          AND g."teacherUserId"=g."publishedTeacherUserId" AND d."eligibilityVersion"=g."publishedTeacherEligibilityVersion"
          AND ($1::text IS NULL OR strpos(lower(c.name||' '||g.name),lower($1))>0)
      ), selected AS (SELECT id FROM visible ORDER BY id LIMIT $2 OFFSET $3)
      SELECT s.id AS "groupId",(SELECT count(*)::text FROM visible) AS total
        FROM (SELECT 1) anchor LEFT JOIN selected s ON true ORDER BY s.id`,[input.q??null,input.pageSize,(input.page-1)*input.pageSize])).rows;
      return {groupIds:rows.filter(r=>r.groupId!==null).map(r=>r.groupId),total:Number(rows[0].total)};
    },
    async discover(groupIds) {
      const rows = (await client.query<ReservationOfferingReference>(`SELECT id AS "groupId","courseId","teacherUserId"
        FROM "AcademicGroup" WHERE id=ANY($1::uuid[]) ORDER BY id`, [groupIds])).rows;
      return Object.freeze(rows.map(row => Object.freeze({ groupId: row.groupId, courseId: row.courseId, teacherUserId: row.teacherUserId })));
    },
    async snapshots(groupIds) {
      type Row = Omit<ReservationOfferingSnapshot, 'teacherEligibilityVersion' | 'publishedTeacherEligibilityVersion' | 'schedule'>
        & { teacherEligibilityVersion: string | null; publishedTeacherEligibilityVersion: string | null; schedule: Slot[] };
      const rows = (await client.query<Row>(`SELECT g.id AS "groupId",g."courseId",g."teacherUserId",
        c.name AS "courseName",g.name AS "groupName",c.revision::text AS "courseRevision",g.revision::text AS "groupRevision",
        c.state AS "courseState",g.state AS "groupState",d.name AS "teacherName",COALESCE(d.eligible,false) AS "teacherEligible",
        d."eligibilityVersion"::text AS "teacherEligibilityVersion",g."publishedTeacherUserId",
        g."publishedTeacherEligibilityVersion"::text,
        COALESCE(c.state='PUBLISHED' AND g.state='PUBLISHED' AND g."teacherUserId"=g."publishedTeacherUserId"
          AND d.eligible AND d."eligibilityVersion"=g."publishedTeacherEligibilityVersion",false) AS "studentVisible",
        (g."publishedTeacherUserId" IS NOT NULL AND (g."teacherUserId" IS DISTINCT FROM g."publishedTeacherUserId"
          OR NOT COALESCE(d.eligible,false) OR d."eligibilityVersion" IS DISTINCT FROM g."publishedTeacherEligibilityVersion")) AS "teacherReviewRequired",
        to_char(g."periodStart",'YYYY-MM-DD') AS "periodStart",to_char(g."periodEnd",'YYYY-MM-DD') AS "periodEnd",g."timeZone",g.capacity,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('dayOfWeek',s."dayOfWeek",
          'startTime',lpad((s."startMinute"/60)::text,2,'0')||':'||lpad((s."startMinute"%60)::text,2,'0'),
          'endTime',lpad((s."endMinute"/60)::text,2,'0')||':'||lpad((s."endMinute"%60)::text,2,'0'))
          ORDER BY s."dayOfWeek",s."startMinute",s."endMinute") FROM "AcademicSlot" s WHERE s."groupId"=g.id),'[]'::jsonb) AS schedule
        FROM "AcademicGroup" g JOIN "AcademicCourse" c ON c.id=g."courseId"
        LEFT JOIN "AcademicTeacherDirectory" d ON d."userId"=g."teacherUserId"
        WHERE g.id=ANY($1::uuid[]) ORDER BY g.id`, [groupIds])).rows;
      return Object.freeze(rows.map(row => Object.freeze({ ...row,
        teacherEligibilityVersion: row.teacherEligibilityVersion === null ? null : BigInt(row.teacherEligibilityVersion),
        publishedTeacherEligibilityVersion: row.publishedTeacherEligibilityVersion === null ? null : BigInt(row.publishedTeacherEligibilityVersion),
        schedule: Object.freeze(row.schedule.map(slot => Object.freeze({ dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime }))),
      })));
    },
  };
}
