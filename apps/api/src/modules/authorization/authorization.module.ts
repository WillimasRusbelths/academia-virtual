import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { SessionLookup, SESSION_LOOKUP } from './application/session-lookup.js';
import type { SessionRepository } from './public/session.js';
import { AccessGuard, AcceptedSessionInterceptor } from './entrypoints/http/access.guard.js';
import { SessionCookie } from '../../http/session-cookie.js';

@Module({})
export class AuthorizationModule {
  static forRoot(sessions: SessionRepository, cookie: SessionCookie): DynamicModule {
    return { module: AuthorizationModule, providers: [
      { provide: SESSION_LOOKUP, useValue: new SessionLookup(sessions) },
      { provide: SessionCookie, useValue: cookie },
      { provide: APP_GUARD, useClass: AccessGuard },
      { provide: APP_INTERCEPTOR, useClass: AcceptedSessionInterceptor },
    ] };
  }
}
