import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import { assertAcademicFixtureInputs } from '../support/academic-offering.js';
import { draftGroup } from '../support/academic-migration.js';
import type { MigrationContext } from '../support/academic-migration.js';
import { sessionFixture } from '../support/session-fixture.js';

let context: MigrationContext;
beforeAll(async () => { assertAcademicFixtureInputs(); context = await identityDatabase('academic_schema_guards'); }, 120000);
afterAll(async () => { await context?.cleanup(); });

test('S01 curso exige retirar antes de editar, incluso si se intenta retirar y editar juntos', async () => {
  const db = context.database.pool; const { courseId } = await draftGroup(db);
  await db.query(`UPDATE "AcademicCourse" SET description='Descripción ficticia',state='PUBLISHED' WHERE id=$1`, [courseId]);
  await expect(db.query(`UPDATE "AcademicCourse" SET state='WITHDRAWN',name='Edición simultánea' WHERE id=$1`, [courseId]))
    .rejects.toMatchObject({ code: '23514' });
  expect((await db.query('SELECT state FROM "AcademicCourse" WHERE id=$1', [courseId])).rows[0].state).toBe('PUBLISHED');
  await db.query(`UPDATE "AcademicCourse" SET state='WITHDRAWN' WHERE id=$1`, [courseId]);
  await db.query(`UPDATE "AcademicCourse" SET name='Corrección ficticia' WHERE id=$1`, [courseId]);
  await db.query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`, [courseId]);
  await expect(db.query(`UPDATE "AcademicCourse" SET state='DRAFT' WHERE id=$1`, [courseId])).rejects.toMatchObject({ code: '23514' });
});

test('S02 grupo publicado exige retiro separado y conserva captura hasta publicación explícita', async () => {
  const db = context.database.pool; const teacher = await sessionFixture(context, 'TEACHER');
  const { groupId } = await draftGroup(db);
  await db.query(`UPDATE "AcademicGroup" SET "periodStart"='2026-11-02',"periodEnd"='2026-11-30',capacity=45,
    "teacherUserId"=$2,"publishedTeacherUserId"=$2,"publishedTeacherEligibilityVersion"=0,state='PUBLISHED' WHERE id=$1`, [groupId, teacher.userId]);
  await expect(db.query(`UPDATE "AcademicGroup" SET state='WITHDRAWN',capacity=50 WHERE id=$1`, [groupId])).rejects.toMatchObject({ code: '23514' });
  await expect(db.query('UPDATE "AcademicGroup" SET "publishedTeacherEligibilityVersion"=1 WHERE id=$1', [groupId]))
    .rejects.toMatchObject({ code: '23514' });
  await db.query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`, [groupId]);
  await db.query('UPDATE "AcademicGroup" SET capacity=50 WHERE id=$1', [groupId]);
  const row = (await db.query('SELECT state,capacity,"publishedTeacherEligibilityVersion" FROM "AcademicGroup" WHERE id=$1', [groupId])).rows[0];
  expect(row).toEqual({ state: 'WITHDRAWN', capacity: 50, publishedTeacherEligibilityVersion: '0' });
  // La validez entre filas se verifica en el adaptador futuro, no por este test SQL local.
});

test('S03 una franja no puede trasladarse a otro grupo', async () => {
  const db = context.database.pool; const first = await draftGroup(db); const second = await draftGroup(db); const id = randomUUID();
  await db.query('INSERT INTO "AcademicSlot" (id,"groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,$2,1,60,120)', [id, first.groupId]);
  await expect(db.query('UPDATE "AcademicSlot" SET "groupId"=$2 WHERE id=$1', [id, second.groupId])).rejects.toMatchObject({ code: '23514' });
});

test('S04 auditoría académica conserva recurso propio y rechaza estados/actor/revisiones inválidos', async () => {
  const db = context.database.pool; const actor = await sessionFixture(context, 'ADMIN'); const resourceId = randomUUID();
  const insert = (who: string, afterState: string, revision: number) => db.query(`INSERT INTO "AcademicAuditEvent"
    ("actorUserId","resourceKind","resourceId",action,result,"commandId","requestId","afterState","afterRevision")
    VALUES ($1,'COURSE',$2,'COURSE_CREATE','APPLIED',$3,$4,$5::"AcademicGroupState",$6)`, [who, resourceId, randomUUID(), randomUUID(), afterState, revision]);
  await expect(insert(actor.userId, 'CANCELLED', 1)).rejects.toMatchObject({ code: '23514' });
  await expect(insert(actor.userId, 'DRAFT', 0)).rejects.toMatchObject({ code: '23514' });
  await expect(insert(randomUUID(), 'DRAFT', 1)).rejects.toMatchObject({ code: '23503' });
  await insert(actor.userId, 'DRAFT', 1);
  const academic = await db.query('SELECT "resourceKind","resourceId" FROM "AcademicAuditEvent" WHERE "resourceId"=$1', [resourceId]);
  expect(academic.rows).toEqual([{ resourceKind: 'COURSE', resourceId }]);
  expect((await db.query('SELECT count(*) FROM "AuditEvent"')).rows[0].count).toBe('0');
});

test('S05 ledger rechaza operación/destino incompatibles y revisiones no positivas', async () => {
  const db = context.database.pool; const actor = await sessionFixture(context, 'ADMIN');
  const insert = (kind: string, revision: number) => db.query(`INSERT INTO "AcademicCommand"
    ("actorUserId","commandId",operation,"targetKind","targetId","payloadDigest","resultingRevision",result)
    VALUES ($1,$2,'GROUP_CREATE',$3::"AcademicResourceKind",$4,$5,$6,'APPLIED')`,
  [actor.userId, randomUUID(), kind, randomUUID(), randomBytes(32), revision]);
  await expect(insert('COURSE', 1)).rejects.toMatchObject({ code: '23514' });
  await expect(insert('GROUP', 0)).rejects.toMatchObject({ code: '23514' });
  await insert('GROUP', 1);
});

test('S06 runtime no puede deshabilitar el trigger que protege la generación', async () => {
  await expect(context.database.pool.query('ALTER TABLE "User" DISABLE TRIGGER "User_teacher_eligibility"'))
    .rejects.toMatchObject({ code: '42501' });
});
