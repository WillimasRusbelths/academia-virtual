import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import { sessionFixture } from '../support/session-fixture.js';
import { assertAcademicFixtureInputs } from '../support/academic-offering.js';
import { academicMigrations, identityMigrations, preAcademicDatabase, identityFingerprint,
  requireAcademicTables, requireGeneration, draftGroup } from '../support/academic-migration.js';
import type { MigrationContext } from '../support/academic-migration.js';

let context: MigrationContext;
beforeAll(async () => { assertAcademicFixtureInputs(); context = await identityDatabase('academic_migration'); }, 120000);
afterAll(async () => { await context?.cleanup(); });

test('M01 control: propietario migra en esquema t_ y runtime conserva DML sin DDL', async () => {
  expect(context.isolated.schema.startsWith('t_')).toBe(true);
  const rows = await context.database.pool.query<{ can_create: boolean; current_schema: string }>(
    'SELECT has_schema_privilege(current_user,current_schema(),\'CREATE\') AS can_create,current_schema()');
  expect(rows.rows[0].current_schema).toBe(context.isolated.schema);
  expect(rows.rows[0].can_create).toBe(false);
  await expect(context.database.pool.query('CREATE TABLE forbidden_runtime_ddl (id int)')).rejects.toMatchObject({ code: '42501' });
  expect((await context.database.pool.query('SELECT count(*) FROM "User"')).rows[0].count).toBe('0');
});

