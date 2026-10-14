import type { Pool } from 'pg';
import { accountTransaction } from '../../../infrastructure/database/account-transaction.js';
import type { AccountMutationDependencies } from '../../../infrastructure/database/account-transaction.js';
import { AuthorizationFailure } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import { userView } from '../../users/public/account.js';
import type { UserViewSource } from '../../users/public/account.js';
import { AccountConflict } from '../application/create-account.js';
import type { AccountCreationStore } from '../application/create-account.js';
import type { ActionLinkAdmission, ActionLinkAccount } from '../application/issue-action-link.js';
import { ActionLinkUnavailable } from '../application/issue-action-link.js';
import { provisionalExpiresAt } from '../domain/access.js';
import { persistActionLink } from './action-token-store.js';

export class PostgresAccountCreationStore implements AccountCreationStore {
  constructor(private readonly pool:Pool,private readonly dependencies:AccountMutationDependencies){}
  create(actor:SessionActor,input:Parameters<AccountCreationStore['create']>[1],admission:ActionLinkAdmission) {
    return accountTransaction(this.pool,async client=>{
      if(input.role==='ADMIN') {
        if(!(await client.query('SELECT id FROM "SystemState" WHERE id=1 FOR UPDATE')).rowCount)throw new ActionLinkUnavailable();
      }
      await client.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',[actor.userId]);
      await this.dependencies.authorization.revalidateInTransaction(client,actor,'users:manage');
      const now=(await client.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now;
      const account=(await client.query<UserViewSource&ActionLinkAccount>(`INSERT INTO "User"
        (name,email,"emailCanonical",role,status,"mustSetPassword","provisionalPasswordHash","provisionalExpiresAt","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,'ACTIVE',true,$5,$6,$7,$7) ON CONFLICT ("emailCanonical") DO NOTHING
        RETURNING id,name,email,"emailCanonical",role,status,"emailVerifiedAt","mustSetPassword","createdAt"`,
        [input.name,input.email,input.emailCanonical,input.role,input.provisionalPasswordHash,provisionalExpiresAt(now),now])).rows[0];
      if(!account)throw new AccountConflict();
      if(admission.allowed) {
        const prepared=admission.prepare(account,now);if(!prepared)throw new ActionLinkUnavailable();
        await persistActionLink(client,account,prepared,now);
      }
      await this.dependencies.audit.write(client,{actorKind:'ACCOUNT',actorUserId:actor.userId,targetUserId:account.id,
        action:'ACCOUNT_CREATED',result:'APPLIED',requestId:input.requestId});
      return userView(account);
    },()=>new ActionLinkUnavailable(),error=>error instanceof AuthorizationFailure||error instanceof AccountConflict);
  }
}
