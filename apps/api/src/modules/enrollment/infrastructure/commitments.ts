import type { PoolClient } from 'pg';
import type { GroupCommitmentPolicy } from '../public/commitments.js';
import { requiresGroupCommitmentCheck } from '../public/commitments.js';
import { postgresInstantParameter } from './temporal.js';

/** Participante del escritor de oferta: mismo cliente, grupo ya bloqueado y t
 * capturado después del recheck. No abre transacciones ni toma locks tardíos.
 * Todo escritor financiero debe adquirir ese mismo grupo antes de cambiar hechos.
 */
export function createGroupCommitmentPolicy(client: PoolClient, lockedGroupIds: readonly string[], assertActive: () => void): GroupCommitmentPolicy {
  const covered = new Set(lockedGroupIds);
  return { async check(input) {
    assertActive();
    if (!covered.has(input.groupId)) throw new TypeError('Grupo fuera de cobertura.');
    if (!requiresGroupCommitmentCheck(input.change)) return { allowed: true };
    const at = postgresInstantParameter(input.evaluatedAt);
    // Nueva sentencia READ COMMITTED después de esperar el grupo. La visibilidad
    // de la oferta y los estados de cuenta no extinguen estos compromisos.
    const result = await client.query<{ blocked: boolean }>(`SELECT
      EXISTS (SELECT 1 FROM "EnrollmentOrderItem" i
        JOIN "EnrollmentOrder" o ON o.id=i."orderId"
        JOIN "SeatReservation" s ON s."orderItemId"=i.id
        WHERE i."groupId"=$1 AND o.state='RESERVED' AND s.state='CONFIRMED'
          AND o."confirmedAt" <= $2::timestamptz AND $2::timestamptz < o."expiresAt")
      OR EXISTS (SELECT 1 FROM "Enrollment" e WHERE e."groupId"=$1
        AND e."confirmedAt" <= $2::timestamptz AND $2::timestamptz < e."validUntil")
      OR EXISTS (SELECT 1 FROM "PaymentIncident" p WHERE $1::uuid=ANY(p."affectedGroupIds")) AS blocked`, [input.groupId, at]);
    assertActive();
    return result.rows[0].blocked ? { allowed: false, reason: 'GROUP_HAS_COMMITMENTS' } : { allowed: true };
  } };
}
