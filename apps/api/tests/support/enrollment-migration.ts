import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { spawnSync } from 'node:child_process';
import { loadEnvironment, repositoryRoot } from '../../src/infrastructure/config/environment.js';
import { createDatabase } from '../../src/infrastructure/database/database.js';
import { assertAcademicFixtureInputs } from './academic-offering.js';
import { createIsolatedTestEnvironment } from './test-environment.js';
import { sessionFixture } from './session-fixture.js';

export const baselineMigrations = ['0001_identity_users', '0002_identity_access',
  '0003_identity_mail_limits', '0004_identity_argon2_format', '0005_academic_offering'] as const;
const migrationRoot = path.join(repositoryRoot(), 'apps/api/prisma/migrations');
export const enrollmentTables = ['CoursePrice', 'AdmissionSequence', 'DispatchState', 'ReservationRequest',
  'EnrollmentOrder', 'EnrollmentOrderItem', 'SeatReservation', 'PaymentAttempt', 'ProviderReceipt',
  'VerifiedPayment', 'Enrollment', 'PaymentIncident', 'IncidentFollowUp', 'EnrollmentCommand', 'EnrollmentAuditEvent'] as const;
export type EnrollmentTable = typeof enrollmentTables[number];
export type FixtureRow = Record<string, unknown>;
const legacyTables = ['User', 'Session', 'ActionToken', 'AuditEvent', 'SystemState', 'MailDelivery',
  'RateBucket', 'RateEvent', 'AcademicCourse', 'AcademicGroup', 'AcademicSlot', 'AcademicCommand', 'AcademicAuditEvent'];

export function historicalMigrationHashes() {
  return baselineMigrations.map(name => ({ name, sha256: createHash('sha256')
    .update(readFileSync(path.join(migrationRoot, name, 'migration.sql'))).digest('hex') }));
}
export function enrollmentMigrationNames() {
  return readdirSync(migrationRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()
    && !(baselineMigrations as readonly string[]).includes(entry.name)).map(entry => entry.name).sort();
}
export class EnrollmentMigrationMissing extends Error {
  readonly code = 'ENROLLMENT_MIGRATION_NOT_IMPLEMENTED';
  constructor() { super('T007/T008 pendientes: migración enrollment posterior a 0005 ausente.'); }
}
export async function legacyFingerprint(pool: Pool) {
  const digest = createHash('sha256');
  for (const table of legacyTables) {
    const projection = table === 'AcademicGroup' ? "to_jsonb(t) - 'description'" : 'to_jsonb(t)';
    const result = await pool.query<{ snapshot: string }>(`SELECT COALESCE(jsonb_agg(${projection}
      ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text AS snapshot FROM "${table}" t`);
    digest.update(table); digest.update(result.rows[0].snapshot);
  }
  return digest.digest('hex');
}

