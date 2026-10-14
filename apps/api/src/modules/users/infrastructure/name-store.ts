import type { Pool } from 'pg';
import { accountTransaction } from '../../../infrastructure/database/account-transaction.js';
import type { AccountMutationDependencies } from '../../../infrastructure/database/account-transaction.js';
import { AuthorizationFailure } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import { userView } from '../public/account.js';
import type { UserViewSource } from '../public/account.js';
import type { NameStore } from '../application/change-name.js';
import { UserReadUnavailable } from '../application/get-me.js';
import { UserNotFound } from '../application/list-users.js';

export class PostgresNameStore implements NameStore {
  constructor(private readonly pool:Pool,private readonly dependencies:AccountMutationDependencies){}
  change(actor:SessionActor,input:Parameters<NameStore['change']>[1]) {
    return accountTransaction(this.pool,async client=>{
      // Actor y destino bloqueados juntos en el orden común, antes de la sesión.
      await client.query('SELECT id FROM "User" WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[actor.userId,input.id]]);
      await this.dependencies.authorization.revalidateInTransaction(client,actor,'users:manage');
      const row=(await client.query<UserViewSource>(`UPDATE "User" SET name=$2,"updatedAt"=clock_timestamp()
        WHERE id=$1 RETURNING id,name,email,role,status,"emailVerifiedAt","mustSetPassword","createdAt"`,[input.id,input.name])).rows[0];
      if(!row)throw new UserNotFound();
      await this.dependencies.audit.write(client,{actorKind:'ACCOUNT',actorUserId:actor.userId,targetUserId:row.id,
        action:'NAME_CHANGED',result:'APPLIED',requestId:input.requestId});
      return userView(row);
    },()=>new UserReadUnavailable(),error=>error instanceof AuthorizationFailure||error instanceof UserNotFound);
  }
}
