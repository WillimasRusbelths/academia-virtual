import { randomUUID } from 'node:crypto';
import { test, expect } from 'vitest';
import { baselineMigrations, enrollmentTables, historicalMigrationHashes, preEnrollmentDatabase,
  legacyFingerprint, seedEnrollmentGraph, insertEnrollmentRow, deployEnrollmentWithPrisma } from '../support/enrollment-migration.js';
import type { EnrollmentTable, EnrollmentMigrationContext, FixtureRow } from '../support/enrollment-migration.js';
import { identityDatabase } from '../support/identity-database.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repositoryRoot } from '../../src/infrastructure/config/environment.js';

/** Cada caso llega por separado a un snapshot real y a applyEnrollment; no beforeAll
 * que oculte casos, skip/fails ni aserción que convierta migración ausente en verde.
 */
function migrationCase(name: string, operation: (context: EnrollmentMigrationContext) => Promise<void>) {
  test(name, async () => {
    const context = await preEnrollmentDatabase();
    try { await context.applyEnrollment(); await operation(context); }
    finally { await context.cleanup(); }
  }, 120000);
}

test('EM00 control snapshot 0005, datos anteriores y runtime sin DDL', async () => {
  const context = await preEnrollmentDatabase();
  try {
    expect(context.isolated.schema).toMatch(/^t_enrollment_upgrade_/);
    expect(historicalMigrationHashes()).toHaveLength(5);
    expect(baselineMigrations[4]).toBe('0005_academic_offering');
    expect((await context.database.pool.query('SELECT count(*)::text AS count FROM "User"')).rows[0].count).toBe('3');
    expect((await context.database.pool.query('SELECT count(*)::text AS count FROM "AcademicGroup"')).rows[0].count).toBe('1');
    expect((await context.database.pool.query(`SELECT "bootstrapCompletedAt" IS NULL
      AND "firstAdminUserId" IS NULL AS untouched FROM "SystemState" WHERE id=1`)).rows[0].untouched).toBe(true);
    await expect(context.database.pool.query('CREATE TABLE forbidden_enrollment_ddl(id int)')).rejects.toMatchObject({ code: '42501' });
  } finally { await context.cleanup(); }
}, 120000);

test('EM01 control motor: microsegundos, epoch negativo y límite civil año 10000', async () => {
  const context = await preEnrollmentDatabase();
  try {
    const result = await context.database.pool.query<{ epoch: string; next: string; boundary: string }>(`SELECT
      (extract(epoch FROM '1969-12-31 23:59:59.999999+00'::timestamptz)*1000000)::bigint::text AS epoch,
      to_char(('1969-12-31 23:59:59.999999+00'::timestamptz+interval '1 microsecond') AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS next,
      (extract(epoch FROM (('9999-12-31'::date+1)::timestamp AT TIME ZONE 'America/Lima'))*1000000)::bigint::text AS boundary`);
    expect(result.rows[0]).toEqual({ epoch: '-1', next: '1970-01-01T00:00:00.000000Z', boundary: '253402318800000000' });
    // Control del motor, no del adaptador/normalizador todavía ausentes.
  } finally { await context.cleanup(); }
}, 120000);

test('EM02 upgrade conserva filas/cuentas/credenciales/oferta/auditoría y no crea finanzas ficticias', async () => {
  const context = await preEnrollmentDatabase();
  try {
    const hashes = historicalMigrationHashes(), before = await legacyFingerprint(context.database.pool);
    await context.applyEnrollment();
    expect(await legacyFingerprint(context.database.pool) === before).toBe(true);
    expect(historicalMigrationHashes()).toEqual(hashes);
    for (const name of enrollmentTables) {
      const result = await context.database.pool.query(`SELECT count(*)::text AS count FROM "${name}"`);
      expect(result.rows[0].count).toBe(['AdmissionSequence', 'DispatchState'].includes(name) ? '1' : '0');
    }
    const description = await context.database.pool.query(`SELECT is_nullable FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='AcademicGroup' AND column_name='description'`);
    expect(description.rows).toEqual([{ is_nullable: 'YES' }]);
    expect((await context.database.pool.query('SELECT description FROM "AcademicGroup"')).rows).toEqual([{ description: null }]);
    await expect(context.database.pool.query('CREATE TABLE forbidden_new_ddl(id int)')).rejects.toMatchObject({ code: '42501' });
  } finally { await context.cleanup(); }
}, 120000);

