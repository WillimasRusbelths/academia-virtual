import { randomUUID } from 'node:crypto';
import type { AcademicOfferingDataset } from './academic-offering.js';
import { sessionFixture } from './session-fixture.js';

/** Solo contexto ficticio de lectura en el esquema t_ del harness. No publica por producto. */
export async function academicCatalogSeed(data: AcademicOfferingDataset) {
  const db = data.context.database.pool;
  const teacherId = data.account('TEACHER').id;
  const staleTeacher = await sessionFixture(data.context, 'TEACHER');
  const version = async (id: string) => (await db.query<{ v: string }>(
    'SELECT "eligibilityVersion"::text AS v FROM "AcademicTeacherDirectory" WHERE "userId"=$1', [id])).rows[0].v;
  const currentVersion = await version(teacherId); const oldVersion = await version(staleTeacher.userId);
  const visibleCourseId = randomUUID(), otherCourseId = randomUUID(), emptyCourseId = randomUUID(), hiddenCourseId = randomUUID();
  await db.query(`INSERT INTO "AcademicCourse" (id,name,description,state) VALUES
    ($1,'Curso visible Alfa','Descripción Alfa','PUBLISHED'),($2,'Curso visible Beta','Descripción Beta','PUBLISHED'),
    ($3,'A vacío Alfa','Sin grupos visibles','PUBLISHED'),($4,'A retirado Alfa','Contexto privado','WITHDRAWN')`,
  [visibleCourseId, otherCourseId, emptyCourseId, hiddenCourseId]);
  async function group(courseId: string, name: string, state: 'DRAFT'|'PUBLISHED'|'WITHDRAWN'|'CANCELLED', capacity = 45, teacher = teacherId, capture = currentVersion) {
    const id = randomUUID();
    await db.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,state,capacity,"periodStart","periodEnd","teacherUserId",
      "publishedTeacherUserId","publishedTeacherEligibilityVersion","cancellationReason","cancelledAt")
      VALUES ($1,$2,$3,$4::text::"AcademicGroupState",$5,'2026-10-19','2026-10-25',$6,$7,$8,$9,CASE WHEN $4::text='CANCELLED' THEN clock_timestamp() ELSE NULL END)`,
    [id, courseId, name, state, capacity, teacher, state === 'DRAFT' ? null : teacher, state === 'DRAFT' ? null : capture,
      state === 'CANCELLED' ? 'Motivo ficticio privado' : null]);
    await db.query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1080,1140)', [id]);
    return id;
  }
  const firstGroupId = await group(visibleCourseId, 'Grupo visible A', 'PUBLISHED');
  const secondGroupId = await group(visibleCourseId, 'Grupo visible B', 'PUBLISHED', 50);
  const otherGroupId = await group(otherCourseId, 'Grupo visible Beta', 'PUBLISHED');
  const hiddenGroupIds = [await group(visibleCourseId, 'A borrador privado', 'DRAFT'),
    await group(visibleCourseId, 'B retirado privado', 'WITHDRAWN'), await group(visibleCourseId, 'C cancelado privado', 'CANCELLED'),
    await group(visibleCourseId, 'D revisión privada', 'PUBLISHED', 45, staleTeacher.userId, oldVersion)];
  const hiddenParentGroupId = await group(hiddenCourseId, 'Grupo bajo padre retirado', 'PUBLISHED');
  // Pérdida y recuperación reales, sin consultas intermedias ni reemplazar captura.
  await db.query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [staleTeacher.userId]);
  await db.query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`, [staleTeacher.userId]);
  return { visibleCourseId, otherCourseId, emptyCourseId, hiddenCourseId, firstGroupId, secondGroupId, otherGroupId,
    hiddenGroupIds, hiddenParentGroupId, teacherId, staleTeacherId: staleTeacher.userId };
}
