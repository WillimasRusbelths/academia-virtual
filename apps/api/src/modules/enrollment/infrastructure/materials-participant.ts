import type { PoolClient } from 'pg';
import type { MaterialsEnrollmentAccess, MaterialsEnrollmentDecision, MaterialsEnrollmentDiscovery, MaterialsEnrollmentReference, MaterialsEnrollmentScope } from '../public/materials-access.js';
import { EnrollmentError, enrollmentUuid } from '../domain/enrollment-error.js';
import { postgresInstantParameter } from './temporal.js';

/** Pre-lock topology only. The coordinator must recheck and decide entitlement after locks. */
export function createMaterialsEnrollmentDiscovery(client: PoolClient): MaterialsEnrollmentDiscovery {
  return { async references(studentId) {
    return (await client.query<MaterialsEnrollmentReference>(`SELECT DISTINCT "groupId","courseId"
      FROM "Enrollment" WHERE "studentId"=$1 ORDER BY "groupId","courseId"`, [enrollmentUuid(studentId)])).rows;
  } };
}

/** Bound to the caller's primary connection and exact decision capability. No pool,
 * transactions, catalog/teacher predicates, locks or financial coordinator here.
 */
export function createMaterialsEnrollmentParticipant(client: PoolClient, scope: MaterialsEnrollmentScope): MaterialsEnrollmentAccess {
  function instant(decision: MaterialsEnrollmentDecision): string {
    scope.assertDecision(decision);
    try { return postgresInstantParameter(decision.at); }
    catch { throw new EnrollmentError({ code: 'TEMPORARILY_UNAVAILABLE' }); }
  }
  return Object.freeze({
    async hasAccess(studentId: string, groupId: string, decision: MaterialsEnrollmentDecision) {
      const at = instant(decision), student = enrollmentUuid(studentId), group = enrollmentUuid(groupId);
      return scope.use(async () => (await client.query<{ allowed: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM "Enrollment" WHERE "studentId"=$1 AND "groupId"=$2
          AND "confirmedAt"<=$3::timestamptz AND $3::timestamptz<"validUntil"
      ) AS allowed`, [student, group, at])).rows[0].allowed);
    },
    async groups(studentId: string, decision: MaterialsEnrollmentDecision) {
      const at = instant(decision), student = enrollmentUuid(studentId);
      return scope.use(async () => Object.freeze((await client.query<MaterialsEnrollmentReference>(`SELECT DISTINCT "groupId","courseId"
        FROM "Enrollment" WHERE "studentId"=$1 AND "confirmedAt"<=$2::timestamptz AND $2::timestamptz<"validUntil"
        ORDER BY "groupId","courseId"`, [student, at])).rows.map(row => Object.freeze({ groupId: row.groupId, courseId: row.courseId }))));
    },
  });
}
