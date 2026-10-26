import { randomUUID } from 'node:crypto';
import type { OfferingCommand } from '../../src/modules/academic-offering/application/offering-store.js';
import type { AcademicOfferingDataset } from './academic-offering.js';
import { preparationSeed } from './academic-preparation.js';

/** Exclusivamente datos ficticios dentro del esquema t_ del harness. Dos hijos
 * publicados con franjas distintas y un competidor del mismo docente en otro curso. */
export async function maintenanceSeed(data: AcademicOfferingDataset, options: { firstGroupDraft?: boolean; firstCourseDraft?: boolean; otherTeacherId?: string } = {}) {
  const db = data.context.database.pool; const seed = await preparationSeed(db);
  const teacherId = data.account('TEACHER').id;
  await db.query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE NOT ($1::boolean AND id=$2)`, [options.firstCourseDraft ?? false, seed.courseId]);
  await db.query(`INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,2,1080,1140)`, [seed.otherGroupId]);
  if (options.otherTeacherId) await db.query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1', [seed.otherGroupId, options.otherTeacherId]);
  await db.query(`UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id<>$2`, [teacherId, seed.otherGroupId]);
  if (!options.otherTeacherId) await db.query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1', [seed.otherGroupId, teacherId]);
  await db.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId",
    "publishedTeacherEligibilityVersion"=(SELECT "eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"="teacherUserId")
    WHERE NOT ($1::boolean AND id=$2)`, [options.firstGroupDraft ?? false, seed.groupId]);
  const competitorId = randomUUID();
  await db.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,capacity,"periodStart","periodEnd","teacherUserId")
    VALUES ($1,$2,'Competidor ficticio',45,'2026-10-19','2026-10-25',$3)`, [competitorId, seed.otherCourseId, teacherId]);
  await db.query(`INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1080,1140)`, [competitorId]);
  return { ...seed, competitorId, teacherId };
}
export async function resetAcademicFixture(data: AcademicOfferingDataset) {
  await data.context.isolated.ownerQuery('TRUNCATE "AcademicAuditEvent","AcademicCommand","AcademicSlot","AcademicGroup","AcademicCourse"');
}
export async function commandCounts(data: AcademicOfferingDataset, commandId: string) {
  return (await data.observerPool.query<{ ledger: number; audit: number }>(`SELECT
    (SELECT count(*)::int FROM "AcademicCommand" WHERE "commandId"=$1) AS ledger,
    (SELECT count(*)::int FROM "AcademicAuditEvent" WHERE "commandId"=$1) AS audit`, [commandId])).rows[0];
}
export async function savedGroup(data: AcademicOfferingDataset, id: string) {
  return (await data.observerPool.query(`SELECT to_jsonb(g) AS value FROM "AcademicGroup" g WHERE id=$1`, [id])).rows[0].value;
}
export function change(operation: 'COURSE_WITHDRAW' | 'GROUP_WITHDRAW' | 'GROUP_CANCEL', id: string, revision = '1', commandId = randomUUID()): OfferingCommand {
  return operation === 'COURSE_WITHDRAW' ? { operation, courseId: id, expectedRevision: revision, commandId }
    : operation === 'GROUP_WITHDRAW' ? { operation, groupId: id, expectedRevision: revision, commandId }
      : { operation, groupId: id, expectedRevision: revision, commandId, cancellationReason: 'Motivo ficticio privado' };
}
