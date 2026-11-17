import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { identityDatabase } from './identity-database.js';
import { assertAcademicFixtureInputs } from './academic-offering.js';
import { sessionFixture } from './session-fixture.js';
import { seedCommitment } from './enrollment-maintenance.js';
import { insertEnrollmentRow } from './enrollment-migration.js';
import { materialFileCase } from './materials-files.js';
import type { MaterialState } from '../../src/modules/materials/public/materials.js';

/** Synthetic facts in a new schema only. Uses 001/003 fixture owners, no HTTP,
 * payment gateway or alternate implementation of materials authorization.
 */
export async function materialsFixture() {
  assertAcademicFixtureInputs();
  const context = await identityDatabase('materials_fixture');
  try {
    const admin = await sessionFixture(context, 'ADMIN');
    const teacher = await sessionFixture(context, 'TEACHER');
    const otherTeacher = await sessionFixture(context, 'TEACHER');
    const ineligibleTeacher = await sessionFixture(context, 'TEACHER');
    const student = await sessionFixture(context), historicalStudent = await sessionFixture(context);
    const otherStudent = await sessionFixture(context), unEnrolledStudent = await sessionFixture(context);
    const reservationStudent = await sessionFixture(context), pendingStudent = await sessionFixture(context);
    const incidentStudent = await sessionFixture(context), disabledStudent = await sessionFixture(context);
    const revokedStudent = await sessionFixture(context);
    const pool = context.database.pool;
    const courseId = randomUUID(), groupId = randomUUID(), otherGroupId = randomUUID(), cancelledGroupId = randomUUID();
    await pool.query(`INSERT INTO "AcademicCourse" (id,name,description)
      VALUES ($1,'Curso ficticio de materiales','No depende de catálogo publicado')`, [courseId]);
    await pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,"teacherUserId",capacity,"periodStart","periodEnd")
      VALUES ($1,$4,'Grupo A ficticio',$5,50,'2090-01-02','2090-03-31'),
        ($2,$4,'Grupo B ficticio',$6,50,'2090-01-02','2090-03-31'),
        ($3,$4,'Grupo cancelado ficticio',$5,50,'2090-01-02','2090-03-31')`,
    [groupId, otherGroupId, cancelledGroupId, courseId, teacher.userId, otherTeacher.userId]);
    let sequence = 0;
    async function commitment(actor: typeof student, kind: Parameters<typeof seedCommitment>[1], group = groupId) {
      await seedCommitment({ ...context, courseId, groupId: group, student: actor }, kind, pool, String(++sequence));
    }
    await commitment(student, 'ENROLLED');
    await commitment(historicalStudent, 'FINISHED');
    await commitment(otherStudent, 'ENROLLED', otherGroupId);
    await commitment(reservationStudent, 'RESERVED');
    await commitment(pendingStudent, 'RESERVED');
    await commitment(incidentStudent, 'INCIDENT');
    await commitment(disabledStudent, 'ENROLLED');
    await commitment(revokedStudent, 'ENROLLED');
    const pendingOrder = (await pool.query('SELECT id FROM "EnrollmentOrder" WHERE "studentId"=$1', [pendingStudent.userId])).rows[0].id;
    await insertEnrollmentRow(pool, 'PaymentAttempt', { id: randomUUID(), orderId: pendingOrder,
      studentId: pendingStudent.userId, initiationId: randomUUID(), payloadDigest: randomBytes(32), state: 'PENDING',
      merchantReference: `fixture-materials-${randomUUID()}`, externalIdempotencyKey: randomUUID(),
      providerScope: 'fixture/provider/merchant/sandbox', providerReference: 'fictional-pending' });
    await pool.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [ineligibleTeacher.userId]);
    await pool.query('UPDATE "User" SET status=\'DISABLED\',"disabledAt"=clock_timestamp() WHERE id=$1', [disabledStudent.userId]);
    await pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [revokedStudent.sessionId]);

    async function seedMaterial(state: MaterialState, group = groupId, author = teacher.userId,
      fileId = 'pdf-valid') {
      const file = materialFileCase(fileId), id = randomUUID(), intentionId = randomUUID(), uploadId = randomUUID();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO "Material" (id,"groupId",title,description,"createdBy","updatedBy")
          VALUES ($1,$2,'Material ficticio',$3,$4,$4)`, [id, group, 'Recurso de ensayo sin datos reales', author]);
        await client.query(`INSERT INTO "MaterialContent" ("materialId",bytes,"byteSize","mediaType","downloadName",sha256)
          VALUES ($1,$2,$3,$4,$5,$6)`, [id, file.bytes, file.byteSize, file.mediaType, file.name, file.sha256]);
        await client.query(`INSERT INTO "MaterialUpload" ("uploadId","actorId","intentionId","groupId",title,description,
          "downloadName","mediaType","byteSize",sha256,"payloadDigest","materialId")
          VALUES ($1,$2,$3,$4,'Material ficticio',$5,$6,$7,$8,$9,$10,$11)`,
        [uploadId, author, intentionId, group, 'Recurso de ensayo sin datos reales', file.name, file.mediaType,
          file.byteSize, file.sha256, createHash('sha256').update(`fixture/${intentionId}`).digest(), id]);
        await client.query(`INSERT INTO "MaterialAuditEvent" ("actorId","groupId","materialId","intentionId",operation,result,revision)
          VALUES ($1,$2,$3,$4,'UPLOAD_COMPLETE','APPLIED',1)`, [author, group, id, intentionId]);
        if (state !== 'PREPARED') {
          const operation = state === 'PUBLISHED' ? 'PUBLISH' : 'WITHDRAW', commandId = randomUUID();
          await client.query(`UPDATE "Material" SET state=$2::"MaterialState",revision=revision+1,"updatedAt"=clock_timestamp(),
            "publishedAt"=CASE WHEN $2::"MaterialState"='PUBLISHED' THEN clock_timestamp() ELSE NULL END,
            "withdrawnAt"=CASE WHEN $2::"MaterialState"='WITHDRAWN' THEN clock_timestamp() ELSE NULL END WHERE id=$1`, [id, state]);
          await client.query(`INSERT INTO "MaterialCommand" ("actorId","commandId","materialId",operation,"payloadDigest","appliedRevision",result)
            VALUES ($1,$2,$3,$4,$5,2,'APPLIED')`, [author, commandId, id, operation, randomBytes(32)]);
          await client.query(`INSERT INTO "MaterialAuditEvent" ("actorId","groupId","materialId","commandId",operation,result,revision)
            VALUES ($1,$2,$3,$4,$5,'APPLIED',2)`, [author, group, id, commandId, operation]);
        }
        await client.query('COMMIT');
        return { id, groupId: group, authorId: author, state, uploadId, intentionId, fileId, sha256: file.sha256 };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    const prepared = await seedMaterial('PREPARED');
    const published = await seedMaterial('PUBLISHED', groupId, teacher.userId, 'png-valid');
    const withdrawn = await seedMaterial('WITHDRAWN', groupId, teacher.userId, 'jpeg-valid');
    const otherPublished = await seedMaterial('PUBLISHED', otherGroupId, otherTeacher.userId);
    const cancelledPublished = await seedMaterial('PUBLISHED', cancelledGroupId, admin.userId);
    await pool.query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Cancelación ficticia',
      "cancelledAt"=clock_timestamp(),revision=revision+1 WHERE id=$1`, [cancelledGroupId]);
    return { ...context, pool, courseId, groupId, otherGroupId, cancelledGroupId,
      admin, teacher, otherTeacher, ineligibleTeacher, student, historicalStudent, otherStudent, unEnrolledStudent,
      reservationStudent, pendingStudent, incidentStudent, disabledStudent, revokedStudent,
      prepared, published, withdrawn, otherPublished, cancelledPublished, seedMaterial };
  } catch (error) { await context.cleanup(); throw error; }
}
export type MaterialsFixture = Awaited<ReturnType<typeof materialsFixture>>;
