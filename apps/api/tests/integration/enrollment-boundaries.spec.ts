import { expect, test } from 'vitest';
import type { PoolClient } from 'pg';
import { preEnrollmentDatabase, seedEnrollmentGraph } from '../support/enrollment-migration.js';
import type { EnrollmentMigrationContext } from '../support/enrollment-migration.js';
import { createEnrollmentCalendar, instantFromEpochText, postgresInstantParameter, readOriginalPeriodBounds } from '../../src/modules/enrollment/infrastructure/temporal.js';
import { formatInstant, parseInstant, reservationExpiresAt } from '../../src/modules/enrollment/domain/instant.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';

async function inDatabase(operation: (client: PoolClient, context: EnrollmentMigrationContext) => Promise<void>, financial = false) {
  const context = await preEnrollmentDatabase();
  try {
    if (financial) await context.applyEnrollment();
    const client = await context.database.pool.connect();
    try { await client.query('BEGIN'); await operation(client, context); }
    finally { await client.query('ROLLBACK'); client.release(); }
  } finally { await context.cleanup(); }
}
for (const zone of ['UTC', 'America/Lima', 'Asia/Tokyo']) {
  test.each([
    ['0001-01-01', '0001-01-01T05:08:12.000000Z', '0001-01-02T05:08:12.000000Z'],
    ['1800-01-01', '1800-01-01T05:08:12.000000Z', '1800-01-02T05:08:12.000000Z'],
    ['1990-02-01', '1990-02-01T04:00:00.000000Z', '1990-02-02T04:00:00.000000Z'],
    ['9999-12-31', '9999-12-31T05:00:00.000000Z', '+010000-01-01T05:00:00.000000Z'],
  ])(`T009 límites originales de %s con conexión ${zone}`, async (date, start, end) => {
    await inDatabase(async client => {
      await client.query("SELECT set_config('TimeZone',$1,true)", [zone]);
      const bounds = await createEnrollmentCalendar(client).originalBounds(date, date);
      expect(formatInstant(bounds.groupStartAt)).toBe(start);
      expect(formatInstant(bounds.enrollmentValidUntil)).toBe(end);
      expect(Object.isFrozen(bounds)).toBe(true);
    });
  });
}
test.each(['1969-12-31T23:59:59.999999Z', '0001-01-01T00:00:00.000001Z',
  '2026-11-01T00:00:00.123456Z', '+010000-01-01T05:00:00.000000Z'])(
  'T009 persistencia timestamptz(6) exacta %s y plazo fijo', async text => {
    await inDatabase(async (client, context) => {
      const input = parseInstant(text), expires = reservationExpiresAt(input);
      const graph = await seedEnrollmentGraph(context, { table: 'EnrollmentOrder', values: {
        confirmedAt: postgresInstantParameter(input), expiresAt: postgresInstantParameter(expires),
      } });
      const row = (await client.query<{ start: string; end: string }>(`SELECT
        (extract(epoch FROM "confirmedAt")*1000000)::numeric(30,0)::text AS start,
        (extract(epoch FROM "expiresAt")*1000000)::numeric(30,0)::text AS end
        FROM "EnrollmentOrder" WHERE id=$1`, [graph.rows.EnrollmentOrder!.id])).rows[0];
      expect(instantFromEpochText(row.start)).toBe(input);
      expect(instantFromEpochText(row.end)).toBe(expires);
      expect(formatInstant(instantFromEpochText(row.start))).toBe(text);
      expect(instantFromEpochText(row.end) - instantFromEpochText(row.start)).toBe(86_400_000_000n);
    }, true);
  });
test('T009 entradas civiles inválidas no llegan a consulta PG', async () => {
  await inDatabase(async client => {
    const calendar = createEnrollmentCalendar(client);
    await expect(calendar.originalBounds('1900-02-29', '1900-03-01')).rejects.toMatchObject({ code: 'INVALID_CIVIL_DATE' });
    await expect(calendar.originalBounds('2026-02-02', '2026-02-01')).rejects.toMatchObject({ code: 'INVALID_INSTANT' });
    // La transacción sigue utilizable: no se provocó un error SQL para validar entradas.
    expect((await client.query('SELECT 1 AS value')).rows[0].value).toBe(1);
  });
});
test.each(['-0', '01', '1.000000', 'NaN', 'Infinity', '1\n', null, 1])(
  'T009 texto epoch inválido no se redondea %s', value => {
    expect(() => instantFromEpochText(value)).toThrow();
  });
