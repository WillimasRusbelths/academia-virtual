import type { SessionActor } from '../../authorization/public/session.js';
import { EnrollmentError } from '../public/errors.js';
import { parsePenMinor } from '../domain/money.js';
import { formatInstant } from '../domain/instant.js';
import type { EnrollmentCommandResult } from './ports.js';

export const ENROLLMENT_PRICES = Symbol('EnrollmentPrices');
export type CoursePrice = { readonly courseId:string; readonly defined:false; readonly amountMinor:null; readonly currency:null; readonly revision:null }
  | { readonly courseId:string; readonly defined:true; readonly amountMinor:string; readonly currency:'PEN'; readonly revision:string };
export interface SetCoursePrice {
  readonly commandId:string; readonly expectedRevision:string|null; readonly amountMinor:string; readonly currency:'PEN';
}
/** Una operación completa; infraestructura conserva locks, autoridad y atomicidad. */
export interface EnrollmentPriceStore {
  read(actor:SessionActor,courseId:string):Promise<CoursePrice>;
  set(actor:SessionActor,courseId:string,input:SetCoursePrice,requestId:string):Promise<EnrollmentCommandResult<CoursePrice>>;
}
function uuid(value:unknown):value is string {return typeof value==='string'&&value.length===36&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);}
export function validPriceRevision(value:unknown):value is string|null {
  return value===null || typeof value==='string'&&value.trim()===value&&/^[1-9]\d{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n;
}
export function validPriceAmount(value:unknown):value is string {
  try{return typeof value==='string'&&value.length<=19&&parsePenMinor(value)<=9223372036854775807n;}catch{return false;}
}
export class EnrollmentPrices {
  constructor(private readonly store:EnrollmentPriceStore){}
  read(actor:SessionActor,courseId:string){
    if(!uuid(courseId))throw new EnrollmentError({code:'VALIDATION_ERROR'});
    return this.store.read(actor,courseId.toLowerCase());
  }
  async set(actor:SessionActor,courseId:string,input:SetCoursePrice,requestId:string){
    if(!uuid(courseId)||!uuid(requestId))throw new EnrollmentError({code:'VALIDATION_ERROR'});
    const fields:('commandId'|'expectedRevision'|'amountMinor'|'currency')[]=[];
    if(!uuid(input.commandId))fields.push('commandId');
    if(!validPriceRevision(input.expectedRevision))fields.push('expectedRevision');
    if(!validPriceAmount(input.amountMinor))fields.push('amountMinor');
    if(input.currency!=='PEN')fields.push('currency');
    if(fields.length)throw new EnrollmentError({code:'VALIDATION_ERROR',fields});
    const result=await this.store.set(actor,courseId.toLowerCase(),{commandId:input.commandId.toLowerCase(),expectedRevision:input.expectedRevision,amountMinor:input.amountMinor,currency:'PEN'},requestId.toLowerCase());
    return {resource:result.resource,command:{id:result.command.id,replayed:result.command.replayed,outcomeCode:result.command.outcomeCode,
      resultingRevision:result.command.resultingRevision,appliedAt:formatInstant(result.command.appliedAt)}};
  }
}
