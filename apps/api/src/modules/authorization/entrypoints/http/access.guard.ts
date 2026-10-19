import { Inject, Injectable, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext, NestInterceptor, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { concatMap } from 'rxjs';
import { SESSION_LOOKUP, type SessionLookup } from '../../application/session-lookup.js';
import { ACCESS_POLICY, AuthorizationFailure, type Permission, type SessionActor } from '../../public/session.js';
import { SessionCookie } from '../../../../http/session-cookie.js';
import type { HttpRequest, HttpResponse } from '../../../../http/error.filter.js';

const POLICY = ACCESS_POLICY;
type Policy = Permission | 'public';
export const Access = (policy: Policy) => SetMetadata(POLICY, policy);
interface AuthorizedRequest extends HttpRequest { actor?: SessionActor }

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SESSION_LOOKUP) private readonly sessions: SessionLookup,
    @Inject(SessionCookie) private readonly cookie: SessionCookie) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<Policy>(POLICY, [context.getHandler(), context.getClass()]);
    if (policy === 'public') return true;
    if (!policy) throw new AuthorizationFailure('FORBIDDEN');
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    const header = request.headers.cookie;
    request.actor = await this.sessions.authorize(this.cookie.read(typeof header === 'string' ? header : undefined), policy);
    return true;
  }
}

/** Solo respuestas protegidas satisfactorias renuevan actividad; no Set-Cookie ni TTL. */
@Injectable()
export class AcceptedSessionInterceptor implements NestInterceptor {
  constructor(@Inject(SESSION_LOOKUP) private readonly sessions: SessionLookup) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthorizedRequest>();
    const response = http.getResponse<HttpResponse>();
    return next.handle().pipe(concatMap(async (body: unknown) => {
      // Un resultado no serializable también es un fallo HTTP, no actividad aceptada.
      if (body !== undefined && response.statusCode !== 204) JSON.stringify(body);
      if (request.actor && response.statusCode >= 200 && response.statusCode < 300) {
        await this.sessions.accepted(request.actor);
      }
      return body;
    }));
  }
}
