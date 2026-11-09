import { test, expect } from 'vitest';
import { enrollmentDataset } from '../support/enrollment.js';
import type { EnrollmentDataset } from '../support/enrollment.js';
import { assertAcademicFixtureInputs } from '../support/academic-offering.js';
import { waitForBlockedBy } from '../support/locks.js';
import { us1Http } from '../support/us1-http.js';

test('el soporte de matrícula rechaza modo manual antes de abrir conexiones', () => {
  expect(() => assertAcademicFixtureInputs({ APP_ENV: 'development' })).toThrow('APP_ENV=test');
});

test('datasets separan actores/escenarios y limpieza sin consumir bootstrap', async () => {
  const first = await enrollmentDataset('enrollment_harness_a', 'AWAITING_PAYMENT');
  let second: EnrollmentDataset | undefined;
  try {
    second = await enrollmentDataset('enrollment_harness_b', 'INCIDENT');
    expect(first.context.isolated.schema).not.toBe(second.context.isolated.schema);
    expect(first.context.isolated.schema).toMatch(/^t_/);
    expect(new Set(Object.values(first.actors).map(actor => actor.id)).size).toBe(4);
    expect(first.actors.owner.id).not.toBe(second.actors.owner.id);
    expect(first.financial.scenario).toBe('AWAITING_PAYMENT');
    expect(second.financial.scenario).toBe('INCIDENT');
    expect(first.financial.persisted).toBe(false);
    expect(second.financial.persisted).toBe(false);
    expect(first.financial.intentionId).not.toBe(second.financial.intentionId);
    const removedSchema = first.context.isolated.schema;
    await first.cleanup();
    await first.cleanup();
    const db = second.context.database.pool;
    expect(Number((await db.query<{ count: string }>('SELECT count(*) AS count FROM "User"')).rows[0].count)).toBe(15);
    expect(Number((await db.query<{ count: string }>('SELECT count(*) AS count FROM "AcademicGroup"')).rows[0].count)).toBe(2);
    expect((await db.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [removedSchema])).rowCount).toBe(0);
    expect((await db.query<{ untouched: boolean }>(`SELECT "bootstrapCompletedAt" IS NULL
      AND "firstAdminUserId" IS NULL AS untouched FROM "SystemState" WHERE id=1`)).rows[0].untouched).toBe(true);
  } finally { await first.cleanup(); await second?.cleanup(); }
}, 120000);

test('fixture sirve identidad y oferta visible/oculta mediante HTTP existente', async () => {
  const data = await enrollmentDataset('enrollment_http');
  let server: Awaited<ReturnType<typeof us1Http>> | undefined;
  try {
    server = await us1Http(data);
    for (const actor of Object.values(data.actors)) {
      const response = await server.get('/me', actor.secret);
      expect(response.status).toBe(200);
      expect((await response.json()).data.id === actor.id).toBe(true);
    }
    const visible = await server.get(`/academic/courses/${data.offer.courseId}/groups/${data.offer.groupId}`, data.actors.owner.secret);
    expect(visible.status).toBe(200);
    const body = (await visible.json()).data;
    expect(body.id).toBe(data.offer.groupId);
    expect(body.occupancy).toBeNull();
    expect(body.availability).toBeNull();
    expect(body.capacityStatus).toBe('NOT_CALCULATED');
    const hidden = await server.get(`/academic/courses/${data.offer.hiddenCourseId}/groups/${data.offer.hiddenGroupId}`, data.actors.owner.secret);
    expect(hidden.status).toBe(404);
    expect((await server.get('/academic/courses')).status).toBe(401);
  } finally { try { await server?.close(); } finally { await data.cleanup(); } }
}, 120000);

test('observador separado acredita bloqueo real sin importar Vitest al navegador', async () => {
  const data = await enrollmentDataset('enrollment_locks');
  const holder = await data.context.database.pool.connect();
  const waiter = await data.context.database.pool.connect();
  let waiting: Promise<unknown> | undefined;
  try {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [data.actors.owner.id]);
    const pid = (await holder.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await waiter.query('BEGIN');
    await waiter.query("SET LOCAL lock_timeout = '5s'");
    waiting = waiter.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [data.actors.owner.id]);
    void waiting.catch(() => undefined);
    await waitForBlockedBy(data.observerPool, pid);
    await holder.query('ROLLBACK');
    await waiting;
    await waiter.query('ROLLBACK');
  } finally {
    await holder.query('ROLLBACK');
    await waiting?.catch(() => undefined);
    await waiter.query('ROLLBACK');
    holder.release(); waiter.release(); await data.cleanup();
  }
}, 120000);
