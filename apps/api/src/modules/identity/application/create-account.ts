import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import { normalizeEmail, normalizeName, requireRole, validatePassword } from '../../users/public/account.js';
import type { Role, UserView } from '../../users/public/account.js';
import { hashNewPassword } from './credentials.js';
import type { PasswordCredentials } from './credentials.js';
import type { ActionLinkAdmission, IssueActionLink } from './issue-action-link.js';

export const CREATE_ACCOUNT=Symbol('CreateAccount');

export interface AccountCreationStore {
  create(actor:SessionActor,input:{name:string;email:string;emailCanonical:string;role:Role;provisionalPasswordHash:string;requestId:string},
    admission:ActionLinkAdmission):Promise<UserView>;
}
export class AccountConflict extends Error {
  readonly code='ACCOUNT_CONFLICT';
  constructor(){super('La cuenta no pudo crearse por conflicto.');}
}
export class CreateAccount {
  constructor(private readonly store:AccountCreationStore,private readonly credentials:PasswordCredentials,private readonly links:IssueActionLink){}
  async execute(actor:SessionActor,input:{name:unknown;email:unknown;role:unknown;provisionalPassword:unknown;origin:string;requestId:string}):Promise<UserView> {
    if(!permits(actor.role,'users:manage'))throw new AuthorizationFailure('FORBIDDEN');
    const name=normalizeName(input.name);const email=normalizeEmail(input.email);const role=requireRole(input.role);
    const password=validatePassword(input.provisionalPassword);
    const provisionalPasswordHash=await hashNewPassword(password,this.credentials);
    const admission=await this.links.admit({email:email.emailCanonical,purpose:'VERIFY_EMAIL',origin:input.origin});
    // Falta de cuota impide correo, no el alta administrativa válida.
    return this.store.create(actor,{name,...email,role,provisionalPasswordHash,requestId:input.requestId},admission);
  }
}
