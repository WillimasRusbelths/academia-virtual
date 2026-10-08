import 'reflect-metadata';
import { Body, Controller, Get, Post, Req, Param, HttpCode } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { IdentityTestDatabase } from './session-fixture.js';
// Los decoradores/providers productivos se importan de tsc para comprobar sus metadatos.
import { AuthorizationModule } from '../../dist/src/modules/authorization/authorization.module.js';
import { Access } from '../../dist/src/modules/authorization/entrypoints/http/access.guard.js';
import type { SessionActor } from '../../dist/src/modules/authorization/public/session.js';
import { PostgresSessionStore } from '../../dist/src/modules/identity/infrastructure/session-store.js';
import { SessionCookie } from '../../dist/src/http/session-cookie.js';
import { configureTransport, strictDto } from '../../dist/src/http/transport.js';
import { TransportFailure } from '../../dist/src/http/error.filter.js';
import { HealthController, READINESS } from '../../dist/src/http/health.controller.js';

/** Controladores exclusivos de prueba; nunca importados por AppModule ni por la imagen en ejecución. */
export async function sessionHttp(context: IdentityTestDatabase) {
  const store = new PostgresSessionStore(context.database.pool);
  const cookie = new SessionCookie(context.environment);
  const controls: { reads: number; beforeMutation?: () => Promise<void>; readyFails: boolean } = { reads: 0, readyFails: false };
  await context.isolated.ownerQuery('CREATE TABLE "AuthorizedEffect" (id uuid PRIMARY KEY DEFAULT gen_random_uuid())');
  class TestController {
    profile(request: { actor: SessionActor }) { return { data: { role: request.actor.role } }; }
    admin(target: string) { controls.reads++; return { data: { target } }; }
    closed() { throw new Error('El guard debe impedir esta ejecución.'); }
    invalid() { throw new TransportFailure(400, 'VALIDATION_ERROR'); }
    unavailable() { throw new Error('SQL password token cookie SENTINEL_PRIVATE'); }
    unserializable() { return { data: 1n }; }
    dto(body: unknown) { strictDto(body, { name: (value) => typeof value === 'string' }); return { data: { accepted: true } }; }
    async mutation(request: { actor: SessionActor }, body: unknown) {
      strictDto(body, {});
      await controls.beforeMutation?.();
      const client = await context.database.pool.connect();
      try {
        await client.query('BEGIN');
        await store.revalidateInTransaction(client, request.actor, 'users:manage');
        await client.query('INSERT INTO "AuthorizedEffect" DEFAULT VALUES');
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
  }
  Controller('__test/identity')(TestController);
  const routes = [
    ['profile', Get('profile'), 'profile:read'], ['admin', Get('admin/:target'), 'users:manage'],
    ['closed', Get('closed'), undefined], ['invalid', Get('invalid'), 'profile:read'],
    ['unavailable', Get('unavailable'), 'profile:read'], ['dto', Post('dto'), 'profile:read'],
    ['unserializable', Get('unserializable'), 'profile:read'],
    ['mutation', Post('mutation'), 'users:manage'],
  ] as const;
  for (const [name, method, policy] of routes) {
    const descriptor = Object.getOwnPropertyDescriptor(TestController.prototype, name)!;
    method(TestController.prototype, name, descriptor);
    if (policy) Access(policy)(TestController.prototype, name, descriptor);
  }
  Req()(TestController.prototype, 'profile', 0);
  Param('target')(TestController.prototype, 'admin', 0);
  Body()(TestController.prototype, 'dto', 0);
  Req()(TestController.prototype, 'mutation', 0);
  Body()(TestController.prototype, 'mutation', 1);
  HttpCode(204)(TestController.prototype, 'mutation', Object.getOwnPropertyDescriptor(TestController.prototype, 'mutation')!);
  const module = await Test.createTestingModule({ imports: [AuthorizationModule.forRoot(store, cookie)],
    controllers: [TestController, HealthController], providers: [{ provide: READINESS, useValue: {
      async check() {
        if (controls.readyFails) throw new Error('SQL SENTINEL_PRIVATE');
        await context.database.pool.query('SELECT 1');
      },
    } }] }).compile();
  const app = module.createNestApplication<NestExpressApplication>({ logger: ['error', 'warn', 'debug', 'verbose'], bodyParser: false });
  configureTransport(app, context.environment);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  return { app, store, cookie, controls, url,
    headers(secret?: string) { return { 'content-type': 'application/json', origin: context.environment.appOrigin,
      'x-csrf-protection': '1', ...(secret ? { cookie: `${cookie.name}=${secret}` } : {}) }; },
    async effects() {
      const result = await context.database.pool.query<{ count: string }>('SELECT count(*) FROM "AuthorizedEffect"');
      return Number(result.rows[0]!.count);
    },
  };
}
