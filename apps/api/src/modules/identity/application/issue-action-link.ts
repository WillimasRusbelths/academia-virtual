import { normalizeEmail } from '../../users/public/account.js';
import type { EncryptedMailPayload } from '../../mail/public/delivery.js';
import type { AccountStatus } from '../../users/public/account.js';
import type { AccessSecrets } from './credentials.js';
import { actionExpiresAt } from '../domain/access.js';
import type { TokenPurpose } from '../domain/access.js';
import { canIssueAction } from '../domain/action-link.js';

export interface ActionLinkAccount {
  readonly id:string;readonly email:string;readonly emailCanonical:string;
  readonly status:AccountStatus;readonly emailVerifiedAt:Date|null;
}
export interface PreparedActionLink {
  readonly purpose:TokenPurpose;readonly tokenHash:Uint8Array;readonly expiresAt:Date;
  readonly payload:EncryptedMailPayload;readonly recipientKey:string;readonly originKey:string;
}
export type ActionLinkFactory=(account:ActionLinkAccount,now:Date)=>PreparedActionLink|null;
export interface ActionLinkStore {replace(emailCanonical:string,prepare:ActionLinkFactory):Promise<boolean>}
export interface ActionLinkLimits {
  admitMail(email:string,purpose:TokenPurpose,origin:string,phase:'ADMISSION'):Promise<{allowed:boolean;retryAfterSeconds:number}>;
  mailKeys(email:string,purpose:TokenPurpose,origin:string,phase:'SMTP'):{recipientKey:string;originKey:string};
}
export interface ActionLinkCipher {
  encrypt(payload:{recipient:string;link:string;template:TokenPurpose}):EncryptedMailPayload;
}
export type ActionLinkAdmission={allowed:false;retryAfterSeconds:number}
  |{allowed:true;retryAfterSeconds:0;prepare:ActionLinkFactory};
export class ActionLinkUnavailable extends Error {
  readonly code='TEMPORARILY_UNAVAILABLE';
  constructor(){super('La operación no pudo confirmarse. Detalles omitidos.');}
}
export class MailAdmissionLimited extends Error {
  readonly code='RATE_LIMITED';
  constructor(readonly retryAfterSeconds:number){super('Espera antes de solicitar instrucciones.');}
}

/** Coordinación reutilizable; no contiene SQL, SMTP ni conoce una solicitud HTTP. */
export class IssueActionLink {
  constructor(private readonly store:ActionLinkStore,private readonly limits:ActionLinkLimits,
    private readonly secrets:AccessSecrets,private readonly cipher:ActionLinkCipher,private readonly appOrigin:string){}

  async admit(input:{email:unknown;purpose:TokenPurpose;origin:string}):Promise<ActionLinkAdmission> {
    const {emailCanonical}=normalizeEmail(input.email);
    try {
      const admission=await this.limits.admitMail(emailCanonical,input.purpose,input.origin,'ADMISSION');
      if(!admission.allowed)return {allowed:false,retryAfterSeconds:admission.retryAfterSeconds};
      const keys=this.limits.mailKeys(emailCanonical,input.purpose,input.origin,'SMTP');
      return {allowed:true,retryAfterSeconds:0,prepare:(account,now)=>{
        if(account.emailCanonical!==emailCanonical || !canIssueAction(account,input.purpose))return null;
        const issued=this.secrets.issue();
        const route=input.purpose==='VERIFY_EMAIL'?'/verificar-correo':'/restablecer';
        const payload=this.cipher.encrypt({recipient:account.email,template:input.purpose,
          link:`${this.appOrigin}${route}#${issued.secret}`});
        return {purpose:input.purpose,tokenHash:issued.digest,expiresAt:actionExpiresAt(input.purpose,now),payload,...keys};
      }};
    }catch{throw new ActionLinkUnavailable();}
  }
  async execute(input:{email:unknown;purpose:TokenPurpose;origin:string}):Promise<{admitted:boolean;queued:boolean;retryAfterSeconds:number}> {
    const {emailCanonical}=normalizeEmail(input.email);const admission=await this.admit(input);
    if(!admission.allowed)return {admitted:false,queued:false,retryAfterSeconds:admission.retryAfterSeconds};
    return {admitted:true,queued:await this.store.replace(emailCanonical,admission.prepare),retryAfterSeconds:0};
  }
}
