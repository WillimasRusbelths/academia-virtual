import type { Pool, PoolClient } from 'pg';
import { AuthorizationFailure, permits } from '../../modules/authorization/public/session.js';
import type { Permission, SessionActor } from '../../modules/authorization/public/session.js';
import type { ClassesGroupAccess, ClassesGroupSnapshot } from '../../modules/academic-offering/public/classes-access.js';
import type { ClassesEnrollmentAccess, ClassesEnrollmentScope } from '../../modules/enrollment/public/classes-access.js';
import type { ClassAuthors } from '../../modules/users/public/class-authors.js';
import type { ClassDecision } from '../../modules/classes/public/classes.js';
import type { ClassesPermission, ClassesTarget, ClassesTopology } from '../../modules/classes/application/ports.js';
import { ClassError } from '../../modules/classes/public/errors.js';
import { isAccountId } from '../../modules/users/public/account.js';
import { accountTransaction } from './account-transaction.js';
import { canonicalLockIds, lockAccounts } from './account-locks.js';

export interface ClassesTransactionContext {
  readonly client: PoolClient;
  readonly actor: SessionActor;
  readonly groups: readonly ClassesGroupSnapshot[];
  readonly classId: string | null;
  readonly commandId?: string;
  readonly mode: 'READ' | 'WRITE';
  readonly decision: ClassDecision;
  assertActive(): void;
  assertDecision(decision: { readonly at: bigint }): void;
  use<T>(operation: () => Promise<T>): Promise<T>;
}
export interface ClassesTransactionDependencies {
  revalidateInTransaction(client: PoolClient, actor: SessionActor, permission: Permission): Promise<void>;
  offering(client: PoolClient): ClassesGroupAccess;
  enrollment(client: PoolClient, scope: ClassesEnrollmentScope): ClassesEnrollmentAccess;
  authors(client: PoolClient, assertActive: () => void, ids: readonly string[]): ClassAuthors;
}
export type ClassesTransaction = <T>(actor: SessionActor, permission: ClassesPermission, target: ClassesTarget,
  mode: 'READ' | 'WRITE', apply: (context: ClassesTransactionContext) => Promise<T>) => Promise<T>;
class TopologyChanged extends Error { readonly transactionAborted = true; }
const keys = ['accountIds', 'courseIds', 'groupIds', 'classIds'] as const;
async function discover(client: PoolClient, offering: ClassesGroupAccess, actor: SessionActor, target: ClassesTarget): Promise<ClassesTopology> {
  // Discovery exposes references only, not a receipt or stored payload. Re-read
  // after actor/resource locks before any result is projected.
  const classId = target.kind === 'CLASS' ? target.id : target.kind === 'STUDENT' ? target.classId
    : target.kind === 'COMMAND' ? (await client.query<{ classId: string }>(
      'SELECT "classId" FROM "ClassCommand" WHERE "actorId"=$1 AND "commandId"=$2', [actor.userId, target.id])).rows[0]?.classId : null;
  const groupId = target.kind === 'GROUP' ? target.id :
    (await client.query<{ groupId: string }>('SELECT "groupId" FROM "ClassSession" WHERE id=$1', [classId])).rows[0]?.groupId;
  const groups = await offering.discover(groupId ? [groupId] : []);
  return Object.freeze({
    accountIds: canonicalLockIds([actor.userId, ...(actor.role === 'STUDENT' ? [] : groups.flatMap(g => g.teacherUserId ? [g.teacherUserId] : [])),
      ...(target.kind === 'STUDENT' ? [target.studentId] : [])]),
    courseIds: canonicalLockIds(groups.map(g => g.courseId)), groupIds: canonicalLockIds(groups.map(g => g.groupId)),
    classIds: canonicalLockIds(classId && groups.length ? [classId] : []),
  });
}
/** One accountTransaction budget. Discovery never authorizes. UUID accounts →
 * session → course → group → class, then callback-owned subrows/ledger. No network
 * waits or financial locks here. Readers SHARE, writers UPDATE from first lock.
 */