for (const table of enrollmentTables) migrationCase(`EM-valid ${table}: fila válida, PK y DML real`, async context => {
  const { rows } = await seedEnrollmentGraph(context);
  const pool = context.database.pool;
  expect((await pool.query(`SELECT count(*)::int AS count FROM "${table}"`)).rows[0].count).toBeGreaterThan(0);
  const pk = await pool.query(`SELECT 1 FROM pg_constraint WHERE conrelid=$1::regclass AND contype='p'`, [`"${context.isolated.schema}"."${table}"`]);
  expect(pk.rowCount).toBe(1);
  if (table === 'AdmissionSequence' || table === 'DispatchState') {
    await expect(pool.query(`INSERT INTO "${table}" SELECT * FROM "${table}"`)).rejects.toMatchObject({ code: '23505' });
  } else await expect(insertEnrollmentRow(pool, table, rows[table]!)).rejects.toMatchObject({ code: '23505' });
});

const foreignKeys: readonly [EnrollmentTable, string][] = [
  ['CoursePrice', 'courseId'], ['CoursePrice', 'changedBy'], ['ReservationRequest', 'studentId'],
  ['EnrollmentOrder', 'studentId'], ['EnrollmentOrder', 'requestId'],
  ['EnrollmentOrderItem', 'orderId'], ['EnrollmentOrderItem', 'courseId'], ['EnrollmentOrderItem', 'groupId'],
  ['SeatReservation', 'orderItemId'], ['PaymentAttempt', 'orderId'], ['PaymentAttempt', 'studentId'],
  ['ProviderReceipt', 'terminalPaymentId'], ['VerifiedPayment', 'orderId'],
  ['Enrollment', 'orderItemId'], ['Enrollment', 'studentId'], ['Enrollment', 'courseId'], ['Enrollment', 'groupId'], ['Enrollment', 'paymentId'],
  ['PaymentIncident', 'verifiedPaymentId'], ['PaymentIncident', 'orderId'], ['IncidentFollowUp', 'incidentId'], ['IncidentFollowUp', 'adminUserId'],
];
for (const [table, field] of foreignKeys) migrationCase(`EM-FK ${table}.${field}: referencia inexistente`, async context => {
  await expect(seedEnrollmentGraph(context, { table, values: { [field]: randomUUID() } })).rejects.toMatchObject({ code: '23503' });
});

