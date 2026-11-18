import { randomBytes, randomUUID } from 'node:crypto';
import { identityDatabase } from './identity-database.js';
import { assertAcademicFixtureInputs } from './academic-offering.js';
import { sessionFixture } from './session-fixture.js';
import { seedCommitment } from './enrollment-maintenance.js';
import { insertEnrollmentRow } from './enrollment-migration.js';
import type { ClassState } from '../../src/modules/classes/public/classes.js';

/** Synthetic facts only, in a fresh guarded t_ schema. Enrollment/payment facts
 * belong to the existing 003 helpers; this is never a product payment adapter. */
export async function classesFixture() {
  assertAcademicFixtureInputs();
  const context = await identityDatabase('classes_fixture');
  try {
    const pool = context.database.pool;
    const admin = await sessionFixture(context, 'ADMIN'), secondAdmin = await sessionFixture(context, 'ADMIN');
    const teacher = await sessionFixture(context, 'TEACHER'), previousTeacher = await sessionFixture(context, 'TEACHER');
    const otherTeacher = await sessionFixture(context, 'TEACHER'), disabledTeacher = await sessionFixture(context, 'TEACHER');
    const student = await sessionFixture(context), secondStudent = await sessionFixture(context);
    const otherStudent = await sessionFixture(context), unEnrolledStudent = await sessionFixture(context);
    const reservationStudent = await sessionFixture(context), pendingStudent = await sessionFixture(context);
    const incidentStudent = await sessionFixture(context), historicalStudent = await sessionFixture(context);
    const disabledStudent = await sessionFixture(context), revokedStudent = await sessionFixture(context);
    const withdrawnStudent = await sessionFixture(context), cancelledStudent = await sessionFixture(context);
    const courseId = randomUUID();
    await pool.query(`INSERT INTO "AcademicCourse" (id,name,description)
      VALUES ($1,'Curso ficticio de clases','Datos exclusivos del ensayo')`, [courseId]);
    async function seedGroup(teacherId = teacher.userId) {
      const id = randomUUID();
      await pool.query(`WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at)
        INSERT INTO "AcademicGroup" (id,"courseId",name,"teacherUserId",capacity,"periodStart","periodEnd","createdAt","updatedAt")
        SELECT $1,$2,'Grupo ficticio',$3,50,'2090-01-02','2090-03-31',instant.at,instant.at FROM instant`, [id, courseId, teacherId]);
      return id;
    }
    const groupId = await seedGroup(), otherGroupId = await seedGroup(otherTeacher.userId);
    const cancelledGroupId = await seedGroup(), withdrawnGroupId = await seedGroup();
    const disabledTeacherGroupId = await seedGroup(disabledTeacher.userId);
    let sequence = 0;
    async function commitment(actor: typeof student, kind: Parameters<typeof seedCommitment>[1], group = groupId) {
      await seedCommitment({ ...context, courseId, groupId: group, student: actor }, kind, pool, String(++sequence));
    }
    for (const actor of [student, secondStudent, disabledStudent, revokedStudent]) await commitment(actor, 'ENROLLED');
    await commitment(otherStudent, 'ENROLLED', otherGroupId);
    await commitment(withdrawnStudent, 'ENROLLED', withdrawnGroupId);
    await commitment(cancelledStudent, 'ENROLLED', cancelledGroupId);
    await commitment(reservationStudent, 'RESERVED'); await commitment(pendingStudent, 'RESERVED');
    await commitment(incidentStudent, 'INCIDENT'); await commitment(historicalStudent, 'FINISHED');
    const order = (await pool.query('SELECT id FROM "EnrollmentOrder" WHERE "studentId"=$1', [pendingStudent.userId])).rows[0].id;
    await insertEnrollmentRow(pool, 'PaymentAttempt', { id: randomUUID(), orderId: order,
      studentId: pendingStudent.userId, initiationId: randomUUID(), payloadDigest: randomBytes(32), state: 'PENDING',
      merchantReference: `fixture-classes-${randomUUID()}`, externalIdempotencyKey: randomUUID(),
      providerScope: 'fixture/provider/merchant/sandbox', providerReference: 'fictional-pending' });

    // Direct SQL creates facts, never an alternative implementation of authority.
    async function seedClass(state: ClassState = 'PREPARED', group = groupId, author = previousTeacher.userId) {
      const id = randomUUID(), client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at)
          INSERT INTO "ClassSession" (id,"groupId",title,"createdBy","updatedBy","createdAt","updatedAt")
          SELECT $1,$2,'Clase ficticia',$3,$3,instant.at,instant.at FROM instant`, [id, group, author]);
        if (state === 'LIVE' || state === 'FINISHED') await client.query(`WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at)
          UPDATE "ClassSession" SET state='LIVE',"startedAt"=instant.at,"updatedAt"=instant.at,revision=2 FROM instant WHERE id=$1`, [id]);
        if (state === 'FINISHED') await client.query(`WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at)
          UPDATE "ClassSession" SET state='FINISHED',"finishedAt"=instant.at,"updatedAt"=instant.at,revision=3 FROM instant WHERE id=$1`, [id]);
        if (state === 'CANCELLED') await client.query(`WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at)
          UPDATE "ClassSession" SET state='CANCELLED',"cancelledAt"=instant.at,"updatedAt"=instant.at,revision=2 FROM instant WHERE id=$1`, [id]);
        await client.query('COMMIT'); return { id, groupId: group, authorId: author, state };
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    }
    async function seedMessage(classId: string, authorId = student.userId) {
      const id = randomUUID(), client = await pool.connect();
      try {
        await client.query('BEGIN');
        const seq = (await client.query(`UPDATE "ClassSession" SET "lastEventSeq"="lastEventSeq"+1
          WHERE id=$1 RETURNING "lastEventSeq"::text AS seq`, [classId])).rows[0].seq;
        await client.query(`INSERT INTO "ClassMessage" (id,"classId","authorId","messageSeq",text,"acceptedAt")
          VALUES ($1,$2,$3,$4,'Pregunta ficticia sin datos personales',clock_timestamp())`, [id, classId, authorId, seq]);
        await client.query(`INSERT INTO "ClassChange" ("classId","eventSeq",type,"actorId","messageId","occurredAt")
          VALUES ($1,$2,'MESSAGE_SENT',$3,$4,clock_timestamp())`, [classId, seq, authorId, id]);
        await client.query('COMMIT'); return { id, classId, authorId, messageSeq: seq };
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    }
    // Finish the historical session before opening the current LIVE session.
    const prepared = await seedClass(), finished = await seedClass('FINISHED'), live = await seedClass('LIVE');
    const cancelled = await seedClass('CANCELLED'), otherLive = await seedClass('LIVE', otherGroupId, otherTeacher.userId);
    const withdrawnLive = await seedClass('LIVE', withdrawnGroupId), cancelledGroupLive = await seedClass('LIVE', cancelledGroupId);
    const disabledTeacherLive = await seedClass('LIVE', disabledTeacherGroupId, disabledTeacher.userId);
    const message = await seedMessage(live.id), secondMessage = await seedMessage(live.id, secondStudent.userId);
    const historicalMessage = await seedMessage(finished.id), otherMessage = await seedMessage(otherLive.id, otherStudent.userId);
    await pool.query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Cancelación ficticia',
      "cancelledAt"=clock_timestamp() WHERE id=$1`, [cancelledGroupId]);
    await pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId",
      "publishedTeacherEligibilityVersion"=(SELECT "teacherEligibilityVersion" FROM "User" WHERE id=$2) WHERE id=$1`,
    [withdrawnGroupId, teacher.userId]);
    await pool.query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`, [withdrawnGroupId]);
    await pool.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=ANY($1::uuid[])`,
      [[disabledTeacher.userId, disabledStudent.userId]]);
    await pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [revokedStudent.sessionId]);
    return { ...context, pool, courseId, groupId, otherGroupId, cancelledGroupId, withdrawnGroupId, disabledTeacherGroupId,
      admin, secondAdmin, teacher, previousTeacher, otherTeacher, disabledTeacher,
      student, secondStudent, otherStudent, unEnrolledStudent, reservationStudent, pendingStudent, incidentStudent,
      historicalStudent, disabledStudent, revokedStudent, withdrawnStudent, cancelledStudent,
      prepared, live, finished, cancelled, otherLive, withdrawnLive, cancelledGroupLive, disabledTeacherLive,
      message, secondMessage, historicalMessage, otherMessage, seedGroup, seedClass, seedMessage };
  } catch (error) { await context.cleanup(); throw error; }
}
export type ClassesFixture = Awaited<ReturnType<typeof classesFixture>>;
