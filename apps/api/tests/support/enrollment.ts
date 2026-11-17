import { randomUUID } from 'node:crypto';
import { academicOfferingDataset, assertAcademicFixtureInputs } from './academic-offering.js';
import type { AcademicOfferingDataset } from './academic-offering.js';
import { sessionFixture } from './session-fixture.js';

/** Etiquetas de preparación, no estados financieros persistidos ni resultados de producto. */
export type EnrollmentFinancialScenario = 'UNPRICED' | 'AWAITING_PAYMENT' | 'EXPIRED' | 'APPLIED' | 'INCIDENT';

/** Puede añadirse al dataset académico ya abierto por la fixture de navegador. */
export async function prepareEnrollmentFixture(data: AcademicOfferingDataset,
  scenario: EnrollmentFinancialScenario = 'UNPRICED') {
  assertAcademicFixtureInputs();
  if (!/^t_[a-z0-9_]+$/.test(data.context.isolated.schema)) throw new Error('Fixture fuera de schema de pruebas.');
  const db = data.context.database.pool;
  const owner = data.account('STUDENT');
  const admin = data.account('ADMIN');
  const teacher = data.account('TEACHER');
  const other = await sessionFixture(data.context, 'STUDENT');
  const courseId = randomUUID(), hiddenCourseId = randomUUID();
  const groupId = randomUUID(), hiddenGroupId = randomUUID();
  const version = (await db.query<{ version: string }>(
    'SELECT "eligibilityVersion"::text AS version FROM "AcademicTeacherDirectory" WHERE "userId"=$1', [teacher.id])).rows[0].version;
  await db.query(`INSERT INTO "AcademicCourse" (id,name,description,state) VALUES
    ($1,'Curso ficticio de reservas','Oferta de prueba visible','PUBLISHED'),
    ($2,'Curso ficticio retirado','Oferta de prueba oculta','WITHDRAWN')`, [courseId, hiddenCourseId]);
  // Fechas ficticias fijas: no calculan vigencia ni prueban el calendario de matrícula.
  await db.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,state,capacity,"periodStart","periodEnd",
    "teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion") VALUES
    ($1,$3,'Grupo ficticio visible','PUBLISHED',2,'2090-01-02','2090-03-31',$5,$5,$6),
    ($2,$4,'Grupo ficticio oculto','PUBLISHED',2,'2090-01-02','2090-03-31',$5,$5,$6)`,
  [groupId, hiddenGroupId, courseId, hiddenCourseId, teacher.id, version]);
  await db.query(`INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES
    ($1,1,1080,1140),($2,2,1080,1140)`, [groupId, hiddenGroupId]);
  return {
    actors: {
      owner: { id: owner.id, secret: owner.sessions[0].secret },
      other: { id: other.userId, secret: other.secret },
      admin: { id: admin.id, secret: admin.sessions[0].secret },
      teacher: { id: teacher.id, secret: teacher.sessions[0].secret },
    },
    offer: { courseId, groupId, hiddenCourseId, hiddenGroupId },
    // Las tablas/estados reales se prepararán tras T007/T008. Nunca simular su existencia.
    financial: Object.freeze({ scenario, persisted: false as const, intentionId: randomUUID(), commandId: randomUUID() }),
  };
}

/** identityDatabase/limpieza/observador pertenecen al harness existente; nunca bootstrap. */
export async function enrollmentDataset(suite = 'enrollment', scenario: EnrollmentFinancialScenario = 'UNPRICED') {
  assertAcademicFixtureInputs();
  const data = await academicOfferingDataset(suite);
  try { return { ...data, ...await prepareEnrollmentFixture(data, scenario) }; }
  catch { await data.cleanup(); throw new Error('Fixture de matrícula no preparada. Valores omitidos.'); }
}
export type EnrollmentDataset = Awaited<ReturnType<typeof enrollmentDataset>>;
