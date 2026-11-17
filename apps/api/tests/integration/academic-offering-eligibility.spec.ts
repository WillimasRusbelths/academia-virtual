import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import { sessionFixture } from '../support/session-fixture.js';
import { assertAcademicFixtureInputs } from '../support/academic-offering.js';
import { teacherState, requireGeneration, identityFingerprint, draftGroup } from '../support/academic-migration.js';
import type { MigrationContext } from '../support/academic-migration.js';
import { ChangeAccess, AccessChangeUnavailable } from '../../src/modules/identity/application/change-access.js';
import { PostgresAccessChangeStore } from '../../src/modules/identity/infrastructure/access-change-store.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { PostgresAuditWriter } from '../../src/modules/audit/infrastructure/audit-writer.js';
import { PostgresPasswordResetStore } from '../../src/modules/identity/infrastructure/password-reset-store.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import { canConsumeAction } from '../../src/modules/identity/domain/access.js';

let context: MigrationContext;
let teacher: Awaited<ReturnType<typeof sessionFixture>>;
beforeAll(async () => { assertAcademicFixtureInputs(); context = await identityDatabase('academic_eligibility'); }, 120000);
beforeEach(async () => { teacher = await sessionFixture(context, 'TEACHER'); });
afterAll(async () => { await context?.cleanup(); });
const pool = () => context.database.pool;
const state = () => teacherState(pool(), teacher.userId);

test('E01 INSERT ordinario inicia generación 0 para docente elegible', async () => {
  const row = await state(); expect(row.role).toBe('TEACHER'); expect(row.verified).toBe(true);
  expect(row.generation, 'T007/T008 pendientes: default de generación docente').toBe('0');
});

test.each(['STUDENT', 'ADMIN'])('E02 perder rol docente hacia %s incrementa exactamente una vez', async role => {
  await pool().query('UPDATE "User" SET role=$2 WHERE id=$1', [teacher.userId, role]);
  expect((await state()).generation, 'T008 pendiente: trigger de pérdida de habilitación').toBe('1');
});

test('E03 desactivar incrementa una vez; cambios posteriores mientras sigue inhabilitado no incrementan', async () => {
  await pool().query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [teacher.userId]);
  await pool().query(`UPDATE "User" SET role='STUDENT',"emailVerifiedAt"=NULL WHERE id=$1`, [teacher.userId]);
  expect((await state()).generation, 'Una misma pérdida no debe contarse otra vez').toBe('1');
});

test('E04 perder verificación también invalida generación sin depender de consultas', async () => {
  await pool().query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [teacher.userId]);
  expect((await state()).verified).toBe(false);
  expect((await state()).generation, 'La condición vigente incluye email verificado').toBe('1');
});

test.each(['role', 'status', 'verification'] as const)('E05 recuperación de %s conserva generación nueva; snapshot anterior sigue inválido', async kind => {
  // Captura de una publicación anterior esperada, sin implementar una función de visibilidad.
  const priorPublishedGeneration = '0';
  if (kind === 'role') {
    await pool().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [teacher.userId]);
    await pool().query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`, [teacher.userId]);
  } else if (kind === 'status') {
    await pool().query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [teacher.userId]);
    await pool().query(`UPDATE "User" SET status='ACTIVE',"disabledAt"=NULL WHERE id=$1`, [teacher.userId]);
  } else {
    await pool().query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [teacher.userId]);
    await pool().query('UPDATE "User" SET "emailVerifiedAt"=clock_timestamp() WHERE id=$1', [teacher.userId]);
  }
  // No hubo lecturas intermedias que pudieran persistir una marca de revisión.
  const row = await state(); expect(row.role).toBe('TEACHER'); expect(row.status).toBe('ACTIVE'); expect(row.verified).toBe(true);
  expect(row.generation, 'Reactivar no autoriza reutilizar la captura de publicación anterior').toBe('1');
  expect(row.generation === priorPublishedGeneration).toBe(false);
});

test('E06 dos pérdidas separadas por recuperación avanzan a generación 2, sin reciclarla', async () => {
  await pool().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [teacher.userId]);
  await pool().query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`, [teacher.userId]);
  await pool().query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [teacher.userId]);
  expect((await state()).generation).toBe('2');
});

test('E07 cambio de nombre y UPDATE no-op no invalidan publicación docente', async () => {
  await pool().query(`UPDATE "User" SET name='Docente ficticio corregido' WHERE id=$1`, [teacher.userId]);
  await pool().query('UPDATE "User" SET role=role,status=status WHERE id=$1', [teacher.userId]);
  expect((await state()).generation).toBe('0');
});

