import type { TemporalDecision } from './ports.js';
import type { PaymentVerificationInput,PaymentVerificationDecision } from '../domain/payment-verification.js';
import { verifyPayment } from '../domain/payment-verification.js';
import type { SessionActor } from '../../authorization/public/session.js';
import type { GatewayAttempt,GatewayInitiation,GatewayObservation,PaymentGateway } from '../public/payments.js';
import { EnrollmentError } from '../domain/enrollment-error.js';

export const PAYMENT_GATEWAY='ENROLLMENT_PAYMENT_GATEWAY';
export const PAYMENT_CONFIGURATION='ENROLLMENT_PAYMENT_CONFIGURATION';
export const PAYMENT_ATTEMPTS='ENROLLMENT_PAYMENT_ATTEMPTS';

/** Aplicabilidad local con el token ya capturado por el coordinador. Esta función
 * no inicia cobros ni confirma filas; la finalización atómica pertenece a T051. */
export function decidePayment(facts:Omit<PaymentVerificationInput,'at'>,decision:TemporalDecision):PaymentVerificationDecision{
  return verifyPayment({...facts,at:decision.at});
}

export type PaymentAttemptState='SUBMITTING'|'PENDING'|'INITIATION_UNKNOWN'|'FAILED_NO_CHARGE'|'APPLIED'|'INCIDENT';
export interface PaymentAttemptView {readonly id:string;readonly state:PaymentAttemptState}
export interface PaymentInitiationInput {readonly orderId:string;readonly initiationId:string}
export interface PreparedPaymentAttempt {readonly view:PaymentAttemptView;readonly external:GatewayAttempt;readonly dispatch:boolean}
export interface PaymentAttemptStore {
  prepare(actor:SessionActor,input:PaymentInitiationInput,requestId:string):Promise<PreparedPaymentAttempt>;
  authorizeDispatch(actor:SessionActor,input:PaymentInitiationInput,attemptId:string,requestId:string):Promise<PreparedPaymentAttempt>;
  technical(attemptId:string,requestId:string):Promise<PreparedPaymentAttempt>;
  settle(attemptId:string,result:GatewayInitiation,requestId:string):Promise<PaymentAttemptView>;
  recordObservation(observation:GatewayObservation,requestId:string):Promise<void>;
}
export interface PaymentAttempts {
  initiate(actor:SessionActor,input:PaymentInitiationInput,requestId:string):Promise<PaymentAttemptView>;
  recover(input:{readonly attemptId:string;readonly requestId:string}):Promise<PaymentAttemptView>;
}
export interface PaymentAttemptConfiguration {readonly providerScope:string}
const terminal=(state:PaymentAttemptState)=>['APPLIED','INCIDENT','FAILED_NO_CHARGE'].includes(state);

/** Red solo después de confirmar la preparación y liberar su unidad de trabajo.
 * El permiso de envío es efímero y solo vuelve al creador del intento: ni replay,
 * otra initiationId, reinicio o vencimiento de un lease vuelven a despacharlo. */
export class Payments implements PaymentAttempts {
  constructor(private readonly store:PaymentAttemptStore,private readonly gateway:PaymentGateway){}
  async initiate(actor:SessionActor,input:PaymentInitiationInput,requestId:string):Promise<PaymentAttemptView>{
    const prepared=await this.store.prepare(actor,input,requestId);
    if(!prepared.dispatch)return prepared.view;
    // Recheck posterior a posibles demoras del COMMIT, antes del envío evitable.
    const current=await this.store.authorizeDispatch(actor,input,prepared.view.id,requestId);
    if(!current.dispatch)return current.view;
    let result:GatewayInitiation;
    try{
      const received=await this.gateway.initiate(current.external);
      result=received?.state==='PENDING'&&typeof received.providerReference==='string'&&received.providerReference.trim()
        ?{state:'PENDING',providerReference:received.providerReference}
        :received?.state==='FAILED_NO_CHARGE'?{state:'FAILED_NO_CHARGE'}:{state:'INITIATION_UNKNOWN'};
    }catch{result={state:'INITIATION_UNKNOWN'};}
    return this.store.settle(current.view.id,result,requestId);
  }
  /** Consulta técnica puntual de la misma operación, sin nueva iniciación.
   * El barrido/reintento acotado y el finalizador se integran en T051/T052. */
  async recover(input:{readonly attemptId:string;readonly requestId:string}):Promise<PaymentAttemptView>{
    const prepared=await this.store.technical(input.attemptId,input.requestId);
    if(terminal(prepared.view.state))return prepared.view;
    let observation:GatewayObservation;
    try{observation=await this.gateway.recover(prepared.external);}catch{observation={state:'UNRESOLVED'};}
    if(!observation)throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
    if(observation.state==='ECONOMIC_FACT'){
      await this.store.recordObservation(observation,input.requestId);
      return (await this.store.technical(input.attemptId,input.requestId)).view;
    }
    if(observation.state==='FAILED_NO_CHARGE')return this.store.settle(input.attemptId,{state:'FAILED_NO_CHARGE'},input.requestId);
    if(observation.state!=='UNRESOLVED')throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
    return this.store.settle(input.attemptId,{state:'INITIATION_UNKNOWN'},input.requestId);
  }
}
