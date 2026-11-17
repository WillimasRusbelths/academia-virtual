import type { GatewayObservation } from '../public/payments.js';
import type { TemporalDecision } from './ports.js';
import type { PaymentVerificationInput,PaymentVerificationDecision } from '../domain/payment-verification.js';
import { verifyPayment,assessPaymentEvidence } from '../domain/payment-verification.js';
import { EnrollmentError } from '../domain/enrollment-error.js';

export interface PaymentFinalization {
  readonly receiptId:string;readonly observation:GatewayObservation;readonly requestId:string;
}
export interface PaymentFinalizationResult {
  readonly state:'APPLIED'|'INCIDENT'|'UNCONFIRMED'|'INTEGRITY_CONFLICT';
  readonly paymentId?:string;readonly verificationFinishedAt?:string;
}
/** Capacidad técnica interna; nunca acepta un éxito procedente del navegador. */
export interface PaymentVerification {
  finalize(input:PaymentFinalization):Promise<PaymentFinalizationResult>;
}
export function finalPaymentDecision(facts:Omit<PaymentVerificationInput,'at'>,decision:TemporalDecision):PaymentVerificationDecision{
  return verifyPayment({...facts,at:decision.at});
}
export function prepareFinalPaymentDecision(facts:Omit<PaymentVerificationInput,'at'>):(decision:TemporalDecision,groups:PaymentVerificationInput['groups'])=>PaymentVerificationDecision{
  const assessment=assessPaymentEvidence(facts);
  return (decision,groups)=>{
    if(facts.order&&decision.at<facts.order.confirmedAt)throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
    return assessment.state==='READY'?finalPaymentDecision({...facts,groups},decision):assessment;
  };
}
