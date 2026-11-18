import type { PoolClient } from 'pg';
import type { ClassesEnrollmentAccess, ClassesEnrollmentDecision, ClassesEnrollmentDiscovery,
  ClassesEnrollmentReference, ClassesEnrollmentScope } from '../public/classes-access.js';
import { EnrollmentError, enrollmentUuid } from '../domain/enrollment-error.js';
import { postgresInstantParameter } from './temporal.js';

const references = (rows: ClassesEnrollmentReference[]) => Object.freeze(rows.map(row =>
  Object.freeze({ groupId: row.groupId, courseId: row.courseId })));
export function createClassesEnrollmentDiscovery(client: PoolClient): ClassesEnrollmentDiscovery {
  return Object.freeze({ async references(studentId: string) {
    return references((await client.query<ClassesEnrollmentReference>(`SELECT DISTINCT "groupId","courseId"
      FROM "Enrollment" WHERE "studentId"=$1 ORDER BY "groupId","courseId"`, [enrollmentUuid(studentId)])).rows);
  } });
}
/** Same connection and original bounds. The caller checks account/role/group
 * and class authority, including a moderation target; this reads only the right.
 */
export function createClassesEnrollmentParticipant(client: PoolClient, scope: ClassesEnrollmentScope): ClassesEnrollmentAccess {
  function instant(decision: ClassesEnrollmentDecision) {
    scope.assertDecision(decision);
    try { return postgresInstantParameter(decision.at); }
    catch { throw new EnrollmentError({ code: 'TEMPORARILY_UNAVAILABLE' }); }
  }
  return Object.freeze({
    async hasAccess(studentId: string, groupId: string, decision: ClassesEnrollmentDecision) {
      const at = instant(decision), student = enrollmentUuid(studentId), group = enrollmentUuid(groupId);
      return scope.use(async () => (await client.query<{ allowed: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM "Enrollment" WHERE "studentId"=$1 AND "groupId"=$2
          AND "confirmedAt"<=$3::timestamptz AND $3::timestamptz<"validUntil"
      ) AS allowed`, [student, group, at])).rows[0].allowed);
    },
    async groups(studentId: string, decision: ClassesEnrollmentDecision) {
      const at = instant(decision), student = enrollmentUuid(studentId);
      return scope.use(async () => references((await client.query<ClassesEnrollmentReference>(`SELECT DISTINCT "groupId","courseId"
        FROM "Enrollment" WHERE "studentId"=$1 AND "confirmedAt"<=$2::timestamptz AND $2::timestamptz<"validUntil"
        ORDER BY "groupId","courseId"`, [student, at])).rows));
    },
  });
}
