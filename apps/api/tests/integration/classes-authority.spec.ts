import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { classesTemporalFixture, type ClassesTemporalFixture } from '../support/classes-temporal.js';
import { classesFoundation } from '../support/classes-foundation.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import type { ClassesCapabilities, ClassesPermission, ClassesTarget } from '../../src/modules/classes/application/ports.js';

// T009 writes executable red tests. T014/T017 supply the real composition seam.
// No skips, permissive substitutes or missing imports count as authority evidence.
let f: ClassesTemporalFixture;
beforeAll(async () => { f = await classesTemporalFixture(); }, 120000);
afterAll(async () => { await f?.cleanup(); });
type Account = { userId: string; sessionId: string };
function actor(account: Account, role: SessionActor['role'] = 'STUDENT'): SessionActor {
  return { userId: account.userId, sessionId: account.sessionId, role, authVersion: 0n };
}
const target = () => classesFoundation(f.environment, f.pool);
const ref = (): ClassesTarget => ({ kind: 'CLASS', id: f.live.id });
async function rejected(who: SessionActor, permission: ClassesPermission, resource: ClassesTarget, code: string) {
  const before = await financialFingerprint(f.pool); let entered = false;
  const run = target(); // Absent implementation fails here, never as the expected rejection.
  await expect(run.run(who, permission, resource, 'READ', async () => { entered = true; })).rejects.toMatchObject({ code });
  expect(entered).toBe(false); expect(await financialFingerprint(f.pool)).toBe(before);
}
async function accepted(who: SessionActor, permission: ClassesPermission, resource = ref()) {
  const before = await financialFingerprint(f.pool); let entered = false;
  await target().run(who, permission, resource, 'READ', async context => {
    entered = true; expect(typeof context.decision.at).toBe('bigint');
  });
  expect(entered).toBe(true); expect(await financialFingerprint(f.pool)).toBe(before);
}

describe('T009 — matriz de autoridad vigente', () => {
  test('ADMIN y docente actual acceden; autor anterior y docente ajeno no heredan acceso', async () => {
    await accepted(actor(f.admin, 'ADMIN'), 'classes:manage-all');
    await accepted(actor(f.teacher, 'TEACHER'), 'classes:manage-own');
    for (const account of [f.previousTeacher, f.otherTeacher])
      await rejected(actor(account, 'TEACHER'), 'classes:manage-own', ref(), 'NOT_FOUND');
  });
  test('dos alumnos distintos acceden con su propia matrícula y permiso', async () => {
    for (const account of [f.student, f.secondStudent]) await accepted(actor(account), 'classes:participate-enrolled');
  });
  test.each(['otherStudent', 'unEnrolledStudent', 'reservationStudent', 'pendingStudent', 'incidentStudent', 'historicalStudent'] as const)('%s no obtiene contenido ni callback de otro derecho', async key => {
      await rejected(actor(f[key]), 'classes:participate-enrolled', ref(), 'NOT_FOUND');
    });
  test.each(['disabledStudent', 'revokedStudent'] as const)('%s pierde autoridad aunque la matrícula exista', async key => {
    await rejected(actor(f[key]), 'classes:participate-enrolled', ref(), 'AUTH_REQUIRED');
  });
  test('rol declarado o permiso desconocido no otorgan autoridad', async () => {
    await rejected(actor(f.teacher, 'ADMIN'), 'classes:manage-all', ref(), 'FORBIDDEN');
    await rejected(actor(f.student), 'classes:manage-all', ref(), 'FORBIDDEN');
    await rejected(actor(f.admin, 'ADMIN'), 'classes:unknown' as ClassesPermission, ref(), 'FORBIDDEN');
  });
  test('una referencia inexistente es indistinguible de una clase ajena', async () => {
    await rejected(actor(f.teacher, 'TEACHER'), 'classes:manage-own', { kind: 'CLASS', id: randomUUID() }, 'NOT_FOUND');
    await rejected(actor(f.teacher, 'TEACHER'), 'classes:manage-own', { kind: 'CLASS', id: f.otherLive.id }, 'NOT_FOUND');
  });
  test('retirar oferta conserva derecho original; cancelar impide contenido nuevo', async () => {
    await accepted(actor(f.withdrawnStudent), 'classes:participate-enrolled', { kind: 'CLASS', id: f.withdrawnLive.id });
    await rejected(actor(f.cancelledStudent), 'classes:participate-enrolled', { kind: 'CLASS', id: f.cancelledGroupLive.id }, 'NOT_FOUND');
  });
  test('historial FINISHED mantiene el derecho del alumno mientras su matrícula sea vigente', async () => {
    await accepted(actor(f.student), 'classes:participate-enrolled', { kind: 'CLASS', id: f.finished.id });
  });
  test('deshabilitar al docente no elimina el derecho propio del alumno', async () => {
    await f.pool.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [f.teacher.userId]);
    try { await accepted(actor(f.student), 'classes:participate-enrolled'); }
    finally { await f.pool.query(`UPDATE "User" SET status='ACTIVE',"disabledAt"=NULL WHERE id=$1`, [f.teacher.userId]); }
    await rejected(actor(f.disabledTeacher, 'TEACHER'), 'classes:manage-own', { kind: 'CLASS', id: f.disabledTeacherLive.id }, 'AUTH_REQUIRED');
  });
  test('silencio valida alumno objetivo del grupo, no una cuenta arbitraria', async () => {
    await accepted(actor(f.teacher, 'TEACHER'), 'classes:manage-own', { kind: 'STUDENT', classId: f.live.id, studentId: f.secondStudent.userId });
    for (const studentId of [f.otherStudent.userId, f.unEnrolledStudent.userId, f.teacher.userId, randomUUID()])
      await rejected(actor(f.teacher, 'TEACHER'), 'classes:manage-own', { kind: 'STUDENT', classId: f.live.id, studentId }, 'NOT_FOUND');
  });
});