export function createClassesTransaction(pool: Pool, dependencies: ClassesTransactionDependencies): ClassesTransaction {
  return async (actor, permission, input, mode, apply) => {
    if (!permits(actor.role, permission) || !['classes:manage-all', 'classes:manage-own', 'classes:participate-enrolled'].includes(permission))
      throw new AuthorizationFailure('FORBIDDEN');
    if (!['READ', 'WRITE'].includes(mode) || !['GROUP', 'CLASS', 'STUDENT', 'COMMAND'].includes(input.kind)
      || input.kind === 'COMMAND' && mode !== 'READ') throw new ClassError('FORBIDDEN');
    if (input.kind === 'STUDENT' && actor.role === 'STUDENT' || input.kind === 'GROUP' && actor.role === 'STUDENT' && mode === 'WRITE')
      throw new ClassError('FORBIDDEN');
    const ids = input.kind === 'STUDENT' ? [input.classId, input.studentId] : [input.id];
    if (!ids.every(isAccountId)) throw new ClassError('NOT_FOUND');
    const target: ClassesTarget = input.kind === 'STUDENT' ? Object.freeze({ kind: 'STUDENT', classId: input.classId.toLowerCase(), studentId: input.studentId.toLowerCase() })
      : Object.freeze({ kind: input.kind, id: input.id.toLowerCase() });
    let callbackError: unknown;
    return accountTransaction(pool, async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      const offering = dependencies.offering(client), found = await discover(client, offering, actor, target);
      await lockAccounts(client, found.accountIds);
      await dependencies.revalidateInTransaction(client, actor, permission);
      const suffix = mode === 'READ' ? 'SHARE' : 'UPDATE';
      for (const [table, values] of [['AcademicCourse', found.courseIds], ['AcademicGroup', found.groupIds], ['ClassSession', found.classIds]] as const) {
        if (!values.length) continue;
        const result = await client.query(`SELECT id FROM "${table}" WHERE id=ANY($1::uuid[]) ORDER BY id FOR ${suffix}`, [values]);
        if (result.rowCount !== values.length) throw new TopologyChanged();
      }
      const current = await discover(client, offering, actor, target);
      if (!keys.every(key => found[key].length === current[key].length && found[key].every((id, i) => id === current[key][i]))) throw new TopologyChanged();
      const at = (await client.query<{ at: string }>('SELECT (extract(epoch FROM clock_timestamp())*1000000)::numeric(30,0)::text AS at')).rows[0].at;
      if (!/^-?\d+$/.test(at)) throw new ClassError('TEMPORARILY_UNAVAILABLE');
      const decision = Object.freeze({ at: BigInt(at) }) as ClassDecision;
      let active = true, pending = 0;
      const assertActive = () => { if (!active) throw new ClassError('TEMPORARILY_UNAVAILABLE'); };
      const scope = Object.freeze({ decision, assertActive,
        assertDecision(token: { readonly at: bigint }) { assertActive(); if (token !== decision) throw new ClassError('TEMPORARILY_UNAVAILABLE'); },
        async use<T>(operation: () => Promise<T>) {
          assertActive(); pending++;
          try { const value = await operation(); assertActive(); return value; } finally { pending--; }
        },
      });
      try {
        const groups = await offering.snapshots(found.groupIds, actor.role === 'STUDENT' ? 'STUDENT' : undefined);
        if (groups.length !== 1 && !(target.kind === 'COMMAND' && groups.length === 0 && found.classIds.length === 0)) throw new ClassError('NOT_FOUND');
        const group = groups[0], enrollment = dependencies.enrollment(client, scope);
        if (group && actor.role === 'TEACHER' && (group.teacherUserId !== actor.userId || !group.teacherEligible || group.state === 'CANCELLED')) throw new ClassError('NOT_FOUND');
        if (group && actor.role === 'STUDENT' && (group.state === 'CANCELLED' || !await enrollment.hasAccess(actor.userId, group.groupId, decision))) throw new ClassError('NOT_FOUND');
        if (target.kind === 'STUDENT') {
          const students = await dependencies.authors(client, assertActive, [target.studentId]).byIds([target.studentId]);
          if (students[0]?.role !== 'STUDENT' || !await enrollment.hasAccess(target.studentId, group.groupId, decision)) throw new ClassError('NOT_FOUND');
        }
        const facts = (await client.query<{ at: string | null }>(`SELECT (extract(epoch FROM max(at))*1000000)::numeric(30,0)::text AS at FROM (
          SELECT GREATEST("createdAt","updatedAt","startedAt","finishedAt","cancelledAt") AS at FROM "ClassSession" WHERE id=ANY($1::uuid[])
          UNION ALL SELECT GREATEST("acceptedAt","hiddenAt") FROM "ClassMessage" WHERE "classId"=ANY($1::uuid[])
          UNION ALL SELECT "updatedAt" FROM "ClassStudentRestriction" WHERE "classId"=ANY($1::uuid[])
          UNION ALL SELECT "updatedAt" FROM "ClassVideoReference" WHERE "classId"=ANY($1::uuid[])
          UNION ALL SELECT "occurredAt" FROM "ClassChange" WHERE "classId"=ANY($1::uuid[])) known`, [found.classIds])).rows[0].at;
        if (facts !== null && (!/^-?\d+$/.test(facts) || BigInt(facts) > decision.at)) throw new ClassError('TEMPORARILY_UNAVAILABLE');
        const context: ClassesTransactionContext = Object.freeze({ ...scope, client, actor, groups: Object.freeze(groups),
          classId: found.classIds[0] ?? null, mode, ...(target.kind === 'COMMAND' ? { commandId: target.id } : {}) });
        let result: Awaited<ReturnType<typeof apply>>;
        try { result = await apply(context); }
        catch (error) { if (error instanceof Error && !('code' in error)) callbackError = error; throw error; }
        if (pending) throw new ClassError('TEMPORARILY_UNAVAILABLE');
        await dependencies.revalidateInTransaction(client, actor, permission);
        return result;
      } finally { active = false; }
    }, () => new ClassError('TEMPORARILY_UNAVAILABLE'), error => error instanceof ClassError || error instanceof AuthorizationFailure || error !== undefined && error === callbackError);
  };
}
