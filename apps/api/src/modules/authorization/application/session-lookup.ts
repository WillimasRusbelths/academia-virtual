import { AuthorizationFailure, permits, type SessionPermission, type SessionActor,
  type SessionRepository } from '../public/session.js';

export const SESSION_LOOKUP = Symbol('SessionLookup');

/** Coordina identidad y permisos sin HTTP, Nest ni conocimiento de PostgreSQL. */
export class SessionLookup {
  constructor(private readonly sessions: SessionRepository) {}

  async authorize(secret: string | null, permission: SessionPermission): Promise<SessionActor> {
    const actor = secret === null ? null : await this.sessions.lookup(secret);
    if (!actor) throw new AuthorizationFailure('AUTH_REQUIRED');
    const allowed = typeof permission === 'string' ? permits(actor.role, permission)
      : Array.isArray(permission) && (permission.length === 2 || (permission.length === 3 && permission[2] === 'materials:read-enrolled')) && permission[0] === 'materials:manage-all'
        && permission[1] === 'materials:manage-own'
        && (permits(actor.role, 'materials:manage-all') || permits(actor.role, 'materials:manage-own')
          || (permission.length === 3 && permits(actor.role, 'materials:read-enrolled')));
    if (!allowed) throw new AuthorizationFailure('FORBIDDEN');
    return actor;
  }

  async accepted(actor: SessionActor): Promise<void> {
    if (!await this.sessions.accept(actor)) throw new AuthorizationFailure('AUTH_REQUIRED');
  }
}
