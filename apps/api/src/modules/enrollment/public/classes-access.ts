import type { InstantUs, UUID } from './enrollment.js';

/** Structural port: only the coordinator issues and validates the live token. */
export interface ClassesEnrollmentDecision { readonly at: InstantUs }
export interface ClassesEnrollmentReference { readonly groupId: UUID; readonly courseId: UUID }
/** Own references may include historical/future rows; discovery never grants access. */
export interface ClassesEnrollmentDiscovery {
  references(studentId: UUID): Promise<readonly ClassesEnrollmentReference[]>;
}
export interface ClassesEnrollmentScope {
  assertDecision(decision: ClassesEnrollmentDecision): void;
  use<T>(operation: () => Promise<T>): Promise<T>;
}
/** Original confirmedAt <= t < validUntil only, including a moderation target.
 * Session, account/role, group/class state and responsibility remain the caller's
 * authority. These reads neither expose payments nor mutate enrollment facts.
 */
export interface ClassesEnrollmentAccess {
  hasAccess(studentId: UUID, groupId: UUID, decision: ClassesEnrollmentDecision): Promise<boolean>;
  groups(studentId: UUID, decision: ClassesEnrollmentDecision): Promise<readonly ClassesEnrollmentReference[]>;
}