const checks: readonly [EnrollmentTable, string, unknown, readonly string[]][] = [
  ['CoursePrice', 'amountMinor', '-1', ['23514']], ['CoursePrice', 'amountMinor', null, ['23502']],
  ['CoursePrice', 'currency', 'USD', ['23514', '22P02']], ['CoursePrice', 'revision', '0', ['23514']],
  ['ReservationRequest', 'admissionSequence', '0', ['23514']], ['ReservationRequest', 'authVersion', '-1', ['23514']],
  ['ReservationRequest', 'groupIds', [], ['23514']], ['ReservationRequest', 'state', 'UNKNOWN', ['23514', '22P02']],
  ['EnrollmentOrder', 'currency', 'USD', ['23514', '22P02']], ['EnrollmentOrder', 'totalMinor', '-1', ['23514']],
  ['EnrollmentOrder', 'revision', '0', ['23514']], ['EnrollmentOrder', 'state', 'CANCELLED', ['23514', '22P02']],
  ['EnrollmentOrder', 'expiresAt', '2026-11-02T00:00:00.123455Z', ['23514']],
  ['EnrollmentOrderItem', 'priceMinor', '-1', ['23514']], ['EnrollmentOrderItem', 'periodEnd', '2030-01-01', ['23514']],
  ['EnrollmentOrderItem', 'timeZone', 'UTC', ['23514', '22P02']], ['EnrollmentOrderItem', 'scheduleSnapshot', [], ['23514']],
  ['EnrollmentOrderItem', 'enrollmentValidUntil', '2030-01-01T05:00:00.000000Z', ['23514']],
  ['SeatReservation', 'state', 'CANCELLED', ['23514', '22P02']], ['PaymentAttempt', 'state', 'UNKNOWN', ['23514', '22P02']],
  ['ProviderReceipt', 'state', 'PENDING_RECONCILIATION', ['23514', '22P02']],
  ['ProviderReceipt', 'state', 'RECEIVED', ['23514']],
  ['VerifiedPayment', 'reconciliationState', 'PENDING_RECONCILIATION', ['23514', '22P02']],
  ['VerifiedPayment', 'orderId', null, ['23514']], ['VerifiedPayment', 'currency', 'USD', ['23514']],
  ['Enrollment', 'originalPeriodEnd', '2030-01-01', ['23514']], ['Enrollment', 'timeZone', 'UTC', ['23514', '22P02']],
  ['Enrollment', 'validUntil', '2026-10-31T00:00:00.000000Z', ['23514']],
  ['IncidentFollowUp', 'content', null, ['23502']], ['EnrollmentCommand', 'resultingRevision', '0', ['23514']],
  ['EnrollmentCommand', 'operation', null, ['23502']], ['EnrollmentCommand', 'actorKind', 'VISITOR', ['23514', '22P02']],
  ['EnrollmentAuditEvent', 'afterRevision', '0', ['23514']], ['EnrollmentAuditEvent', 'operation', null, ['23502']],
];
for (const [table, field, value, codes] of checks) migrationCase(`EM-CHECK ${table}.${field}=${JSON.stringify(value)}`, async context => {
  const result = await seedEnrollmentGraph(context, { table, values: { [field]: value } })
    .then(() => ({ code: 'UNEXPECTED_SUCCESS' }), (error: unknown) => ({ code: String((error as { code?: string }).code) }));
  expect(codes).toContain(result.code);
});

const unique: readonly [EnrollmentTable, string, FixtureRow][] = [
  ['ReservationRequest', 'studentId/intentionId', { admissionSequence: '2' }],
  ['ReservationRequest', 'admissionSequence', { intentionId: 'NEW_UUID' }],
  ['EnrollmentOrder', 'requestId', {}], ['EnrollmentOrderItem', 'orderId/courseId', {}],
  ['SeatReservation', 'orderItemId', {}], ['PaymentAttempt', 'studentId/initiationId', { merchantReference: 'fixture-other', externalIdempotencyKey: 'NEW_UUID' }],
  ['VerifiedPayment', 'providerScope/providerPaymentId', {}], ['Enrollment', 'orderItemId', {}],
  ['PaymentIncident', 'verifiedPaymentId/reason', {}], ['EnrollmentCommand', 'actorKind/actorReference/commandId con otra operación', { operation: 'INCIDENT_FOLLOW_UP' }],
];
for (const [table, label, changes] of unique) migrationCase(`EM-UNIQUE ${table}: ${label}`, async context => {
  const { rows } = await seedEnrollmentGraph(context);
  const row: FixtureRow = { ...rows[table]!, ...(table !== 'EnrollmentCommand' ? { id: randomUUID() } : {}) };
  for (const [key, value] of Object.entries(changes)) row[key] = value === 'NEW_UUID' ? randomUUID() : value;
  await expect(insertEnrollmentRow(context.database.pool, table, row)).rejects.toMatchObject({ code: '23505' });
});

