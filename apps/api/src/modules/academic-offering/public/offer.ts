import type { AdministrativeConflictCode, OfferingErrorCode, OfferingField } from '../domain/offering-error.js';
export { OfferingError, OFFERING_ERROR_MESSAGES } from '../domain/offering-error.js';
export type { OfferingErrorCode, OfferingFailure, OfferingField } from '../domain/offering-error.js';

/** Formas de transporte; las entradas futuras validarán valores y campos desconocidos.
 * Ninguna interfaz se debe serializar extendiendo una fila de persistencia.
 */
export type UUID = string;
/** Decimal canónico positivo hasta 9223372036854775807; nunca number. */
export type Revision = string;
/** YYYY-MM-DD real, HH:mm sin segundos e instante UTC, respectivamente. */
export type CivilDate = string;
export type LocalTime = string;
export type ISOInstant = string;
export type AcademicTimeZone = 'America/Lima';
export type CourseState = 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN';
export type GroupState = CourseState | 'CANCELLED';
export type IsoDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export interface Slot {
  readonly dayOfWeek: IsoDayOfWeek;
  readonly startTime: LocalTime;
  readonly endTime: LocalTime;
}
export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
export interface TeacherCandidate { readonly id: UUID; readonly name: string }
interface UncalculatedCapacity {
  readonly occupancy: null;
  readonly availability: null;
  readonly capacityStatus: 'NOT_CALCULATED';
}
export interface AdminCourse {
  readonly id: UUID; readonly name: string; readonly description: string | null;
  readonly state: CourseState; readonly revision: Revision; readonly studentVisible: boolean;
  readonly createdAt: ISOInstant; readonly updatedAt: ISOInstant;
}
export interface AdminGroup extends UncalculatedCapacity {
  readonly id: UUID; readonly courseId: UUID; readonly name: string; readonly state: GroupState;
  readonly revision: Revision; readonly periodStart: CivilDate | null; readonly periodEnd: CivilDate | null;
  readonly timeZone: AcademicTimeZone; readonly capacity: number | null; readonly schedule: readonly Slot[];
  readonly teacher: { readonly id: UUID; readonly name: string; readonly eligible: boolean } | null;
  readonly teacherReviewRequired: boolean; readonly studentVisible: boolean;
  readonly cancellationReason: string | null; readonly cancelledAt: ISOInstant | null;
  readonly lastPublishedTeacherId: UUID | null; readonly createdAt: ISOInstant; readonly updatedAt: ISOInstant;
}
export interface CatalogCourse { readonly id: UUID; readonly name: string; readonly description: string }
export interface CatalogGroup extends UncalculatedCapacity {
  readonly id: UUID; readonly courseId: UUID; readonly name: string;
  readonly periodStart: CivilDate; readonly periodEnd: CivilDate; readonly timeZone: AcademicTimeZone;
  readonly capacity: number; readonly schedule: readonly Slot[]; readonly teacher: { readonly name: string };
}
export interface TeachingGroup extends UncalculatedCapacity {
  readonly id: UUID;
  readonly course: { readonly id: UUID; readonly name: string; readonly description: string | null };
  readonly name: string; readonly state: GroupState; readonly periodStart: CivilDate | null;
  readonly periodEnd: CivilDate | null; readonly timeZone: AcademicTimeZone; readonly capacity: number | null;
  readonly schedule: readonly Slot[]; readonly teacher: { readonly name: string };
}
export interface CommandResult<T extends AdminCourse | AdminGroup = AdminCourse | AdminGroup> {
  readonly resource: T;
  readonly command: { readonly id: UUID; readonly replayed: boolean; readonly appliedRevision: Revision;
    readonly result: 'APPLIED' | 'NO_CHANGE' };
}
export interface DataResponse<T> { readonly data: T }
/** Códigos de transporte existentes, sin añadirlos a las reglas del dominio. */
export type OfferingHttpErrorCode = OfferingErrorCode | 'UNSUPPORTED_MEDIA_TYPE' | 'RATE_LIMITED';
interface ErrorBase { readonly message: string; readonly requestId: UUID }
export type OfferingErrorView =
  | (ErrorBase & { readonly code: 'VALIDATION_ERROR' | 'TEACHER_NOT_ELIGIBLE';
      readonly fields?: readonly { readonly field: OfferingField; readonly message: string }[] })
  | (ErrorBase & { readonly code: AdministrativeConflictCode; readonly conflictingGroupIds?: readonly UUID[] })
  | (ErrorBase & { readonly code: Exclude<OfferingHttpErrorCode, 'VALIDATION_ERROR' | 'TEACHER_NOT_ELIGIBLE' | AdministrativeConflictCode> });
/** Las referencias de conflicto solo las proyectará el transporte para administración. */
export interface ErrorResponse { readonly error: OfferingErrorView }
