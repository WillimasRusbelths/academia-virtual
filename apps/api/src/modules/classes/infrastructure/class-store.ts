import { randomUUID } from 'node:crypto';
import type { ClassesTransaction, ClassesTransactionContext } from '../../../infrastructure/database/classes-transaction.js';
import type { SessionActor } from '../../authorization/public/session.js';
import { isAccountId } from '../../users/public/account.js';
import { ClassError } from '../public/errors.js';
import type { ClassCommandInput, ClassCommandLookup, ClassCreateInput, ClassEditInput, ManagedClassSession } from '../public/classes.js';
import type { ClassesCommands, ClassesManagementStore, ClassesPermission } from '../application/ports.js';
import { classRevision, normalizeClassTexts, prepareClassSession, transitionClassSession } from '../domain/class-session.js';
import type { ClassSessionCommand, ClassSessionSnapshot } from '../domain/class-session.js';
import { classCommandDigest, createClassCommandStore } from './command-store.js';

const permission = (actor: SessionActor): ClassesPermission => actor.role === 'ADMIN' ? 'classes:manage-all'
  : actor.role === 'TEACHER' ? 'classes:manage-own' : 'classes:participate-enrolled';
const instant = (parameter: number) => `TIMESTAMPTZ 'epoch'+($${parameter}::text || ' microseconds')::interval`;
type Row = Omit<ClassSessionSnapshot, 'createdAt' | 'updatedAt' | 'startedAt' | 'finishedAt' | 'cancelledAt'> & {
  createdAt: string; updatedAt: string; startedAt: string | null; finishedAt: string | null; cancelledAt: string | null; viewVersion: string;
};
const times = ['createdAt', 'updatedAt', 'startedAt', 'finishedAt', 'cancelledAt'] as const;
function snapshot(row: Row): ClassSessionSnapshot {
  return Object.freeze({ id: row.id, groupId: row.groupId, createdBy: row.createdBy, updatedBy: row.updatedBy,
    title: row.title, description: row.description, state: row.state, revision: row.revision,
    createdAt: BigInt(row.createdAt), updatedAt: BigInt(row.updatedAt), startedAt: row.startedAt === null ? null : BigInt(row.startedAt),
    finishedAt: row.finishedAt === null ? null : BigInt(row.finishedAt), cancelledAt: row.cancelledAt === null ? null : BigInt(row.cancelledAt) });
}
function utc(at: bigint): string {
  // Date formats whole seconds only; authoritative comparisons retain bigint μs.
  let seconds = at / 1000000n, fraction = at % 1000000n;
  if (fraction < 0n) { seconds--; fraction += 1000000n; }
  return new Date(Number(seconds * 1000n)).toISOString().replace(/\.\d{3}Z$/, '.' + fraction.toString().padStart(6, '0') + 'Z');
}
/** A scoped store owns no transaction/retry/network. The coordinator already
 * holds group UPDATE and (for existing sessions) class UPDATE before writing. */
