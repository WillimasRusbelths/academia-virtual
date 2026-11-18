import { createHash, timingSafeEqual } from 'node:crypto';
import type { ClassesTransactionContext } from '../../../infrastructure/database/classes-transaction.js';
import type { ClassOperation, ClassReceipt, ClassResult } from '../public/classes.js';
import type { ClassesAuditRecord } from '../application/ports.js';
import { ClassError } from '../public/errors.js';
import { isAccountId } from '../../users/public/account.js';

const operations: readonly ClassOperation[] = ['CREATE', 'EDIT', 'START', 'FINISH', 'CANCEL', 'SEND', 'HIDE', 'MUTE', 'UNMUTE', 'VIDEO_REFERENCE_SET'];
/** Validated canonical input only. Explicit fields, never a DTO, body or secret.
 * Command identity is the actor's ledger key, separate from semantic intent. */
export interface ClassCommandIntent {
  readonly operation: ClassOperation;
  readonly groupId: string;
  readonly classId: string | null;
  readonly messageId?: string;
  readonly targetStudentId?: string;
  readonly expectedRevision?: string;
  readonly title?: string;
  readonly description?: string | null;
  readonly text?: string;
  readonly videoId?: string | null;
}
export function classCommandDigest(input: ClassCommandIntent): Buffer {
  if (!operations.includes(input.operation)) throw new ClassError('VALIDATION_ERROR');
  return createHash('sha256').update(JSON.stringify(['classes.command.v1', input.operation, input.groupId.toLowerCase(),
    input.classId?.toLowerCase() ?? null, input.messageId?.toLowerCase() ?? null, input.targetStudentId?.toLowerCase() ?? null,
    input.expectedRevision ?? null, input.title ?? null, input.description ?? null, input.text ?? null, input.videoId ?? null])).digest();
}
export interface StoredClassCommand {
  readonly commandId: string;
  readonly classId: string;
  readonly groupId: string;
  readonly operation: ClassOperation;
  readonly messageId: string | null;
  readonly targetStudentId: string | null;
  readonly appliedRevision: string | null;
  readonly appliedEventSeq: string | null;
  readonly result: ClassResult;
}
export interface ClassCommandAppend {
  readonly commandId: string;
  readonly operation: ClassOperation;
  readonly payloadDigest: Buffer;
  readonly messageId?: string | null;
  readonly targetStudentId?: string | null;
  readonly appliedRevision: string | null;
  readonly appliedEventSeq: string | null;
  readonly result: ClassResult;
}
const receipt = (record: StoredClassCommand, replayed: boolean): ClassReceipt => Object.freeze({
  id: record.commandId, replayed, result: record.result, appliedRevision: record.appliedRevision, appliedEventSeq: record.appliedEventSeq,
});
/** Constructed only with a live authorized class transaction. Parent class lock
 * precedes immutable ledger reads; actor lock serializes keys across classes.
 * No original view/text is persisted or returned, and no internal retry exists.
 */
export function createClassCommandStore(context: ClassesTransactionContext) {
  const bound = () => {
    context.assertActive();
    if (!context.classId || context.groups.length !== 1) throw new ClassError('NOT_FOUND');
    return { classId: context.classId, groupId: context.groups[0].groupId };
  };
  const writeAudit = async (record: ClassesAuditRecord) => {
    const resource = bound();
    if (context.mode !== 'WRITE' || record.actorId !== context.actor.userId || record.classId !== resource.classId
      || record.groupId !== resource.groupId || record.at !== context.decision.at) throw new ClassError('FORBIDDEN');
    return context.use(async () => {
      await context.client.query(`INSERT INTO "ClassAuditEvent" ("actorId","classId","groupId",operation,"commandId",result,revision,"eventSeq","occurredAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TIMESTAMPTZ 'epoch'+($9::text || ' microseconds')::interval)`,
      [record.actorId, record.classId, record.groupId, record.operation, record.commandId, record.result, record.revision, record.eventSeq, record.at.toString()]);
    });
  };
  return Object.freeze({
    async lookup(commandId: string, expected?: { readonly operation: ClassOperation; readonly payloadDigest: Buffer }) {
      const resource = bound();
      if (!isAccountId(commandId)) throw new ClassError('VALIDATION_ERROR', ['commandId']);
      return context.use(async () => {
        const row = (await context.client.query<StoredClassCommand & { payloadDigest: Buffer; at: string }>(`SELECT "commandId","classId","groupId",operation,
          "messageId","targetStudentId","appliedRevision"::text,"appliedEventSeq"::text,result,"payloadDigest",
          (extract(epoch FROM "appliedAt")*1000000)::numeric(30,0)::text AS at
          FROM "ClassCommand" WHERE "actorId"=$1 AND "commandId"=$2`, [context.actor.userId, commandId])).rows[0];
        if (!row) return null;
        if (!/^-?\d+$/.test(row.at) || BigInt(row.at) > context.decision.at) throw new ClassError('TEMPORARILY_UNAVAILABLE');
        if (row.classId !== resource.classId || row.groupId !== resource.groupId || expected && (row.operation !== expected.operation
          || expected.payloadDigest.length !== 32 || row.payloadDigest.length !== 32 || !timingSafeEqual(row.payloadDigest, expected.payloadDigest)))
          throw new ClassError('IDEMPOTENCY_CONFLICT');
        const value: StoredClassCommand = Object.freeze({ commandId: row.commandId, classId: row.classId, groupId: row.groupId,
          operation: row.operation, messageId: row.messageId, targetStudentId: row.targetStudentId,
          appliedRevision: row.appliedRevision, appliedEventSeq: row.appliedEventSeq, result: row.result });
        return Object.freeze({ record: value, command: receipt(value, true) });
      });
    },
    async append(input: ClassCommandAppend): Promise<ClassReceipt> {
      const resource = bound();
      if (context.mode !== 'WRITE') throw new ClassError('FORBIDDEN');
      if (!isAccountId(input.commandId) || !Buffer.isBuffer(input.payloadDigest) || input.payloadDigest.length !== 32)
        throw new ClassError('VALIDATION_ERROR', ['commandId']);
      const value: StoredClassCommand = { commandId: input.commandId, ...resource, operation: input.operation,
        messageId: input.messageId ?? null, targetStudentId: input.targetStudentId ?? null,
        appliedRevision: input.appliedRevision, appliedEventSeq: input.appliedEventSeq, result: input.result };
      await context.use(async () => {
        try {
          await context.client.query(`INSERT INTO "ClassCommand" ("actorId","commandId","classId","groupId",operation,"payloadDigest","messageId",
            "targetStudentId","appliedRevision","appliedEventSeq",result,"appliedAt")
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TIMESTAMPTZ 'epoch'+($12::text || ' microseconds')::interval)`,
          [context.actor.userId, value.commandId, value.classId, value.groupId, value.operation, input.payloadDigest,
            value.messageId, value.targetStudentId, value.appliedRevision, value.appliedEventSeq, value.result, context.decision.at.toString()]);
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new ClassError('IDEMPOTENCY_CONFLICT');
          throw error;
        }
      });
      await writeAudit({ actorId: context.actor.userId, classId: value.classId, groupId: value.groupId,
        commandId: value.commandId, operation: value.operation, result: value.result, at: context.decision.at,
        revision: value.appliedRevision, eventSeq: value.appliedEventSeq });
      return receipt(value, false);
    },
    audit: Object.freeze({ write: writeAudit }),
  });
}
