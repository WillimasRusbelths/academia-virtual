/// <reference types="vite/client" />
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Post, Req, Body } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import type { PoolClient } from 'pg';
import { AppModule } from '../../dist/src/app.module.js';
import { academicOfferingDataset } from '../support/academic-offering.js';
import type { AcademicOfferingDataset } from '../support/academic-offering.js';
import { draftGroup } from '../support/academic-migration.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { TeachingDirectory } from '../../src/modules/users/public/teaching-directory.js';
import type { AcademicCommandWriter, AcademicCommandWork } from '../../src/modules/academic-offering/infrastructure/offering-store.js';
import type { AdminCourse } from '../../src/modules/academic-offering/public/offer.js';
import { OfferingError } from '../../dist/src/modules/academic-offering/public/offer.js';
import { Access } from '../../dist/src/modules/authorization/entrypoints/http/access.guard.js';
import { configureTransport, strictDto } from '../../dist/src/http/transport.js';
import { SessionCookie } from '../../dist/src/http/session-cookie.js';
import type { HttpRequest } from '../../dist/src/http/error.filter.js';
import { sessionFixture } from '../support/session-fixture.js';
import { activity } from '../support/session-fixture.js';
interface Exports { AcademicOfferingModule: { forRoot: unknown }; ACADEMIC_COMMAND_WRITER: symbol; ACADEMIC_TEACHING_DIRECTORY: symbol }
const modules = import.meta.glob<Exports>('../../dist/src/modules/academic-offering/academic-offering.module.js', { eager: true });
let dataset: AcademicOfferingDataset;
let module: TestingModule;
let writer: AcademicCommandWriter;
let directory: TeachingDirectory;
let app: NestExpressApplication | undefined;
const conflictId = randomUUID();
// Entrada exclusiva del ensayo de transporte; nunca se compila entre controladores de producto.
class ErrorProbe {
  publish(request: HttpRequest, body: unknown) {
    const input = strictDto(body, { commandId: value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value) });
    request.commandId = input.commandId as string;
    throw new OfferingError({ code: 'TEACHER_SCHEDULE_CONFLICT', conflictingGroupIds: [conflictId] });
  }
}
Controller('api/v1/admin/academic/groups')(ErrorProbe);
const descriptor = Object.getOwnPropertyDescriptor(ErrorProbe.prototype, 'publish')!;
Post(':id/publish')(ErrorProbe.prototype, 'publish', descriptor);
Access('academic:manage')(ErrorProbe.prototype, 'publish', descriptor);
Req()(ErrorProbe.prototype, 'publish', 0); Body()(ErrorProbe.prototype, 'publish', 1);
const db = () => dataset.context.database.pool;
beforeAll(async () => {
  const offering = Object.values(modules)[0];
  expect(offering?.AcademicOfferingModule?.forRoot, 'T016: composición académica real aún ausente').toBeTypeOf('function');
  dataset = await academicOfferingDataset('academic_composition');
  module = await Test.createTestingModule({ imports: [AppModule.forRoot(dataset.context.environment, dataset.context.database)], controllers: [ErrorProbe] }).compile();
  writer = module.get<AcademicCommandWriter>(offering.ACADEMIC_COMMAND_WRITER);
  directory = module.get<TeachingDirectory>(offering.ACADEMIC_TEACHING_DIRECTORY);
}, 120000);
afterAll(async () => { if (app) await app.close(); else await module?.close(); await dataset?.cleanup(); });

test('C01 composición real exporta capacidades sin consultas ficticias o pool adicional', async () => {
  expect(writer).toBeTypeOf('function'); expect(directory.find).toBeTypeOf('function');
  const teacher = dataset.account('TEACHER');
  const query = vi.spyOn(db(), 'query');
  try {
    const found = await directory.find(teacher.id);
    expect(found).toEqual({ userId: teacher.id, name: teacher.name, eligible: true, eligibilityVersion: 0n });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('AcademicTeacherDirectory');
    expect(Object.keys(found!).sort()).toEqual(['eligibilityVersion','eligible','name','userId']);
  } finally { query.mockRestore(); }
});

