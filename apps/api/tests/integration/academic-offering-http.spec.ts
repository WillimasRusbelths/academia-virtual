import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { academicCatalogSeed } from '../support/academic-catalog.js';
import { academicFingerprint } from '../support/academic-preparation.js';
import { sessionFixture } from '../support/session-fixture.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';

let data: AcademicOfferingDataset, http: Us1Http;
let seed: Awaited<ReturnType<typeof academicCatalogSeed>>;
const routes = () => [
  { method: 'POST', path: `/admin/academic/courses/${seed.visibleCourseId}/publish` },
  { method: 'POST', path: `/admin/academic/groups/${seed.firstGroupId}/publish` },
  { method: 'GET', path: '/academic/courses' },
  { method: 'GET', path: `/academic/courses/${seed.visibleCourseId}` },
  { method: 'GET', path: `/academic/courses/${seed.visibleCourseId}/groups` },
  { method: 'GET', path: `/academic/courses/${seed.visibleCourseId}/groups/${seed.firstGroupId}` },
];
beforeAll(async () => { data = await academicOfferingDataset('academic_http'); http = await us1Http(data); }, 120000);
beforeEach(async () => {
  await data.context.isolated.ownerQuery('TRUNCATE "AcademicAuditEvent","AcademicCommand","AcademicSlot","AcademicGroup","AcademicCourse"');
  seed = await academicCatalogSeed(data);
});
afterAll(async () => { try { await http?.close(); } finally { await data?.cleanup(); } });

for (const index of [0, 1]) for (const kind of ['csrf', 'origin', 'media', 'size', 'query'] as const) {
  test(`H01 publicación ${index} conserva protección ${kind} y no aplica efectos`, async () => {
    const route = routes()[index], headers = http.headers(data.account('ADMIN').sessions[0].secret);
    const before = await academicFingerprint(data.observerPool);
    // Control positivo de ruta real: el recurso de contexto ya está publicado.
    expect((await http.post(route.path, { commandId: randomUUID(), expectedRevision: '1' }, data.account('ADMIN').sessions[0].secret)).status).toBe(409);
    const changed: Record<string, string> = { ...headers };
    if (kind === 'csrf') delete changed['x-csrf-protection'];
    if (kind === 'origin') changed.origin = 'https://foreign.example.test';
    if (kind === 'media') changed['content-type'] = 'text/plain';
    const response = await fetch(`${http.url}/api/v1${route.path}${kind === 'query' ? '?state=PUBLISHED' : ''}`, {
      method: 'POST', headers: changed,
      body: JSON.stringify({ commandId: randomUUID(), expectedRevision: '1', ...(kind === 'size' ? { name: 'x'.repeat(17000) } : {}) }),
    });
    expect(response.status).toBe(kind === 'csrf' || kind === 'origin' ? 403 : kind === 'media' ? 415 : kind === 'size' ? 413 : 400);
    const body = await response.json();
    expect(body.error.code).toBe(kind === 'csrf' || kind === 'origin' ? 'REQUEST_NOT_ALLOWED' : kind === 'media' ? 'UNSUPPORTED_MEDIA_TYPE' : 'VALIDATION_ERROR');
    expect(body).not.toHaveProperty('data'); expect(body.error).not.toHaveProperty('conflictingGroupIds');
    expect(await academicFingerprint(data.observerPool)).toBe(before);
  });
}
test.each([0, 1, 2, 3, 4, 5])('H02 ruta %i rechaza sesión revocada sin entregar datos ni escribir oferta', async index => {
  const fixture = await sessionFixture(data.context, index < 2 ? 'ADMIN' : 'STUDENT'), route = routes()[index];
  if (index >= 2) expect((await http.get(route.path, fixture.secret)).status).toBe(200);
  else expect((await http.post(route.path, { commandId: randomUUID(), expectedRevision: '1' }, fixture.secret)).status).toBe(409);
  await data.observerPool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [fixture.sessionId]);
  const before = await academicFingerprint(data.observerPool);
  const response = index < 2 ? await http.post(route.path, { commandId: randomUUID(), expectedRevision: '1' }, fixture.secret)
    : await http.get(route.path, fixture.secret);
  expect(response.status).toBe(401); const body = await response.json();
  expect(Object.keys(body.error).sort()).toEqual(['code', 'message', 'requestId']);
  expect(body.error.code).toBe('AUTH_REQUIRED'); expect(body).not.toHaveProperty('data');
  expect(await academicFingerprint(data.observerPool)).toBe(before);
});
test.each([0, 1, 3, 4, 5])('H03 ruta %i rechaza UUID con salto de línea final', async index => {
  const route = routes()[index], who = data.account(index < 2 ? 'ADMIN' : 'STUDENT').sessions[0].secret;
  const target = index === 1 || index === 5 ? seed.firstGroupId : seed.visibleCourseId;
  const path = route.path.replace(target, target + '%0A'), before = await academicFingerprint(data.observerPool);
  const response = index < 2 ? await http.post(path, { commandId: randomUUID(), expectedRevision: '1' }, who) : await http.get(path, who);
  expect(response.status).toBe(400); expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
  expect(await academicFingerprint(data.observerPool)).toBe(before);
});
test.each([0, 1])('H04 publicación %i exige revisión y commandId canónicos sin salto final', async index => {
  for (const field of ['commandId', 'expectedRevision'] as const) {
    const body = { commandId: randomUUID(), expectedRevision: '1' }; body[field] += '\n';
    const before = await academicFingerprint(data.observerPool);
    const response = await http.post(routes()[index].path, body, data.account('ADMIN').sessions[0].secret);
    expect(response.status).toBe(400); expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    expect(await academicFingerprint(data.observerPool)).toBe(before);
  }
});
test('H05 página con salto final no se convierte silenciosamente a entero', async () => {
  const before = await academicFingerprint(data.observerPool);
  const response = await http.get('/academic/courses?page=1%0A', data.account('STUDENT').sessions[0].secret);
  expect(response.status).toBe(400); expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
  expect(await academicFingerprint(data.observerPool)).toBe(before);
});