// Trace real SQL, keeping a real client across rollback/retry. No mocked results.
async function trace<T>(work: (client: PoolClient) => Promise<T>, beforeQuery?: (text: string, writer: PoolClient) => Promise<void>) {
  const writer = await f.pool.connect(), client = await f.pool.connect();
  const sql: { text: string; values?: unknown }[] = [];
  const connect = vi.spyOn(f.pool, 'connect').mockImplementation((async () => client) as typeof f.pool.connect);
  const release = vi.spyOn(client, 'release').mockImplementation(() => {});
  const original = client.query.bind(client);
  const query = vi.spyOn(client, 'query').mockImplementation((async (...args: unknown[]) => {
    if (typeof args[0] === 'string') { sql.push({ text: args[0], values: args[1] }); await beforeQuery?.(args[0], writer); }
    return Reflect.apply(original, client, args);
  }) as typeof client.query);
  try { const result = await work(client); return { result, sql }; }
  finally { query.mockRestore(); release.mockRestore(); connect.mockRestore(); client.release(); writer.release(); }
}
describe('T009 — orden de locks y topología cambiante', () => {
  test('dos cuentas distintas serializan escrituras con COMMIT efectivo', async () => {
    const first = target(), otherPool = new Pool({ ...f.pool.options, max: 1 });
    f.clock.configure(otherPool);
    let release!: () => void, announce!: () => void, secondEntered = false;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { announce = resolve; });
    let firstWork: Promise<void> | undefined;
    let secondWork: Promise<{ ok: boolean; error?: unknown }> | undefined;
    try {
      const second = classesFoundation(f.environment, otherPool);
      const pid = (await otherPool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      firstWork = first.run(actor(f.admin, 'ADMIN'), 'classes:manage-all', ref(), 'WRITE', async () => {
        announce(); await gate;
      });
      await Promise.race([entered, firstWork.then(() => { throw new Error('First callback was not entered'); })]);
      secondWork = second.run(actor(f.secondAdmin, 'ADMIN'), 'classes:manage-all', ref(), 'WRITE', async () => { secondEntered = true; })
        .then(() => ({ ok: true }), error => ({ ok: false, error }));
      let blocked = false;
      for (let attempt = 0; attempt < 60 && !blocked; attempt++) {
        blocked = (await f.pool.query(`SELECT wait_event_type='Lock' AS blocked FROM pg_stat_activity WHERE pid=$1`, [pid])).rows[0]?.blocked === true;
        if (!blocked) await pause(25);
      }
      expect(blocked).toBe(true); expect(secondEntered).toBe(false);
      release(); await firstWork;
      expect(await secondWork).toEqual({ ok: true }); expect(secondEntered).toBe(true);
    } finally { release(); await Promise.allSettled([firstWork, secondWork]); await otherPool.end(); }
  });
  test.each(['READ', 'WRITE'] as const)('%s bloquea cuentas UUID → sesión → curso → grupo → clase sin promoción', async mode => {
    const run = target();
    const { sql } = await trace(() => run.run(actor(f.admin, 'ADMIN'), 'classes:manage-all', ref(), mode, async () => {}));
    const locks = sql.filter(q => /FOR (UPDATE|SHARE)/.test(q.text));
    const index = (table: string) => locks.findIndex(q => q.text.includes(`FROM "${table}"`));
    expect(index('User')).toBe(0);
    for (const [a, b] of [['User', 'Session'], ['Session', 'AcademicCourse'], ['AcademicCourse', 'AcademicGroup'], ['AcademicGroup', 'ClassSession']])
      expect(index(b)).toBeGreaterThan(index(a));
    const classLocks = locks.filter(q => q.text.includes('FROM "ClassSession"'));
    expect(classLocks.length).toBeGreaterThan(0);
    expect(classLocks.every(q => q.text.includes(`FOR ${mode === 'READ' ? 'SHARE' : 'UPDATE'}`))).toBe(true);
    expect(locks[index('AcademicGroup')].text).toContain(`FOR ${mode === 'READ' ? 'SHARE' : 'UPDATE'}`);
    expect(locks.some(q => /FROM "(Enrollment|EnrollmentOrder|SeatReservation|VerifiedPayment|PaymentAttempt|PaymentDispatch)"/.test(q.text))).toBe(false);
    expect((locks[0].values as [string[]])[0]).toEqual([...new Set([f.admin.userId, f.teacher.userId])].sort());
  });
  test('objetivo de moderación se bloquea con las cuentas desde el comienzo', async () => {
    const run = target();
    const { sql } = await trace(() => run.run(actor(f.teacher, 'TEACHER'), 'classes:manage-own',
      { kind: 'STUDENT', classId: f.live.id, studentId: f.secondStudent.userId }, 'WRITE', async () => {}));
    const lock = sql.find(q => /FROM "User"/.test(q.text) && /FOR UPDATE/.test(q.text));
    expect((lock!.values as [string[]])[0]).toEqual([f.teacher.userId, f.secondStudent.userId].sort());
  });
  test('alumno no necesita bloquear la cuenta del docente', async () => {
    const run = target();
    const { sql } = await trace(() => run.run(actor(f.student), 'classes:participate-enrolled', ref(), 'READ', async () => {}));
    const lock = sql.find(q => /FROM "User"/.test(q.text) && /FOR UPDATE/.test(q.text));
    expect((lock!.values as [string[]])[0]).toEqual([f.student.userId]);
  });
  test.each(['assignment', 'revocation', 'cancellation', 'withdrawal'] as const)('%s confirmada tras descubrir se observa antes del callback', async kind => {
      const groupId = await f.seedGroup(), session = await f.seedClass('PREPARED', groupId);
      const run = target(); let changed = false, entered = false;
      try {
        await trace(async () => {
          const operation = run.run(actor(f.teacher, 'TEACHER'), 'classes:manage-own', { kind: 'CLASS', id: session.id }, 'READ', async () => { entered = true; });
          if (kind === 'withdrawal') await operation;
          else await expect(operation).rejects.toMatchObject({ code: kind === 'revocation' ? 'AUTH_REQUIRED' : 'NOT_FOUND' });
        }, async (text, writer) => {
          if (changed || !text.includes('FROM "User"') || !text.includes('FOR UPDATE')) return;
          changed = true;
          if (kind === 'assignment') await writer.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [f.otherTeacher.userId, groupId]);
          if (kind === 'revocation') await writer.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [f.teacher.sessionId]);
          if (kind === 'cancellation') await writer.query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Carrera ficticia',"cancelledAt"=clock_timestamp() WHERE id=$1`, [groupId]);
          if (kind === 'withdrawal') {
            await writer.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId",
              "publishedTeacherEligibilityVersion"=(SELECT "teacherEligibilityVersion" FROM "User" WHERE id=$2) WHERE id=$1`, [groupId, f.teacher.userId]);
            await writer.query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`, [groupId]);
          }
        });
        expect(changed).toBe(true); expect(entered).toBe(kind === 'withdrawal');
      } finally { if (kind === 'revocation') await f.pool.query('UPDATE "Session" SET "revokedAt"=NULL WHERE id=$1', [f.teacher.sessionId]); }
    });
  test('ADMIN redescubre nueva cuenta responsable tras rollback, sin locks tardíos', async () => {
    const groupId = await f.seedGroup(), session = await f.seedClass('PREPARED', groupId), run = target();
    let changed = false, entered = 0;
    const { sql } = await trace(() => run.run(actor(f.admin, 'ADMIN'), 'classes:manage-all',
      { kind: 'CLASS', id: session.id }, 'READ', async () => { entered++; }), async (text, writer) => {
      if (changed || !text.includes('FROM "User"') || !text.includes('FOR UPDATE')) return;
      changed = true;
      await writer.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2', [f.otherTeacher.userId, groupId]);
    });
    expect(changed).toBe(true); expect(entered).toBe(1);
    const locks = sql.filter(q => q.text.includes('FROM "User"') && q.text.includes('FOR UPDATE'));
    const oldLock = locks.findIndex(q => JSON.stringify(q.values) === JSON.stringify([[f.admin.userId, f.teacher.userId].sort()]));
    const newLock = locks.findIndex(q => JSON.stringify(q.values) === JSON.stringify([[f.admin.userId, f.otherTeacher.userId].sort()]));
    expect(oldLock).toBeGreaterThanOrEqual(0); expect(newLock).toBeGreaterThan(oldLock);
    const previous = sql.indexOf(locks[oldLock]), next = sql.indexOf(locks[newLock]);
    expect(sql.slice(previous + 1, next).some(q => /^ROLLBACK\b/.test(q.text))).toBe(true);
    expect(sql.slice(previous + 1, next).some(q => /^BEGIN\b/.test(q.text))).toBe(true);
  });
  test('sesión se revalida antes de terminar el callback', async () => {
    const run = target();
    await trace(async client => {
      await expect(run.run(actor(f.teacher, 'TEACHER'), 'classes:manage-own', ref(), 'READ', async () => {
        await client.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [f.teacher.sessionId]);
      })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    });
    expect((await f.pool.query('SELECT "revokedAt" FROM "Session" WHERE id=$1', [f.teacher.sessionId])).rows[0].revokedAt).toBeNull();
  });
  test('callback fallido revierte sus efectos de clase', async () => {
    const run = target(), before = await financialFingerprint(f.pool);
    const sequence = (await f.pool.query('SELECT "lastEventSeq"::text AS seq FROM "ClassSession" WHERE id=$1', [f.live.id])).rows[0].seq;
    await trace(async client => {
      await expect(run.run(actor(f.teacher, 'TEACHER'), 'classes:manage-own', ref(), 'WRITE', async () => {
        await client.query('UPDATE "ClassSession" SET "lastEventSeq"="lastEventSeq"+1 WHERE id=$1', [f.live.id]);
        throw new Error('fixture-callback-aborted');
      })).rejects.toThrow('fixture-callback-aborted');
    });
    expect((await f.pool.query('SELECT "lastEventSeq"::text AS seq FROM "ClassSession" WHERE id=$1', [f.live.id])).rows[0].seq).toBe(sequence);
    expect(await financialFingerprint(f.pool)).toBe(before);
  });
  test('BD indisponible deniega sin entregar contenido o ejecutar callback', async () => {
    const run = target(); let entered = false;
    const connect = vi.spyOn(f.pool, 'connect').mockRejectedValue(Object.assign(new Error('synthetic database unavailable'), { code: 'ECONNREFUSED' }));
    try {
      await expect(run.run(actor(f.student), 'classes:participate-enrolled', ref(), 'READ', async () => { entered = true; }))
        .rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
      expect(entered).toBe(false);
    } finally { connect.mockRestore(); }
  });
});

