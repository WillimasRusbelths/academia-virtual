import { normalizeEmail, validatePassword } from '../../users/public/account.js';
import type { UserView } from '../../users/public/account.js';
import type { AccountAccess } from '../domain/access.js';
import { verifyAccountCredential } from './credentials.js';
import type { PasswordCredentials, AccessSecrets } from './credentials.js';

export const LOGIN=Symbol('Login');
export interface LoginCandidate {readonly id:string;readonly account:AccountAccess}
export interface LoginStore {
  find(emailCanonical:string):Promise<LoginCandidate|null>;
  createSession(verified:LoginCandidate,digest:Uint8Array):Promise<UserView|null>;
}
export interface LoginReservation {bucketKey:string;eventId:string}
export interface LoginLimits {
  reserveLogin(email:string,origin:string):Promise<{allowed:true;retryAfterSeconds:0;reservation:LoginReservation}
    |{allowed:false;retryAfterSeconds:number}>;
  finishLogin(reservation:LoginReservation,succeeded:boolean):Promise<boolean>;
}
export class InvalidCredentials extends Error {
  readonly code='INVALID_CREDENTIALS';
  constructor(){super('No se pudo iniciar el acceso con esas credenciales.');}
}
export class LoginLimited extends Error {
  readonly code='RATE_LIMITED';
  constructor(readonly retryAfterSeconds:number){super('Espera antes de volver a intentarlo.');}
}
export class LoginUnavailable extends Error {
  readonly code='TEMPORARILY_UNAVAILABLE';
  constructor(){super('El acceso no pudo confirmarse. Detalles omitidos.');}
}
/** Resultado interno: HTTP convierte sessionSecret exclusivamente en cookie HttpOnly. */
export interface LoginResult {readonly user:UserView;readonly sessionSecret:string}
export class Login {
  constructor(private readonly store:LoginStore,private readonly credentials:PasswordCredentials,
    private readonly secrets:AccessSecrets,private readonly limits:LoginLimits){}
  async execute(input:{email:unknown;password:unknown;origin:string}):Promise<LoginResult> {
    const {emailCanonical}=normalizeEmail(input.email);const password=validatePassword(input.password);
    let admission:Awaited<ReturnType<LoginLimits['reserveLogin']>>;
    try {admission=await this.limits.reserveLogin(emailCanonical,input.origin);}catch{throw new LoginUnavailable();}
    if(!admission.allowed)throw new LoginLimited(admission.retryAfterSeconds);
    let finished=false;
    try {
      const candidate=await this.store.find(emailCanonical);
      const verified=await verifyAccountCredential(candidate?.account??null,password,this.credentials);
      let result:LoginResult|undefined;
      if(verified&&candidate) {
        const issued=this.secrets.issue();
        const user=await this.store.createSession(candidate,issued.digest);
        if(user)result={user,sessionSecret:issued.secret};
      }
      finished=true;
      if(!await this.limits.finishLogin(admission.reservation,result!==undefined))throw new LoginUnavailable();
      if(!result)throw new InvalidCredentials();
      return result;
    } catch(error) {
      if(!finished)await this.limits.finishLogin(admission.reservation,false).catch(()=>undefined);
      if(error instanceof InvalidCredentials)throw error;
      throw new LoginUnavailable();
    }
  }
}
