/// <reference types="vite/client" />
import { expect } from 'vitest';
import type { Pool } from 'pg';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import type { PaymentGateway, GatewayObservation } from '../../src/modules/enrollment/public/payments.js';
import type { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import type { ReservationAdmissionFixture } from './reservation-admission.js';

/** Puertos privados del ensayo; no son implementación, SDK o API pública. */
export interface AttemptView { readonly id:string;readonly state:'SUBMITTING'|'PENDING'|'INITIATION_UNKNOWN'|'FAILED_NO_CHARGE'|'APPLIED'|'INCIDENT' }
export interface AttemptService {
  initiate(actor:SessionActor,input:{orderId:string;initiationId:string},requestId:string):Promise<AttemptView>;
  recover(input:{attemptId:string;requestId:string}):Promise<AttemptView>;
}
interface AttemptExports {createPaymentAttempts?:(pool:Pool,authorization:ReservationAdmissionFixture['authorization'],offering:typeof createReservationOfferingParticipant,gateway:PaymentGateway,configuration:{providerScope:string})=>AttemptService}
const stores=import.meta.glob<AttemptExports>('../../src/modules/enrollment/infrastructure/enrollment-store.ts',{eager:true});
export function attemptService(pool:Pool,authorization:ReservationAdmissionFixture['authorization'],offering:typeof createReservationOfferingParticipant,gateway:PaymentGateway){
  const factory=Object.values(stores)[0]?.createPaymentAttempts;
  expect(factory,'T049/T052 pendientes: iniciación/recuperación de intentos ausente; no es fallo PG/import/configuración').toBeTypeOf('function');
  return factory!(pool,authorization,offering,gateway,{providerScope:'fixture/provider/merchant/sandbox'});
}
export interface ReceiptAdapter {
  authenticate(delivery:unknown):Promise<{providerScope:string;normalizedEvidenceReference:string;merchantReferenceHint:string|null;observation:GatewayObservation}|null>;
}
export interface ReceiptReceiver {receive(delivery:unknown,requestId:string):Promise<{state:'ACCEPTED'|'REJECTED';receiptId?:string}>}
interface ReceiptExports {createPaymentReceiptReceiver?:(pool:Pool,adapter:ReceiptAdapter)=>ReceiptReceiver}
const receipts=import.meta.glob<ReceiptExports>('../../src/modules/enrollment/infrastructure/payment-receipts.ts',{eager:true});
export function receiptReceiver(pool:Pool,adapter:ReceiptAdapter){
  const factory=Object.values(receipts)[0]?.createPaymentReceiptReceiver;
  expect(factory,'T050 pendiente: receptor técnico de recibos ausente; no es fallo PG/import/configuración').toBeTypeOf('function');
  return factory!(pool,adapter);
}
interface PaymentBindings {PAYMENT_GATEWAY?:string|symbol}
const bindings=import.meta.glob<PaymentBindings>('../../src/modules/enrollment/application/payments.ts',{eager:true});
export const gatewayBinding=Object.values(bindings)[0]?.PAYMENT_GATEWAY;
