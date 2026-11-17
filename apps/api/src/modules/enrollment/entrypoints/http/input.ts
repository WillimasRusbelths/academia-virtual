import type { SessionActor } from '../../../authorization/public/session.js';
import type { HttpRequest } from '../../../../http/error.filter.js';
import { strictDto } from '../../../../http/transport.js';
import { EnrollmentError } from '../../public/errors.js';
import type { OfferingPage } from '../../application/queries.js';

export interface EnrollmentRequest extends Omit<HttpRequest,'actor'> {actor:SessionActor;body?:unknown}
export const uuid=(value:unknown):value is string=>typeof value==='string'&&value.length===36&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function id(value:string):string {if(!uuid(value))throw new EnrollmentError({code:'VALIDATION_ERROR'});return value.toLowerCase();}
export const groupIds=(value:unknown):value is string[]=>Array.isArray(value)&&value.length>0&&value.every(uuid)&&new Set(value.map(v=>v.toLowerCase())).size===value.length;
export function read(request:EnrollmentRequest){if(request.body!==undefined)throw new EnrollmentError({code:'VALIDATION_ERROR'});}
export function found<T>(value:T|null):T {if(value===null)throw new EnrollmentError({code:'NOT_FOUND'});return value;}
export function page(input:unknown,search=false):OfferingPage {
  const positive=(v:unknown)=>typeof v==='string'&&/^[1-9]\d*$/.test(v)&&Number.isSafeInteger(Number(v));
  const optional=(valid:(v:unknown)=>boolean)=>(v:unknown)=>v===undefined||valid(v);
  const values=strictDto(input,{page:optional(positive),pageSize:optional(v=>positive(v)&&Number(v)<=50),...(search?{q:optional(v=>typeof v==='string')}:{})});
  const result={page:values.page===undefined?1:Number(values.page),pageSize:values.pageSize===undefined?20:Number(values.pageSize),
    ...(values.q===undefined?{}:{q:(values.q as string).trim()})};
  if(!Number.isSafeInteger((result.page-1)*result.pageSize))throw new EnrollmentError({code:'VALIDATION_ERROR'});
  return result;
}
