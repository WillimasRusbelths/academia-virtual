import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { maintenanceSeed, resetAcademicFixture, commandCounts } from '../support/academic-maintenance-fixture.js';
import { academicFingerprint } from '../support/academic-preparation.js';
import { sessionFixture } from '../support/session-fixture.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';

let data: AcademicOfferingDataset, http: Us1Http, seed: Awaited<ReturnType<typeof maintenanceSeed>>;
type Kind = 'course-withdraw' | 'group-withdraw' | 'group-cancel';
const kinds: readonly Kind[] = ['course-withdraw', 'group-withdraw', 'group-cancel'];
const admin = () => data.account('ADMIN').sessions[0].secret;
const target = (kind: Kind) => kind === 'course-withdraw' ? seed.courseId : seed.groupId;
const route = (kind: Kind, id: string = target(kind)) => `/admin/academic/${kind === 'course-withdraw' ? 'courses' : 'groups'}/${id}/${kind === 'group-cancel' ? 'cancel' : 'withdraw'}`;
const body = (kind: Kind, revision = '1') => ({ commandId: randomUUID(), expectedRevision: revision,
  ...(kind === 'group-cancel' ? { cancellationReason: 'Motivo ficticio privado' } : {}) });
beforeAll(async () => { data = await academicOfferingDataset('academic_maintenance_http'); http = await us1Http(data); }, 120000);
beforeEach(async () => { await resetAcademicFixture(data); seed = await maintenanceSeed(data); });
afterAll(async () => { try { await http?.close(); } finally { await data?.cleanup(); } });
async function error(response: Response, status: number, code: string, before: string) {
  expect(response.status).toBe(status); const result = await response.json();
  expect(result.error.code).toBe(code); expect(result).not.toHaveProperty('data');
  expect(JSON.stringify(result)).not.toMatch(/Motivo ficticio|AcademicGroup|AcademicCommand|SELECT |UPDATE |INSERT |postgres|passwordHash|authVersion|eligibilityVersion/);
  expect(await academicFingerprint(data.observerPool)).toBe(before); return result;
}
for (const kind of kinds) for (const role of ['ADMIN', 'STUDENT', 'TEACHER', 'VISITOR'] as const) test(`M01 ${kind}/${role}: matriz HTTP real, datos mínimos y cero efectos denegados`, async () => {
  const input = body(kind), before = await academicFingerprint(data.observerPool);
  const secret = role === 'VISITOR' ? '' : data.account(role).sessions[0].secret;
  const response = await http.post(route(kind), input, secret);
  if (role !== 'ADMIN') {
    await error(response, role === 'VISITOR' ? 401 : 403, role === 'VISITOR' ? 'AUTH_REQUIRED' : 'FORBIDDEN', before); return;
  }
  expect(response.status).toBe(200); const result = (await response.json()).data;
  expect(result.command).toMatchObject({ id: input.commandId, replayed: false, result: 'APPLIED', appliedRevision: '2' });
  expect(result.resource).toMatchObject({ id: target(kind), state: kind === 'group-cancel' ? 'CANCELLED' : 'WITHDRAWN', revision: '2', studentVisible: false });
  const fields = kind === 'course-withdraw' ? ['id','name','description','state','revision','studentVisible','createdAt','updatedAt']
    : ['id','courseId','name','description','state','revision','periodStart','periodEnd','timeZone','capacity','schedule','teacher','teacherReviewRequired','studentVisible',
      'cancellationReason','cancelledAt','lastPublishedTeacherId','createdAt','updatedAt','occupancy','availability','capacityStatus'];
  expect(Object.keys(result.resource).sort()).toEqual(fields.sort());
  if (kind !== 'course-withdraw') expect(result.resource).toMatchObject({ occupancy: null, availability: null, capacityStatus: 'NOT_CALCULATED' });
  expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
});
for (const kind of kinds) for (const defect of ['csrf','origin','media','size','query'] as const) test(`M02 ${kind}: transporte ${defect} no permite mutación`, async () => {
  // Ruta real comprobada con revisión obsoleta, sin cambiar el estado del fixture.
  expect((await http.post(route(kind), body(kind, '2'), admin())).status).toBe(409);
  const before = await academicFingerprint(data.observerPool), headers: Record<string, string> = { ...http.headers(admin()) };
  if (defect === 'csrf') delete headers['x-csrf-protection'];
  if (defect === 'origin') headers.origin = 'https://foreign.example.test';
  if (defect === 'media') headers['content-type'] = 'text/plain';
  const response = await fetch(`${http.url}/api/v1${route(kind)}${defect === 'query' ? '?state=WITHDRAWN' : ''}`, {
    method: 'POST', headers, body: JSON.stringify({ ...body(kind), ...(defect === 'size' ? { padding: 'x'.repeat(17000) } : {}) }),
  });
  await error(response, defect === 'csrf' || defect === 'origin' ? 403 : defect === 'media' ? 415 : defect === 'size' ? 413 : 400,
    defect === 'csrf' || defect === 'origin' ? 'REQUEST_NOT_ALLOWED' : defect === 'media' ? 'UNSUPPORTED_MEDIA_TYPE' : 'VALIDATION_ERROR', before);
});
for (const kind of kinds) for (const defect of ['target','commandId','expectedRevision'] as const) test(`M03 ${kind}: ${defect} con salto final no se normaliza a una intención válida`, async () => {
  const input = body(kind); if (defect !== 'target') input[defect] += '\n';
  const before = await academicFingerprint(data.observerPool);
  await error(await http.post(route(kind, target(kind) + (defect === 'target' ? '%0A' : '')), input, admin()), 400, 'VALIDATION_ERROR', before);
});
for (const kind of kinds) for (const loss of ['session','role'] as const) test(`M04 ${kind}: pérdida de ${loss} deniega también una URL administrativa directa`, async () => {
  const account = await sessionFixture(data.context, 'ADMIN');
  expect((await http.post(route(kind), body(kind, '2'), account.secret)).status).toBe(409);
  if (loss === 'session') await data.context.database.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [account.sessionId]);
  else await data.context.database.pool.query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`, [account.userId]);
  const before = await academicFingerprint(data.observerPool);
  await error(await http.post(route(kind), body(kind), account.secret), loss === 'session' ? 401 : 403, loss === 'session' ? 'AUTH_REQUIRED' : 'FORBIDDEN', before);
});
for (const kind of kinds) test(`M05 ${kind}: replay HTTP conserva revisión aplicada y un solo hecho persistido`, async () => {
  const input = body(kind); const first = await http.post(route(kind), input, admin()); expect(first.status).toBe(200);
  const result = (await first.json()).data;
  const replay = await http.post(route(kind), input, admin()); expect(replay.status).toBe(200);
  expect((await replay.json()).data).toEqual({ ...result, command: { ...result.command, replayed: true } });
  let before = await academicFingerprint(data.observerPool);
  await error(await http.post(route(kind), { ...input, expectedRevision: '2' }, admin()), 409, 'IDEMPOTENCY_CONFLICT', before);
  before = await academicFingerprint(data.observerPool);
  await error(await http.post(route(kind), { ...input, commandId: randomUUID(), expectedRevision: '2' }, admin()), 409, 'OFFERING_STATE_CONFLICT', before);
  expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
});
for (const kind of kinds) test(`M06 ${kind}: fallo SQL de auditoría produce 503 seguro y rollback completo; reintento manual no duplica`, async () => {
  const input = body(kind), before = await academicFingerprint(data.observerPool);
  await data.context.isolated.ownerQuery('ALTER TABLE "AcademicAuditEvent" ADD CONSTRAINT maintenance_http_audit_failure CHECK (false)');
  try { await error(await http.post(route(kind), input, admin()), 503, 'TEMPORARILY_UNAVAILABLE', before);
    expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 0, audit: 0 }); }
  finally { await data.context.isolated.ownerQuery('ALTER TABLE "AcademicAuditEvent" DROP CONSTRAINT maintenance_http_audit_failure'); }
  expect((await http.post(route(kind), input, admin())).status).toBe(200);
  expect(await commandCounts(data, input.commandId)).toEqual({ ledger: 1, audit: 1 });
});
for (const kind of kinds) test(`M07 ${kind}: recurso inexistente devuelve 404 seguro sin mutaciones`, async () => {
  expect((await http.post(route(kind), body(kind, '2'), admin())).status).toBe(409);
  const before = await academicFingerprint(data.observerPool);
  await error(await http.post(route(kind, randomUUID()), body(kind), admin()), 404, 'NOT_FOUND', before);
});
