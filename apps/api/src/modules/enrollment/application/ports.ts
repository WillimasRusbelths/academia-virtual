import type { Permission, SessionActor } from '../../authorization/public/session.js';
import type { ReservationOfferingAccess } from '../../academic-offering/public/reservation-boundary.js';
import type { GroupCommitmentPolicy } from '../public/commitments.js';
import type { EnrollmentOrderSnapshot, InstantUs, OriginalOrderItem, OriginalPeriodBounds, ReservationSelection, UUID } from '../public/enrollment.js';

declare const temporalDecision: unique symbol;
/** Solo la composición transaccional emite el token tras todos los locks/recheck.
 * No se construye desde HTTP. Normalización y nueva reserva comparten este objeto.
 */
export interface TemporalDecision { readonly at: InstantUs; readonly [temporalDecision]: true }
export interface EnrollmentCalendar {
  originalBounds(periodStart: string, periodEnd: string): Promise<OriginalPeriodBounds>;
}
export type OwnEnrollmentPermission = 'enrollment:reserve-own' | 'enrollment:pay-own' | 'enrollment:read-own';
export type AdministrativeEnrollmentPermission = 'enrollment:price-manage' | 'enrollment:read-all' | 'enrollment:incident-follow-up';
export type EnrollmentPermission = Extract<Permission, `enrollment:${string}`>;
/** Identidad técnica de composición; no sustituye SessionActor ni acepta SYSTEM por HTTP. */
export type EnrollmentAuditActor = { readonly kind:'ACCOUNT'; readonly reference:UUID }
  | { readonly kind:'SYSTEM'; readonly reference:string };
export type EnrollmentCommandOperation = 'COURSE_PRICE_SET' | 'INCIDENT_FOLLOW_UP';
export type EnrollmentResourceReferences = { readonly courseId:UUID }
  | { readonly incidentId:UUID; readonly followUpId:UUID };
export interface EnrollmentCommandReceipt {
  readonly id:UUID; readonly replayed:boolean; readonly outcomeCode:'APPLIED'|'NO_CHANGE';
  readonly resultingRevision:string; readonly appliedAt:InstantUs;
}
export interface EnrollmentCommandResult<T> { readonly resource:T; readonly command:EnrollmentCommandReceipt }
export { EnrollmentCommandConflict } from '../public/errors.js';
export type EnrollmentAuditRecord =
  | { readonly operation:EnrollmentCommandOperation; readonly targetId:UUID; readonly commandId:UUID; readonly requestId:UUID;
      readonly beforeRevision:string|null; readonly afterRevision:string|null; readonly result:'APPLIED'|'NO_CHANGE' }
  | { readonly operation:'ORDER_EXPIRED'; readonly targetId:UUID; readonly requestId:UUID;
      readonly beforeRevision:string; readonly afterRevision:string; readonly result:'EXPIRED' };
export interface EnrollmentAudit {
  write(event:EnrollmentAuditRecord):Promise<{readonly id:UUID;readonly recorded:boolean;readonly occurredAt:InstantUs}>;
}
/** La composición liga permiso y misma transacción; SessionRepository queda intacto.
 * Debe revalidar cuenta/sesión/permiso actuales en la primaria, no aceptar un rol de UI.
 */
export interface EnrollmentAuthorization { revalidate(actor: SessionActor, permission: EnrollmentPermission): Promise<void> }
export interface EnrollmentTopology {
  readonly accountIds: readonly UUID[]; readonly courseIds: readonly UUID[]; readonly groupIds: readonly UUID[];
  readonly orderIds: readonly UUID[]; readonly attemptIds: readonly UUID[]; readonly receiptIds: readonly UUID[];
  readonly paymentIds: readonly UUID[]; readonly enrollmentIds: readonly UUID[]; readonly incidentIds: readonly UUID[];
}
export interface EnrollmentDiscovery {
  readonly offering: ReservationOfferingAccess;
  /** Incluye la orden anterior y sus grupos, también si ya venció efectivamente. */
  discoverStudent(studentId: UUID): Promise<EnrollmentTopology>;
}
/** Persistencia del agregado, no CRUD genérico. Resultado/auditoría se confirman juntos. */
export interface EnrollmentStore {
  currentOrder(studentId: UUID): Promise<EnrollmentOrderSnapshot | null>;
  confirm(input: { readonly studentId: UUID; readonly requestId: UUID; readonly selection: ReservationSelection;
    readonly items: readonly OriginalOrderItem[]; readonly totalMinor: bigint; readonly decision: TemporalDecision }): Promise<UUID>;
}
/** Lecturas disponibles desde fundamentos; confirm se incorpora en T033. */
export interface EnrollmentFinancialReads extends Pick<EnrollmentStore,'currentOrder'> {
  order(orderId: UUID): Promise<EnrollmentOrderSnapshot | null>;
}
export interface EnrollmentFoundationParticipants {
  readonly offering: ReservationOfferingAccess;
  readonly calendar: EnrollmentCalendar;
  readonly financial: EnrollmentFinancialReads;
  readonly decision: TemporalDecision;
}
export interface ExpirationNormalizer {
  normalize(orderId: UUID, decision: TemporalDecision): Promise<'EXPIRED' | 'NOT_DUE' | 'ALREADY_TERMINAL'>;
}
export interface EnrollmentDecisionCapabilities {
  readonly offering: ReservationOfferingAccess; readonly commitments: GroupCommitmentPolicy;
  readonly calendar: EnrollmentCalendar; readonly store: EnrollmentStore;
  readonly expiration: ExpirationNormalizer; readonly decision: TemporalDecision;
}
export interface ReservationWork<T> {
  discover(capabilities: EnrollmentDiscovery): Promise<EnrollmentTopology>;
  /** El coordinador repite descubrimiento tras locks; aborta si cambia la cobertura.
   * Reautoriza mediante dependencia de composición antes de llamar decide.
   */
  decide(capabilities: EnrollmentDecisionCapabilities): Promise<T>;
}
/** Un presupuesto accountTransaction, un cliente por intento, capacidades efímeras
 * solo durante el callback. Sin implementación de locks/COMMIT en este bloque T010.
 * SYSTEM se ensambla por separado en infraestructura, nunca como actor de cliente.
 */
export interface ReservationCoordinator {
  run<T>(actor: SessionActor, work: ReservationWork<T>): Promise<T>;
}
