import { canVerifyEmail } from '../domain/action-link.js';
import type { AccountAccess,ActionAccess } from '../domain/access.js';
import type { AccessSecrets } from './credentials.js';

export const VERIFY_EMAIL=Symbol('VerifyEmail');
export type VerificationRule=(account:AccountAccess,token:ActionAccess,now:Date)=>boolean;
export interface VerificationStore {consume(digest:Uint8Array,accepts:VerificationRule):Promise<boolean>}
export class InvalidActionLink extends Error {
  readonly code='INVALID_ACTION_LINK';
  constructor(){super('El enlace no permite completar la operación.');}
}
export class VerifyEmail {
  constructor(private readonly store:VerificationStore,private readonly secrets:AccessSecrets){}
  async execute(input:{token:unknown}):Promise<void> {
    const digest=typeof input.token==='string'?this.secrets.digest(input.token):null;
    if(!digest)throw new InvalidActionLink();
    const consumed=await this.store.consume(digest,canVerifyEmail);
    if(!consumed)throw new InvalidActionLink();
  }
}
