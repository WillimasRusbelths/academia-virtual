import { afterAll, beforeAll, expect, test } from 'vitest';
import { classesTemporalFixture, type ClassesTemporalFixture } from '../support/classes-temporal.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';

let f: ClassesTemporalFixture;
beforeAll(async () => { f = await classesTemporalFixture(); }, 120000);
afterAll(async () => { await f?.cleanup(); });

test('fixtures de clases solo usan esquema aleatorio y runtime sin CREATE', async () => {
  expect(f.environment.databaseSchema).toMatch(/^t_classes_fixture_[a-f0-9]+$/);
  expect((await f.pool.query("SELECT has_schema_privilege(current_user,current_schema(),'CREATE') AS allowed")).rows[0].allowed).toBe(false);
  expect(f.student.userId).not.toBe(f.secondStudent.userId);
  expect(f.teacher.userId).not.toBe(f.previousTeacher.userId);
  // Helpers created after installing the frozen clock must use that same clock,
  // including both timestamps of a transition (never two wall-clock readings).
  const group = await f.seedGroup(), session = await f.seedClass('FINISHED', group);
  const times = (await f.pool.query(`SELECT
    (extract(epoch FROM "createdAt")*1000000)::numeric(30,0)::text AS created,
    (extract(epoch FROM "updatedAt")*1000000)::numeric(30,0)::text AS updated,
    (extract(epoch FROM "finishedAt")*1000000)::numeric(30,0)::text AS finished
    FROM "ClassSession" WHERE id=$1`, [session.id])).rows[0];
  expect([times.created, times.updated, times.finished]).toEqual([f.base, f.base, f.base].map(String));
});
test('grupos retirados y cancelados son hechos distintos; autor anterior no es responsable actual', async () => {
  const rows = (await f.pool.query(`SELECT id,state,"teacherUserId" FROM "AcademicGroup" WHERE id=ANY($1::uuid[])`,
    [[f.groupId, f.otherGroupId, f.cancelledGroupId, f.withdrawnGroupId]])).rows;
  expect(rows.find(r => r.id === f.cancelledGroupId).state).toBe('CANCELLED');
  expect(rows.find(r => r.id === f.withdrawnGroupId).state).toBe('WITHDRAWN');
  expect(rows.find(r => r.id === f.groupId).teacherUserId).toBe(f.teacher.userId);
  expect(f.live.authorId).toBe(f.previousTeacher.userId);
});
test('matrícula confirmada, reserva, pago pendiente e incidente conservan hechos propios de 003', async () => {
  for (const actor of [f.student, f.secondStudent, f.withdrawnStudent, f.cancelledStudent]) {
    const row = (await f.pool.query(`SELECT e."studentId",p."providerScope",p."reconciliationState",i."courseName"
      FROM "Enrollment" e JOIN "VerifiedPayment" p ON p.id=e."paymentId"
      JOIN "EnrollmentOrderItem" i ON i.id=e."orderItemId" WHERE e."studentId"=$1`, [actor.userId])).rows[0];
    expect(row).toMatchObject({ studentId: actor.userId, providerScope: 'fixture/provider/merchant/sandbox',
      reconciliationState: 'APPLIED', courseName: 'Curso original ficticio' });
  }
  for (const actor of [f.unEnrolledStudent, f.reservationStudent, f.pendingStudent, f.incidentStudent])
    expect((await f.pool.query('SELECT id FROM "Enrollment" WHERE "studentId"=$1', [actor.userId])).rowCount).toBe(0);
  expect((await f.pool.query('SELECT state FROM "PaymentAttempt" WHERE "studentId"=$1', [f.pendingStudent.userId])).rows[0].state).toBe('PENDING');
  expect((await f.pool.query('SELECT id FROM "PaymentIncident"')).rowCount).toBe(1);
});
test('sesiones, cuentas deshabilitadas y matrícula histórica se preparan independientemente', async () => {
  expect((await f.pool.query('SELECT "revokedAt" IS NOT NULL AS revoked FROM "Session" WHERE id=$1', [f.revokedStudent.sessionId])).rows[0].revoked).toBe(true);
  expect((await f.pool.query('SELECT status FROM "User" WHERE id=ANY($1::uuid[])', [[f.disabledTeacher.userId, f.disabledStudent.userId]])).rows.map(r => r.status)).toEqual(['DISABLED', 'DISABLED']);
  expect((await f.pool.query('SELECT "validUntil"<pg_catalog.clock_timestamp() AS ended FROM "Enrollment" WHERE "studentId"=$1', [f.historicalStudent.userId])).rows[0].ended).toBe(true);
});
test('clases terminales, LIVE por grupo y mensajes ficticios cumplen restricciones reales', async () => {
  expect((await f.pool.query('SELECT state FROM "ClassSession" WHERE id=$1', [f.finished.id])).rows[0].state).toBe('FINISHED');
  expect((await f.pool.query('SELECT state FROM "ClassSession" WHERE id=$1', [f.cancelled.id])).rows[0].state).toBe('CANCELLED');
  expect((await f.pool.query(`SELECT "lastEventSeq"::text AS seq,revision::text FROM "ClassSession" WHERE id=$1`, [f.live.id])).rows[0]).toEqual({ seq: '2', revision: '2' });
  expect((await f.pool.query('SELECT "authorId" FROM "ClassMessage" WHERE "classId"=$1 ORDER BY "messageSeq"', [f.live.id])).rows.map(r => r.authorId)).toEqual([f.student.userId, f.secondStudent.userId]);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "ClassChange" WHERE "classId"=$1', [f.live.id])).rows[0].n).toBe(2);
});
test.each([-1n, 0n, 1n])('reloj conserva fin %+s microsegundos sin redondear ni cambiar matrícula', async offset => {
  const before = await financialFingerprint(f.pool);
  try {
    await f.set(f.validUntil + offset);
    const row = (await f.pool.query(`SELECT
      (extract(epoch FROM clock_timestamp())*1000000)::numeric(30,0)::text AS at,
      "confirmedAt"<=clock_timestamp() AND clock_timestamp()<"validUntil" AS active
      FROM "Enrollment" WHERE "studentId"=$1`, [f.temporalStudent.userId])).rows[0];
    expect(BigInt(row.at)).toBe(f.validUntil + offset); expect(row.active).toBe(offset < 0n);
    expect(await financialFingerprint(f.pool)).toBe(before);
  } finally { await f.set(f.base); }
});
test('reloj conserva el comienzo inclusivo sin modificar la matrícula original', async () => {
  const before = await financialFingerprint(f.pool);
  try {
    for (const offset of [-1n, 0n, 1n]) {
      await f.set(f.confirmedAt + offset);
      expect((await f.pool.query(`SELECT "confirmedAt"<=clock_timestamp() AND clock_timestamp()<"validUntil" AS active
        FROM "Enrollment" WHERE "studentId"=$1`, [f.temporalStudent.userId])).rows[0].active).toBe(offset >= 0n);
    }
    expect(await financialFingerprint(f.pool)).toBe(before);
  } finally { await f.set(f.base); }
});
