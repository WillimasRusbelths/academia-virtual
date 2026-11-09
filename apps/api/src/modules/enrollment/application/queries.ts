import type { SessionActor } from '../../authorization/public/session.js';
import type { OriginalOrderItem, OrderState } from '../public/enrollment.js';
export const ENROLLMENT_QUERIES=Symbol('ENROLLMENT_QUERIES');

export interface EnrollmentPage {readonly page:number;readonly pageSize:number}
export interface OfferingPage extends EnrollmentPage {readonly q?:string}
export interface PageResult<T> extends EnrollmentPage {readonly items:readonly T[];readonly total:number}
export interface InventoryItem {
  readonly groupId:string;readonly courseId:string;readonly courseName:string;readonly groupName:string;
  readonly teacherName:string|null;readonly periodStart:string|null;readonly periodEnd:string|null;
  readonly timeZone:'America/Lima';readonly schedule:OriginalOrderItem['schedule'];
  readonly capacity:number;readonly reserved:number;readonly occupied:number;readonly available:number;
  readonly priceMinor:string|null;readonly currency:'PEN';
}
export interface InventoryResult {readonly items:readonly InventoryItem[];readonly evaluatedAt:string;readonly totalMinor?:string}
export interface OrderItemView extends Omit<OriginalOrderItem,'priceMinor'|'groupStartAt'|'enrollmentValidUntil'> {
  readonly priceMinor:string;readonly groupStartAt:string;readonly enrollmentValidUntil:string;
}
export interface OrderView {
  readonly id:string;readonly revision:string;readonly state:OrderState;readonly totalMinor:string;readonly currency:'PEN';
  readonly confirmedAt:string;readonly expiresAt:string;readonly serverNow:string;readonly items:readonly OrderItemView[];
  readonly paymentAllowed:boolean;readonly paymentMessage:string|null;
  readonly paymentState:'NOT_PAID'|'PENDING'|'APPLIED'|'INCIDENT';readonly incidentSummary:string|null;
}
export interface EnrollmentView {
  readonly id:string;readonly orderId:string;readonly courseId:string;readonly groupId:string;
  readonly courseName:string;readonly groupName:string;readonly state:'ENROLLED'|'HISTORICAL';
  readonly periodStart:string;readonly periodEnd:string;readonly timeZone:'America/Lima';
  readonly schedule:OriginalOrderItem['schedule'];readonly confirmedAt:string;readonly validUntil:string;
}
export type RequestView={readonly id:string;readonly intentionId:string;readonly admittedAt:string}&(
  {readonly state:'ADMITTED'}|{readonly state:'CONFIRMED';readonly orderId:string}|{readonly state:'REJECTED';readonly decisionCode:string});
/** Puertos de lectura propios; ninguna entrada acepta titular, dinero o reloj. */
export interface EnrollmentQueries {
  offerings(actor:SessionActor,input:OfferingPage):Promise<InventoryResult&PageResult<InventoryItem>>;
  preview(actor:SessionActor,groupIds:readonly string[]):Promise<InventoryResult>;
  request(actor:SessionActor,intentionId:string):Promise<RequestView|null>;
  requests(actor:SessionActor,input:EnrollmentPage):Promise<PageResult<RequestView>>;
  order(actor:SessionActor,id:string):Promise<OrderView|null>;
  orders(actor:SessionActor,input:EnrollmentPage):Promise<PageResult<OrderView>>;
  currentOrder(actor:SessionActor):Promise<OrderView|null>;
  enrollments(actor:SessionActor,input:EnrollmentPage):Promise<PageResult<EnrollmentView>>;
  enrollment(actor:SessionActor,id:string):Promise<EnrollmentView|null>;
}
