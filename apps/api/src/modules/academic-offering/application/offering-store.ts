import type { SessionActor } from '../../authorization/public/session.js';
import type { AdminCourse, AdminGroup, CatalogCourse, CatalogGroup, TeachingGroup, TeacherCandidate,
  UUID, Revision, CivilDate, AcademicTimeZone, CourseState, GroupState, Slot, Page, CommandResult } from '../public/offer.js';

export interface PageQuery { readonly page: number; readonly pageSize: number }
export interface NameQuery extends PageQuery { readonly q?: string }
export interface CourseQuery extends NameQuery { readonly state?: CourseState }
export interface GroupQuery extends NameQuery { readonly state?: GroupState }
interface CourseAttributes { readonly name: string; readonly description: string | null }
interface GroupAttributes {
  readonly name: string; readonly periodStart: CivilDate; readonly periodEnd: CivilDate;
  readonly timeZone: AcademicTimeZone; readonly capacity: number; readonly teacherUserId: UUID | null;
}
type AtLeastOne<T> = { [K in keyof T]: Pick<T, K> & Partial<Omit<T, K>> }[keyof T];
interface CommandIdentity { readonly commandId: UUID }
interface ExistingResource extends CommandIdentity { readonly expectedRevision: Revision }

export type CourseCommand =
  | (CommandIdentity & { readonly operation: 'COURSE_CREATE'; readonly attributes: Pick<CourseAttributes, 'name'> & Partial<Pick<CourseAttributes, 'description'>> })
  | (ExistingResource & { readonly operation: 'COURSE_EDIT'; readonly courseId: UUID; readonly changes: AtLeastOne<CourseAttributes> })
  | (ExistingResource & { readonly operation: 'COURSE_PUBLISH' | 'COURSE_WITHDRAW'; readonly courseId: UUID });
export type GroupCommand =
  | (CommandIdentity & { readonly operation: 'GROUP_CREATE'; readonly courseId: UUID;
      readonly attributes: Pick<GroupAttributes, 'name'> & Partial<Omit<GroupAttributes, 'name'>> })
  | (ExistingResource & { readonly operation: 'GROUP_EDIT'; readonly groupId: UUID; readonly changes: AtLeastOne<GroupAttributes> })
  | (ExistingResource & { readonly operation: 'GROUP_SCHEDULE'; readonly groupId: UUID; readonly schedule: readonly Slot[] })
  | (ExistingResource & { readonly operation: 'GROUP_PUBLISH' | 'GROUP_WITHDRAW'; readonly groupId: UUID })
  | (ExistingResource & { readonly operation: 'GROUP_CANCEL'; readonly groupId: UUID; readonly cancellationReason: string });
export type OfferingCommand = CourseCommand | GroupCommand;
export type OfferingOperation = OfferingCommand['operation'];
export interface CommandContext { readonly requestId: UUID }

/** Capacidad atómica, no acceso CRUD o a conexiones.
 * Implementación futura: reautorizar actor, descubrir/bloquear cuentas, sesión, padre e hijo;
 * releer tras locks; comparar revisión/agenda; negocio + ledger + auditoría en un commit.
 * Replay se autoriza antes del ledger y devuelve proyección actual/revisión aplicada original.
 * Publicar curso no renueva snapshots; solo publicar grupo explícitamente captura generación.
 * No envolver execute en otro presupuesto de reintentos ni pasarle elegibilidad precalculada.
 * Consultas: una instantánea, filtro de audiencia antes de conteo/página, sin N+1.
 * null significa inexistente o fuera de alcance; infraestructura falla con error, no con vacío.
 * Los DTO son proyecciones explícitas; jamás filas, generación ni UserView.
 */
export interface OfferingStore {
  execute(actor: SessionActor, command: OfferingCommand, context: CommandContext): Promise<CommandResult>;
  adminCourses(actor: SessionActor, query: CourseQuery): Promise<Page<AdminCourse>>;
  adminCourse(actor: SessionActor, courseId: UUID): Promise<AdminCourse | null>;
  adminGroups(actor: SessionActor, courseId: UUID, query: GroupQuery): Promise<Page<AdminGroup> | null>;
  adminGroup(actor: SessionActor, groupId: UUID): Promise<AdminGroup | null>;
  teacherCandidates(actor: SessionActor, query: NameQuery): Promise<Page<TeacherCandidate>>;
  catalogCourses(actor: SessionActor, query: NameQuery): Promise<Page<CatalogCourse>>;
  catalogCourse(actor: SessionActor, courseId: UUID): Promise<CatalogCourse | null>;
  catalogGroups(actor: SessionActor, courseId: UUID, query: PageQuery): Promise<Page<CatalogGroup> | null>;
  catalogGroup(actor: SessionActor, courseId: UUID, groupId: UUID): Promise<CatalogGroup | null>;
  teachingGroups(actor: SessionActor, query: PageQuery): Promise<Page<TeachingGroup>>;
  teachingGroup(actor: SessionActor, groupId: UUID): Promise<TeachingGroup | null>;
}
