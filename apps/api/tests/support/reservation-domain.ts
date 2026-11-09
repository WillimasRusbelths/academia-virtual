import type { ReservableGroup, ReservationInput } from '../../src/modules/enrollment/domain/reservation.js';
import type { EffectiveCommitment } from '../../src/modules/enrollment/domain/compatibility.js';
import type { OriginalOrderItem } from '../../src/modules/enrollment/public/enrollment.js';
import { parseInstant } from '../../src/modules/enrollment/domain/instant.js';

/** Datos estáticos ficticios; no computa decisiones, importes, disponibilidad o D06. */
export const ref=(n:number)=>`00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
export const at=parseInstant('2030-01-01T00:00:00.123456Z');
export function group(changes:Partial<ReservableGroup>={}):ReservableGroup {
  return {courseId:ref(1),groupId:ref(10),courseName:'Curso original',groupName:'Grupo original',
    studentVisible:true,teacherEligible:true,teacherReviewRequired:false,capacity:2,reserved:0,enrolled:0,price:{amountMinor:12500n,currency:'PEN'},
    periodStart:'2030-01-07',periodEnd:'2030-01-31',timeZone:'America/Lima',schedule:[{dayOfWeek:1,startTime:'18:00',endTime:'19:00'}],
    groupStartAt:parseInstant('2030-01-07T05:00:00.000000Z'),enrollmentValidUntil:parseInstant('2030-02-01T05:00:00.000000Z'),...changes};
}
export function input(changes:Partial<ReservationInput>={}):ReservationInput {
  return {groupIds:[ref(10)],groups:[group()],commitments:[],activeOrder:null,at,...changes};
}
export function commitment(changes:Partial<EffectiveCommitment>={}):EffectiveCommitment {
  return {courseId:ref(2),groupId:ref(20),kind:'RESERVATION',state:'CONFIRMED',confirmedAt:at-1000000n,validUntil:at+1000000n,studentVisible:false,
    periodStart:'2030-01-07',periodEnd:'2030-01-31',timeZone:'America/Lima',schedule:[{dayOfWeek:1,startTime:'18:00',endTime:'19:00'}],...changes};
}
export function item(changes:Partial<OriginalOrderItem>={}):OriginalOrderItem {
  return {courseId:ref(1),groupId:ref(10),courseName:'Curso original',groupName:'Grupo original',priceMinor:12500n,currency:'PEN',
    periodStart:'2030-01-07',periodEnd:'2030-01-31',timeZone:'America/Lima',schedule:[{dayOfWeek:1,startTime:'18:00',endTime:'19:00'}],
    groupStartAt:parseInstant('2030-01-07T05:00:00.000000Z'),enrollmentValidUntil:parseInstant('2030-02-01T05:00:00.000000Z'),...changes};
}