test('C02 escritor ensamblado confirma y repite un comando ficticio mediante protocolo/ledger/auditoría reales', async () => {
  const auth = new PostgresSessionStore(db()); const actor = (await auth.lookup(dataset.secondAdmin.secret))!;
  const { courseId } = await draftGroup(db());
  const project = async (client: PoolClient, id: string): Promise<AdminCourse> => {
    const row = (await client.query<{ id: string; name: string; description: string | null; state: 'DRAFT'; revision: string; createdAt: Date; updatedAt: Date }>(
      'SELECT id,name,description,state,revision::text,"createdAt","updatedAt" FROM "AcademicCourse" WHERE id=$1', [id])).rows[0];
    return { ...row, studentVisible: false, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  };
  const topology = { accountIds: [actor.userId], courseIds: [courseId], groupIds: [] };
  const apply = vi.fn(async (client: PoolClient) => {
    await client.query('UPDATE "AcademicCourse" SET revision=2 WHERE id=$1', [courseId]);
    return { resource: await project(client, courseId), result: 'APPLIED' as const, beforeState: 'DRAFT' as const, beforeRevision: '1' };
  });
  const input: AcademicCommandWork<AdminCourse> = { actor, permission: 'academic:manage', commandId: randomUUID(), requestId: randomUUID(),
    operation: 'COURSE_EDIT', targetKind: 'COURSE', targetId: courseId, expectedRevision: '1', payload: { name: 'Ficticio' },
    discover: async () => topology, recheck: async () => topology, project, apply };
  const first = await writer(input); const replay = await writer({ ...input, requestId: randomUUID() });
  expect(first.command).toMatchObject({ replayed: false, appliedRevision: '2' });
  expect(replay.command).toMatchObject({ replayed: true, appliedRevision: '2' }); expect(apply).toHaveBeenCalledTimes(1);
  expect((await db().query('SELECT count(*)::int AS n FROM "AcademicCommand" WHERE "actorUserId"=$1 AND "commandId"=$2', [actor.userId, input.commandId])).rows[0].n).toBe(1);
  expect((await db().query('SELECT "requestId" FROM "AcademicAuditEvent" WHERE "commandId"=$1', [input.commandId])).rows).toEqual([{ requestId: input.requestId }]);
  await db().query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1', [actor.sessionId]);
  await expect(writer(input)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); expect(apply).toHaveBeenCalledTimes(1);
});

test('C03 HTTP real: plantilla de Express, guard, error administrativo y logs sin cuerpo ni renovación de sesión', async () => {
  const admin = await sessionFixture(dataset.context, 'ADMIN'); const student = await sessionFixture(dataset.context, 'STUDENT');
  const before = await activity(dataset.context, admin.sessionId); const record = vi.fn(() => true);
  app = module.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false });
  configureTransport(app, dataset.context.environment, { record }); await app.listen(0, '127.0.0.1');
  const url = await app.getUrl(); const id = randomUUID(); const commandId = randomUUID();
  const headers = (secret?: string) => ({ 'content-type': 'application/json', origin: dataset.context.environment.appOrigin,
    'x-csrf-protection': '1', ...(secret ? { cookie: new SessionCookie(dataset.context.environment).issue(secret).split(';')[0] } : {}) });
  const send = (secret?: string) => fetch(`${url}/api/v1/admin/academic/groups/${id}/publish`, {
    method: 'POST', headers: headers(secret), body: JSON.stringify({ commandId }),
  });
  const response = await send(admin.secret); const body = await response.json();
  expect(response.status).toBe(409); expect(body.error).toMatchObject({ code: 'TEACHER_SCHEDULE_CONFLICT', conflictingGroupIds: [conflictId] });
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ targetKind: 'GROUP', requestedTargetId: id,
    routeTemplate: '/admin/academic/groups/:id/publish', commandId }), body.error.requestId);
  expect(body.error.requestId).not.toBe(commandId); expect(body.error).not.toHaveProperty('commandId');
  expect((await activity(dataset.context, admin.sessionId)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  const denied = await send(student.secret); expect(denied.status).toBe(403); expect((await denied.json()).error).not.toHaveProperty('conflictingGroupIds');
  const anonymous = await send(); expect(anonymous.status).toBe(401); expect((await anonymous.json()).error).not.toHaveProperty('conflictingGroupIds');
});