test('M02 deploy vacío incorpora una migración posterior a las cuatro de identidad', async () => {
  const names = academicMigrations();
  expect(names.length, 'T008 pendiente: falta migración aditiva de oferta').toBe(1);
  expect(names[0] > identityMigrations[3]).toBe(true);
  const applied = await context.database.pool.query<{ migration_name: string }>(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name');
  const historical = [...identityMigrations, ...names];
  expect(applied.rows.slice(0, historical.length).map(row => row.migration_name)).toEqual(historical);
  expect(applied.rows.slice(historical.length).every(row => row.migration_name > names[0])).toBe(true);
});

test('M03 deploy vacío crea cinco tablas académicas vacías y generación bigint default 0', async () => {
  const pool = context.database.pool;
  const tables = ['AcademicCourse', 'AcademicGroup', 'AcademicSlot', 'AcademicCommand', 'AcademicAuditEvent'];
  await requireAcademicTables(pool, ...tables);
  for (const name of tables) expect((await pool.query(`SELECT count(*) FROM "${name}"`)).rows[0].count).toBe('0');
  const column = await pool.query(`SELECT data_type,is_nullable,column_default FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='User' AND column_name='teacherEligibilityVersion'`);
  expect(column.rows).toHaveLength(1);
  expect(column.rows[0].data_type).toBe('bigint'); expect(column.rows[0].is_nullable).toBe('NO');
  expect(column.rows[0].column_default).toMatch(/\b0\b/);
});

test('M04 directorio SQL mínimo funciona con runtime en esquema distinto de public', async () => {
  const columns = await context.database.pool.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='AcademicTeacherDirectory' ORDER BY column_name`);
  expect(columns.rows.map(row => row.column_name), 'T008 pendiente: proyección SQL de usuarios').toEqual(
    ['eligibilityVersion', 'eligible', 'name', 'userId']);
  const teacher = await sessionFixture(context, 'TEACHER');
  const view = await context.database.pool.query<{ eligible: boolean; eligibilityVersion: string }>(
    'SELECT eligible,"eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"=$1', [teacher.userId]);
  expect(view.rows).toEqual([{ eligible: true, eligibilityVersion: '0' }]);
});

test('M05 actualización incremental conserva cuentas, hashes, sesiones, tokens, auditoría, correo y bootstrap', async () => {
  const copy = await preAcademicDatabase();
  try {
    const pool = copy.database.pool;
    const admin = await sessionFixture(copy, 'ADMIN'); const teacher = await sessionFixture(copy, 'TEACHER');
    await pool.query('UPDATE "SystemState" SET "bootstrapCompletedAt"=clock_timestamp(),"firstAdminUserId"=$1 WHERE id=1', [admin.userId]);
    const tokenId = randomUUID(); const key = randomBytes(32).toString('hex');
    await pool.query(`WITH instant AS (SELECT clock_timestamp() AS at) INSERT INTO "ActionToken"
      (id,"userId",purpose,"tokenHash","emailCanonicalSnapshot","createdAt","expiresAt")
      SELECT $1,$2,'VERIFY_EMAIL',$3,'migration@example.test',at,at+interval '24 hours' FROM instant`, [tokenId, teacher.userId, randomBytes(32)]);
    await pool.query(`INSERT INTO "MailDelivery" ("tokenId","recipientKey","originKey","encryptedPayload",nonce,"authTag","keyId")
      VALUES ($1,$2,$2,$3,$4,$5,'test-v1')`, [tokenId, key, randomBytes(20), randomBytes(12), randomBytes(16)]);
    await pool.query(`INSERT INTO "AuditEvent" ("actorKind","actorUserId","targetUserId",action,result,"requestId")
      VALUES ('ACCOUNT',$1,$2,'ACCOUNT_CREATED','APPLIED',$3)`, [admin.userId, teacher.userId, randomUUID()]);
    await pool.query(`INSERT INTO "RateBucket" (key,scope,phase) VALUES ($1,'LOGIN_PAIR','ADMISSION')`, [key]);
    await pool.query(`WITH instant AS (SELECT clock_timestamp() AS at) INSERT INTO "RateEvent"
      ("bucketKey",status,"occurredAt","reservationExpiresAt") SELECT $1,'RESERVED',at,at+interval '30 seconds' FROM instant`, [key]);
    const before = await identityFingerprint(pool);
    await copy.applyAcademic();
    expect(await identityFingerprint(pool) === before, 'La migración no debe alterar filas de identidad').toBe(true);
    const versions = await pool.query('SELECT "teacherEligibilityVersion" FROM "User"');
    expect(versions.rows.every(row => row.teacherEligibilityVersion === '0')).toBe(true);
    expect(versions.rowCount).toBe(2);
    await requireAcademicTables(pool, 'AcademicCourse', 'AcademicGroup', 'AcademicSlot', 'AcademicCommand', 'AcademicAuditEvent');
  } finally { await copy.cleanup(); }
}, 120000);

test.each([
  ['capacidad cero', 'capacity', 0], ['capacidad negativa', 'capacity', -1], ['capacidad 51', 'capacity', 51],
  ['zona ajena', 'timeZone', 'UTC'], ['revision cero', 'revision', '0'], ['nombre vacío', 'name', ''],
] as const)('M06 restricción de grupo: %s', async (_label, field, value) => {
  const { groupId } = await draftGroup(context.database.pool);
  await expect(context.database.pool.query(`UPDATE "AcademicGroup" SET "${field}"=$2 WHERE id=$1`, [groupId, value]))
    .rejects.toMatchObject({ code: '23514' });
});

test('M07 capacidad admite 1 y 50, borrador incompleto y nombres iguales sin unicidad inventada', async () => {
  const first = await draftGroup(context.database.pool); const second = await draftGroup(context.database.pool);
  for (const [id, capacity] of [[first.groupId, 1], [second.groupId, 50]] as const) {
    await context.database.pool.query('UPDATE "AcademicGroup" SET capacity=$2 WHERE id=$1', [id, capacity]);
    const row = await context.database.pool.query('SELECT capacity,state FROM "AcademicGroup" WHERE id=$1', [id]);
    expect(row.rows).toEqual([{ capacity, state: 'DRAFT' }]);
  }
});

test('M08 periodo invertido y snapshot incompleto son rechazados sin cambio parcial', async () => {
  const pool = context.database.pool; const { groupId } = await draftGroup(pool);
  const teacher = await sessionFixture(context, 'TEACHER');
  await expect(pool.query(`UPDATE "AcademicGroup" SET "periodStart"='2026-11-02',"periodEnd"='2026-11-01' WHERE id=$1`, [groupId]))
    .rejects.toMatchObject({ code: '23514' });
  await expect(pool.query('UPDATE "AcademicGroup" SET "publishedTeacherUserId"=$2 WHERE id=$1', [groupId, teacher.userId]))
    .rejects.toMatchObject({ code: '23514' });
  const after = await pool.query('SELECT "periodStart","periodEnd","publishedTeacherUserId" FROM "AcademicGroup" WHERE id=$1', [groupId]);
  expect(after.rows).toEqual([{ periodStart: null, periodEnd: null, publishedTeacherUserId: null }]);
});

test('M09 FK RESTRICT y pertenencia inmutable no permiten trasladar o borrar padres', async () => {
  const pool = context.database.pool; const first = await draftGroup(pool); const second = await draftGroup(pool);
  await expect(pool.query('DELETE FROM "AcademicCourse" WHERE id=$1', [first.courseId])).rejects.toMatchObject({ code: '23503' });
  await expect(pool.query('UPDATE "AcademicGroup" SET "courseId"=$2 WHERE id=$1', [first.groupId, second.courseId]))
    .rejects.toMatchObject({ code: '23514' });
  await expect(pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$2 WHERE id=$1', [first.groupId, randomUUID()]))
    .rejects.toMatchObject({ code: '23503' });
});

test('M10 cancelar exige motivo/fecha y Cancelado es terminal incluso ante escritura SQL runtime', async () => {
  const pool = context.database.pool; const { groupId } = await draftGroup(pool);
  await expect(pool.query(`UPDATE "AcademicGroup" SET state='CANCELLED' WHERE id=$1`, [groupId])).rejects.toMatchObject({ code: '23514' });
  await pool.query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='Motivo ficticio',"cancelledAt"=clock_timestamp() WHERE id=$1`, [groupId]);
  await expect(pool.query(`UPDATE "AcademicGroup" SET state='DRAFT',"cancellationReason"=NULL,"cancelledAt"=NULL WHERE id=$1`, [groupId]))
    .rejects.toMatchObject({ code: '23514' });
  await expect(pool.query(`UPDATE "AcademicGroup" SET name='Edición inválida' WHERE id=$1`, [groupId])).rejects.toMatchObject({ code: '23514' });
});

