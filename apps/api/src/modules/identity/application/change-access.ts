import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import { requireRole, requireStatus, isAccountId } from '../../users/public/account.js';
import type { UserView } from '../../users/public/account.js';
import type { AccessChange } from '../domain/account-administration.js';

export const CHANGE_ACCESS=Symbol('ChangeAccess');
export interface AccessChangeStore {
  change(actor:SessionActor,input:{id:string;change:AccessChange;requestId:string}):Promise<UserView>;
}
export class AccessTargetMissing extends Error {
  readonly code='NOT_FOUND';
  constructor(){super('Cuenta no encontrada.');}
}
export class AccessCommandInvalid extends Error {
  readonly code='VALIDATION_ERROR';
  constructor(){super('Comando inválido. Valores omitidos.');}
}
export class AccessChangeUnavailable extends Error {
  readonly code='TEMPORARILY_UNAVAILABLE';
  constructor(){super('El cambio no pudo confirmarse. Detalles omitidos.');}
}
export class ChangeAccess {
  constructor(private readonly store:AccessChangeStore){}
  execute(actor:SessionActor,input:{id:string;kind:'role'|'status';value:unknown;requestId:string}) {
    if(!permits(actor.role,'users:manage'))throw new AuthorizationFailure('FORBIDDEN');
    if(!isAccountId(input.id))throw new AccessCommandInvalid();
    const change:AccessChange=input.kind==='role'?{kind:'role',role:requireRole(input.value)}:{kind:'status',status:requireStatus(input.value)};
    return this.store.change(actor,{id:input.id,change,requestId:input.requestId});
  }
}
