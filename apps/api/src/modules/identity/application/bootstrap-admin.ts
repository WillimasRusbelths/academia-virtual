import { normalizeEmail,normalizeName } from '../../users/public/account.js';
import { hashNewPassword } from './credentials.js';
import type { PasswordCredentials } from './credentials.js';
import type { IdentityStore,BootstrapResult } from './identity-store.js';
import { BootstrapUnavailable } from './identity-store.js';
import { BootstrapAlreadyInitialized } from '../domain/bootstrap.js';
import type { IssueActionLink } from './issue-action-link.js';

/** T028 conserva la única transacción y reserva de cuota; no ejecuta hash ni SMTP bajo lock. */
export class BootstrapAdmin {
  constructor(private readonly store:IdentityStore,private readonly credentials:PasswordCredentials,
    private readonly links:Pick<IssueActionLink,'prepareMessage'>){}
  async execute(input:{name:unknown;email:unknown;provisionalPassword:unknown;requestId:string;origin:string}):Promise<BootstrapResult> {
    const name=normalizeName(input.name);const {email}=normalizeEmail(input.email);
    const provisionalPasswordHash=await hashNewPassword(input.provisionalPassword,this.credentials);
    try{
      const verification=this.links.prepareMessage(email,'VERIFY_EMAIL');
      return await this.store.bootstrap({name,email,provisionalPasswordHash,requestId:input.requestId,origin:input.origin,verification});
    }catch(error){if(error instanceof BootstrapAlreadyInitialized)throw error;throw new BootstrapUnavailable();}
  }
}
