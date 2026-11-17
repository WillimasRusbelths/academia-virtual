/// <reference types="vite/client" />
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
export interface FollowUpInput {readonly commandId:string;readonly content:string}
export interface FollowUpStore {append(actor:SessionActor,incidentId:string,input:FollowUpInput,requestId:string):Promise<unknown>}
export interface FollowUps {append(actor:SessionActor,incidentId:string,input:FollowUpInput,requestId:string):Promise<unknown>}
interface Exports {EnrollmentFollowUps?:new(store:FollowUpStore)=>FollowUps}
const modules=import.meta.glob<Exports>('../../src/modules/enrollment/application/follow-up.ts',{eager:true});
/** Puerto privado de conformidad: el ausente falla por operación, no al cargar.
 * No implementa validación, autorización, escritura ni un resultado satisfactorio. */
export function followUps(store:FollowUpStore):FollowUps {
  const Constructor=Object.values(modules)[0]?.EnrollmentFollowUps;
  if(!Constructor)throw new Error('T074 pendiente: operación de seguimiento no implementada.');
  return new Constructor(store);
}