test('T009 lee límite congelado aunque el período actual de oferta cambie', async () => {
  const context = await preEnrollmentDatabase();
  try {
    await context.applyEnrollment();
    const graph = await seedEnrollmentGraph(context);
    const client = await context.database.pool.connect();
    try {
      const id = String(graph.rows.EnrollmentOrderItem!.id);
      const before = await readOriginalPeriodBounds(client, id);
      await client.query(`UPDATE "AcademicGroup" SET "periodEnd"='2031-12-31' WHERE id=$1`, [context.groupId]);
      const after = await readOriginalPeriodBounds(client, id);
      expect(after).toEqual(before);
      expect(formatInstant(after.enrollmentValidUntil)).toBe('2030-02-01T05:00:00.000000Z');
      const current = await createEnrollmentCalendar(client).originalBounds('2030-01-07', '2031-12-31');
      expect(current.enrollmentValidUntil).not.toBe(after.enrollmentValidUntil);
    } finally { client.release(); }
  } finally { await context.cleanup(); }
}, 120000);
test('T010 participante descubre padres/docente y snapshot explícito sin tomar locks', async () => {
  await inDatabase(async (client, context) => {
    const offering = createReservationOfferingParticipant(client);
    const refs = await offering.discover([context.groupId]);
    expect(refs).toEqual([{ groupId: context.groupId, courseId: context.courseId, teacherUserId: context.teacher.userId }]);
    const [snapshot] = await offering.snapshots([context.groupId]);
    expect(snapshot.groupId).toBe(context.groupId); expect(snapshot.courseId).toBe(context.courseId);
    expect(snapshot.groupRevision).toBe('1'); expect(snapshot.courseRevision).toBe('1');
    expect(snapshot.teacherEligibilityVersion).toBeTypeOf('bigint');
    expect(snapshot.schedule).toEqual([{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }]);
    expect(Object.keys(snapshot).sort()).toEqual(['groupId','courseId','teacherUserId','courseName','groupName','courseRevision','groupRevision',
      'courseState','groupState','studentVisible','teacherReviewRequired','teacherName','teacherEligible','teacherEligibilityVersion',
      'publishedTeacherUserId','publishedTeacherEligibilityVersion','periodStart','periodEnd','timeZone','capacity','schedule'].sort());
    expect(Object.isFrozen(snapshot)).toBe(true); expect(Object.isFrozen(snapshot.schedule[0])).toBe(true);
    expect(await offering.discover(['00000000-0000-4000-8000-000000000000'])).toEqual([]);
    expect(await offering.snapshots([])).toEqual([]);
    const locks = (await client.query(`SELECT mode FROM pg_locks WHERE pid=pg_backend_pid() AND relation IN
      ('"AcademicCourse"'::regclass,'"AcademicGroup"'::regclass) AND mode<>'AccessShareLock'`)).rows;
    expect(locks).toEqual([]);
    // Participante no hizo COMMIT: un cambio propio se revierte al cerrar inDatabase.
    await client.query(`UPDATE "AcademicGroup" SET name='Cambio transaccional ficticio' WHERE id=$1`, [context.groupId]);
    expect((await offering.snapshots([context.groupId]))[0].groupName).toBe('Cambio transaccional ficticio');
  });
});
test('T010 snapshot distingue publicación, ocultamiento y generación docente recuperada', async () => {
  await inDatabase(async (client, context) => {
    const offering = createReservationOfferingParticipant(client);
    const current = async () => (await offering.snapshots([context.groupId]))[0];
    expect((await current()).studentVisible).toBe(false);
    await client.query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`, [context.courseId]);
    await client.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId",
      "publishedTeacherEligibilityVersion"=$2 WHERE id=$1`, [context.groupId, (await current()).teacherEligibilityVersion!.toString()]);
    const published = await current();
    expect(published.studentVisible).toBe(true); expect(published.teacherReviewRequired).toBe(false);
    await client.query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [context.teacher.userId]);
    const hidden = await current();
    expect(hidden.teacherEligible).toBe(false); expect(hidden.studentVisible).toBe(false);
    expect(hidden.teacherEligibilityVersion).toBe(published.teacherEligibilityVersion! + 1n);
    await client.query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`, [context.teacher.userId]);
    const recovered = await current();
    expect(recovered.teacherEligible).toBe(true); expect(recovered.teacherReviewRequired).toBe(true);
    expect(recovered.studentVisible).toBe(false);
    expect(recovered.publishedTeacherEligibilityVersion).toBe(published.publishedTeacherEligibilityVersion);
    // Los snapshots anteriores son valores congelados, no vistas mutables del participante.
    expect(published.studentVisible).toBe(true);
  });
});
