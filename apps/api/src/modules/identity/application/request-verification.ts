import { MailAdmissionLimited } from './issue-action-link.js';
import type { IssueActionLink } from './issue-action-link.js';

export const REQUEST_VERIFICATION=Symbol('RequestVerification');
/** La respuesta pública no depende de si existe una cuenta elegible ni del transporte. */
export class RequestVerification {
  constructor(private readonly links:IssueActionLink){}
  async execute(input:{email:unknown;origin:string}):Promise<void> {
    const result=await this.links.execute({...input,purpose:'VERIFY_EMAIL'});
    if(!result.admitted)throw new MailAdmissionLimited(result.retryAfterSeconds);
  }
}
