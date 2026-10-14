import type { Role, AccountStatus } from '../../users/public/account.js';

export type AccessChange={kind:'role';role:Role}|{kind:'status';status:AccountStatus};
export interface ManagedAccount {id:string;role:Role;status:AccountStatus}
export class AdminInvariant extends Error {
  readonly code='ADMIN_INVARIANT';
  constructor(){super('El cambio vulnera una condición administrativa.');}
}

/** Decide una transición, sin IO ni alteraciones de credenciales o estados revocados. */
export function decideAccessChange(actorId:string,target:ManagedAccount,change:AccessChange,activeAdmins:number) {
  const role=change.kind==='role'?change.role:target.role;
  const status=change.kind==='status'?change.status:target.status;
  const changed=role!==target.role||status!==target.status;
  if(changed&&actorId===target.id&&(change.kind==='role'||status==='DISABLED'))throw new AdminInvariant();
  if(target.role==='ADMIN'&&target.status==='ACTIVE'&&(role!=='ADMIN'||status!=='ACTIVE')&&activeAdmins<=1)throw new AdminInvariant();
  return {role,status,changed,revokeSessions:changed&&(change.kind==='role'||status==='DISABLED'),
    revokeActions:changed&&status==='DISABLED'&&change.kind==='status'};
}
