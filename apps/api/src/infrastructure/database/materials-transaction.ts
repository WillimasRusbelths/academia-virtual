import type { Pool, PoolClient } from 'pg';
import type { Permission, SessionActor } from '../../modules/authorization/public/session.js';
import { AuthorizationFailure, permits } from '../../modules/authorization/public/session.js';
import type { MaterialsGroupAccess, MaterialsGroupSnapshot } from '../../modules/academic-offering/public/materials-access.js';
import type { MaterialDecision } from '../../modules/materials/public/materials.js';
import type { MaterialsTopology } from '../../modules/materials/application/ports.js';
import type { MaterialsEnrollmentAccess, MaterialsEnrollmentDiscovery, MaterialsEnrollmentScope } from '../../modules/enrollment/public/materials-access.js';
import { MaterialError } from '../../modules/materials/public/errors.js';
import { isAccountId } from '../../modules/users/public/account.js';
import { accountTransaction } from './account-transaction.js';
import { canonicalLockIds, lockAccounts } from './account-locks.js';

export type MaterialsAction = 'READ' | 'PREPARE' | 'EDIT' | 'PUBLISH' | 'WITHDRAW';
export type MaterialsTarget = { readonly kind: 'GROUP' | 'MATERIAL' | 'UPLOAD'; readonly id: string } | { readonly kind: 'GROUPS' };
export interface MaterialsTransactionContext {
  readonly client: PoolClient;
  readonly groups: readonly MaterialsGroupSnapshot[];
  readonly decision: MaterialDecision;
  assertActive(): void;
  assertDecision(token: MaterialDecision): void;
  use<T>(operation: () => Promise<T>): Promise<T>;
}
export interface MaterialsTransactionDependencies {
  revalidateInTransaction(client: PoolClient, actor: SessionActor, permission: Permission): Promise<void>;
}
export interface MaterialsEnrollmentParticipants {
  discover(client: PoolClient): MaterialsEnrollmentDiscovery;
  access(client: PoolClient, scope: MaterialsEnrollmentScope): MaterialsEnrollmentAccess;
}
export type MaterialsTransaction = <T>(actor: SessionActor, target: MaterialsTarget, action: MaterialsAction,
  apply: (context: MaterialsTransactionContext) => Promise<T>) => Promise<T>;
type Discovery = { topology: MaterialsTopology; uploadActorId: string | null };
const keys = ['accountIds', 'courseIds', 'groupIds', 'materialIds', 'uploadIds'] as const;
class TopologyChanged extends Error { readonly transactionAborted = true; }
export function materialsManagerPermission(actor: SessionActor): Permission {
  if (actor.role === 'ADMIN') return 'materials:manage-all';
  if (actor.role === 'TEACHER') return 'materials:manage-own';
  throw new AuthorizationFailure('FORBIDDEN');
}

async function discover(client: PoolClient, offering: MaterialsGroupAccess, actor: SessionActor, target: MaterialsTarget,
  enrollment?: MaterialsEnrollmentParticipants): Promise<Discovery> {
  let groupIds: string[] = [], materialIds: string[] = [], uploadIds: string[] = [], uploadActorId: string | null = null;
  if (target.kind === 'GROUP') groupIds = [target.id];
  if (target.kind === 'MATERIAL') {
    const row = (await client.query<{ id: string; groupId: string }>('SELECT id,"groupId" FROM "Material" WHERE id=$1', [target.id])).rows[0];
    if (row) { groupIds = [row.groupId]; materialIds = [row.id]; }
  }
  if (target.kind === 'UPLOAD') {
    const row = (await client.query<{ uploadId: string; groupId: string; actorId: string; materialId: string | null }>(
      'SELECT "uploadId","groupId","actorId","materialId" FROM "MaterialUpload" WHERE "uploadId"=$1', [target.id])).rows[0];
    if (row) {
      groupIds = [row.groupId]; uploadIds = [row.uploadId]; uploadActorId = row.actorId;
      materialIds = row.materialId === null ? [] : [row.materialId];
    }
  }
  if (actor.role === 'STUDENT' && target.kind === 'GROUPS') {
    if (!enrollment) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
    groupIds = (await enrollment.discover(client).references(actor.userId)).map(row => row.groupId);
  }
  const groups = target.kind === 'GROUPS' && actor.role !== 'STUDENT'
    ? await offering.managedReferences(actor.userId, actor.role as 'ADMIN' | 'TEACHER') : await offering.discover(groupIds);
  const topology: MaterialsTopology = {
    accountIds: canonicalLockIds([actor.userId, ...(actor.role === 'STUDENT' ? [] : groups.flatMap(group => group.teacherUserId ? [group.teacherUserId] : []))]),
    courseIds: canonicalLockIds(groups.map(group => group.courseId)), groupIds: canonicalLockIds(groups.map(group => group.groupId)),
    materialIds: canonicalLockIds(materialIds), uploadIds: canonicalLockIds(uploadIds),
  };
  return { topology, uploadActorId };
}
function same(a: Discovery, b: Discovery): boolean {
  return a.uploadActorId === b.uploadActorId && keys.every(key => a.topology[key].length === b.topology[key].length
    && a.topology[key].every((id, index) => id === b.topology[key][index]));
}

/** One shared accountTransaction retry budget, primary connection and ordered locks.
 * READ uses SHARE on resources; session/accounts remain protected by identity's protocol.
 * No financial locks, nested coordinators, transaction during network transfer or ledger before authority.
 */
