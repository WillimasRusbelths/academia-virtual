import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { SessionActor, SessionRepository } from '../../authorization/public/session.js';
import type { CourseQuery, GroupQuery, NameQuery, OfferingStore } from './offering-store.js';
import type { UUID } from '../public/offer.js';

export type AdministrativeReads = Pick<OfferingStore,
  'adminCourses' | 'adminCourse' | 'adminGroups' | 'adminGroup' | 'teacherCandidates'>;

/** La proyección se obtiene en una sentencia. La aceptación primaria existente
 * confirma la sesión antes de entregar datos; no confía en un rol almacenado en UI.
 */
export class AdministrativeQueries implements AdministrativeReads {
  constructor(private readonly reads: AdministrativeReads, private readonly sessions: Pick<SessionRepository, 'accept'>) {}
  private async read<T>(actor: SessionActor, work: () => Promise<T>): Promise<T> {
    if (!permits(actor.role, 'academic:manage')) throw new AuthorizationFailure('FORBIDDEN');
    const value = await work();
    if (!await this.sessions.accept(actor)) throw new AuthorizationFailure('AUTH_REQUIRED');
    return value;
  }
  adminCourses(actor: SessionActor, query: CourseQuery) { return this.read(actor, () => this.reads.adminCourses(actor, query)); }
  adminCourse(actor: SessionActor, id: UUID) { return this.read(actor, () => this.reads.adminCourse(actor, id)); }
  adminGroups(actor: SessionActor, id: UUID, query: GroupQuery) { return this.read(actor, () => this.reads.adminGroups(actor, id, query)); }
  adminGroup(actor: SessionActor, id: UUID) { return this.read(actor, () => this.reads.adminGroup(actor, id)); }
  teacherCandidates(actor: SessionActor, query: NameQuery) { return this.read(actor, () => this.reads.teacherCandidates(actor, query)); }
}
