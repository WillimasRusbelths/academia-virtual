import type { SessionActor } from '../../authorization/public/session.js';
import type { ManagedMaterial, ManagedMaterialGroup, MaterialState, StudentMaterial } from '../public/materials.js';
import type { MaterialsReadQueries } from '../application/queries.js';
import { MaterialError } from '../public/errors.js';
import type { MaterialsGroupSnapshot } from '../../academic-offering/public/materials-access.js';
import type { MaterialsTransaction } from '../../../infrastructure/database/materials-transaction.js';
import { managedMaterialProjection as projection, readManagedMaterial } from './material-store.js';

function pagination(input: unknown, filter: boolean) {
  const allowed = filter ? ['page', 'pageSize', 'state'] : ['page', 'pageSize'];
  if (input === undefined) input = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !allowed.includes(key))) throw new MaterialError('VALIDATION_ERROR');
  const query = input as Record<string, unknown>, page = Object.hasOwn(query, 'page') ? query.page : 1,
    pageSize = Object.hasOwn(query, 'pageSize') ? query.pageSize : 20;
  if (!Number.isSafeInteger(page) || (page as number) < 1) throw new MaterialError('VALIDATION_ERROR', ['page']);
  if (!Number.isSafeInteger(pageSize) || (pageSize as number) < 1 || (pageSize as number) > 50) throw new MaterialError('VALIDATION_ERROR', ['pageSize']);
  if (query.state !== undefined && (typeof query.state !== 'string'
    || !['PREPARED', 'PUBLISHED', 'WITHDRAWN'].includes(query.state))) throw new MaterialError('VALIDATION_ERROR', ['state']);
  return { page: page as number, pageSize: pageSize as number, state: query.state as MaterialState | undefined };
}
function groupView(group: MaterialsGroupSnapshot): ManagedMaterialGroup {
  const editable = group.state !== 'CANCELLED';
  return { id: group.groupId, name: group.name, courseName: group.courseName, state: group.state,
    actions: { prepare: editable, edit: editable, publish: editable, withdraw: true } };
}

const studentProjection = `m.id,m."groupId",m.title,m.description,c."mediaType",c."byteSize",c."downloadName",
  to_char(m."publishedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "publishedAt"`;
const minimalGroup = (group: MaterialsGroupSnapshot) => ({ id: group.groupId, name: group.name, courseName: group.courseName });
export function createMaterialsQueries(run: MaterialsTransaction): MaterialsReadQueries {
  return {
    async groups(actor: SessionActor, input?: unknown) {
      const { page, pageSize } = pagination(input, false);
      return run(actor, { kind: 'GROUPS' }, 'READ', async context => {
        const start = (BigInt(page) - 1n) * BigInt(pageSize);
        const items = start >= BigInt(context.groups.length) ? [] : context.groups.slice(Number(start), Number(start) + pageSize).map(actor.role === 'STUDENT' ? minimalGroup : groupView);
        return { items, page, pageSize, total: context.groups.length };
      });
    },
    async group(actor: SessionActor, groupId: string) {
      return run(actor, { kind: 'GROUP', id: groupId }, 'READ', async context => (actor.role === 'STUDENT' ? minimalGroup : groupView)(context.groups[0]));
    },
    async items(actor: SessionActor, groupId: string, input?: unknown) {
      const student = actor.role === 'STUDENT', { page, pageSize, state } = pagination(input, !student);
      return run(actor, { kind: 'GROUP', id: groupId }, 'READ', context => context.use(async () => {
        if (student) {
          const future = (await context.client.query<{ future: boolean }>(`SELECT EXISTS(SELECT 1 FROM "Material"
            WHERE "groupId"=$1 AND state='PUBLISHED' AND extract(epoch FROM GREATEST("createdAt","updatedAt","publishedAt"))*1000000>$2::numeric) AS future`,
          [groupId, context.decision.at.toString()])).rows[0].future;
          if (future) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
        }
        const values = [groupId, student ? 'PUBLISHED' : state ?? null];
        const total = (await context.client.query<{ total: string }>(`SELECT count(*)::text AS total FROM "Material"
          WHERE "groupId"=$1 AND ($2::"MaterialState" IS NULL OR state=$2)`, values)).rows[0].total;
        const items = (await context.client.query<ManagedMaterial | StudentMaterial>(`SELECT ${student ? studentProjection : projection} FROM "Material" m
          JOIN "MaterialContent" c ON c."materialId"=m.id WHERE m."groupId"=$1 AND ($2::"MaterialState" IS NULL OR m.state=$2)
          ORDER BY m."createdAt" DESC,m.id DESC LIMIT $3 OFFSET $4`,
        [...values, pageSize, ((BigInt(page) - 1n) * BigInt(pageSize)).toString()])).rows;
        return { items, page, pageSize, total: Number(total) };
      }));
    },
    async item(actor: SessionActor, materialId: string) {
      return run<ManagedMaterial | StudentMaterial>(actor, { kind: 'MATERIAL', id: materialId }, 'READ', context => actor.role !== 'STUDENT' ? readManagedMaterial(context, materialId) : context.use(async () => {
        const row = (await context.client.query<StudentMaterial>(`SELECT ${studentProjection} FROM "Material" m
          JOIN "MaterialContent" c ON c."materialId"=m.id WHERE m.id=$1 AND m.state='PUBLISHED'`, [materialId])).rows[0];
        if (!row) throw new MaterialError('NOT_FOUND'); return row;
      }));
    },
  };
}
