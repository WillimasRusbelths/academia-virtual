/// <reference types="vite/client" />
import { expect } from 'vitest';
import type { Pool } from 'pg';
import type { EnrollmentOrderSnapshot, InstantUs, OriginalOrderItem } from '../../src/modules/enrollment/public/enrollment.js';
import type { AuthenticPaymentEvidence, GatewayObservation } from '../../src/modules/enrollment/public/payments.js';
import type { EffectiveCommitment } from '../../src/modules/enrollment/domain/compatibility.js';
import type { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';

/** Puertos de conformidad del ensayo, no APIs ni sustitutos de producto.
 * T048/T051 podrán exportar estas capacidades; un objetivo ausente falla dentro
 * del caso, sin error de import, test.fails ni una decisión satisfactoria ficticia. */
export interface PaymentConditions {
  readonly groupId:string;readonly studentVisible:boolean;readonly teacherEligible:boolean;
  readonly teacherReviewRequired:boolean;readonly seatState:'CONFIRMED'|'CONVERTED'|'EXPIRED';
  readonly capacity:number;readonly reserved:number;readonly occupied:number;
  readonly currentPriceMinor:bigint;readonly currentName:string;
}
export interface PaymentInput {
  readonly order:EnrollmentOrderSnapshot|null;readonly merchantReference:string|null;
  readonly providerScope:string;readonly observation:GatewayObservation;readonly at:InstantUs;
  readonly groups:readonly PaymentConditions[];
  readonly commitments:readonly (EffectiveCommitment&{readonly orderId:string|null})[];
  readonly receivedAt?:InstantUs;readonly externalObservedAt?:InstantUs;
}
export type PaymentDecision=
  | {readonly state:'UNCONFIRMED'}
  | {readonly state:'INCIDENT';readonly reason:string;readonly evidence:AuthenticPaymentEvidence;readonly affectedGroupIds:readonly string[]}
  | {readonly state:'APPLIED';readonly items:readonly (OriginalOrderItem&{readonly confirmedAt:InstantUs;readonly validUntil:InstantUs})[]};
interface DomainExports {verifyPayment?:(input:PaymentInput)=>PaymentDecision}
const domains=import.meta.glob<DomainExports>('../../src/modules/enrollment/domain/payment-verification.ts',{eager:true});
export function paymentDecisionTarget():(input:PaymentInput)=>PaymentDecision{
  const target=Object.values(domains)[0]?.verifyPayment;
  expect(target,'T048 pendiente: decisión pura de pago ausente; no es fallo de import/configuración').toBeTypeOf('function');
  return target!;
}
export function paymentDecision(input:PaymentInput):PaymentDecision{return paymentDecisionTarget()(input);}
export interface PaymentFinalization {
  readonly receiptId:string;readonly observation:GatewayObservation;readonly requestId:string;
}
export interface PaymentProcessor {
  finalize(input:PaymentFinalization):Promise<{state:'APPLIED'|'INCIDENT'|'UNCONFIRMED'|'INTEGRITY_CONFLICT';paymentId?:string;verificationFinishedAt?:string}>;
}
interface StoreExports {createPaymentVerification?:(pool:Pool,offering:typeof createReservationOfferingParticipant)=>PaymentProcessor}
const stores=import.meta.glob<StoreExports>('../../src/modules/enrollment/infrastructure/enrollment-store.ts',{eager:true});
export function paymentProcessor(pool:Pool,offering:typeof createReservationOfferingParticipant):PaymentProcessor{
  const factory=Object.values(stores)[0]?.createPaymentVerification;
  expect(factory,'T051 pendiente: finalizador SYSTEM de pago ausente; no es fallo de PG/import/configuración').toBeTypeOf('function');
  return factory!(pool,offering);
}
