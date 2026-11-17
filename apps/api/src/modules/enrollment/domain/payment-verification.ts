import type { EnrollmentOrderSnapshot,InstantUs } from '../public/enrollment.js';
import type { AuthenticPaymentEvidence,GatewayObservation } from '../public/payments.js';
import type { EffectiveCommitment } from './compatibility.js';
import type { EnrollmentPlanItem } from './enrollment.js';
import { assertReservationCompatibility } from './compatibility.js';
import { enrollmentPlan } from './enrollment.js';
import { EnrollmentError } from './enrollment-error.js';
import { RESERVATION_DURATION_US } from './instant.js';

export interface PaymentGroupConditions {
  readonly groupId:string;readonly studentVisible:boolean;readonly teacherEligible:boolean;readonly teacherReviewRequired:boolean;
  readonly seatState:'CONFIRMED'|'CONVERTED'|'EXPIRED';readonly capacity:number;readonly reserved:number;readonly occupied:number;
}
export interface PaymentVerificationInput {
  readonly order:EnrollmentOrderSnapshot|null;readonly merchantReference:string|null;readonly providerScope:string;
  /** Evidencia ya autenticada por la entrada técnica, nunca un success del cliente. */
  readonly observation:GatewayObservation;readonly at:InstantUs;readonly groups:readonly PaymentGroupConditions[];
  readonly commitments:readonly (EffectiveCommitment&{readonly orderId:string|null})[];
}
export type PaymentIncidentReason='UNKNOWN_REFERENCE'|'ASSOCIATION_MISMATCH'|'AMOUNT_OR_CURRENCY_MISMATCH'|'ORDER_TERMINAL'|'RESERVATION_EXPIRED'|'OFFERING_UNAVAILABLE'|'SEAT_TERMINAL'|'COURSE_COMMITMENT_EXISTS'|'STUDENT_SCHEDULE_CONFLICT';
export type PaymentVerificationDecision=
  | {readonly state:'UNCONFIRMED'}
  | {readonly state:'INCIDENT';readonly reason:PaymentIncidentReason;readonly evidence:AuthenticPaymentEvidence;readonly affectedGroupIds:readonly string[]}
  | {readonly state:'APPLIED';readonly items:readonly EnrollmentPlanItem[]};

/** Comparación decimal exacta sin Number, redondeo o potencias de escala arbitraria. */
function decimalKey(units:bigint,scale:number):string{
  if(units===0n)return '0';
  const digits=units.toString(),trimmed=digits.replace(/0+$/,'');
  return trimmed+':'+(scale-(digits.length-trimmed.length));
}
function exactTotal(evidence:AuthenticPaymentEvidence,total:bigint):boolean{
  return evidence.currency==='PEN'&&typeof evidence.amountUnits==='bigint'&&evidence.amountUnits>=0n
    &&Number.isSafeInteger(evidence.amountScale)&&evidence.amountScale>=0
    &&decimalKey(evidence.amountUnits,evidence.amountScale)===decimalKey(total,2);
}
function consistentOrder(order:EnrollmentOrderSnapshot):void{
  const courses=new Set<string>(),groups=new Set<string>();let total=0n;
  if(order.expiresAt-order.confirmedAt!==RESERVATION_DURATION_US||order.currency!=='PEN'||!order.items.length)throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
  for(const item of order.items){
    if(courses.has(item.courseId)||groups.has(item.groupId)||typeof item.priceMinor!=='bigint'||item.priceMinor<0n||item.currency!=='PEN'||item.groupStartAt>=item.enrollmentValidUntil)throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
    courses.add(item.courseId);groups.add(item.groupId);total+=item.priceMinor;
  }
  if(total!==order.totalMinor)throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
}
/** Decisión pura de todo el conjunto. No autentica proveedor, captura reloj,
 * persiste efectos, extiende plazas o deduplica hechos económicos. El finalizador
 * aporta hechos bajo locks y el único token después de los contrastes locales. */
/** Contrastes no temporales completos antes de capturar verificationFinishedAt. */
export function assessPaymentEvidence(input:Omit<PaymentVerificationInput,'at'>):Exclude<PaymentVerificationDecision,{state:'APPLIED'}>|{readonly state:'READY'}{
  if(input.observation.state!=='ECONOMIC_FACT')return Object.freeze({state:'UNCONFIRMED'});
  const evidence=input.observation.evidence,order=input.order;
  const associated=Boolean(order&&input.merchantReference&&input.merchantReference===evidence.merchantReference&&input.providerScope===evidence.providerScope);
  const incident=(reason:PaymentIncidentReason):Extract<PaymentVerificationDecision,{state:'INCIDENT'}>=>Object.freeze({state:'INCIDENT',reason,
    evidence:Object.freeze({...evidence}),affectedGroupIds:Object.freeze(associated?Array.from(new Set(order!.items.map(item=>item.groupId))).sort():[])});
  if(!order||!input.merchantReference)return incident('UNKNOWN_REFERENCE');
  if(!associated)return incident('ASSOCIATION_MISMATCH');
  consistentOrder(order);
  if(!exactTotal(evidence,order.totalMinor))return incident('AMOUNT_OR_CURRENCY_MISMATCH');
  return {state:'READY'};
}
export function verifyPayment(input:PaymentVerificationInput):PaymentVerificationDecision{
  const assessment=assessPaymentEvidence(input);
  if(input.order&&input.at<input.order.confirmedAt)throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
  if(assessment.state!=='READY')return assessment;
  const order=input.order!,evidence=input.observation.state==='ECONOMIC_FACT'?input.observation.evidence:null;
  if(!evidence)throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
  const incident=(reason:PaymentIncidentReason):Extract<PaymentVerificationDecision,{state:'INCIDENT'}>=>Object.freeze({state:'INCIDENT',reason,
    evidence:Object.freeze({...evidence}),affectedGroupIds:Object.freeze(Array.from(new Set(order.items.map(item=>item.groupId))).sort())});
  if(order.state!=='RESERVED')return incident('ORDER_TERMINAL');
  if(input.at>=order.expiresAt)return incident('RESERVATION_EXPIRED');
  for(const item of order.items){
    const matches=input.groups.filter(group=>group.groupId===item.groupId);
    if(matches.length>1)throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
    const group=matches[0];
    if(!group||!group.studentVisible||!group.teacherEligible||group.teacherReviewRequired)return incident('OFFERING_UNAVAILABLE');
    if(group.seatState!=='CONFIRMED')return incident('SEAT_TERMINAL');
    if(!Number.isSafeInteger(group.capacity)||group.capacity<1||group.capacity>50||!Number.isSafeInteger(group.reserved)||group.reserved<1||!Number.isSafeInteger(group.occupied)||group.occupied<0||group.reserved+group.occupied>group.capacity)throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
  }
  try{
    // Una matrícula propia de esa orden no se excluye: solo las reservas que
    // esta conversión sustituirá, sin ignorar compromisos ocultos de otras órdenes.
    const others=input.commitments.filter(commitment=>!(commitment.kind==='RESERVATION'&&commitment.orderId===order.id));
    assertReservationCompatibility(order.items,others,input.at);
  }catch(error){
    if(error instanceof EnrollmentError&&(error.code==='COURSE_COMMITMENT_EXISTS'||error.code==='STUDENT_SCHEDULE_CONFLICT'))return incident(error.code);
    throw error;
  }
  return Object.freeze({state:'APPLIED',items:enrollmentPlan(order.items,input.at)});
}
