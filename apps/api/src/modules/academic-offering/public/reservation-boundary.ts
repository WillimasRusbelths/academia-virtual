import type { AcademicTimeZone, CivilDate, CourseState, GroupState, Revision, Slot, UUID } from './offer.js';

/** Solo referencias para descubrir/recomprobar topología; no autoriza una reserva. */
export interface ReservationOfferingReference {
  readonly groupId: UUID;
  readonly courseId: UUID;
  readonly teacherUserId: UUID | null;
}
/** Snapshot autoritativo después de locks/recheck. Puede describir oferta no reservable.
 * Sin correo, credenciales, motivos privados ni datos financieros de otro dueño.
 */
export interface ReservationOfferingSnapshot extends ReservationOfferingReference {
  readonly courseName: string;
  readonly groupName: string;
  readonly courseRevision: Revision;
  readonly groupRevision: Revision;
  readonly courseState: CourseState;
  readonly groupState: GroupState;
  readonly studentVisible: boolean;
  readonly teacherReviewRequired: boolean;
  readonly teacherName: string | null;
  readonly teacherEligible: boolean;
  readonly teacherEligibilityVersion: bigint | null;
  readonly publishedTeacherUserId: UUID | null;
  readonly publishedTeacherEligibilityVersion: bigint | null;
  readonly periodStart: CivilDate | null;
  readonly periodEnd: CivilDate | null;
  readonly timeZone: AcademicTimeZone;
  readonly capacity: number | null;
  readonly schedule: readonly Slot[];
}
/** Participante efímero ligado por composición a la misma unidad de trabajo.
 * No abre transacciones, adquiere locks, captura reloj ni decide cupos/precios.
 * La ausencia se conserva como ausencia; el coordinador comprueba cobertura exacta.
 */
export interface ReservationOfferingAccess {
  discover(groupIds: readonly UUID[]): Promise<readonly ReservationOfferingReference[]>;
  snapshots(groupIds: readonly UUID[]): Promise<readonly ReservationOfferingSnapshot[]>;
}

/** Catálogo del dueño; el consumidor cubre las referencias antes de proyectar. */
export interface ReservationCatalogAccess extends ReservationOfferingAccess {
  page(input:{readonly page:number;readonly pageSize:number;readonly q?:string}):Promise<{readonly groupIds:readonly UUID[];readonly total:number}>;
}

/** Referencia para precio compartido; no decide precio ni abre transacciones. */
export interface CourseReferenceAccess { exists(courseId:UUID):Promise<boolean> }
