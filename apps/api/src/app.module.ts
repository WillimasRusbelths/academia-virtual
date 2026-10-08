import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { Environment } from './infrastructure/config/environment.js';
import type { createDatabase } from './infrastructure/database/database.js';
import { PostgresSessionStore } from './modules/identity/infrastructure/session-store.js';
import { AuthorizationModule } from './modules/authorization/authorization.module.js';
import { SessionCookie } from './http/session-cookie.js';
import { HealthController, READINESS } from './http/health.controller.js';

// Raíz de composición del único proceso. Los módulos funcionales se añadirán al necesitarlos.
@Module({})
export class AppModule {
  static forRoot(environment: Environment, database: ReturnType<typeof createDatabase>): DynamicModule {
    return { module: AppModule,
      imports: [AuthorizationModule.forRoot(new PostgresSessionStore(database.pool), new SessionCookie(environment))],
      controllers: [HealthController], providers: [
        { provide: READINESS, useValue: { async check() { await database.pool.query('SELECT 1'); } } },
        { provide: 'DATABASE_LIFECYCLE', useValue: { onApplicationShutdown: () => database.close() } },
      ] };
  }
}
