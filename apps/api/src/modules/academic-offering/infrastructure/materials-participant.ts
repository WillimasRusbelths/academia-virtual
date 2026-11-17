import type { PoolClient } from 'pg';
import type { TeachingDirectory } from '../../users/public/teaching-directory.js';
import type { MaterialsGroupAccess, MaterialsGroupReference, MaterialsGroupSnapshot } from '../public/materials-access.js';

/** The owner reads offering rows; teacher eligibility comes from users' public contract. */
export function createMaterialsGroupParticipant(client: PoolClient, teachers: TeachingDirectory): MaterialsGroupAccess {
  return {
    async discover(groupIds) {
      return (await client.query<MaterialsGroupReference>(`SELECT id AS "groupId","courseId","teacherUserId"
        FROM "AcademicGroup" WHERE id=ANY($1::uuid[]) ORDER BY id`, [groupIds])).rows;
    },
    async managedReferences(actorId, role) {
      if (role !== 'ADMIN' && role !== 'TEACHER') return [];
      return (await client.query<MaterialsGroupReference>(`SELECT id AS "groupId","courseId","teacherUserId"
        FROM "AcademicGroup" WHERE $1='ADMIN' OR ("teacherUserId"=$2 AND state<>'CANCELLED') ORDER BY id`, [role, actorId])).rows;
    },
    async snapshots(groupIds, audience) {
      const rows = (await client.query<Omit<MaterialsGroupSnapshot, 'teacherEligible'>>(`SELECT g.id AS "groupId",
        g."courseId",g."teacherUserId",g.name,c.name AS "courseName",g.state
        FROM "AcademicGroup" g JOIN "AcademicCourse" c ON c.id=g."courseId"
        WHERE g.id=ANY($1::uuid[]) ORDER BY g.name,g.id`, [groupIds])).rows;
      if (audience === 'STUDENT') return rows.map(row => Object.freeze({ ...row, teacherEligible: false }));
      const eligibility = new Map<string, boolean>();
      for (const id of new Set(rows.flatMap(row => row.teacherUserId ? [row.teacherUserId] : []))) {
        eligibility.set(id, (await teachers.find(id))?.eligible === true);
      }
      return rows.map(row => Object.freeze({ ...row, teacherEligible: row.teacherUserId !== null && eligibility.get(row.teacherUserId) === true }));
    },
  };
}
