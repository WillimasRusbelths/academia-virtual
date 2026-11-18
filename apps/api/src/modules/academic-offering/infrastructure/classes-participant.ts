import type { PoolClient } from 'pg';
import type { TeachingDirectory } from '../../users/public/teaching-directory.js';
import type { ClassesGroupAccess, ClassesGroupReference, ClassesGroupSnapshot } from '../public/classes-access.js';

/** Offering owns its rows; users owns eligibility. No locks/BEGIN or catalog
 * predicate: withdrawing an offer does not cancel original enrollment rights. */
export function createClassesGroupParticipant(client: PoolClient, teachers: TeachingDirectory): ClassesGroupAccess {
  const references = (rows: ClassesGroupReference[]) => Object.freeze(rows.map(row => Object.freeze({
    groupId: row.groupId, courseId: row.courseId, teacherUserId: row.teacherUserId,
  })));
  return Object.freeze({
    async discover(groupIds: readonly string[]) {
      return references((await client.query<ClassesGroupReference>(`SELECT id AS "groupId","courseId","teacherUserId"
        FROM "AcademicGroup" WHERE id=ANY($1::uuid[]) ORDER BY id`, [groupIds])).rows);
    },
    async managedReferences(actorId: string, role: 'ADMIN' | 'TEACHER') {
      if (role !== 'ADMIN' && role !== 'TEACHER') return Object.freeze([]);
      return references((await client.query<ClassesGroupReference>(`SELECT id AS "groupId","courseId","teacherUserId"
        FROM "AcademicGroup" WHERE $1='ADMIN' OR ("teacherUserId"=$2 AND state<>'CANCELLED') ORDER BY id`, [role, actorId])).rows);
    },
    async snapshots(groupIds: readonly string[], audience?: 'STUDENT') {
      const rows = (await client.query<Omit<ClassesGroupSnapshot, 'teacherEligible'>>(`SELECT g.id AS "groupId",g."courseId",
        g."teacherUserId",g.name,c.name AS "courseName",c.state AS "courseState",g.state
        FROM "AcademicGroup" g JOIN "AcademicCourse" c ON c.id=g."courseId"
        WHERE g.id=ANY($1::uuid[]) ORDER BY g.name,g.id`, [groupIds])).rows;
      const eligibility = new Map<string, boolean>();
      if (audience !== 'STUDENT') {
        for (const id of new Set(rows.flatMap(row => row.teacherUserId ? [row.teacherUserId] : [])))
          eligibility.set(id, (await teachers.find(id))?.eligible === true);
      }
      return Object.freeze(rows.map(row => Object.freeze({ groupId: row.groupId, courseId: row.courseId,
        teacherUserId: row.teacherUserId, name: row.name, courseName: row.courseName, courseState: row.courseState,
        state: row.state, teacherEligible: row.teacherUserId !== null && eligibility.get(row.teacherUserId) === true })));
    },
  });
}
