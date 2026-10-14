import type { Role, AccountStatus } from '../domain/account.js';

export interface UserView {
  readonly id:string;readonly name:string;readonly email:string;readonly role:Role;readonly status:AccountStatus;
  readonly emailVerified:boolean;readonly mustSetPassword:boolean;readonly createdAt:string;
}
export interface UserViewSource {
  id:string;name:string;email:string;role:Role;status:AccountStatus;
  emailVerifiedAt:Date|null;mustSetPassword:boolean;createdAt:Date;
}
/** Proyección explícita; nunca serializa una entidad o fila completa. */
export function userView(source:UserViewSource):UserView {
  return Object.freeze({id:source.id,name:source.name,email:source.email,role:source.role,status:source.status,
    emailVerified:source.emailVerifiedAt!==null,mustSetPassword:source.mustSetPassword,createdAt:source.createdAt.toISOString()});
}
