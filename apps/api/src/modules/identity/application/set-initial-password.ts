import { normalizeEmail,validatePassword } from '../../users/public/account.js';
import type { AccountAccess } from '../domain/access.js';
import { hashNewPassword,verifyProvisionalCredential } from './credentials.js';
import type { PasswordCredentials } from './credentials.js';
import { InvalidCredentials,LoginLimited,LoginUnavailable } from './login.js';
import type { LoginLimits } from './login.js';

export const SET_INITIAL_PASSWORD=Symbol('SetInitialPassword');
export interface InitialPasswordCandidate {readonly id:string;readonly account:AccountAccess}
export interface InitialPasswordStore {
  find(emailCanonical:string):Promise<{candidate:InitialPasswordCandidate|null;now:Date}>;
  replace(verified:InitialPasswordCandidate,newHash:string):Promise<boolean>;
}
export class SetInitialPassword {
  constructor(private readonly store:InitialPasswordStore,private readonly credentials:PasswordCredentials,private readonly limits:LoginLimits){}
  async execute(input:{email:unknown;provisionalPassword:unknown;newPassword:unknown;origin:string}):Promise<void> {
    const {emailCanonical}=normalizeEmail(input.email);const provisional=validatePassword(input.provisionalPassword);
    const newPassword=validatePassword(input.newPassword);
    let admission:Awaited<ReturnType<LoginLimits['reserveLogin']>>;
    try{admission=await this.limits.reserveLogin(emailCanonical,input.origin);}catch{throw new LoginUnavailable();}
    if(!admission.allowed)throw new LoginLimited(admission.retryAfterSeconds);
    let finished=false;
    try{
      const lookup=await this.store.find(emailCanonical);
      const verified=await verifyProvisionalCredential(lookup.candidate?.account??null,provisional,lookup.now,this.credentials);
      let changed=false;
      if(verified&&lookup.candidate){
        const hash=await hashNewPassword(newPassword,this.credentials);
        changed=await this.store.replace(lookup.candidate,hash);
      }
      finished=true;
      if(!await this.limits.finishLogin(admission.reservation,changed))throw new LoginUnavailable();
      if(!changed)throw new InvalidCredentials();
    }catch(error){
      if(!finished)await this.limits.finishLogin(admission.reservation,false).catch(()=>undefined);
      if(error instanceof InvalidCredentials)throw error;throw new LoginUnavailable();
    }
  }
}
