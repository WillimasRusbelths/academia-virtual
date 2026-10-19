import { normalizeEmail,normalizeName,validatePassword } from '../../users/public/account.js';
import { hashNewPassword } from './credentials.js';
import type { PasswordCredentials } from './credentials.js';
import { MailAdmissionLimited } from './issue-action-link.js';
import type { ActionLinkAdmission,IssueActionLink } from './issue-action-link.js';

export const REGISTER_STUDENT=Symbol('RegisterStudent');
export interface RegistrationStore {
  create(input:{name:string;email:string;emailCanonical:string;passwordHash:string},admission:ActionLinkAdmission):Promise<void>;
}
export class RegisterStudent {
  constructor(private readonly store:RegistrationStore,private readonly credentials:PasswordCredentials,private readonly links:IssueActionLink){}
  async execute(input:{name:unknown;email:unknown;password:unknown;origin:string}):Promise<void> {
    const name=normalizeName(input.name);const email=normalizeEmail(input.email);const password=validatePassword(input.password);
    const passwordHash=await hashNewPassword(password,this.credentials);
    // Cuota pública antes de adquirir locks de cuenta, también para correos existentes.
    const admission=await this.links.admit({email:email.emailCanonical,purpose:'VERIFY_EMAIL',origin:input.origin});
    await this.store.create({name,...email,passwordHash},admission);
    // La excepción ocurre después del commit que conserva la cuenta pendiente.
    if(!admission.allowed)throw new MailAdmissionLimited(admission.retryAfterSeconds);
  }
}
