import type { SessionActor } from '../../authorization/public/session.js';
import { EnrollmentError,enrollmentUuid } from '../domain/enrollment-error.js';
export const ENROLLMENT_FOLLOW_UPS=Symbol('EnrollmentFollowUps');

export interface FollowUpInput {readonly commandId:string;readonly content:string}
export interface FollowUpView {readonly id:string;readonly incidentId:string;readonly adminUserId:string;readonly commandId:string;readonly recordedAt:string;readonly content:string}
export interface FollowUpResult {
  readonly resource:FollowUpView;
  readonly command:{readonly id:string;readonly replayed:boolean;readonly outcomeCode:'APPLIED';readonly resultingRevision:string;readonly appliedAt:string};
}
/** La implementación reautoriza y confirma nota, ledger y auditoría juntos. */
export interface EnrollmentFollowUpStore {append(actor:SessionActor,incidentId:string,input:FollowUpInput,requestId:string):Promise<FollowUpResult>}
export function followUpInput(value:FollowUpInput):FollowUpInput {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['commandId','content'].includes(key)))throw new EnrollmentError({code:'VALIDATION_ERROR'});
  const commandId=enrollmentUuid(value.commandId);
  if(typeof value.content!=='string'||!value.content.trim())throw new EnrollmentError({code:'VALIDATION_ERROR',fields:['content']});
  // Se conserva el texto: el digest del ledger distingue contenidos diferentes.
  return {commandId,content:value.content};
}
export class EnrollmentFollowUps {
  constructor(private readonly store:EnrollmentFollowUpStore){}
  async append(actor:SessionActor,incidentId:string,input:FollowUpInput,requestId:string):Promise<FollowUpResult>{
    return this.store.append(actor,enrollmentUuid(incidentId),followUpInput(input),enrollmentUuid(requestId));
  }
}
