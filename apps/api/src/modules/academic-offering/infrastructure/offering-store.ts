import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { createAcademicTransaction } from '../../../infrastructure/database/academic-transaction.js';
import type { AcademicTransactionDependencies, AcademicTransactionWork } from '../../../infrastructure/database/academic-transaction.js';
import type { OfferingOperation } from '../application/offering-store.js';
import { OfferingError } from '../public/offer.js';
import type { AdminCourse, AdminGroup, CommandResult, GroupState, Revision, UUID } from '../public/offer.js';
import { offeringAudit } from './offering-audit.js';
import type { AcademicAuditWriter } from './offering-audit.js';

type Resource = AdminCourse | AdminGroup;
export interface AcademicMutation<T extends Resource> {
  readonly resource: T;
  readonly result: 'APPLIED' | 'NO_CHANGE';
  readonly beforeState: GroupState | null;
  readonly beforeRevision: Revision | null;
}
/** Puerto interno de infraestructura para futuros adaptadores de comandos, no CRUD público.
 * discover/recheck incluyen padres y docentes; validate contiene las reglas específicas.
 * apply escribe el agregado; no abre transacciones ni escribe ledger/auditoría.
 * payload ya normalizado contiene toda la intención (incluido courseId al crear grupo).
 */
export interface AcademicCommandWork<T extends Resource> extends Omit<AcademicTransactionWork<AcademicMutation<T>>, 'afterAuthorization'> {
  readonly commandId: UUID;
  readonly requestId: UUID;
  readonly operation: OfferingOperation;
  readonly targetKind: 'COURSE' | 'GROUP';
  /** Para altas: UUID generado por servidor antes del intento; replay usa el del ledger. */
  readonly targetId: UUID;
  readonly expectedRevision?: Revision;
  readonly payload: Readonly<Record<string, unknown>>;
  /** Proyección administrativa autorizada, solo por el ID suministrado, sin efectos. */
  project(client: PoolClient, targetId: UUID): Promise<T>;
}
export type AcademicCommandWriter = <T extends Resource>(work: AcademicCommandWork<T>) => Promise<CommandResult<T>>;

interface LedgerRow {
  payloadDigest: Buffer;
  targetId: UUID;
  resultingRevision: Revision;
  result: 'APPLIED' | 'NO_CHANGE';
}

/** JSON canónico: claves ordenadas recursivamente, orden de arrays conservado.
 * Rechazar valores ajenos a JSON en vez de colapsar intenciones diferentes.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + Array.from(value, canonical).join(',') + ']';
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}';
  }
  throw new TypeError('Comando interno no JSON. Valores omitidos.');
}
function digest<T extends Resource>(work: AcademicCommandWork<T>, targetId: UUID): Buffer {
  return createHash('sha256').update(canonical({ operation: work.operation, targetKind: work.targetKind,
    targetId: targetId.toLowerCase(), expectedRevision: work.expectedRevision ?? null, payload: work.payload })).digest();
}
function revision(value: string): bigint {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new TypeError('Revisión interna no válida. Valor omitido.');
  }
  return BigInt(value);
}
function checkResource(resource: Resource, kind: 'COURSE' | 'GROUP', targetId: UUID): void {
  if (resource.id.toLowerCase() !== targetId.toLowerCase() || ('courseId' in resource) !== (kind === 'GROUP')) {
    throw new TypeError('Proyección interna inconsistente. Valores omitidos.');
  }
  revision(resource.revision);
}

/** Un solo protocolo/retry budget. El lock del actor serializa su PK actor/commandId.
 * No guarda cuerpos/respuestas, no purga entradas y no reintenta un COMMIT incierto.
 * Las operaciones concretas y las consultas de audiencia se incorporan en sus historias.
 */
export function createAcademicCommandWriter(pool: Pool, authorization: AcademicTransactionDependencies,
  options: { readonly audit?: AcademicAuditWriter } = {}): AcademicCommandWriter {
  const transact = createAcademicTransaction(pool, authorization);
  const audit = options.audit ?? offeringAudit;
  return <T extends Resource>(work: AcademicCommandWork<T>): Promise<CommandResult<T>> => {
    // Estado por invocación; jamás compartir digest/proyección entre comandos concurrentes.
    let payloadDigest: Buffer;
    let before: T | undefined;
    const creating = work.operation === 'COURSE_CREATE' || work.operation === 'GROUP_CREATE';
    return transact<CommandResult<T>>({
      actor: work.actor, permission: 'academic:manage',
      discover: client => work.discover(client), recheck: (client, locked) => work.recheck(client, locked),
      async afterAuthorization(client) {
        const stored = await client.query<LedgerRow>(`SELECT "payloadDigest","targetId","resultingRevision"::text,result
          FROM "AcademicCommand" WHERE "actorUserId"=$1 AND "commandId"=$2`, [work.actor.userId, work.commandId]);
        const prior = stored.rows[0];
        // El UUID de un alta es generado por servidor, no una intención del cliente.
        // Tras pérdida de respuesta se recupera el UUID original ANTES de calcular el digest.
        payloadDigest = digest(work, creating && prior ? prior.targetId : work.targetId);
        if (!prior) return undefined;
        if (!payloadDigest.equals(prior.payloadDigest)) throw new OfferingError({ code: 'IDEMPOTENCY_CONFLICT' });
        const resource = await work.project(client, prior.targetId);
        checkResource(resource, work.targetKind, prior.targetId);
        return { value: { resource, command: { id: work.commandId, replayed: true,
          appliedRevision: prior.resultingRevision, result: prior.result } } };
      },
      async validate(client, locked) {
        before = undefined; // También al redescubrir tras un aborto conocido.
        if (creating) {
          if (work.expectedRevision !== undefined) throw new TypeError('Alta interna con revisión previa.');
        } else {
          if (work.expectedRevision === undefined) throw new TypeError('Falta revisión interna.');
          revision(work.expectedRevision);
          before = await work.project(client, work.targetId);
          checkResource(before, work.targetKind, work.targetId);
          if (before.revision !== work.expectedRevision) throw new OfferingError({ code: 'OFFERING_VERSION_CONFLICT' });
        }
        await work.validate?.(client, locked);
      },
      async apply(client) {
        const changed = await work.apply(client);
        checkResource(changed.resource, work.targetKind, work.targetId);
        const applied = revision(changed.resource.revision);
        if (changed.beforeRevision !== (before?.revision ?? null) || changed.beforeState !== (before?.state ?? null)
          || (creating ? changed.result !== 'APPLIED' || applied !== 1n
            : applied !== revision(before!.revision) + (changed.result === 'APPLIED' ? 1n : 0n))) {
          throw new TypeError('Resultado interno inconsistente. Valores omitidos.');
        }
        await client.query(`INSERT INTO "AcademicCommand"
          ("actorUserId","commandId",operation,"targetKind","targetId","payloadDigest","resultingRevision",result)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [work.actor.userId, work.commandId, work.operation, work.targetKind,
          work.targetId, payloadDigest!, changed.resource.revision, changed.result]);
        await audit.write(client, { actorUserId: work.actor.userId, resourceKind: work.targetKind,
          resourceId: work.targetId, action: work.operation, result: changed.result,
          commandId: work.commandId, requestId: work.requestId, beforeState: changed.beforeState,
          afterState: changed.resource.state, beforeRevision: changed.beforeRevision, afterRevision: changed.resource.revision });
        return { resource: changed.resource, command: { id: work.commandId, replayed: false,
          appliedRevision: changed.resource.revision, result: changed.result } };
      },
    });
  };
}
