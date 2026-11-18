import type { SessionActor } from '../../authorization/public/session.js';
import type { ClassesTransaction, ClassesTransactionContext } from '../../../infrastructure/database/classes-transaction.js';
import type { ClassesGroupSnapshot } from '../../academic-offering/public/classes-access.js';
import type { ClassesReadQueries } from '../application/queries.js';
import type { ClassesPermission } from '../application/ports.js';
import type { ClassSessionView, ManagedClassSession, ClassState } from '../public/classes.js';
import { ClassError } from '../public/errors.js';
import { createClassSessionStore } from './class-store.js';
import { createDisabledClassVideo } from './video-disabled.js';

const permission = (actor: SessionActor): ClassesPermission => actor.role === 'ADMIN' ? 'classes:manage-all'
  : actor.role === 'TEACHER' ? 'classes:manage-own' : 'classes:participate-enrolled';
function pagination(input: unknown, filtered: boolean) {
  const allowed = ['page', 'pageSize', ...(filtered ? ['state'] : [])];
  if (input === undefined) input = {};
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !allowed.includes(k))) throw new ClassError('VALIDATION_ERROR');
  const q = input as Record<string, unknown>, page = Object.hasOwn(q, 'page') ? q.page : 1,
    pageSize = Object.hasOwn(q, 'pageSize') ? q.pageSize : 20;
  if (!Number.isSafeInteger(page) || (page as number) < 1) throw new ClassError('VALIDATION_ERROR', ['page']);
  if (!Number.isSafeInteger(pageSize) || (pageSize as number) < 1 || (pageSize as number) > 50) throw new ClassError('VALIDATION_ERROR', ['pageSize']);
  if (q.state !== undefined && !['PREPARED','LIVE','FINISHED','CANCELLED'].includes(q.state as string)) throw new ClassError('VALIDATION_ERROR', ['state']);
  return { page: page as number, pageSize: pageSize as number, state: q.state as ClassState | undefined };
}
function groupView(context: ClassesTransactionContext, group: ClassesGroupSnapshot) {
  const minimal = { id: group.groupId, name: group.name, courseName: group.courseName };
  return context.actor.role === 'STUDENT' ? minimal : { ...minimal, state: group.state, canPrepare: group.state !== 'CANCELLED' };
}
async function sessionView(context: ClassesTransactionContext, id: string): Promise<ClassSessionView | ManagedClassSession> {
  const row = await createClassSessionStore(context).session(id);
  if (context.actor.role !== 'STUDENT') return row;
  if (row.state === 'CANCELLED') throw new ClassError('NOT_FOUND');
  return { id: row.id, groupId: row.groupId, title: row.title, description: row.description, state: row.state,
    revision: row.revision, viewVersion: row.viewVersion, createdAt: row.createdAt, updatedAt: row.updatedAt,
    startedAt: row.startedAt, finishedAt: row.finishedAt, cancelledAt: row.cancelledAt };
}
/** Scoped projections share the coordinator's connection and authority. Group
 * SHARE prevents command writes while count, page and projections are read. */
export function createScopedClassQueries(context: ClassesTransactionContext) {
  return {
    async groups(input?: unknown) {
      context.assertActive(); const { page, pageSize } = pagination(input, false), offset = (BigInt(page)-1n)*BigInt(pageSize);
      const items = offset >= BigInt(context.groups.length) ? [] : context.groups.slice(Number(offset), Number(offset)+pageSize).map(g => groupView(context, g));
      return { items, page, pageSize, total: context.groups.length };
    },
    async group(id: string) {
      context.assertActive(); const group = context.groups.find(g => g.groupId === id);
      if (!group) throw new ClassError('NOT_FOUND'); return groupView(context, group);
    },
    async sessions(id: string, input?: unknown) {
      context.assertActive(); if (!context.groups.some(g => g.groupId === id)) throw new ClassError('NOT_FOUND');
      const { page, pageSize, state } = pagination(input, context.actor.role !== 'STUDENT');
      return context.use(async () => {
        const values = [id, context.actor.role === 'STUDENT', state ?? null];
        const where = `"groupId"=$1 AND (NOT $2::boolean OR state<>'CANCELLED') AND ($3::"ClassState" IS NULL OR state=$3)`;
        const total = Number((await context.client.query<{ total: string }>(`SELECT count(*)::text AS total FROM "ClassSession" WHERE ${where}`, values)).rows[0].total);
        const ids = (await context.client.query<{ id: string }>(`SELECT id FROM "ClassSession" WHERE ${where} ORDER BY "createdAt" DESC,id DESC LIMIT $4 OFFSET $5`,
          [...values, pageSize, ((BigInt(page)-1n)*BigInt(pageSize)).toString()])).rows;
        const items = [];
        for (const row of ids) items.push(await sessionView(Object.freeze({ ...context, groups: Object.freeze(context.groups.filter(g => g.groupId === id)), classId: row.id }), row.id));
        return { items, page, pageSize, total };
      });
    },
    session: (id: string) => sessionView(context, id),
    async video(id: string) {
      const row = await sessionView(context, id);
      if (row.state === 'CANCELLED' || context.groups[0].state === 'CANCELLED') throw new ClassError('NOT_FOUND');
      return row.state === 'LIVE' ? createDisabledClassVideo(context).access() : { status: 'CLASS_NOT_LIVE' as const };
    },
  };
}
export function createClassesQueries(run: ClassesTransaction): ClassesReadQueries {
  return {
    groups: (actor, input) => run(actor, permission(actor), { kind: 'GROUPS' }, 'READ', c => createScopedClassQueries(c).groups(input)),
    group: (actor, id) => run(actor, permission(actor), { kind: 'GROUP', id }, 'READ', c => createScopedClassQueries(c).group(id.toLowerCase())),
    sessions: (actor, id, input) => run(actor, permission(actor), { kind: 'GROUP', id }, 'READ', c => createScopedClassQueries(c).sessions(id.toLowerCase(), input)),
    session: (actor, id) => run(actor, permission(actor), { kind: 'CLASS', id }, 'READ', c => createScopedClassQueries(c).session(id.toLowerCase())),
    video: (actor, id) => run(actor, permission(actor), { kind: 'CLASS', id }, 'READ', c => createScopedClassQueries(c).video(id.toLowerCase())),
  };
}
