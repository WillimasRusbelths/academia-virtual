import type { PoolClient } from 'pg';
import { isAccountId } from '../../modules/users/public/account.js';

/** Referencias internas validadas, copiadas y ordenadas; no conserva arrays del llamante. */
export function canonicalLockIds(ids: readonly string[]): readonly string[] {
  if (!Array.isArray(ids) || !ids.every(isAccountId)) {
    throw new TypeError('Referencias de bloqueo no válidas. Valores omitidos.');
  }
  return Object.freeze([...new Set(ids.map(id => id.toLowerCase()))].sort());
}

/** Capacidad compartida de infraestructura. Requiere BEGIN del llamante.
 * Solo aquí se conoce la tabla física de cuentas; no decide elegibilidad ni permisos.
 * FOR UPDATE coordina también los cambios de rol/estado que no modifican claves.
 */
export async function lockAccounts(client: PoolClient, ids: readonly string[]): Promise<void> {
  const ordered = canonicalLockIds(ids);
  if (ordered.length === 0) return;
  await client.query('SELECT id FROM "User" WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ordered]);
  // Una cuenta ausente no revela información antes de reautorizar al actor.
  // La asignación/elegibilidad vigente se comprueba por la superficie de usuarios.
}