describe('T009 — token exacto y derecho original', () => {
  test('retroceso temporal frente a hechos de clase no autoriza', async () => {
    const run = target(), session = await f.seedClass();
    try {
      await f.set(f.base + 1000000n);
      await f.pool.query(`UPDATE "ClassSession" SET title='Hecho posterior ficticio',revision=revision+1,
        "updatedAt"=clock_timestamp() WHERE id=$1`, [session.id]);
      await f.set(f.base);
      await expect(run.run(actor(f.admin, 'ADMIN'), 'classes:manage-all', { kind: 'CLASS', id: session.id }, 'READ', async () => {}))
        .rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
    } finally { await f.set(f.base); }
  });
  test('la matrícula del objetivo de silencio también vence en el instante exacto', async () => {
    const run = target(); let entered = false;
    await f.set(f.validUntil);
    try {
      await expect(run.run(actor(f.teacher, 'TEACHER'), 'classes:manage-own',
        { kind: 'STUDENT', classId: f.live.id, studentId: f.temporalStudent.userId }, 'WRITE', async () => { entered = true; }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(entered).toBe(false);
    } finally { await f.set(f.base); }
  });
  test.each([-1n, 0n, 1n])('fin %+s μs se decide sin redondeo', async offset => {
    const run = target(); let entered = false;
    await f.set(f.validUntil + offset);
    try {
      const operation = run.run(actor(f.temporalStudent), 'classes:participate-enrolled', ref(), 'READ', async c => {
        entered = true; expect(c.decision.at).toBe(f.validUntil + offset);
      });
      if (offset < 0n) await operation; else await expect(operation).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(entered).toBe(offset < 0n);
    } finally { await f.set(f.base); }
  });
  test.each([-1n, 0n, 1n])('comienzo %+s μs es inclusivo', async offset => {
    const run = target(); let entered = false;
    await f.set(f.confirmedAt + offset);
    try {
      const operation = run.run(actor(f.temporalStudent), 'classes:participate-enrolled', ref(), 'READ', async () => { entered = true; });
      if (offset >= 0n) await operation; else await expect(operation).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(entered).toBe(offset >= 0n);
    } finally { await f.set(f.base); }
  });
  test('el token se emite después de locks, no en descubrimiento', async () => {
    const run = target(); let moved = false, entered = false;
    await f.set(f.validUntil - 1n);
    try {
      await trace(async () => {
        await expect(run.run(actor(f.temporalStudent), 'classes:participate-enrolled', ref(), 'READ', async () => { entered = true; }))
          .rejects.toMatchObject({ code: 'NOT_FOUND' });
      }, async (text, writer) => {
        if (moved || !text.includes('FROM "ClassSession"') || !text.includes('FOR SHARE')) return;
        moved = true;
        await writer.query(`UPDATE "ClassesTestClock" SET instant=instant+interval '1 microsecond' WHERE id=1`);
      });
      expect(moved).toBe(true); expect(entered).toBe(false);
    } finally { await f.set(f.base); }
  });
  test('cambiar período actual no prolonga la matrícula original', async () => {
    const run = target(), before = await financialFingerprint(f.pool);
    await f.pool.query(`UPDATE "AcademicGroup" SET "periodStart"='2091-01-02',"periodEnd"='2091-03-31' WHERE id=$1`, [f.groupId]);
    try {
      await f.set(f.validUntil);
      await expect(run.run(actor(f.temporalStudent), 'classes:participate-enrolled', ref(), 'READ', async () => {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await financialFingerprint(f.pool)).toBe(before);
    } finally {
      await f.pool.query(`UPDATE "AcademicGroup" SET "periodStart"='2090-01-02',"periodEnd"='2090-03-31' WHERE id=$1`, [f.groupId]);
      await f.set(f.base);
    }
  });
  test('decisión capturada no habilita usar puertos después de terminar la transacción', async () => {
    const run = target(); let leaked: ClassesCapabilities | undefined;
    await run.run(actor(f.student), 'classes:participate-enrolled', ref(), 'READ', async c => { leaked = c; });
    await expect(Promise.resolve().then(() => leaked!.queries.session(f.live.id))).rejects.toBeDefined();
  });
});
