import type { EffectiveSchedule } from '../../academic-offering/public/schedule.js';
import type { InstantUs } from '../public/enrollment.js';
import { EnrollmentError } from './enrollment-error.js';
import { effectiveSchedulesOverlap } from '../../academic-offering/public/schedule.js';
import { containsInstant } from './instant.js';

export interface SelectedSchedule extends EffectiveSchedule {readonly courseId:string;readonly groupId:string}
export interface EffectiveCommitment extends SelectedSchedule {
  readonly kind:'RESERVATION'|'ENROLLMENT';readonly state:'CONFIRMED'|'CONVERTED'|'EXPIRED'|'ENROLLED';
  readonly confirmedAt:InstantUs;readonly validUntil:InstantUs;readonly studentVisible:boolean;
}
/** Condiciones originales y vigencia efectiva; ocultamiento no extingue un compromiso. */
export function assertReservationCompatibility(selected:readonly SelectedSchedule[],commitments:readonly EffectiveCommitment[],at:InstantUs):void {
  const active=commitments.filter(c=>(c.kind==='RESERVATION'?c.state==='CONFIRMED':c.state==='ENROLLED')&&containsInstant(c.confirmedAt,c.validUntil,at));
  for(let i=0;i<selected.length;i++){
    const current=selected[i];
    for(const prior of active){
      if(current.courseId===prior.courseId)throw new EnrollmentError({code:'COURSE_COMMITMENT_EXISTS'});
      if(effectiveSchedulesOverlap(current,prior))throw new EnrollmentError({code:'STUDENT_SCHEDULE_CONFLICT'});
    }
    for(const other of selected.slice(i+1))if(effectiveSchedulesOverlap(current,other))throw new EnrollmentError({code:'STUDENT_SCHEDULE_CONFLICT'});
  }
}
