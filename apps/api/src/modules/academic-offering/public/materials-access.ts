import type { UUID, GroupState } from './offer.js';

export interface MaterialsGroupReference {
  readonly groupId: UUID;
  readonly courseId: UUID;
  readonly teacherUserId: UUID | null;
}
export interface MaterialsGroupSnapshot extends MaterialsGroupReference {
  readonly name: string;
  readonly courseName: string;
  readonly state: GroupState;
  readonly teacherEligible: boolean;
}
/** Same connection as the caller's transaction. No catalog visibility predicate,
 * session policy, financial data, BEGIN or locks inside this participant.
 */
export interface MaterialsGroupAccess {
  discover(groupIds: readonly UUID[]): Promise<readonly MaterialsGroupReference[]>;
  managedReferences(actorId: UUID, role: 'ADMIN' | 'TEACHER'): Promise<readonly MaterialsGroupReference[]>;
  snapshots(groupIds: readonly UUID[], audience?: 'STUDENT'): Promise<readonly MaterialsGroupSnapshot[]>;
}
