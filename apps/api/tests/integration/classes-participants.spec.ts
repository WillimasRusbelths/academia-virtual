import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { classesTemporalFixture, type ClassesTemporalFixture } from '../support/classes-temporal.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { createClassesGroupParticipant } from '../../src/modules/academic-offering/infrastructure/classes-participant.js';
import { createClassesEnrollmentDiscovery, createClassesEnrollmentParticipant } from '../../src/modules/enrollment/infrastructure/classes-participant.js';
import type { ClassesEnrollmentDecision, ClassesEnrollmentScope, ClassesEnrollmentAccess } from '../../src/modules/enrollment/public/classes-access.js';
import { PostgresTeachingDirectory } from '../../src/modules/users/infrastructure/teaching-directory.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { SessionLookup } from '../../src/modules/authorization/application/session-lookup.js';
import { CLASSES_MANAGEMENT_POLICY, CLASSES_PARTICIPATION_POLICY } from '../../src/modules/authorization/public/session.js';

let f: ClassesTemporalFixture, before: string;
beforeAll(async () => { f = await classesTemporalFixture(); }, 120000);
beforeEach(async () => { await f.set(f.base); before = await financialFingerprint(f.pool); });
afterEach(async () => { if (f) { expect(await financialFingerprint(f.pool)).toBe(before); await f.set(f.base); } });
afterAll(async () => { await f?.cleanup(); });

/** Participant contract only. This fixture owns its transaction/token; it does
 * not substitute or claim to test the pending T014 authority coordinator. */
async function run<T>(apply: (client: PoolClient, decision: ClassesEnrollmentDecision, scope: ClassesEnrollmentScope) => Promise<T>) {
  const client = await f.pool.connect(); let active = true;
  try {
    await client.query('BEGIN');
    const at = (await client.query(`SELECT (extract(epoch FROM clock_timestamp())*1000000)::numeric(30,0)::text AS at`)).rows[0].at;
    const decision = Object.freeze({ at: BigInt(at) });
    const scope: ClassesEnrollmentScope = {
      assertDecision(token) { if (!active || token !== decision) throw new Error('Inactive or foreign fixture decision'); },
      async use(operation) { if (!active) throw new Error('Inactive fixture scope'); return operation(); },
    };
    return await apply(client, decision, scope);
  } finally { active = false; await client.query('ROLLBACK'); client.release(); }
}
const matrix = (['ADMIN', 'TEACHER', 'STUDENT'] as const).flatMap((role, index) =>
  (['classes:manage-all', 'classes:manage-own', 'classes:participate-enrolled'] as const)
    .map((permission, p) => ({ role, permission, allowed: index === p })));
