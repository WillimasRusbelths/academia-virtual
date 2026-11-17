import type { InstantUs, UUID } from './enrollment.js';

/** Operación/campos concretos de oferta; no concede permiso para editarlos. */
export type GroupCommitmentChange =
  | { readonly operation: 'GROUP_EDIT'; readonly fields: readonly ('name' | 'description' | 'periodStart' | 'periodEnd' | 'capacity' | 'timeZone' | 'teacherUserId')[] }
  | { readonly operation: 'GROUP_SCHEDULE' | 'GROUP_CANCEL' | 'GROUP_WITHDRAW' | 'GROUP_PUBLISH' };
export interface GroupCommitmentCheck {
  readonly groupId: UUID;
  readonly change: GroupCommitmentChange;
  readonly evaluatedAt: InstantUs;
}
export type GroupCommitmentResult = { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'GROUP_HAS_COMMITMENTS' };
/** Comprobar reservas/matrículas vigentes e incidencias abiertas con los mismos locks
 * y reloj del escritor. No inicia otra transacción ni devuelve titulares/cifras privadas.
 * Nombre/descripción/docente/retiro/publicación conservan las reglas propias de 002.
 */
export interface GroupCommitmentPolicy {
  check(input: GroupCommitmentCheck): Promise<GroupCommitmentResult>;
}
/** La oferta identifica la operación; enrollment conserva la regla de protección. */
export function requiresGroupCommitmentCheck(change: GroupCommitmentChange): boolean {
  return change.operation === 'GROUP_CANCEL' || change.operation === 'GROUP_SCHEDULE'
    || change.operation === 'GROUP_EDIT' && change.fields.some(field =>
      field === 'periodStart' || field === 'periodEnd' || field === 'timeZone' || field === 'capacity');
}
