import { AuthorizationFailure, permits, MATERIALS_MANAGEMENT_POLICY, MATERIALS_READ_POLICY,
  CLASSES_MANAGEMENT_POLICY, CLASSES_PARTICIPATION_POLICY, type SessionPermission, type SessionActor,
  type SessionRepository } from '../public/session.js';

export const SESSION_LOOKUP = Symbol('SessionLookup');

/** Coordina identidad y permisos sin HTTP, Nest ni conocimiento de PostgreSQL. */
export class SessionLookup {
  constructor(private readonly sessions: SessionRepository) {}

  async authorize(secret: string | null, permission: SessionPermission): Promise<SessionActor> {
    const actor = secret === null ? null : await this.sessions.lookup(secret);
    if (!actor) throw new AuthorizationFailure('AUTH_REQUIRED');
    // Match only the four explicit tuples. Compare from the complete constant,
    // so sparse arrays, mixed domains and arbitrary OR-policies cannot pass.
    const policy = [MATERIALS_MANAGEMENT_POLICY, MATERIALS_READ_POLICY, CLASSES_MANAGEMENT_POLICY, CLASSES_PARTICIPATION_POLICY]
      .find(expected => Array.isArray(permission) && permission.length === expected.length
        && expected.every((required, index) => permission[index] === required));
    const allowed = typeof permission === 'string' ? permits(actor.role, permission)
      : policy?.some(required => permits(actor.role, required)) === true;
    if (!allowed) throw new AuthorizationFailure('FORBIDDEN');
    return actor;
  }

  async accepted(actor: SessionActor): Promise<void> {
    if (!await this.sessions.accept(actor)) throw new AuthorizationFailure('AUTH_REQUIRED');
  }
}