export function createMaterialsTransaction(pool: Pool, authorization: MaterialsTransactionDependencies,
  participant: (client: PoolClient) => MaterialsGroupAccess, enrollment?: MaterialsEnrollmentParticipants): MaterialsTransaction {
  return (actor, target, action, apply) => {
    const student = actor.role === 'STUDENT';
    if (student && (action !== 'READ' || target.kind === 'UPLOAD')) throw new AuthorizationFailure('FORBIDDEN');
    const permission = student ? 'materials:read-enrolled' : materialsManagerPermission(actor);
    if (!permits(actor.role, permission)) throw new AuthorizationFailure('FORBIDDEN');
    if (!['READ', 'PREPARE', 'EDIT', 'PUBLISH', 'WITHDRAW'].includes(action)) throw new MaterialError('FORBIDDEN');
    if (target.kind !== 'GROUPS' && !isAccountId(target.id)) throw new MaterialError('NOT_FOUND');
    return accountTransaction(pool, async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      const offering = participant(client), found = await discover(client, offering, actor, target, enrollment), locked = found.topology;
      await lockAccounts(client, locked.accountIds);
      await authorization.revalidateInTransaction(client, actor, permission);
      const suffix = action === 'READ' ? 'SHARE' : 'UPDATE';
      for (const [table, ids, column] of [
        ['AcademicCourse', locked.courseIds, 'id'], ['AcademicGroup', locked.groupIds, 'id'],
        ['Material', locked.materialIds, 'id'], ['MaterialUpload', locked.uploadIds, 'uploadId'],
      ] as const) {
        if (!ids.length) continue;
        const result = await client.query(`SELECT "${column}" FROM "${table}" WHERE "${column}"=ANY($1::uuid[]) ORDER BY "${column}" FOR ${suffix}`, [ids]);
        if (result.rowCount !== ids.length) throw new TopologyChanged();
      }
      if (!same(found, await discover(client, offering, actor, target, enrollment))) throw new TopologyChanged();
      const at = (await client.query<{ at: string }>(
        'SELECT (extract(epoch FROM clock_timestamp())*1000000)::numeric(30,0)::text AS at')).rows[0].at;
      if (!/^-?\d+$/.test(at)) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
      const decision = Object.freeze({ at: BigInt(at) }) as MaterialDecision;
      let active = true, pending = 0;
      const assertActive = () => { if (!active) throw new MaterialError('TEMPORARILY_UNAVAILABLE'); };
      const scope = Object.freeze({ decision, assertActive,
        assertDecision(token: MaterialDecision) { assertActive(); if (token !== decision) throw new MaterialError('TEMPORARILY_UNAVAILABLE'); },
        async use<T>(operation: () => Promise<T>) {
          assertActive(); pending++;
          try { const result = await operation(); assertActive(); return result; } finally { pending--; }
        },
      });
      try {
        let references = locked.groupIds;
        if (student) {
          if (!enrollment) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
          const current = new Set((await enrollment.access(client, scope).groups(actor.userId, decision)).map(row => row.groupId));
          references = locked.groupIds.filter(id => current.has(id));
        }
        const snapshots = await offering.snapshots(references, student ? 'STUDENT' : undefined);
        const groups = snapshots.filter(group => actor.role === 'ADMIN' || (student
          ? group.state !== 'CANCELLED' : group.teacherUserId === actor.userId && group.teacherEligible && group.state !== 'CANCELLED'));
        if (target.kind !== 'GROUPS' && groups.length !== 1) throw new MaterialError('NOT_FOUND');
        if (target.kind === 'UPLOAD' && found.uploadActorId !== actor.userId) throw new MaterialError('NOT_FOUND');
        if (student && target.kind === 'MATERIAL') {
          const row = (await client.query<{ state: string }>('SELECT state FROM "Material" WHERE id=$1', [target.id])).rows[0];
          if (row?.state !== 'PUBLISHED') throw new MaterialError('NOT_FOUND');
        }
        if (groups.some(group => group.state === 'CANCELLED') && !['READ', 'WITHDRAW'].includes(action)) throw new MaterialError('MATERIAL_STATE_CONFLICT');
        const facts = await client.query<{ at: string | null }>(`SELECT (extract(epoch FROM max(at))*1000000)::numeric(30,0)::text AS at FROM (
          SELECT GREATEST("createdAt","updatedAt","publishedAt","withdrawnAt") AS at FROM "Material" WHERE id=ANY($1::uuid[])
          UNION ALL SELECT "createdAt" AS at FROM "MaterialUpload" WHERE "uploadId"=ANY($2::uuid[])) known`, [locked.materialIds, locked.uploadIds]);
        if (facts.rows[0].at !== null && (!/^-?\d+$/.test(facts.rows[0].at) || BigInt(facts.rows[0].at) > decision.at)) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
        const context: MaterialsTransactionContext = Object.freeze({ ...scope, client, groups: Object.freeze(groups) });
        const value = await apply(context);
        if (pending) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
        // Session time may expire while executing the callback. Never commit using the earlier check alone.
        await authorization.revalidateInTransaction(client, actor, permission);
        return value;
      } finally { active = false; }
    }, () => new MaterialError('TEMPORARILY_UNAVAILABLE'), error => error instanceof MaterialError || error instanceof AuthorizationFailure);
  };
}