/** Snapshot 0005 real en schema propio. Nunca invoca deploy de una migración futura. */
export async function preEnrollmentDatabase() {
  assertAcademicFixtureInputs();
  const isolated = await createIsolatedTestEnvironment('enrollment_upgrade');
  let database: ReturnType<typeof createDatabase> | undefined;
  try {
    for (const name of baselineMigrations) await isolated.ownerQuery(readFileSync(path.join(migrationRoot, name, 'migration.sql'), 'utf8'));
    const input: NodeJS.ProcessEnv = { ...process.env, APP_ENV: 'test' };
    for (const key of ['TEST_DATABASE_URL', 'TEST_MIGRATION_DATABASE_URL']) {
      const url = new URL(input[key]!); url.searchParams.set('schema', isolated.schema); input[key] = url.toString();
    }
    const environment = loadEnvironment(input);
    database = createDatabase(environment);
    const activeDatabase = database;
    let closed = false;
    const context = { isolated, environment, database: activeDatabase,
      async cleanup() { if (closed) return; closed = true; try { await activeDatabase.close(); } finally { await isolated.cleanup(); } },
    };
    const admin = await sessionFixture(context, 'ADMIN');
    const student = await sessionFixture(context, 'STUDENT');
    const teacher = await sessionFixture(context, 'TEACHER');
    const courseId = randomUUID(), otherCourseId = randomUUID(), groupId = randomUUID();
    const pool = database.pool;
    await pool.query(`INSERT INTO "AcademicCourse" (id,name,description) VALUES
      ($1,'Curso previo ficticio','Snapshot 0005'),($2,'Otro curso previo ficticio',NULL)`, [courseId, otherCourseId]);
    await pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,capacity,"periodStart","periodEnd","teacherUserId")
      VALUES ($1,$2,'Grupo previo ficticio',2,'2030-01-07','2030-01-31',$3)`, [groupId, courseId, teacher.userId]);
    await pool.query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1080,1140)', [groupId]);
    const tokenId = randomUUID(), key = randomBytes(32).toString('hex'), commandId = randomUUID();
    await pool.query(`WITH t AS (SELECT clock_timestamp() AS at) INSERT INTO "ActionToken"
      (id,"userId",purpose,"tokenHash","emailCanonicalSnapshot","createdAt","expiresAt")
      SELECT $1,$2,'VERIFY_EMAIL',$3,'upgrade@example.test',at,at+interval '24 hours' FROM t`, [tokenId, student.userId, randomBytes(32)]);
    await pool.query(`INSERT INTO "MailDelivery" ("tokenId","recipientKey","originKey","encryptedPayload",nonce,"authTag","keyId")
      VALUES ($1,$2,$2,$3,$4,$5,'test-v1')`, [tokenId, key, randomBytes(20), randomBytes(12), randomBytes(16)]);
    await pool.query(`INSERT INTO "AuditEvent" ("actorKind","actorUserId","targetUserId",action,result,"requestId")
      VALUES ('ACCOUNT',$1,$2,'ACCOUNT_CREATED','APPLIED',$3)`, [admin.userId, student.userId, randomUUID()]);
    await pool.query(`INSERT INTO "RateBucket" (key,scope,phase) VALUES ($1,'LOGIN_PAIR','ADMISSION')`, [key]);
    await pool.query(`WITH t AS (SELECT clock_timestamp() AS at) INSERT INTO "RateEvent"
      ("bucketKey",status,"occurredAt","reservationExpiresAt") SELECT $1,'RESERVED',at,at+interval '30 seconds' FROM t`, [key]);
    await pool.query(`INSERT INTO "AcademicCommand" ("actorUserId","commandId",operation,"targetKind","targetId","payloadDigest","resultingRevision",result)
      VALUES ($1,$2,'GROUP_EDIT','GROUP',$3,$4,1,'APPLIED')`, [admin.userId, commandId, groupId, randomBytes(32)]);
    await pool.query(`INSERT INTO "AcademicAuditEvent" ("actorUserId","resourceKind","resourceId",action,result,"commandId","requestId","afterState","afterRevision")
      VALUES ($1,'GROUP',$2,'GROUP_EDIT','APPLIED',$3,$4,'DRAFT',1)`, [admin.userId, groupId, commandId, randomUUID()]);
    return { ...context, admin, student, teacher, courseId, otherCourseId, groupId,
      async applyEnrollment() {
        const names = enrollmentMigrationNames();
        if (names.length === 0) throw new EnrollmentMigrationMissing();
        if (names.some(name => name <= baselineMigrations[4])) throw new Error('Orden de migración no aditivo.');
        for (const name of names) await isolated.ownerQuery(readFileSync(path.join(migrationRoot, name, 'migration.sql'), 'utf8'));
      },
    };
  } catch (error) { try { await database?.close(); } finally { await isolated.cleanup(); } throw error; }
}
export type EnrollmentMigrationContext = Awaited<ReturnType<typeof preEnrollmentDatabase>>;

/** Ensayo de adopción del snapshot conocido 0005 y deploy real mediante script vigente.
 * Solo este schema t_ recién creado; no resuelve ni modifica historiales ajenos.
 */
export function deployEnrollmentWithPrisma(context: EnrollmentMigrationContext) {
  assertAcademicFixtureInputs();
  if (!/^t_enrollment_upgrade_[a-f0-9]+$/.test(context.isolated.schema)
    || context.environment.databaseSchema !== context.isolated.schema) throw new Error('Destino de upgrade rechazado.');
  const env = { ...process.env, APP_ENV: 'test', TEST_DATABASE_URL: context.environment.databaseUrl,
    TEST_MIGRATION_DATABASE_URL: context.environment.migrationUrl };
  const run = (args: string[]) => {
    const result = spawnSync(process.execPath, args, { cwd: repositoryRoot(), env, encoding: 'utf8', timeout: 120000 });
    if (result.status !== 0) throw new Error('Ensayo Prisma aislado no completado; valores omitidos.');
  };
  for (const name of baselineMigrations) run(['node_modules/prisma/build/index.js', 'migrate', 'resolve', '--applied', name, '--config', 'apps/api/prisma.config.ts']);
  run(['apps/api/scripts/database.mjs', 'deploy']);
}

const jsonColumns = new Set(['scheduleSnapshot', 'resourceReferences']);
/** Filas ficticias explícitas: no reglas, transiciones ni respuestas de producto. */
export async function insertEnrollmentRow(pool: Pool, table: EnrollmentTable, row: FixtureRow) {
  const columns = Object.keys(row);
  if (columns.some(column => !/^[a-zA-Z][a-zA-Z0-9]*$/.test(column))) throw new Error('Columna de fixture inválida.');
  return pool.query(`INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(',')}) VALUES
    (${columns.map((_, i) => `$${i + 1}`).join(',')})`, columns.map(c => jsonColumns.has(c) ? JSON.stringify(row[c]) : row[c]));
}

/** Contrato físico de fixtures para T007/T008; se ejecuta solo tras migración real. */
export async function seedEnrollmentGraph(context: EnrollmentMigrationContext,
  override?: { table: EnrollmentTable; values: FixtureRow }) {
  const studentId = context.student.userId, adminId = context.admin.userId;
  const requestId = randomUUID(), orderId = randomUUID(), itemId = randomUUID(), paymentId = randomUUID(), incidentPaymentId = randomUUID();
  const incidentId = randomUUID();
  const confirmedAt = '2026-11-01T00:00:00.123456Z', expiresAt = '2026-11-02T00:00:00.123456Z';
  const verificationFinishedAt = '2026-11-01T00:01:00.123456Z';
  const scope = 'fixture/provider/merchant/sandbox', merchantReference = `fixture-${randomUUID()}`;
  const schedule = [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }];
  const rows: Partial<Record<EnrollmentTable, FixtureRow>> = {
    CoursePrice: { courseId: context.courseId, amountMinor: '12500', currency: 'PEN', revision: '1', changedBy: adminId, changedAt: confirmedAt },
    ReservationRequest: { id: requestId, studentId, intentionId: randomUUID(), selectionDigest: randomBytes(32), groupIds: [context.groupId],
      admittedAt: confirmedAt, admissionSequence: '1', actorSessionReference: context.student.sessionId, authVersion: '0', state: 'CONFIRMED', decisionCode: 'RESERVATION_CONFIRMED', decidedAt: confirmedAt },
    EnrollmentOrder: { id: orderId, studentId, requestId, currency: 'PEN', totalMinor: '12500', state: 'ENROLLED', revision: '1', confirmedAt, expiresAt, expirationProcessedAt: null },
    EnrollmentOrderItem: { id: itemId, orderId, courseId: context.courseId, groupId: context.groupId, priceMinor: '12500',
      courseName: 'Curso previo ficticio', groupName: 'Grupo previo ficticio', periodStart: '2030-01-07', periodEnd: '2030-01-31', timeZone: 'America/Lima',
      groupStartAt: '2030-01-07T05:00:00.000000Z', enrollmentValidUntil: '2030-02-01T05:00:00.000000Z', scheduleSnapshot: schedule },
    SeatReservation: { id: randomUUID(), orderItemId: itemId, state: 'CONVERTED' },
    PaymentAttempt: { id: randomUUID(), orderId, studentId, initiationId: randomUUID(), payloadDigest: randomBytes(32), state: 'APPLIED',
      merchantReference, externalIdempotencyKey: randomUUID(), providerScope: scope, providerReference: 'fixture-attempt', createdAt: confirmedAt },
    VerifiedPayment: { id: paymentId, providerScope: scope, providerPaymentId: randomUUID(), orderId, amountUnits: '12500', amountScale: 2,
      currency: 'PEN', merchantReference, verificationFinishedAt, reconciliationState: 'APPLIED', normalizedEvidenceReference: 'fixture-evidence-applied' },
    ProviderReceipt: { id: randomUUID(), providerScope: scope, deliveryKey: randomUUID(), merchantReferenceHint: merchantReference,
      providerPaymentIdHint: 'fixture-hint', normalizedEvidenceReference: 'fixture-evidence-receipt', receivedAt: confirmedAt,
      externalObservedAt: null, state: 'PROCESSED', processedAt: verificationFinishedAt, terminalPaymentId: paymentId },
    Enrollment: { id: randomUUID(), orderItemId: itemId, studentId, courseId: context.courseId, groupId: context.groupId, paymentId,
      confirmedAt: verificationFinishedAt, originalPeriodStart: '2030-01-07', originalPeriodEnd: '2030-01-31', timeZone: 'America/Lima', scheduleSnapshot: schedule, validUntil: '2030-02-01T05:00:00.000000Z' },
    PaymentIncident: { id: incidentId, orderId: null, verifiedPaymentId: incidentPaymentId, reason: 'UNKNOWN_REFERENCE', affectedGroupIds: [], openedAt: verificationFinishedAt },
    IncidentFollowUp: { id: randomUUID(), incidentId, adminUserId: adminId, commandId: randomUUID(), recordedAt: verificationFinishedAt, content: 'Seguimiento ficticio sin resolución económica.' },
    EnrollmentCommand: { actorKind: 'ACCOUNT', actorReference: adminId, commandId: randomUUID(), operation: 'COURSE_PRICE_SET', payloadDigest: randomBytes(32),
      outcomeCode: 'APPLIED', resourceReferences: { courseId: context.courseId }, resultingRevision: '1', appliedAt: confirmedAt },
    EnrollmentAuditEvent: { id: randomUUID(), actorKind: 'ACCOUNT', actorReference: adminId, operation: 'COURSE_PRICE_SET', targetKind: 'COURSE', targetId: context.courseId,
      commandId: null, providerEventId: null, effectKey: null, requestId: randomUUID(), occurredAt: confirmedAt, beforeRevision: null, afterRevision: '1', result: 'APPLIED' },
  };
  rows.EnrollmentAuditEvent!.commandId = rows.EnrollmentCommand!.commandId;
  if (override) rows[override.table] = { ...rows[override.table], ...override.values };
  for (const table of ['CoursePrice', 'ReservationRequest', 'EnrollmentOrder', 'EnrollmentOrderItem', 'SeatReservation', 'PaymentAttempt', 'VerifiedPayment', 'ProviderReceipt', 'Enrollment'] as const) {
    await insertEnrollmentRow(context.database.pool, table, rows[table]!);
  }
  const incidentPayment = { ...rows.VerifiedPayment!, id: incidentPaymentId, providerPaymentId: randomUUID(), orderId: null,
    amountUnits: '1234567', amountScale: 3, currency: 'USD', merchantReference: 'fixture-unknown-reference', reconciliationState: 'INCIDENT' };
  await insertEnrollmentRow(context.database.pool, 'VerifiedPayment', incidentPayment);
  for (const table of ['PaymentIncident', 'IncidentFollowUp', 'EnrollmentCommand', 'EnrollmentAuditEvent'] as const) {
    await insertEnrollmentRow(context.database.pool, table, rows[table]!);
  }
  return { rows, incidentPayment };
}
