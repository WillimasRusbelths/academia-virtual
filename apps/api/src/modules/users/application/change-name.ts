import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import { normalizeName } from '../public/account.js';
import type { UserView } from '../public/account.js';
import { requireUserId } from './list-users.js';

export const CHANGE_NAME=Symbol('ChangeName');
export interface NameStore {
  change(actor:SessionActor,input:{id:string;name:string;requestId:string}):Promise<UserView>;
}
export class ChangeName {
  constructor(private readonly store:NameStore){}
  execute(actor:SessionActor,input:{id:string;name:unknown;requestId:string}):Promise<UserView> {
    if(!permits(actor.role,'users:manage'))throw new AuthorizationFailure('FORBIDDEN');
    return this.store.change(actor,{...input,id:requireUserId(input.id),name:normalizeName(input.name)});
  }
}
