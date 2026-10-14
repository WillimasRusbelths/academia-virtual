import { canConsumeAction } from './access.js';
import type { AccountAccess,ActionAccess,TokenPurpose } from './access.js';

/** La emisión solo sirve al propósito de la cuenta; no habilita acceso de aplicación. */
export function canIssueAction(account:Pick<AccountAccess,'status'|'emailVerifiedAt'>,purpose:TokenPurpose):boolean {
  return account.status==='ACTIVE' && (purpose==='VERIFY_EMAIL'?account.emailVerifiedAt===null
    :purpose==='RESET_PASSWORD' && account.emailVerifiedAt!==null && Number.isFinite(account.emailVerifiedAt.getTime()));
}

export function canVerifyEmail(account:AccountAccess,token:ActionAccess,now:Date):boolean {
  return canIssueAction(account,'VERIFY_EMAIL') && canConsumeAction(account,token,'VERIFY_EMAIL',now);
}