migrationCase('EM-money cero explícito y PEN exacto más allá de 2^53 sin backfill', async context => {
  const { rows } = await seedEnrollmentGraph(context);
  await context.database.pool.query('UPDATE "CoursePrice" SET "amountMinor"=$2 WHERE "courseId"=$1', [context.courseId, '9007199254740993']);
  expect((await context.database.pool.query('SELECT "amountMinor"::text AS value FROM "CoursePrice"')).rows[0].value).toBe('9007199254740993');
  await insertEnrollmentRow(context.database.pool, 'CoursePrice', { ...rows.CoursePrice!, courseId: context.otherCourseId, amountMinor: '0' });
  expect((await context.database.pool.query('SELECT "amountMinor"::text AS value FROM "CoursePrice" WHERE "courseId"=$1', [context.otherCourseId])).rows[0].value).toBe('0');
});

migrationCase('EM-economic scope distinto y dinero incompatible conservado como INCIDENT', async context => {
  const { rows, incidentPayment } = await seedEnrollmentGraph(context);
  await insertEnrollmentRow(context.database.pool, 'VerifiedPayment', { ...rows.VerifiedPayment!, id: randomUUID(), providerScope: 'fixture/other-merchant/sandbox' });
  const payment = await context.database.pool.query(`SELECT "amountUnits"::text AS amount,"amountScale",currency,"orderId"
    FROM "VerifiedPayment" WHERE id=$1`, [incidentPayment.id]);
  expect(payment.rows).toEqual([{ amount: '1234567', amountScale: 3, currency: 'USD', orderId: null }]);
});

migrationCase('EM-receipt no introduce FK provisional a orden ni recibo como pago', async context => {
  await seedEnrollmentGraph(context);
  const fks = await context.database.pool.query<{ target: string }>(`SELECT confrelid::regclass::text AS target FROM pg_constraint
    WHERE conrelid=$1::regclass AND contype='f'`, [`"${context.isolated.schema}"."ProviderReceipt"`]);
  expect(fks.rows.every(row => !row.target.includes('EnrollmentOrder'))).toBe(true);
});

for (const table of ['IncidentFollowUp', 'EnrollmentAuditEvent'] as const) for (const action of ['UPDATE', 'DELETE'] as const) {
  migrationCase(`EM-append ${table}: ${action} rechazado`, async context => {
    await seedEnrollmentGraph(context);
    const sql = action === 'DELETE' ? `DELETE FROM "${table}"` : table === 'IncidentFollowUp'
      ? 'UPDATE "IncidentFollowUp" SET content=\'Contenido reemplazado\'' : 'UPDATE "EnrollmentAuditEvent" SET result=\'NO_CHANGE\'';
    const result = await context.database.pool.query(sql).then(() => ({ code: 'UNEXPECTED_SUCCESS' }),
      (error: unknown) => ({ code: String((error as { code?: string }).code) }));
    expect(['42501', '23514']).toContain(result.code);
  });
}

