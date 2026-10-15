import { MailAdmissionLimited } from './issue-action-link.js';
import type { IssueActionLink } from './issue-action-link.js';

export const REQUEST_PASSWORD_RESET=Symbol('RequestPasswordReset');
/** La admisión pública es equivalente para todos los estados; SMTP sigue siendo asíncrono. */
export class RequestPasswordReset {
  constructor(private readonly links:Pick<IssueActionLink,'execute'>){}
  async execute(input:{email:unknown;origin:string}):Promise<void> {
    const result=await this.links.execute({...input,purpose:'RESET_PASSWORD'});
    if(!result.admitted)throw new MailAdmissionLimited(result.retryAfterSeconds);
  }
}
