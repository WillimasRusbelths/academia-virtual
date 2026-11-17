import { createHash } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { materialsFixture } from '../support/materials.js';
import type { MaterialsFixture } from '../support/materials.js';
import { materialFileCase } from '../support/materials-files.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';

let f: MaterialsFixture;
beforeAll(async () => { f = await materialsFixture(); }, 120000);
afterAll(async () => { await f?.cleanup(); });

test('two groups share a course while cancelled history and each material retain separate identities', async () => {
  const groups = (await f.pool.query('SELECT id,"courseId",state FROM "AcademicGroup" ORDER BY id')).rows;
  expect(groups).toHaveLength(3); expect(new Set(groups.map(g => g.courseId))).toEqual(new Set([f.courseId]));
  expect(groups.find(g => g.id === f.cancelledGroupId)?.state).toBe('CANCELLED');
  const states = (await f.pool.query('SELECT state FROM "Material" WHERE "groupId"=$1 ORDER BY state', [f.groupId])).rows.map(r => r.state);
  expect(new Set(states)).toEqual(new Set(['PREPARED', 'PUBLISHED', 'WITHDRAWN']));
  for (const material of [f.prepared, f.published, f.withdrawn, f.otherPublished, f.cancelledPublished]) {
    const row = (await f.pool.query(`SELECT m."groupId",m."createdBy",c.bytes,c.sha256 FROM "Material" m
      JOIN "MaterialContent" c ON c."materialId"=m.id WHERE m.id=$1`, [material.id])).rows[0];
    expect(row.groupId).toBe(material.groupId); expect(row.createdBy).toBe(material.authorId);
    expect(row.bytes).toEqual(materialFileCase(material.fileId).bytes);
    expect(createHash('sha256').update(row.bytes).digest('hex')).toBe(material.sha256);
    expect(row.sha256).toBe(material.sha256);
  }
});

test('matrix contains real valid/historical/other-group enrollments, pending finance and non-enrolled accounts', async () => {
  const rights = (await f.pool.query(`SELECT "studentId","groupId",("confirmedAt" <= clock_timestamp()
    AND clock_timestamp() < "validUntil") AS current FROM "Enrollment"`)).rows;
  expect(rights.find(r => r.studentId === f.student.userId)).toMatchObject({ groupId: f.groupId, current: true });
  expect(rights.find(r => r.studentId === f.historicalStudent.userId)).toMatchObject({ groupId: f.groupId, current: false });
  expect(rights.find(r => r.studentId === f.otherStudent.userId)).toMatchObject({ groupId: f.otherGroupId, current: true });
  for (const actor of [f.unEnrolledStudent, f.reservationStudent, f.pendingStudent, f.incidentStudent]) {
    expect(rights.some(r => r.studentId === actor.userId)).toBe(false);
  }
  expect((await f.pool.query('SELECT state FROM "PaymentAttempt" WHERE "studentId"=$1', [f.pendingStudent.userId])).rows).toEqual([{ state: 'PENDING' }]);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "PaymentIncident"')).rows[0].n).toBe(1);
  const sessions = new PostgresSessionStore(f.pool);
  expect(await sessions.lookup(f.teacher.secret)).not.toBeNull();
  expect(await sessions.lookup(f.disabledStudent.secret)).toBeNull();
  expect(await sessions.lookup(f.revokedStudent.secret)).toBeNull();
  expect((await f.pool.query('SELECT eligible FROM "AcademicTeacherDirectory" WHERE "userId"=$1', [f.ineligibleTeacher.userId])).rows[0].eligible).toBe(false);
});

test('creating additional synthetic material does not modify financial snapshots or another schema', async () => {
  const before = await financialFingerprint(f.pool);
  const second = await materialsFixture();
  try {
    expect(second.isolated.schema).not.toBe(f.isolated.schema);
    await second.seedMaterial('PUBLISHED');
    expect((await f.pool.query('SELECT count(*)::int AS n FROM "Material"')).rows[0].n).toBe(5);
    await f.seedMaterial('PREPARED');
    expect(await financialFingerprint(f.pool)).toBe(before);
  } finally { await second.cleanup(); }
});