test('E08 una cuenta que nunca fue elegible no incrementa por desactivación', async () => {
  const student = await sessionFixture(context, 'STUDENT');
  await pool().query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`, [student.userId]);
  expect((await teacherState(pool(), student.userId)).generation).toBe('0');
});

test.each([false, true])('E09 UPDATE no permite sustituir generación enviada por el escritor; pérdida=%s', async losesEligibility => {
  await requireGeneration(pool());
  await pool().query(`UPDATE "User" SET "teacherEligibilityVersion"=999,role=$2 WHERE id=$1`,
    [teacher.userId, losesEligibility ? 'STUDENT' : 'TEACHER']);
  expect((await state()).generation).toBe(losesEligibility ? '1' : '0');
});

test('E10 reset real revoca sesión y aumenta authVersion sin aumentar generación docente', async () => {
  const token = accessSecrets.issue();
  await pool().query(`WITH instant AS (SELECT clock_timestamp() AS at) INSERT INTO "ActionToken"
    ("userId",purpose,"tokenHash","emailCanonicalSnapshot","createdAt","expiresAt")
    SELECT id,'RESET_PASSWORD',$2,"emailCanonical",at,at+interval '30 minutes' FROM "User",instant WHERE id=$1`,
  [teacher.userId, Buffer.from(token.digest)]);
  // Hash válido existente usado como fixture del adaptador; no se imprime ni se prueba el formulario de reset.
  const hash = (await pool().query<{ passwordHash: string }>('SELECT "passwordHash" FROM "User" WHERE id=$1', [teacher.userId])).rows[0].passwordHash;
  const consumed = await new PostgresPasswordResetStore(pool()).consume(token.digest, hash,
    (account, action, now) => canConsumeAction(account, action, 'RESET_PASSWORD', now));
  expect(consumed).toBe(true);
  const after = await state(); expect(after.authVersion).toBe('1');
  const session = await pool().query<{ revoked: boolean }>('SELECT "revokedAt" IS NOT NULL AS revoked FROM "Session" WHERE id=$1', [teacher.sessionId]);
  expect(session.rows[0].revoked).toBe(true);
  expect(after.generation, 'authVersion no sustituye generación de habilitación').toBe('0');
});

async function accessCase(failAudit: boolean) {
  const admin = await sessionFixture(context, 'ADMIN');
  const sessions = new PostgresSessionStore(pool()); const actualAudit = new PostgresAuditWriter();
  const actor = await sessions.lookup(admin.secret); expect(actor !== null).toBe(true);
  const change = new ChangeAccess(new PostgresAccessChangeStore(pool(), { authorization: sessions,
    audit: { async write(client, event) {
      await actualAudit.write(client, event);
      if (failAudit) throw new Error('Aborto de auditoría controlado por el ensayo');
    } },
  }));
  return () => change.execute(actor!, { id: teacher.userId, kind: 'status', value: 'DISABLED', requestId: randomUUID() });
}

test('E11 cambio de acceso real confirma generación, revocación y auditoría juntos', async () => {
  await (await accessCase(false))();
  const row = await state(); expect(row.status).toBe('DISABLED'); expect(row.authVersion).toBe('1');
  const sessions = await pool().query('SELECT id FROM "Session" WHERE "userId"=$1 AND "revokedAt" IS NULL', [teacher.userId]);
  expect(sessions.rowCount).toBe(0);
  const audit = await pool().query('SELECT result FROM "AuditEvent" WHERE "targetUserId"=$1', [teacher.userId]);
  expect(audit.rows).toEqual([{ result: 'APPLIED' }]);
  expect(row.generation).toBe('1');
});

test('E12 fallo de auditoría revierte acceso, generación y revocación en una sola transacción', async () => {
  const command = await accessCase(true); const before = await identityFingerprint(pool());
  await expect(command()).rejects.toBeInstanceOf(AccessChangeUnavailable);
  expect(await identityFingerprint(pool()) === before, 'Rollback de todas las filas de identidad').toBe(true);
  const row = await state(); expect(row.status).toBe('ACTIVE'); expect(row.authVersion).toBe('0');
  expect(row.generation, 'El contador tampoco puede sobrevivir al rollback').toBe('0');
});

test('E13 overflow bigint aborta pérdida de habilitación sin reciclar generación ni alterar la fila', async () => {
  await requireGeneration(pool());
  const id = randomUUID(); const email = `${id}@example.test`; const maximum = '9223372036854775807';
  // INSERT extraordinario de fixture para alcanzar la frontera sin miles de millones de UPDATE.
  // No autoriza entrada HTTP ni cambio ordinario de generación.
  await pool().query(`INSERT INTO "User" (id,name,email,"emailCanonical",role,"passwordHash","emailVerifiedAt","teacherEligibilityVersion")
    SELECT $1,'Frontera ficticia',$2,$2,'TEACHER',"passwordHash",clock_timestamp(),$3 FROM "User" WHERE id=$4`,
  [id, email, maximum, teacher.userId]);
  expect((await teacherState(pool(), id)).generation).toBe(maximum);
  await expect(pool().query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [id])).rejects.toMatchObject({ code: '22003' });
  const after = await teacherState(pool(), id); expect(after.role).toBe('TEACHER'); expect(after.generation).toBe(maximum);
});

test('E14 recuperar habilitación no actualiza snapshot ni estado/revision de un grupo publicado', async () => {
  const db = pool(); const { courseId, groupId } = await draftGroup(db);
  await requireGeneration(db);
  await db.query(`UPDATE "AcademicCourse" SET description='Descripción ficticia',state='PUBLISHED' WHERE id=$1`, [courseId]);
  await db.query(`INSERT INTO "AcademicSlot" (id,"groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,$2,1,1080,1140)`, [randomUUID(), groupId]);
  await db.query(`UPDATE "AcademicGroup" SET "periodStart"='2026-11-02',"periodEnd"='2026-11-30',capacity=45,
    "teacherUserId"=$2,"publishedTeacherUserId"=$2,"publishedTeacherEligibilityVersion"=0,state='PUBLISHED' WHERE id=$1`, [groupId, teacher.userId]);
  const before = (await db.query('SELECT to_jsonb(g) AS value FROM "AcademicGroup" g WHERE id=$1', [groupId])).rows[0].value;
  await db.query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [teacher.userId]);
  await db.query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`, [teacher.userId]);
  const after = (await db.query('SELECT to_jsonb(g) AS value FROM "AcademicGroup" g WHERE id=$1', [groupId])).rows[0].value;
  expect(JSON.stringify(after) === JSON.stringify(before)).toBe(true);
  expect(String(after.publishedTeacherEligibilityVersion)).toBe('0');
  expect((await state()).generation).toBe('1');
  expect(after.state).toBe('PUBLISHED');
  // Republicación por operación autorizada se comprobará en T032/T056; no se simula aquí.
});