test.each([[0, 60, 120], [8, 60, 120], [1, -1, 60], [1, 60, 1440], [1, 60, 60], [1, 120, 60]])(
  'M11 franja rechazada día=%i inicio=%i fin=%i', async (day, start, end) => {
    const pool = context.database.pool; await requireAcademicTables(pool, 'AcademicSlot');
    const { groupId } = await draftGroup(pool);
    await expect(pool.query('INSERT INTO "AcademicSlot" (id,"groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), groupId, day, start, end])).rejects.toMatchObject({ code: '23514' });
  });

test('M12 franjas contiguas válidas y duplicado exacto rechazado por unicidad', async () => {
  const pool = context.database.pool; await requireAcademicTables(pool, 'AcademicSlot'); const { groupId } = await draftGroup(pool);
  const insert = (start: number, end: number) => pool.query(
    'INSERT INTO "AcademicSlot" (id,"groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,$2,1,$3,$4)', [randomUUID(), groupId, start, end]);
  await insert(0, 60); await insert(60, 1439);
  await expect(insert(0, 60)).rejects.toMatchObject({ code: '23505' });
  expect((await pool.query('SELECT count(*) FROM "AcademicSlot" WHERE "groupId"=$1', [groupId])).rows[0].count).toBe('2');
});

test('M13 ledger exige unicidad actor/comando y huella SHA-256 de 32 bytes', async () => {
  const pool = context.database.pool; await requireAcademicTables(pool, 'AcademicCommand');
  const actor = await sessionFixture(context, 'ADMIN'); const { courseId } = await draftGroup(pool); const commandId = randomUUID();
  const insert = (digest: Buffer) => pool.query(`INSERT INTO "AcademicCommand"
    ("actorUserId","commandId",operation,"targetKind","targetId","payloadDigest","resultingRevision","appliedAt",result)
    VALUES ($1,$2,'COURSE_CREATE','COURSE',$3,$4,1,clock_timestamp(),'APPLIED')`, [actor.userId, commandId, courseId, digest]);
  await expect(insert(randomBytes(31))).rejects.toMatchObject({ code: '23514' });
  await insert(randomBytes(32)); await expect(insert(randomBytes(32))).rejects.toMatchObject({ code: '23505' });
});

test('M14 generación no admite negativos en una nueva fila y Published exige datos completos', async () => {
  const pool = context.database.pool; await requireGeneration(pool); const { courseId, groupId } = await draftGroup(pool);
  const account = await sessionFixture(context, 'TEACHER');
  await expect(pool.query(`INSERT INTO "User" (id,name,email,"emailCanonical",role,"passwordHash","emailVerifiedAt","teacherEligibilityVersion")
    SELECT $1,'Fixture negativa',$2,$2,'TEACHER',"passwordHash",clock_timestamp(),-1 FROM "User" WHERE id=$3`,
  [randomUUID(), `${randomUUID()}@example.test`, account.userId])).rejects.toMatchObject({ code: '23514' });
  await expect(pool.query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`, [courseId])).rejects.toMatchObject({ code: '23514' });
  await expect(pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED' WHERE id=$1`, [groupId])).rejects.toMatchObject({ code: '23514' });
});
