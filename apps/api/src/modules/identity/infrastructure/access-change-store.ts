import type { Pool } from 'pg';
import { accountTransaction } from '../../../infrastructure/database/account-transaction.js';
import type { AccountMutationDependencies } from '../../../infrastructure/database/account-transaction.js';
import { AuthorizationFailure } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import { userView } from '../../users/public/account.js';
import type { UserViewSource } from '../../users/public/account.js';
import { decideAccessChange, AdminInvariant } from '../domain/account-administration.js';
import { AccessTargetMissing, AccessChangeUnavailable } from '../application/change-access.js';
import type { AccessChangeStore } from '../application/change-access.js';

export class PostgresAccessChangeStore implements AccessChangeStore {
  constructor(private readonly pool:Pool,private readonly dependencies:AccountMutationDependencies){}
  change(actor:SessionActor,input:Parameters<AccessChangeStore['change']>[1]) {
    return accountTransaction(this.pool,async client=>{
      if(!(await client.query('SELECT id FROM "SystemState" WHERE id=1 FOR UPDATE')).rowCount)throw new AccessChangeUnavailable();
      const accounts=(await client.query<UserViewSource>(`SELECT id,name,email,role,status,"emailVerifiedAt","mustSetPassword","createdAt"
        FROM "User" WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,[[actor.userId,input.id]])).rows;
      await this.dependencies.authorization.revalidateInTransaction(client,actor,'users:manage');
      const target=accounts.find(row=>row.id===input.id.toLowerCase());if(!target)throw new AccessTargetMissing();
      const activeAdmins=(await client.query<{n:number}>(`SELECT count(*)::int AS n FROM "User" WHERE role='ADMIN' AND status='ACTIVE'`)).rows[0].n;
      const decision=decideAccessChange(actor.userId,target,input.change,activeAdmins);
      const now=(await client.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now;
      if(decision.changed) {
        if(decision.revokeSessions)await client.query('SELECT id FROM "Session" WHERE "userId"=$1 ORDER BY id FOR UPDATE',[target.id]);
        if(decision.revokeActions)await client.query('SELECT id FROM "ActionToken" WHERE "userId"=$1 AND "consumedAt" IS NULL ORDER BY id FOR UPDATE',[target.id]);
        await client.query(`UPDATE "User" SET role=$2::"Role",status=$3::"AccountStatus",
          "disabledAt"=CASE WHEN $6::text='status' THEN CASE WHEN $3::"AccountStatus"='DISABLED' THEN $4::timestamptz ELSE NULL END ELSE "disabledAt" END,
          "authVersion"="authVersion"+$5::bigint,"updatedAt"=$4::timestamptz WHERE id=$1`,
          [target.id,decision.role,decision.status,now,decision.revokeSessions?1:0,input.change.kind]);
        if(decision.revokeSessions)await client.query('UPDATE "Session" SET "revokedAt"=COALESCE("revokedAt",$2) WHERE "userId"=$1',[target.id,now]);
        if(decision.revokeActions) {
          const tokens=(await client.query<{id:string}>(`UPDATE "ActionToken" SET "revokedAt"=COALESCE("revokedAt",$2)
            WHERE "userId"=$1 AND "consumedAt" IS NULL RETURNING id`,[target.id,now])).rows.map(row=>row.id);
          if(tokens.length) {
            await client.query('SELECT id FROM "MailDelivery" WHERE "tokenId"=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[tokens]);
            await client.query(`UPDATE "MailDelivery" SET status='CANCELLED',"finishedAt"=$2,"encryptedPayload"=NULL,nonce=NULL,"authTag"=NULL,
              "keyId"=NULL,"leaseUntil"=NULL,"claimId"=NULL WHERE "tokenId"=ANY($1::uuid[]) AND status IN ('PENDING','SENDING')`,[tokens,now]);
          }
        }
      }
      await this.dependencies.audit.write(client,{actorKind:'ACCOUNT',actorUserId:actor.userId,targetUserId:target.id,
        action:input.change.kind==='role'?'ROLE_CHANGED':'STATUS_CHANGED',result:decision.changed?'APPLIED':'NO_CHANGE',requestId:input.requestId,
        ...(decision.changed?(input.change.kind==='role'?{oldRole:target.role,newRole:decision.role}:{oldStatus:target.status,newStatus:decision.status}):{})});
      return userView({...target,role:decision.role,status:decision.status});
    },()=>new AccessChangeUnavailable(),error=>error instanceof AuthorizationFailure||error instanceof AdminInvariant||error instanceof AccessTargetMissing);
  }
}