export function createClassSessionStore(context: ClassesTransactionContext) {
  function group() {
    context.assertActive();
    if (context.groups.length !== 1) throw new ClassError('NOT_FOUND');
    return context.groups[0];
  }
  function write(id: string, create = false) {
    const g = group();
    if (context.mode !== 'WRITE' || context.actor.role === 'STUDENT') throw new ClassError('FORBIDDEN');
    if (!isAccountId(id) || (create ? context.classId !== null || id !== g.groupId : context.classId !== id)) throw new ClassError('NOT_FOUND');
    return g;
  }
  // Private binding only after inserting, or locking and checking, a session in
  // this already-authorized group. It never acquires a different group's class.
  const bound = (id: string): ClassesTransactionContext => Object.freeze({ ...context, classId: id });
  async function load(id: string): Promise<{ resource: ClassSessionSnapshot; viewVersion: string }> {
    const row = await context.use(async () => (await context.client.query<Row>(`SELECT s.id,s."groupId",s.title,s.description,s.state,
      s.revision::text,s."createdBy",s."updatedBy",${times.map(t => `(extract(epoch FROM s."${t}")*1000000)::numeric(30,0)::text AS "${t}"`).join(',')},
      COALESCE((SELECT max(c."eventSeq") FROM "ClassChange" c WHERE c."classId"=s.id
        AND c.type IN ('CREATED','EDITED','STARTED','FINISHED','CANCELLED')),0)::text AS "viewVersion"
      FROM "ClassSession" s WHERE s.id=$1 AND s."groupId"=$2`, [id, group().groupId])).rows[0]);
    if (!row) throw new ClassError('NOT_FOUND');
    const resource = snapshot(row);
    if (times.some(t => resource[t] !== null && resource[t]! > context.decision.at)) throw new ClassError('TEMPORARILY_UNAVAILABLE');
    return { resource, viewVersion: row.viewVersion };
  }
  async function view(id: string): Promise<ManagedClassSession> {
    const { resource: r, viewVersion } = await load(id), cancelled = group().state === 'CANCELLED';
    return Object.freeze({ ...r, viewVersion, createdAt: utc(r.createdAt), updatedAt: utc(r.updatedAt),
      startedAt: r.startedAt === null ? null : utc(r.startedAt), finishedAt: r.finishedAt === null ? null : utc(r.finishedAt),
      cancelledAt: r.cancelledAt === null ? null : utc(r.cancelledAt), actions: Object.freeze({ edit: true,
        start: !cancelled && r.state === 'PREPARED', finish: r.state === 'LIVE', cancel: r.state === 'PREPARED' }) });
  }
  async function event(id: string, type: 'CREATED' | 'EDITED' | 'STARTED' | 'FINISHED' | 'CANCELLED', revision: string) {
    return context.use(async () => {
      const seq = (await context.client.query<{ seq: string }>(`UPDATE "ClassSession" SET "lastEventSeq"="lastEventSeq"+1
        WHERE id=$1 AND "lastEventSeq"<9223372036854775807 RETURNING "lastEventSeq"::text AS seq`, [id])).rows[0]?.seq;
      if (!seq) throw new ClassError('CLASS_STATE_CONFLICT');
      await context.client.query(`INSERT INTO "ClassChange" ("classId","eventSeq",type,"actorId",revision,"occurredAt")
        VALUES ($1,$2,$3,$4,$5,${instant(6)})`, [id, seq, type, context.actor.userId, revision, context.decision.at.toString()]);
      return seq;
    });
  }
  const mutate = (operation: ClassSessionCommand['operation']) => async (id: string, input: ClassCommandInput | ClassEditInput) => {
    const g = write(id);
    if (!isAccountId(input.commandId)) throw new ClassError('VALIDATION_ERROR', ['commandId']);
    const canonical = Object.freeze({ commandId: input.commandId.toLowerCase(), expectedRevision: classRevision(input.expectedRevision),
      ...(operation === 'EDIT' ? normalizeClassTexts(inputTexts(input)) : {}) });
    const payloadDigest = classCommandDigest({ operation, groupId: g.groupId, classId: id, ...canonical });
    const ledger = createClassCommandStore(context), replay = await ledger.lookup(canonical.commandId, { operation, payloadDigest });
    if (replay) return Object.freeze({ resource: await view(id), command: replay.command });
    const { resource: current } = await load(id);
    const result = transitionClassSession(current, { ...canonical, operation }, { at: context.decision.at, actorId: context.actor.userId });
    if (g.state === 'CANCELLED' && operation === 'START') throw new ClassError('CLASS_STATE_CONFLICT');
    let appliedEventSeq: string | null = null;
    if (result.result === 'APPLIED') {
      if (operation === 'START' && (await context.use(async () => context.client.query(
        `SELECT id FROM "ClassSession" WHERE "groupId"=$1 AND state='LIVE' AND id<>$2 LIMIT 1`, [g.groupId, id]))).rowCount)
        throw new ClassError('CLASS_ALREADY_LIVE');
      const r = result.resource;
      await context.use(async () => {
        try {
          await context.client.query(`UPDATE "ClassSession" SET title=$2,description=$3,state=$4,revision=$5,"updatedBy"=$6,
            "updatedAt"=${instant(7)},"startedAt"=${instant(8)},"finishedAt"=${instant(9)},"cancelledAt"=${instant(10)} WHERE id=$1`,
          [id, r.title, r.description, r.state, r.revision, r.updatedBy, r.updatedAt.toString(),
            r.startedAt?.toString() ?? null, r.finishedAt?.toString() ?? null, r.cancelledAt?.toString() ?? null]);
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === '23505'
            && 'constraint' in error && error.constraint === 'ClassSession_one_live_per_group') throw new ClassError('CLASS_ALREADY_LIVE');
          throw error;
        }
      });
      const type = { EDIT: 'EDITED', START: 'STARTED', FINISH: 'FINISHED', CANCEL: 'CANCELLED' } as const;
      appliedEventSeq = await event(id, type[operation], r.revision);
    }
    const command = await ledger.append({ commandId: canonical.commandId, operation, payloadDigest,
      result: result.result, appliedRevision: result.resource.revision, appliedEventSeq });
    return Object.freeze({ resource: await view(id), command });
  };
  const commands: ClassesCommands = Object.freeze({
    async create(groupId: string, input: ClassCreateInput) {
      const g = write(groupId, true), texts = normalizeClassTexts(inputTexts(input));
      if (!isAccountId(input.commandId)) throw new ClassError('VALIDATION_ERROR', ['commandId']);
      const commandId = input.commandId.toLowerCase();
      const payloadDigest = classCommandDigest({ operation: 'CREATE', groupId, classId: null, ...texts });
      const previous = await context.use(async () => (await context.client.query<{ classId: string; groupId: string }>(
        'SELECT "classId","groupId" FROM "ClassCommand" WHERE "actorId"=$1 AND "commandId"=$2', [context.actor.userId, commandId])).rows[0]);
      if (previous) {
        if (previous.groupId !== groupId) throw new ClassError('IDEMPOTENCY_CONFLICT');
        await context.use(async () => context.client.query('SELECT id FROM "ClassSession" WHERE id=$1 AND "groupId"=$2 FOR UPDATE', [previous.classId, groupId]));
        const replay = await createClassCommandStore(bound(previous.classId)).lookup(commandId, { operation: 'CREATE', payloadDigest });
        if (!replay) throw new ClassError('TEMPORARILY_UNAVAILABLE');
        return Object.freeze({ resource: await view(previous.classId), command: replay.command });
      }
      if (g.state === 'CANCELLED') throw new ClassError('CLASS_STATE_CONFLICT');
      const id = randomUUID(), r = prepareClassSession(texts, { id, groupId, actorId: context.actor.userId, at: context.decision.at });
      await context.use(async () => context.client.query(`INSERT INTO "ClassSession" (id,"groupId",title,description,"createdBy","updatedBy","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$5,${instant(6)},${instant(6)})`, [id, groupId, r.title, r.description, r.createdBy, r.createdAt.toString()]));
      const appliedEventSeq = await event(id, 'CREATED', r.revision);
      const command = await createClassCommandStore(bound(id)).append({ commandId, operation: 'CREATE', payloadDigest,
        result: 'APPLIED', appliedRevision: r.revision, appliedEventSeq });
      return Object.freeze({ resource: await view(id), command });
    }, edit: mutate('EDIT'), start: mutate('START'), finish: mutate('FINISH'), cancel: mutate('CANCEL'),
  });
  return Object.freeze({ commands,
    async command(id: string): Promise<ClassCommandLookup> {
      context.assertActive();
      if (!isAccountId(id) || context.commandId && context.commandId !== id) throw new ClassError('NOT_FOUND');
      if (!context.classId) {
        if (!context.commandId) throw new ClassError('NOT_FOUND');
        return Object.freeze({ result: 'NOT_CONFIRMED' });
      }
      const replay = await createClassCommandStore(context).lookup(id);
      if (!replay) return Object.freeze({ result: 'NOT_CONFIRMED' });
      if (context.actor.role === 'STUDENT') throw new ClassError('NOT_FOUND');
      if (!['CREATE', 'EDIT', 'START', 'FINISH', 'CANCEL'].includes(replay.record.operation)) throw new ClassError('TEMPORARILY_UNAVAILABLE');
      return Object.freeze({ result: 'APPLIED', response: Object.freeze({ resource: await view(context.classId), command: replay.command }) });
    },
  });
}
function inputTexts(input: ClassCreateInput | ClassCommandInput) {
  const value = input as ClassCreateInput;
  return { title: value.title, description: value.description };
}
export function createClassesManagementStore(transaction: ClassesTransaction): ClassesManagementStore {
  const mutate = (operation: 'edit' | 'start' | 'finish' | 'cancel') => (actor: SessionActor, id: string, input: ClassEditInput | ClassCommandInput) =>
    transaction(actor, permission(actor), { kind: 'CLASS', id }, 'WRITE', c => createClassSessionStore(c).commands[operation](id, input as ClassEditInput));
  return Object.freeze({
    create: (actor: SessionActor, id: string, input: ClassCreateInput) => transaction(actor, permission(actor), { kind: 'GROUP', id }, 'WRITE', c => createClassSessionStore(c).commands.create(id, input)),
    edit: mutate('edit'), start: mutate('start'), finish: mutate('finish'), cancel: mutate('cancel'),
    command: (actor: SessionActor, id: string) => transaction(actor, permission(actor), { kind: 'COMMAND', id }, 'READ', c => createClassSessionStore(c).command(id)),
  });
}
