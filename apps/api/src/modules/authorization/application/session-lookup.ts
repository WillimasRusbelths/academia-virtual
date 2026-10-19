import { AuthorizationFailure, permits, type Permission, type SessionActor,
  type SessionRepository } from '../public/session.js';

export const SESSION_LOOKUP = Symbol('SessionLookup');

/** Coordina identidad y permisos sin HTTP, Nest ni conocimiento de PostgreSQL. */
export class SessionLookup {
  constructor(private readonly sessions: SessionRepository) {}

  async authorize(secret: string | null, permission: Permission): Promise<SessionActor> {
    const actor = secret === null ? null : await this.sessions.lookup(secret);
    if (!actor) throw new AuthorizationFailure('AUTH_REQUIRED');
    if (!permits(actor.role, permission)) throw new AuthorizationFailure('FORBIDDEN');
    return actor;
  }

  async accepted(actor: SessionActor): Promise<void> {
    if (!await this.sessions.accept(actor)) throw new AuthorizationFailure('AUTH_REQUIRED');
  }
}
