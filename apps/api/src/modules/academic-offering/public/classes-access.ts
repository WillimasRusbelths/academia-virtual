import type { UUID, CourseState, GroupState } from './offer.js';

export interface ClassesGroupReference {
  readonly groupId: UUID;
  readonly courseId: UUID;
  readonly teacherUserId: UUID | null;
}
export interface ClassesGroupSnapshot extends ClassesGroupReference {
  readonly name: string;
  readonly courseName: string;
  readonly courseState: CourseState;
  readonly state: GroupState;
  readonly teacherEligible: boolean;
}
/** Same primary connection as the coordinator. Discovery is not authorization.
 * No catalog visibility predicate, financial reads, locks or transaction owner.
 * STUDENT snapshots deliberately do not consult teacher eligibility.
 */
export interface ClassesGroupAccess {
  discover(groupIds: readonly UUID[]): Promise<readonly ClassesGroupReference[]>;
  managedReferences(actorId: UUID, role: 'ADMIN' | 'TEACHER'): Promise<readonly ClassesGroupReference[]>;
  snapshots(groupIds: readonly UUID[], audience?: 'STUDENT'): Promise<readonly ClassesGroupSnapshot[]>;
}
