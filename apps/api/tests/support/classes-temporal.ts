import type { Pool } from 'pg';
import { classesFixture } from './classes.js';
import { sessionFixture } from './session-fixture.js';
import { seedCommitment } from './enrollment-maintenance.js';
import { postgresInstantParameter } from '../../src/modules/enrollment/infrastructure/temporal.js';

/** Exact schema-local clock; no Date rounding or mutation of original enrollment. */
export async function classesTemporalFixture() {
  const f = await classesFixture();
  try {
    const schema = f.environment.databaseSchema;
    if (!/^t_classes_fixture_[a-f0-9]+$/.test(schema)) throw new Error('Invalid isolated classes schema');
    const base = BigInt((await f.pool.query(`SELECT
      (extract(epoch FROM pg_catalog.clock_timestamp())*1000000)::numeric(30,0)::text AS at`)).rows[0].at);
    await f.isolated.ownerQuery(`CREATE TABLE "ClassesTestClock" (id int PRIMARY KEY CHECK(id=1),instant timestamptz(6) NOT NULL);
      INSERT INTO "ClassesTestClock" VALUES (1,pg_catalog.clock_timestamp());
      CREATE FUNCTION clock_timestamp() RETURNS timestamptz LANGUAGE sql VOLATILE AS
      $$ SELECT instant FROM "ClassesTestClock" WHERE id=1 $$;`);
    const configure = (pool: Pool) => { pool.options.options = `-c search_path=${schema},pg_catalog -c timezone=UTC`; };
    configure(f.pool);
    await f.pool.query(`SET search_path TO "${schema}",pg_catalog`);
    const set = async (at: bigint) => {
      await f.pool.query('UPDATE "ClassesTestClock" SET instant=$1::timestamptz WHERE id=1', [postgresInstantParameter(at)]);
      await f.pool.query(`UPDATE "Session" SET "createdAt"=clock_timestamp()-interval '1 minute',
        "lastAcceptedAt"=clock_timestamp()-interval '1 minute',"absoluteExpiresAt"=clock_timestamp()+interval '7 hours 59 minutes'`);
    };
    const temporalStudent = await sessionFixture(f);
    await set(base + 1000001n);
    await seedCommitment({ ...f, student: temporalStudent }, 'ENROLLED', f.pool, '1000');
    const bounds = (await f.pool.query<{ start: string; end: string }>(`SELECT
      (extract(epoch FROM "confirmedAt")*1000000)::numeric(30,0)::text AS start,
      (extract(epoch FROM "validUntil")*1000000)::numeric(30,0)::text AS end
      FROM "Enrollment" WHERE "studentId"=$1`, [temporalStudent.userId])).rows[0];
    await set(base);
    return { ...f, temporalStudent, base, confirmedAt: BigInt(bounds.start), validUntil: BigInt(bounds.end), set, clock: { configure } };
  } catch (error) { await f.cleanup(); throw error; }
}
export type ClassesTemporalFixture = Awaited<ReturnType<typeof classesTemporalFixture>>;
