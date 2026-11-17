import type { UUID } from './enrollment.js';

/** Scope configurado proveedor/comercio/entorno, sin secretos. D02 sigue pendiente. */
export interface PaymentIdentity { readonly providerScope: string; readonly providerPaymentId: string }
export interface GatewayAttempt {
  readonly attemptId: UUID; readonly merchantReference: string; readonly externalIdempotencyKey: string;
  readonly providerScope: string; readonly amountMinor: bigint; readonly currency: 'PEN';
}
export type GatewayInitiation =
  | { readonly state: 'PENDING'; readonly providerReference: string }
  | { readonly state: 'INITIATION_UNKNOWN' }
  | { readonly state: 'FAILED_NO_CHARGE' };
/** Hecho externo auténtico normalizado; no es VerifiedPayment ni confirma matrícula.
 * Importe real con escala explícita, sin restringir a PEN/escala 2 un hecho incompatible.
 */
export interface AuthenticPaymentEvidence extends PaymentIdentity {
  readonly merchantReference: string;
  readonly amountUnits: bigint; readonly amountScale: number; readonly currency: string;
  readonly normalizedEvidenceReference: string;
}
export type GatewayObservation = { readonly state: 'UNRESOLVED' }
  | { readonly state: 'FAILED_NO_CHARGE' }
  | { readonly state: 'ECONOMIC_FACT'; readonly evidence: AuthenticPaymentEvidence };
/** Solo fuera de transacciones/locks. No recibe éxito del navegador ni fecha de
 * verificación del cliente. Una consulta sin resultado no acredita ausencia de cobro.
 * Ninguna implementación/adaptador de proveedor se habilita mediante este contrato.
 */
export interface PaymentGateway {
  initiate(attempt: GatewayAttempt): Promise<GatewayInitiation>;
  recover(attempt: GatewayAttempt): Promise<GatewayObservation>;
  verify(receipt: { readonly receiptId: UUID; readonly normalizedEvidenceReference: string }): Promise<GatewayObservation>;
}
