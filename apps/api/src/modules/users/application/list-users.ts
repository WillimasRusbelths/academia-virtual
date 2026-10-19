import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import { requireRole, requireStatus, isAccountId } from '../public/account.js';
import type { Role, AccountStatus, UserView } from '../public/account.js';

export const LIST_USERS=Symbol('ListUsers');
export interface UserListFilter { q?:string;role?:Role;status?:AccountStatus;page:number;pageSize:number }
export interface UserList { items:UserView[];page:number;pageSize:number;total:number }
export interface AdministrativeUserQueries {
  list(actor:SessionActor,filter:UserListFilter):Promise<UserList>;
  get(actor:SessionActor,id:string):Promise<UserView|null>;
}
export class UserQueryInvalid extends Error {
  readonly code='VALIDATION_ERROR';
  constructor(){super('Consulta inválida. Valores omitidos.');}
}
export class UserNotFound extends Error {
  readonly code='NOT_FOUND';
  constructor(){super('Cuenta no encontrada.');}
}
export function requireUserId(id:string):string {
  if(!isAccountId(id))throw new UserQueryInvalid();
  return id;
}
export class ListUsers {
  constructor(private readonly queries:AdministrativeUserQueries){}
  execute(actor:SessionActor,filter:UserListFilter):Promise<UserList> {
    if(!permits(actor.role,'users:manage'))throw new AuthorizationFailure('FORBIDDEN');
    if(!Number.isSafeInteger(filter.page)||filter.page<1||!Number.isSafeInteger(filter.pageSize)||filter.pageSize<1||filter.pageSize>50
      ||filter.q!==undefined&&(typeof filter.q!=='string'||Array.from(filter.q).length>254||filter.q.includes('\0')))throw new UserQueryInvalid();
    if(filter.role!==undefined)requireRole(filter.role);if(filter.status!==undefined)requireStatus(filter.status);
    return this.queries.list(actor,filter);
  }
}