test.each(matrix)('sesión primaria y revalidación transaccional $role / $permission = $allowed', async ({ role, permission, allowed }) => {
  const sessions = new PostgresSessionStore(f.pool), account = role === 'ADMIN' ? f.admin : role === 'TEACHER' ? f.teacher : f.student;
  const actor = (await sessions.lookup(account.secret))!;
  const result = new SessionLookup(sessions).authorize(account.secret, permission);
  if (allowed) expect(await result).toEqual(actor); else await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await run(async client => {
    const check = sessions.revalidateInTransaction(client, actor, permission);
    if (allowed) await expect(check).resolves.toBeUndefined(); else await expect(check).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
test('tuplas cerradas usan sesiones reales; revocación, cuenta inactiva y visitante se deniegan', async () => {
  const lookup = new SessionLookup(new PostgresSessionStore(f.pool));
  for (const account of [f.admin, f.teacher]) expect((await lookup.authorize(account.secret, CLASSES_MANAGEMENT_POLICY)).userId).toBe(account.userId);
  await expect(lookup.authorize(f.student.secret, CLASSES_MANAGEMENT_POLICY)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  for (const account of [f.admin, f.teacher, f.student]) expect((await lookup.authorize(account.secret, CLASSES_PARTICIPATION_POLICY)).userId).toBe(account.userId);
  for (const secret of [null, f.disabledStudent.secret, f.revokedStudent.secret, 'synthetic-unknown-secret'])
    await expect(lookup.authorize(secret, CLASSES_PARTICIPATION_POLICY)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
});
test('oferta descubre referencias mínimas y responsables actuales; autoría no concede gestión', async () => {
  await run(async client => {
    const value = createClassesGroupParticipant(client, new PostgresTeachingDirectory(client));
    expect(await value.discover([f.groupId, randomUUID(), f.groupId])).toEqual([{ groupId: f.groupId, courseId: f.courseId, teacherUserId: f.teacher.userId }]);
    const own = await value.managedReferences(f.teacher.userId, 'TEACHER');
    expect(own.map(r => r.groupId)).toContain(f.groupId); expect(own.map(r => r.groupId)).toContain(f.withdrawnGroupId);
    expect(own.map(r => r.groupId)).not.toContain(f.cancelledGroupId); expect(own.map(r => r.groupId)).not.toContain(f.otherGroupId);
    expect(await value.managedReferences(f.previousTeacher.userId, 'TEACHER')).toEqual([]);
    expect((await value.managedReferences(f.admin.userId, 'ADMIN')).map(r => r.groupId)).toContain(f.cancelledGroupId);
    expect(await value.managedReferences(f.student.userId, 'STUDENT' as 'TEACHER')).toEqual([]);
  });
});
test('snapshots distinguen retirada/cancelación y elegibilidad actual sin filtrar por catálogo', async () => {
  await run(async client => {
    const value = createClassesGroupParticipant(client, new PostgresTeachingDirectory(client));
    const rows = await value.snapshots([f.withdrawnGroupId, f.cancelledGroupId, f.disabledTeacherGroupId]);
    expect(rows.find(r => r.groupId === f.withdrawnGroupId)).toMatchObject({ state: 'WITHDRAWN', courseState: 'DRAFT', teacherEligible: true });
    expect(rows.find(r => r.groupId === f.cancelledGroupId)?.state).toBe('CANCELLED');
    expect(rows.find(r => r.groupId === f.disabledTeacherGroupId)?.teacherEligible).toBe(false);
    expect(Object.keys(rows[0]).sort()).toEqual(['groupId', 'courseId', 'teacherUserId', 'name', 'courseName', 'courseState', 'state', 'teacherEligible'].sort());
  });
});
test('la proyección de alumno no consulta la elegibilidad docente', async () => {
  await run(async client => {
    const teachers = new PostgresTeachingDirectory(client), find = vi.spyOn(teachers, 'find').mockRejectedValue(new Error('synthetic directory unavailable'));
    try {
      const value = createClassesGroupParticipant(client, teachers);
      expect((await value.snapshots([f.disabledTeacherGroupId], 'STUDENT'))[0].teacherEligible).toBe(false);
      expect(find).not.toHaveBeenCalled();
      await expect(value.snapshots([f.groupId])).rejects.toThrow('synthetic directory unavailable');
    } finally { find.mockRestore(); }
  });
});
test('oferta observa cambios no confirmados solo en la conexión titular y no abre otra transacción', async () => {
  const previous = (await f.pool.query('SELECT name FROM "AcademicCourse" WHERE id=$1', [f.courseId])).rows[0].name;
  await run(async client => {
    await client.query('UPDATE "AcademicCourse" SET name=\'Nombre no confirmado\' WHERE id=$1', [f.courseId]);
    await client.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [f.otherTeacher.userId, f.groupId]);
    const value = createClassesGroupParticipant(client, new PostgresTeachingDirectory(client));
    const query = vi.spyOn(client, 'query');
    try {
      expect((await value.snapshots([f.groupId]))[0]).toMatchObject({ courseName: 'Nombre no confirmado', teacherUserId: f.otherTeacher.userId });
      expect((await value.discover([f.groupId]))[0].teacherUserId).toBe(f.otherTeacher.userId);
      expect(query.mock.calls.every(c => typeof c[0] === 'string' && !/\b(BEGIN|COMMIT|ROLLBACK|FOR UPDATE|FOR SHARE)\b/.test(c[0]))).toBe(true);
      expect((await f.pool.query('SELECT name FROM "AcademicCourse" WHERE id=$1', [f.courseId])).rows[0].name).toBe(previous);
    } finally { query.mockRestore(); }
  });
  expect((await f.pool.query('SELECT name FROM "AcademicCourse" WHERE id=$1', [f.courseId])).rows[0].name).toBe(previous);
});
for (const [boundary, offset, allowed] of [
  ['confirmedAt', -1n, false], ['confirmedAt', 0n, true], ['confirmedAt', 1n, true],
  ['validUntil', -1n, true], ['validUntil', 0n, false], ['validUntil', 1n, false],
] as const) test(`matrícula original ${boundary} ${offset} μs = ${allowed}, también objetivo de moderación`, async () => {
  await f.set(f[boundary] + offset);
  await run(async (client, decision, scope) => {
    const value = createClassesEnrollmentParticipant(client, scope);
    expect(decision.at).toBe(f[boundary] + offset);
    expect(await value.hasAccess(f.temporalStudent.userId, f.groupId, decision)).toBe(allowed);
    expect(await value.groups(f.temporalStudent.userId, decision)).toEqual(allowed ? [{ groupId: f.groupId, courseId: f.courseId }] : []);
  });
});
test('descubrir historia/futuro no autoriza; reserva, pendiente, incidente y grupo ajeno no son matrícula vigente', async () => {
  await run(async (client, decision, scope) => {
    const discovery = createClassesEnrollmentDiscovery(client), value = createClassesEnrollmentParticipant(client, scope);
    expect(await discovery.references(f.historicalStudent.userId)).toEqual([{ groupId: f.groupId, courseId: f.courseId }]);
    expect(await discovery.references(f.temporalStudent.userId)).toEqual([{ groupId: f.groupId, courseId: f.courseId }]);
    for (const account of [f.historicalStudent, f.temporalStudent, f.unEnrolledStudent, f.reservationStudent, f.pendingStudent, f.incidentStudent]) {
      expect(await value.hasAccess(account.userId, f.groupId, decision)).toBe(false);
      expect(await value.groups(account.userId, decision)).toEqual([]);
    }
    expect(await value.hasAccess(f.otherStudent.userId, f.groupId, decision)).toBe(false);
    expect(await value.hasAccess(f.secondStudent.userId, f.groupId, decision)).toBe(true);
    expect(await value.groups(f.otherStudent.userId, decision)).toEqual([{ groupId: f.otherGroupId, courseId: f.courseId }]);
  });
});
test('período actual, catálogo y cancelación no alteran los hechos originales leídos por matrícula', async () => {
  await f.set(f.validUntil);
  await run(async (client, decision, scope) => {
    await client.query(`UPDATE "AcademicGroup" SET "periodEnd"='2091-03-31' WHERE id=$1`, [f.groupId]);
    const value = createClassesEnrollmentParticipant(client, scope);
    expect(await value.hasAccess(f.temporalStudent.userId, f.groupId, decision)).toBe(false);
  });
  await f.set(f.base);
  await run(async (client, decision, scope) => {
    const value = createClassesEnrollmentParticipant(client, scope);
    expect(await value.hasAccess(f.withdrawnStudent.userId, f.withdrawnGroupId, decision)).toBe(true);
    // Offering cancellation must still be denied separately by T014.
    expect(await value.hasAccess(f.cancelledStudent.userId, f.cancelledGroupId, decision)).toBe(true);
  });
});
test('matrícula exige token propio, scope activo y precisión válida, sin locks financieros o transacciones internas', async () => {
  let leaked: ClassesEnrollmentAccess | undefined, token: ClassesEnrollmentDecision | undefined;
  await run(async (client, decision, scope) => {
    const value = createClassesEnrollmentParticipant(client, scope); leaked = value; token = decision;
    await expect(value.hasAccess(f.student.userId, f.groupId, { at: decision.at })).rejects.toThrow('foreign fixture decision');
    const query = vi.spyOn(client, 'query');
    try {
      expect(await value.hasAccess(f.student.userId, f.groupId, decision)).toBe(true);
      await value.groups(f.student.userId, decision); await createClassesEnrollmentDiscovery(client).references(f.student.userId);
      const texts = query.mock.calls.map(c => String(c[0]));
      expect(texts.every(sql => !/\b(BEGIN|COMMIT|ROLLBACK|FOR UPDATE|FOR SHARE)\b|Payment|Reservation|EnrollmentOrder/.test(sql))).toBe(true);
      expect(texts.every(sql => sql.includes('FROM "Enrollment"'))).toBe(true);
    } finally { query.mockRestore(); }
    const invalid = { at: 10n ** 30n };
    await expect(createClassesEnrollmentParticipant(client, { ...scope, assertDecision: () => {} })
      .hasAccess(f.student.userId, f.groupId, invalid)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
  });
  await expect(leaked!.hasAccess(f.student.userId, f.groupId, token!)).rejects.toThrow('Inactive');
  await expect(leaked!.groups(f.student.userId, token!)).rejects.toThrow('Inactive');
});
