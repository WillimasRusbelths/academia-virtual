import type { EnrollmentOrderSnapshot, InstantUs, OriginalOrderItem } from '../public/enrollment.js';
import { EnrollmentError, enrollmentUuid } from './enrollment-error.js';
import { reservationExpiresAt } from './instant.js';

export interface ReservedOrderInput {
  readonly id:string;readonly studentId:string;readonly confirmedAt:InstantUs;readonly items:readonly OriginalOrderItem[];
}
/** Congela condiciones originales; cero explícito sigue siendo una reserva. */
export function createReservedOrder(input:ReservedOrderInput):EnrollmentOrderSnapshot {
  const id=enrollmentUuid(input.id),studentId=enrollmentUuid(input.studentId);
  if(!input.items.length||typeof input.confirmedAt!=='bigint')throw new EnrollmentError({code:'VALIDATION_ERROR'});
  const courses=new Set<string>();let totalMinor=0n;
  const items=input.items.map(item=>{
    const courseId=enrollmentUuid(item.courseId),groupId=enrollmentUuid(item.groupId);
    if(courses.has(courseId)||typeof item.priceMinor!=='bigint'||item.priceMinor<0n||item.currency!=='PEN'||input.confirmedAt>=item.groupStartAt||item.groupStartAt>=item.enrollmentValidUntil)throw new EnrollmentError({code:'VALIDATION_ERROR'});
    courses.add(courseId);totalMinor+=item.priceMinor;
    return Object.freeze({...item,courseId,groupId,schedule:Object.freeze(item.schedule.map(slot=>Object.freeze({...slot})))});
  });
  if(totalMinor>9223372036854775807n)throw new EnrollmentError({code:'VALIDATION_ERROR'});
  return Object.freeze({id,studentId,revision:'1',state:'RESERVED',confirmedAt:input.confirmedAt,expiresAt:reservationExpiresAt(input.confirmedAt),currency:'PEN',totalMinor,items:Object.freeze(items)});
}
