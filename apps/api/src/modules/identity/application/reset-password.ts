import { validatePassword } from '../../users/public/account.js';
import { canConsumeAction } from '../domain/access.js';
import type { AccountAccess,ActionAccess } from '../domain/access.js';
import { hashNewPassword } from './credentials.js';
import type { AccessSecrets,PasswordCredentials } from './credentials.js';
import { InvalidActionLink } from './verify-email.js';

export const RESET_PASSWORD=Symbol('ResetPassword');
export type PasswordResetRule=(account:AccountAccess,token:ActionAccess,now:Date)=>boolean;
export interface PasswordResetStore {
  consume(digest:Uint8Array,newHash:string,accepts:PasswordResetRule):Promise<boolean>;
}
export class ResetPassword {
  constructor(private readonly store:PasswordResetStore,private readonly credentials:PasswordCredentials,
    private readonly secrets:AccessSecrets){}
  async execute(input:{token:unknown;newPassword:unknown}):Promise<void> {
    const password=validatePassword(input.newPassword);
    const digest=typeof input.token==='string'?this.secrets.digest(input.token):null;
    if(!digest)throw new InvalidActionLink();
    // El adaptador no recibe texto claro; no se mantiene un lock durante Argon2.
    const hash=await hashNewPassword(password,this.credentials);
    const consumed=await this.store.consume(digest,hash,
      (account,token,now)=>canConsumeAction(account,token,'RESET_PASSWORD',now));
    if(!consumed)throw new InvalidActionLink();
  }
}
