import { randomUUID, createHash } from 'node:crypto';
import type { Pool } from 'pg';

/** Solo fixtures de preparación en el esquema aislado de T004. Sin comandos de producto. */
export async function preparationSeed(pool: Pool) {
  const courseId = randomUUID(); const otherCourseId = randomUUID();
  const groupId = randomUUID(); const otherGroupId = randomUUID();
  await pool.query(`INSERT INTO "AcademicCourse" (id,name,description) VALUES
    ($1,'Curso preparado','Descripción ficticia'),($2,'Otro curso','Otro contexto')`, [courseId, otherCourseId]);
  await pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,capacity,"periodStart","periodEnd") VALUES
    ($1,$3,'Turno A',1,'2026-10-19','2026-10-25'),($2,$3,'Turno B',50,'2026-10-19','2026-10-25')`,
  [groupId, otherGroupId, courseId]);
  await pool.query(`INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1080,1140)`, [groupId]);
  return { courseId, otherCourseId, groupId, otherGroupId };
}
const tables = ['AcademicCourse','AcademicGroup','AcademicSlot','AcademicCommand','AcademicAuditEvent'] as const;
/** Compara filas completas, incluidos ledger/auditoría; no imprime datos ni digests. */
export async function academicFingerprint(pool: Pool) {
  const digest = createHash('sha256');
  for (const table of tables) {
    const row = (await pool.query<{ value: string }>(`SELECT COALESCE(jsonb_agg(to_jsonb(t)
      ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text AS value FROM "${table}" t`)).rows[0];
    digest.update(table); digest.update(row.value);
  }
  return digest.digest('hex');
}
