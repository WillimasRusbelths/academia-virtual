import type { EffectiveSchedule } from '../../academic-offering/public/schedule.js';
import type { InstantUs, OriginalOrderItem, OriginalPeriodBounds } from '../public/enrollment.js';
import type { PenPrice } from './money.js';
import type { EffectiveCommitment } from './compatibility.js';
import { EnrollmentError, reservationGroupIds } from './enrollment-error.js';
import { assertReservationCompatibility } from './compatibility.js';

export interface ReservableGroup extends EffectiveSchedule,OriginalPeriodBounds {
  readonly courseId:string;readonly groupId:string;readonly courseName:string;readonly groupName:string;
  readonly studentVisible:boolean;readonly teacherEligible:boolean;readonly teacherReviewRequired:boolean;
  readonly capacity:number|null;readonly reserved:number;readonly enrolled:number;readonly price:PenPrice|null;
}
export interface ReservationInput {
  readonly groupIds:readonly string[];readonly groups:readonly ReservableGroup[];
  readonly commitments:readonly EffectiveCommitment[];readonly at:InstantUs;
  readonly activeOrder:{readonly state:'RESERVED'|'ENROLLED'|'EXPIRED';readonly expiresAt:InstantUs}|null;
}
export interface ReservationPlan {readonly items:readonly OriginalOrderItem[];readonly totalMinor:bigint;readonly currency:'PEN'}
/** Decisión pura sobre el conjunto completo y un único instante del coordinador. */
export function prepareReservation(input:ReservationInput):ReservationPlan {
  const ids=reservationGroupIds(input.groupIds),courses=new Set<string>();
  if(input.activeOrder?.state==='RESERVED'&&input.at<input.activeOrder.expiresAt)throw new EnrollmentError({code:'ACTIVE_ORDER_EXISTS'});
  const groups=ids.map(id=>{
    const matches=input.groups.filter(g=>g.groupId.toLowerCase()===id);
    if(matches.length!==1)throw new EnrollmentError({code:'OFFERING_NOT_RESERVABLE'});
    const group=matches[0],course=group.courseId.toLowerCase();
    if(courses.has(course))throw new EnrollmentError({code:'VALIDATION_ERROR'});courses.add(course);
    if(!group.studentVisible||!group.teacherEligible||group.teacherReviewRequired||group.price===null||group.price.currency!=='PEN'||!Number.isInteger(group.capacity)||group.capacity!<1||group.capacity!>50||input.at>=group.groupStartAt)throw new EnrollmentError({code:'OFFERING_NOT_RESERVABLE'});
    if(!Number.isInteger(group.reserved)||!Number.isInteger(group.enrolled)||group.reserved<0||group.enrolled<0||group.reserved+group.enrolled>group.capacity!)throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
    if(group.reserved+group.enrolled===group.capacity)throw new EnrollmentError({code:'CAPACITY_UNAVAILABLE'});
    return group;
  });
  assertReservationCompatibility(groups,input.commitments,input.at);
  let totalMinor=0n;
  const items=groups.map(g=>{
    if(typeof g.price!.amountMinor!=='bigint'||g.price!.amountMinor<0n)throw new EnrollmentError({code:'VALIDATION_ERROR'});
    totalMinor+=g.price!.amountMinor;
    return Object.freeze({courseId:g.courseId.toLowerCase(),groupId:g.groupId.toLowerCase(),courseName:g.courseName,groupName:g.groupName,priceMinor:g.price!.amountMinor,currency:'PEN' as const,
      periodStart:g.periodStart,periodEnd:g.periodEnd,timeZone:g.timeZone,groupStartAt:g.groupStartAt,enrollmentValidUntil:g.enrollmentValidUntil,schedule:Object.freeze(g.schedule.map(slot=>Object.freeze({...slot})))});
  });
  if(totalMinor>9223372036854775807n)throw new EnrollmentError({code:'VALIDATION_ERROR'});
  return Object.freeze({items:Object.freeze(items),totalMinor,currency:'PEN'});
}
