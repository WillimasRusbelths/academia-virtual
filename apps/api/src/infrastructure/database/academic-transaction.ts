import type { Pool, PoolClient } from 'pg';
import { AuthorizationFailure } from '../../modules/authorization/public/session.js';
import type { SessionActor, Permission } from '../../modules/authorization/public/session.js';
import { OfferingError } from '../../modules/academic-offering/public/offer.js';
import { accountTransaction } from './account-transaction.js';
import { canonicalLockIds, lockAccounts } from './account-locks.js';

/** Capacidades de infraestructura, ensambladas desde composición; no amplían SessionRepository. */
export interface AcademicTransactionDependencies {
  revalidateInTransaction(client: PoolClient, actor: SessionActor, permission: Permission): Promise<void>;
}
export interface AcademicTopology {
  readonly accountIds: readonly string[];
  readonly courseIds: readonly string[];
  readonly groupIds: readonly string[];
}
export interface AcademicTransactionWork<T> {
  readonly actor: SessionActor;
  readonly permission: Permission;
  /** Descubrir dentro de cada intento, incluyendo docentes anteriores/nuevos e hijos pertinentes. */
  discover(client: PoolClient): Promise<AcademicTopology>;
  /** Releer asignaciones/conjunto tras locks; no adquirir nuevas cuentas aquí. */
  recheck(client: PoolClient, locked: AcademicTopology): Promise<AcademicTopology>;
  /** Punto de extensión para T014: solo después de reautorizar, antes de bloquear recursos.
   * undefined continúa; {value} termina sin mutación (p. ej. replay futuro).
   * No hay lectura/escritura de ledger implementada en este protocolo.
   */
  afterAuthorization?(client: PoolClient, locked: AcademicTopology): Promise<{ readonly value: T } | undefined>;
  /** Versiones/reglas/conflictos en sentencias posteriores a locks y recheck, no una CTE de lock+lectura. */
  validate?(client: PoolClient, locked: AcademicTopology): Promise<void>;
  apply(client: PoolClient): Promise<T>;
}
export type AcademicTransaction = <T>(work: AcademicTransactionWork<T>) => Promise<T>;

/** Señal privada: comparte el presupuesto/rollback de accountTransaction, no otro bucle. */
class AcademicTopologyChanged extends Error {
  readonly transactionAborted = true;
  constructor() { super('Cambió el conjunto de referencias académicas. Valores omitidos.'); }
}

function snapshot(topology: AcademicTopology, actorId: string): AcademicTopology {
  return Object.freeze({ accountIds: canonicalLockIds([...topology.accountIds, actorId]),
    courseIds: canonicalLockIds(topology.courseIds), groupIds: canonicalLockIds(topology.groupIds) });
}
function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
async function lockResources(client: PoolClient, topology: AcademicTopology): Promise<void> {
  // Sentencias separadas y orden global: cursos antes de grupos, UUID ordenados.
  // En altas, discover incluye solo padres existentes, nunca filas todavía inexistentes.
  if (topology.courseIds.length) {
    const result = await client.query('SELECT id FROM "AcademicCourse" WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [topology.courseIds]);
    if (result.rowCount !== topology.courseIds.length) throw new OfferingError({ code: 'NOT_FOUND' });
  }
  if (topology.groupIds.length) {
    const result = await client.query<{ id: string; courseId: string }>(
      'SELECT id,"courseId" FROM "AcademicGroup" WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [topology.groupIds]);
    if (result.rowCount !== topology.groupIds.length) throw new OfferingError({ code: 'NOT_FOUND' });
    const parents = new Set(topology.courseIds);
    // No adquirir un padre recién descubierto después de Group: abortar y redescubrir.
    if (result.rows.some(group => !parents.has(group.courseId))) throw new AcademicTopologyChanged();
  }
}

/** Un pool existente, una conexión por intento y una sola llamada a accountTransaction.
 * La selección de recursos propios y las reglas académicas pertenecen al adaptador
 * consumidor; discover/recheck deben incluir sus padres e integrantes pertinentes.
 * Nunca SystemState ni locks de grupos ajenos para comprobar agenda.
 */
export function createAcademicTransaction(pool: Pool, authorization: AcademicTransactionDependencies): AcademicTransaction {
  return <T>(work: AcademicTransactionWork<T>): Promise<T> => accountTransaction(pool, async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    const locked = snapshot(await work.discover(client), work.actor.userId);
    await lockAccounts(client, locked.accountIds);
    await authorization.revalidateInTransaction(client, work.actor, work.permission);
    const decision = await work.afterAuthorization?.(client, locked);
    if (decision !== undefined) return decision.value;
    await lockResources(client, locked);
    const current = snapshot(await work.recheck(client, locked), work.actor.userId);
    if (!same(locked.accountIds, current.accountIds) || !same(locked.courseIds, current.courseIds)
      || !same(locked.groupIds, current.groupIds)) throw new AcademicTopologyChanged();
    await work.validate?.(client, locked);
    return work.apply(client);
  }, () => new OfferingError({ code: 'TEMPORARILY_UNAVAILABLE' }),
  error => error instanceof OfferingError || error instanceof AuthorizationFailure);
}
