import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { SessionActor, SessionRepository } from '../../authorization/public/session.js';
import type { CourseQuery, GroupQuery, NameQuery, PageQuery, OfferingStore } from './offering-store.js';
import type { UUID } from '../public/offer.js';
export const ACADEMIC_ADMINISTRATIVE_QUERIES = Symbol('AcademicAdministrativeQueries');
export const ACADEMIC_CATALOG_QUERIES = Symbol('AcademicCatalogQueries');
export const ACADEMIC_TEACHING_QUERIES = Symbol('AcademicTeachingQueries');

export type AdministrativeReads = Pick<OfferingStore,
  'adminCourses' | 'adminCourse' | 'adminGroups' | 'adminGroup' | 'teacherCandidates'>;
export type CatalogReads = Pick<OfferingStore,
  'catalogCourses' | 'catalogCourse' | 'catalogGroups' | 'catalogGroup'>;
export type TeachingReads = Pick<OfferingStore, 'teachingGroups' | 'teachingGroup'>;

/** La pertenencia se filtra en la proyección SQL por la asignación actual; aceptar
 * la sesión antes de responder impide entregar datos con un acceso ya revocado.
 */
export class TeachingQueries implements TeachingReads {
  constructor(private readonly reads: TeachingReads, private readonly sessions: Pick<SessionRepository, 'accept'>) {}
  private async read<T>(actor: SessionActor, work: () => Promise<T>): Promise<T> {
    if (!permits(actor.role, 'academic:read-own')) throw new AuthorizationFailure('FORBIDDEN');
    const value = await work();
    if (!await this.sessions.accept(actor)) throw new AuthorizationFailure('AUTH_REQUIRED');
    return value;
  }
  teachingGroups(actor: SessionActor, query: PageQuery) { return this.read(actor, () => this.reads.teachingGroups(actor, query)); }
  teachingGroup(actor: SessionActor, id: UUID) { return this.read(actor, () => this.reads.teachingGroup(actor, id)); }
}

/** Misma aceptación primaria que administración. El adaptador proyecta únicamente
 * oferta visible; aceptar la sesión no sustituye la habilitación docente en SQL.
 */
export class CatalogQueries implements CatalogReads {
  constructor(private readonly reads: CatalogReads, private readonly sessions: Pick<SessionRepository, 'accept'>) {}
  private async read<T>(actor: SessionActor, work: () => Promise<T>): Promise<T> {
    if (!permits(actor.role, 'academic:read-published')) throw new AuthorizationFailure('FORBIDDEN');
    const value = await work();
    if (!await this.sessions.accept(actor)) throw new AuthorizationFailure('AUTH_REQUIRED');
    return value;
  }
  catalogCourses(actor: SessionActor, query: NameQuery) { return this.read(actor, () => this.reads.catalogCourses(actor, query)); }
  catalogCourse(actor: SessionActor, id: UUID) { return this.read(actor, () => this.reads.catalogCourse(actor, id)); }
  catalogGroups(actor: SessionActor, id: UUID, query: PageQuery) { return this.read(actor, () => this.reads.catalogGroups(actor, id, query)); }
  catalogGroup(actor: SessionActor, courseId: UUID, id: UUID) { return this.read(actor, () => this.reads.catalogGroup(actor, courseId, id)); }
}

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
