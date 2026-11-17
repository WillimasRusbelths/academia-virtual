import { createHash } from 'node:crypto';
import type { MaterialsTransaction } from '../../../infrastructure/database/materials-transaction.js';
import type { SessionActor } from '../../authorization/public/session.js';
import type { MaterialsCommandStore } from '../application/ports.js';
import type { MaterialCommandInput, MaterialEditInput, MaterialCommandResponse, MaterialResult } from '../public/materials.js';
import { MaterialError } from '../domain/material-error.js';
import { transitionMaterial } from '../domain/transitions.js';
import type { MaterialTransitionOperation } from '../domain/transitions.js';
import { readManagedMaterial } from './material-store.js';
import { writeMaterialAudit } from './audit.js';

type Receipt = { materialId: string; payloadDigest: Buffer; appliedRevision: string; result: MaterialResult; at: string };
type Times = { updatedBy: string; updatedAt: string; publishedAt: string | null; withdrawnAt: string | null };
const instant = (value: string): bigint => {
  if (!/^-?\d+$/.test(value)) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
  return BigInt(value);
};
export function createMaterialsCommandStore(run: MaterialsTransaction): MaterialsCommandStore {
  const execute = (actor: SessionActor, materialId: string, operation: MaterialTransitionOperation,
    input: MaterialCommandInput | MaterialEditInput): Promise<MaterialCommandResponse> =>
    run(actor, { kind: 'MATERIAL', id: materialId }, operation, async context => {
      // Preserve the original PUBLISH v1 digest so existing durable receipts replay.
      const texts = operation === 'EDIT' ? input as MaterialEditInput : null;
      const digest = createHash('sha256').update(JSON.stringify(['materials.command.v1', actor.userId, materialId,
        operation, input.commandId, input.expectedRevision, ...(texts ? [texts.title, texts.description] : [])])).digest();
      // Sorted account locks (including actor) precede group/material locks.
      // Identical command IDs aimed at different resources also serialize.
      // Authority is current before any ledger lookup or replay projection.
      const receipt = await context.use(async () => (await context.client.query<Receipt>(`SELECT "materialId","payloadDigest",
        "appliedRevision"::text AS "appliedRevision",result,(extract(epoch FROM "appliedAt")*1000000)::numeric(30,0)::text AS at
        FROM "MaterialCommand" WHERE "actorId"=$1 AND "commandId"=$2`, [actor.userId, input.commandId])).rows[0]);
      if (receipt) {
        if (instant(receipt.at) > context.decision.at) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
        if (receipt.materialId !== materialId || !receipt.payloadDigest.equals(digest)) throw new MaterialError('IDEMPOTENCY_CONFLICT');
        return { resource: await readManagedMaterial(context, materialId), command: { id: input.commandId, replayed: true,
          appliedRevision: receipt.appliedRevision, result: receipt.result } };
      }
      const previous = await readManagedMaterial(context, materialId);
      const times = await context.use(async () => (await context.client.query<Times>(`SELECT "updatedBy",
        (extract(epoch FROM "updatedAt")*1000000)::numeric(30,0)::text AS "updatedAt",
        (extract(epoch FROM "publishedAt")*1000000)::numeric(30,0)::text AS "publishedAt",
        (extract(epoch FROM "withdrawnAt")*1000000)::numeric(30,0)::text AS "withdrawnAt"
        FROM "Material" WHERE id=$1`, [materialId])).rows[0]);
      const group = context.groups.find(item => item.groupId === previous.groupId);
      if (!times || !group || (actor.role !== 'ADMIN' && actor.role !== 'TEACHER')) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
      const transition = transitionMaterial({ ...previous, updatedBy: times.updatedBy, updatedAt: instant(times.updatedAt),
        publishedAt: times.publishedAt === null ? null : instant(times.publishedAt),
        withdrawnAt: times.withdrawnAt === null ? null : instant(times.withdrawnAt) },
      { operation, expectedRevision: input.expectedRevision, ...(texts ?? {}) },
      { at: context.decision.at, actorId: actor.userId, role: actor.role, groupState: group.state });
      const { result } = transition;
      if (result === 'APPLIED') {
        const next = transition.resource;
        await context.use(async () => {
          const changed = await context.client.query(`UPDATE "Material" SET title=$2,description=$3,state=$4,revision=$5,"updatedBy"=$6,
            "updatedAt"=TIMESTAMPTZ 'epoch'+($7::text || ' microseconds')::interval,
            "publishedAt"=TIMESTAMPTZ 'epoch'+($8::text || ' microseconds')::interval,
            "withdrawnAt"=TIMESTAMPTZ 'epoch'+($9::text || ' microseconds')::interval WHERE id=$1 AND revision=$10`,
          [materialId, next.title, next.description, next.state, next.revision, next.updatedBy, next.updatedAt.toString(),
            next.publishedAt?.toString() ?? null, next.withdrawnAt?.toString() ?? null, previous.revision]);
          if (changed.rowCount !== 1) throw new MaterialError('MATERIAL_VERSION_CONFLICT');
        });
      }
      const resource = result === 'NO_CHANGE' ? previous : await readManagedMaterial(context, materialId);
      await context.use(async () => {
        await context.client.query(`INSERT INTO "MaterialCommand"
          ("actorId","commandId","materialId",operation,"payloadDigest","appliedRevision",result,"appliedAt")
          VALUES ($1,$2,$3,$4,$5,$6,$7,TIMESTAMPTZ 'epoch'+($8::text || ' microseconds')::interval)`,
        [actor.userId, input.commandId, materialId, operation, digest, resource.revision, result, context.decision.at.toString()]);
      });
      await writeMaterialAudit(context, { actorId: actor.userId, groupId: resource.groupId, materialId,
        intentionId: null, commandId: input.commandId, operation, result, revision: resource.revision, at: context.decision.at });
      return { resource, command: { id: input.commandId, replayed: false, appliedRevision: resource.revision, result } };
    });
  return Object.freeze<MaterialsCommandStore>({
    edit: (actor, materialId, input) => execute(actor, materialId, 'EDIT', input),
    publish: (actor, materialId, input) => execute(actor, materialId, 'PUBLISH', input),
    withdraw: (actor, materialId, input) => execute(actor, materialId, 'WITHDRAW', input),
  });
}
