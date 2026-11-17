export { EnrollmentError } from '../public/errors.js';
import { EnrollmentError } from '../public/errors.js';

export function enrollmentUuid(value:unknown):string {
  if(typeof value!=='string'||value.length!==36||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new EnrollmentError({code:'VALIDATION_ERROR'});
  return value.toLowerCase();
}
export function reservationGroupIds(value:unknown):readonly string[] {
  if(!Array.isArray(value)||value.length===0)throw new EnrollmentError({code:'VALIDATION_ERROR'});
  const ids=Array.from(value,enrollmentUuid).sort();
  if(new Set(ids).size!==ids.length)throw new EnrollmentError({code:'VALIDATION_ERROR'});
  return Object.freeze(ids);
}
