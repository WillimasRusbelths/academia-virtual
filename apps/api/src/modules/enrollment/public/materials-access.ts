import type { InstantUs, UUID } from './enrollment.js';

/** Structural temporal port: only the owning coordinator may issue/validate a token. */
export interface MaterialsEnrollmentDecision { readonly at: InstantUs }
export interface MaterialsEnrollmentReference { readonly groupId: UUID; readonly courseId: UUID }
/** Discovery only: immutable own references, including history/future rows. Never an entitlement. */
export interface MaterialsEnrollmentDiscovery {
  references(studentId: UUID): Promise<readonly MaterialsEnrollmentReference[]>;
}
/** The caller supplies the live transaction capability; no SQL or IO types cross this port. */
export interface MaterialsEnrollmentScope {
  assertDecision(decision: MaterialsEnrollmentDecision): void;
  use<T>(operation: () => Promise<T>): Promise<T>;
}
/** Enrollment owns the original confirmedAt/validUntil snapshots. These reads do not
 * authorize a session, material state or offering operation and never mutate finances.
 */
export interface MaterialsEnrollmentAccess {
  hasAccess(studentId: UUID, groupId: UUID, decision: MaterialsEnrollmentDecision): Promise<boolean>;
  groups(studentId: UUID, decision: MaterialsEnrollmentDecision): Promise<readonly MaterialsEnrollmentReference[]>;
}