migrationCase('EM-active una sola orden RESERVED por alumno y estados históricos no bloquean', async context => {
  const { rows } = await seedEnrollmentGraph(context);
  const make = async () => {
    const requestId = randomUUID();
    await insertEnrollmentRow(context.database.pool, 'ReservationRequest', { ...rows.ReservationRequest!, id: requestId, intentionId: randomUUID(), admissionSequence: String(BigInt('0x' + randomUUID().replaceAll('-', '').slice(0, 12))) });
    return { ...rows.EnrollmentOrder!, id: randomUUID(), requestId, state: 'RESERVED' };
  };
  await insertEnrollmentRow(context.database.pool, 'EnrollmentOrder', await make());
  await expect(insertEnrollmentRow(context.database.pool, 'EnrollmentOrder', await make())).rejects.toMatchObject({ code: '23505' });
  const index = await context.database.pool.query<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes
    WHERE schemaname=current_schema() AND tablename='EnrollmentOrder'`);
  expect(index.rows.some(row => row.indexdef.includes('UNIQUE') && row.indexdef.includes('RESERVED') && !/now\(|clock_timestamp\(/i.test(row.indexdef))).toBe(true);
});

migrationCase('EM-attempt FK compuesta no acepta otra cuenta existente de la orden', async context => {
  await expect(seedEnrollmentGraph(context, { table: 'PaymentAttempt', values: { studentId: context.admin.userId } }))
    .rejects.toMatchObject({ code: '23503' });
});

for (const table of ['AdmissionSequence', 'DispatchState'] as const) migrationCase(`EM-coordinator ${table}: id fijo`, async context => {
  await expect(context.database.pool.query(`INSERT INTO "${table}" (id${table === 'AdmissionSequence' ? ',"nextSequence"' : ''})
    VALUES (2${table === 'AdmissionSequence' ? ',1' : ''})`)).rejects.toMatchObject({ code: '23514' });
});

migrationCase('EM-counter secuencia positiva', async context => {
  await expect(context.database.pool.query('UPDATE "AdmissionSequence" SET "nextSequence"=0')).rejects.toMatchObject({ code: '23514' });
});

migrationCase('EM-effect ORDER_EXPIRED/orderId único y SYSTEM sin usuario financiero ficticio', async context => {
  const { rows } = await seedEnrollmentGraph(context);
  const requestId = randomUUID(), orderId = randomUUID();
  const confirmedAt = '2026-10-30T00:00:00.123456Z', expiresAt = '2026-10-31T00:00:00.123456Z';
  await insertEnrollmentRow(context.database.pool, 'ReservationRequest', { ...rows.ReservationRequest!, id: requestId,
    intentionId: randomUUID(), admissionSequence: '2', admittedAt: confirmedAt, decidedAt: confirmedAt });
  await insertEnrollmentRow(context.database.pool, 'EnrollmentOrder', { ...rows.EnrollmentOrder!, id: orderId,
    requestId, state: 'EXPIRED', revision: '2', confirmedAt, expiresAt, expirationProcessedAt: expiresAt });
  const event = { ...rows.EnrollmentAuditEvent!, id: randomUUID(), actorKind: 'SYSTEM', actorReference: 'enrollment-expiration',
    operation: 'ORDER_EXPIRED', targetKind: 'ORDER', targetId: orderId, commandId: null,
    effectKey: `ORDER_EXPIRED/${orderId}`, occurredAt: expiresAt, beforeRevision: '1', afterRevision: '2' };
  await insertEnrollmentRow(context.database.pool, 'EnrollmentAuditEvent', event);
  await expect(insertEnrollmentRow(context.database.pool, 'EnrollmentAuditEvent', { ...event, id: randomUUID() }))
    .rejects.toMatchObject({ code: '23505' });
});

migrationCase('EM-unresolved una sola iniciación no resuelta por orden', async context => {
  const { rows } = await seedEnrollmentGraph(context);
  const requestId = randomUUID(), orderId = randomUUID();
  await insertEnrollmentRow(context.database.pool, 'ReservationRequest', { ...rows.ReservationRequest!, id: requestId,
    intentionId: randomUUID(), admissionSequence: '2' });
  await insertEnrollmentRow(context.database.pool, 'EnrollmentOrder', { ...rows.EnrollmentOrder!, id: orderId, requestId, state: 'RESERVED' });
  const attempt = { ...rows.PaymentAttempt!, id: randomUUID(), orderId, initiationId: randomUUID(), state: 'SUBMITTING',
    merchantReference: `fixture-${randomUUID()}`, externalIdempotencyKey: randomUUID(), providerReference: null };
  await insertEnrollmentRow(context.database.pool, 'PaymentAttempt', attempt);
  await expect(insertEnrollmentRow(context.database.pool, 'PaymentAttempt', { ...attempt, id: randomUUID(),
    initiationId: randomUUID(), merchantReference: `fixture-${randomUUID()}`, externalIdempotencyKey: randomUUID() }))
    .rejects.toMatchObject({ code: '23505' });
});

for (const [table, statement] of [
  ['EnrollmentOrder', `UPDATE "EnrollmentOrder" SET "confirmedAt"="confirmedAt"+interval '86400 seconds',"expiresAt"="expiresAt"+interval '86400 seconds'`],
  ['EnrollmentOrderItem', 'UPDATE "EnrollmentOrderItem" SET "priceMinor"="priceMinor"+1'],
  ['Enrollment', `UPDATE "Enrollment" SET "validUntil"="validUntil"+interval '86400 seconds'`],
] as const) migrationCase(`EM-immutable ${table}: snapshot original conservado`, async context => {
  await seedEnrollmentGraph(context);
  const fingerprint = async () => (await context.database.pool.query(`SELECT to_jsonb(t)::text AS row FROM "${table}" t ORDER BY id`)).rows;
  const before = await fingerprint();
  await expect(context.database.pool.query(statement)).rejects.toMatchObject({ code: '23514' });
  expect(JSON.stringify(await fingerprint()) === JSON.stringify(before)).toBe(true);
});

migrationCase('EM-RESTRICT referencias a identidad/oferta sin cascadas', async context => {
  const result = await context.database.pool.query<{ confdeltype: string }>(`SELECT c.confdeltype FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_class parent ON parent.oid=c.confrelid WHERE n.nspname=current_schema()
    AND t.relname=ANY($1::text[]) AND parent.relname=ANY($2::text[]) AND c.contype='f'`,
  [enrollmentTables, ['User', 'AcademicCourse', 'AcademicGroup']]);
  expect(result.rows.length).toBeGreaterThan(0);
  expect(result.rows.every(row => row.confdeltype === 'r')).toBe(true);
});

test('EM-deploy upgrade 0005 con Prisma, checksums reales y datos anteriores preservados', async () => {
  const context = await preEnrollmentDatabase();
  try {
    const before = await legacyFingerprint(context.database.pool);
    deployEnrollmentWithPrisma(context);
    expect(await legacyFingerprint(context.database.pool) === before).toBe(true);
    const history = await context.database.pool.query<{ migration_name: string; checksum: string }>(
      'SELECT migration_name,checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name');
    expect(history.rows.map(row => row.migration_name)).toEqual([...baselineMigrations, '0006_enrollment', '0007_payment_reconciliation']);
    for (const row of history.rows) {
      const bytes = readFileSync(path.join(repositoryRoot(), 'apps/api/prisma/migrations', row.migration_name, 'migration.sql'));
      expect(row.checksum).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
    expect((await context.database.pool.query('SELECT count(*)::int AS n FROM "CoursePrice"')).rows[0].n).toBe(0);
    expect((await context.database.pool.query('SELECT count(*)::int AS n FROM "EnrollmentOrder"')).rows[0].n).toBe(0);
    await expect(context.database.pool.query('CREATE TABLE forbidden_deploy_ddl(id int)')).rejects.toMatchObject({ code: '42501' });
  } finally { await context.cleanup(); }
}, 120000);

test('EM-deploy instalación nueva con seis migraciones y cliente generado utilizable', async () => {
  const context = await identityDatabase('enrollment_deploy');
  try {
    const history = await context.database.pool.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name');
    expect(history.rows.map(row => row.migration_name)).toEqual([...baselineMigrations, '0006_enrollment', '0007_payment_reconciliation']);
    expect(await context.database.prisma.admissionSequence.findUnique({ where: { id: 1 } })).toEqual({ id: 1, nextSequence: 1n });
    expect(await context.database.prisma.dispatchState.findUnique({ where: { id: 1 } })).toEqual({ id: 1 });
    expect(await context.database.prisma.enrollment.count()).toBe(0);
    expect(await context.database.prisma.coursePrice.count()).toBe(0);
  } finally { await context.cleanup(); }
}, 120000);

for (const table of ['AdmissionSequence', 'DispatchState'] as const) migrationCase(`EM-durable ${table}: no borrar coordinadora`, async context => {
  await expect(context.database.pool.query(`DELETE FROM "${table}"`)).rejects.toMatchObject({ code: '23514' });
});
migrationCase('EM-durable contador puede avanzar pero no retroceder', async context => {
  await context.database.pool.query('UPDATE "AdmissionSequence" SET "nextSequence"=2');
  await expect(context.database.pool.query('UPDATE "AdmissionSequence" SET "nextSequence"=1')).rejects.toMatchObject({ code: '23514' });
  expect((await context.database.pool.query('SELECT "nextSequence"::text AS n FROM "AdmissionSequence"')).rows[0].n).toBe('2');
});

for (const [label, slots] of [
  ['null', null], ['no array', {}], ['vacío', []],
  ['día fuera de rango', [{ dayOfWeek: 8, startTime: '18:00', endTime: '19:00' }]],
  ['campo nulo', [{ dayOfWeek: 1, startTime: null, endTime: '19:00' }]],
  ['horario invertido', [{ dayOfWeek: 1, startTime: '19:00', endTime: '18:00' }]],
  ['campos sobrantes', [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00', private: 'no' }]],
  ['solapamiento', [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }, { dayOfWeek: 1, startTime: '18:30', endTime: '19:30' }]],
] as const) migrationCase(`EM-snapshot forma inválida: ${label}`, async context => {
  await expect(seedEnrollmentGraph(context, { table: 'EnrollmentOrderItem', values: { scheduleSnapshot: slots } }))
    .rejects.toMatchObject({ code: '23514' });
});
migrationCase('EM-snapshot franjas contiguas válidas sin solapamiento', async context => {
  const slots = [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }, { dayOfWeek: 1, startTime: '19:00', endTime: '20:00' }];
  await seedEnrollmentGraph(context, { table: 'EnrollmentOrderItem', values: { scheduleSnapshot: slots } });
  expect((await context.database.pool.query('SELECT "scheduleSnapshot" FROM "EnrollmentOrderItem"')).rows[0].scheduleSnapshot).toEqual(slots);
});
migrationCase('EM-evidence unidades incompatibles grandes no se redondean ni se fuerzan a PEN', async context => {
  const { incidentPayment } = await seedEnrollmentGraph(context);
  const amount = '123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890';
  await insertEnrollmentRow(context.database.pool, 'VerifiedPayment', { ...incidentPayment, id: randomUUID(),
    providerPaymentId: randomUUID(), amountUnits: amount, amountScale: 7 });
  const row = await context.database.pool.query('SELECT "amountUnits"::text AS amount,currency FROM "VerifiedPayment" WHERE "amountScale"=7');
  expect(row.rows).toEqual([{ amount, currency: 'USD' }]);
});
for (const [label, groups] of [
  ['duplicado', ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001']],
  ['nulo', ['00000000-0000-0000-0000-000000000001', null]],
  ['dos dimensiones', [['00000000-0000-0000-0000-000000000001']]],
  ['desordenado', ['00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001']],
] as const) migrationCase(`EM-groups conjunto inválido: ${label}`, async context => {
  await expect(seedEnrollmentGraph(context, { table: 'ReservationRequest', values: { groupIds: groups } })).rejects.toMatchObject({ code: '23514' });
});
migrationCase('EM-metadata descripción nullable conserva retiro previo y curso inmutable', async context => {
  const pool = context.database.pool;
  await pool.query('UPDATE "AcademicGroup" SET description=$2 WHERE id=$1', [context.groupId, 'Descripción ficticia']);
  await pool.query('UPDATE "AcademicCourse" SET state=\'PUBLISHED\' WHERE id=$1', [context.courseId]);
  const v = (await pool.query('SELECT "eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"=$1', [context.teacher.userId])).rows[0].eligibilityVersion;
  await pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"=$2,"publishedTeacherEligibilityVersion"=$3 WHERE id=$1`, [context.groupId, context.teacher.userId, v]);
  await expect(pool.query('UPDATE "AcademicGroup" SET description=$2 WHERE id=$1', [context.groupId, 'Cambio sin retiro'])).rejects.toMatchObject({ code: '23514' });
  await pool.query('UPDATE "AcademicGroup" SET state=\'WITHDRAWN\' WHERE id=$1', [context.groupId]);
  await pool.query('UPDATE "AcademicGroup" SET description=NULL WHERE id=$1', [context.groupId]);
  await expect(pool.query('UPDATE "AcademicGroup" SET "courseId"=$2 WHERE id=$1', [context.groupId, context.otherCourseId])).rejects.toMatchObject({ code: '23514' });
});
