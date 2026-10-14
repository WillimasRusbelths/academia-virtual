import type { Pool,PoolClient } from 'pg';
import type { ActionLinkAccount,ActionLinkFactory,ActionLinkStore,PreparedActionLink } from '../application/issue-action-link.js';
import { actionTransaction } from './action-transaction.js';

/** El llamador ya bloqueó User: orden común User → tokens → entregas. */
export async function persistActionLink(client:PoolClient,account:ActionLinkAccount,prepared:PreparedActionLink,now:Date):Promise<void> {
  if(prepared.tokenHash.length!==32)throw new Error('Preparación de enlace inválida. Valores omitidos.');
  const previous=(await client.query<{id:string}>(`UPDATE "ActionToken" SET "revokedAt"=COALESCE("revokedAt",$3)
    WHERE "userId"=$1 AND purpose=$2 AND "consumedAt" IS NULL RETURNING id`,
    [account.id,prepared.purpose,now])).rows.map(row=>row.id);
  if(previous.length)await client.query(`UPDATE "MailDelivery" SET status='CANCELLED',"finishedAt"=$2,
    "encryptedPayload"=NULL,nonce=NULL,"authTag"=NULL,"keyId"=NULL,"leaseUntil"=NULL,"claimId"=NULL
    WHERE "tokenId"=ANY($1::uuid[]) AND status IN ('PENDING','SENDING')`,[previous,now]);
  const token=(await client.query<{id:string}>(`INSERT INTO "ActionToken"
    ("userId",purpose,"tokenHash","emailCanonicalSnapshot","createdAt","expiresAt") VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [account.id,prepared.purpose,Buffer.from(prepared.tokenHash),account.emailCanonical,now,prepared.expiresAt])).rows[0];
  const payload=prepared.payload;
  await client.query(`INSERT INTO "MailDelivery" ("tokenId","recipientKey","originKey","encryptedPayload",nonce,"authTag","keyId","createdAt","nextAttemptAt")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,[token.id,prepared.recipientKey,prepared.originKey,Buffer.from(payload.encryptedPayload),
    Buffer.from(payload.nonce),Buffer.from(payload.authTag),payload.keyId,now]);
}
export class PostgresActionTokenStore implements ActionLinkStore {
  constructor(private readonly pool:Pool){}
  replace(emailCanonical:string,prepare:ActionLinkFactory):Promise<boolean> {
    return actionTransaction(this.pool,async client=>{
      const account=(await client.query<ActionLinkAccount>(`SELECT id,email,"emailCanonical",status,"emailVerifiedAt"
        FROM "User" WHERE "emailCanonical"=$1 FOR UPDATE`,[emailCanonical])).rows[0];
      if(!account)return false;
      const now=(await client.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now;
      const prepared=prepare(account,now);if(!prepared)return false;
      await persistActionLink(client,account,prepared,now);return true;
    });
  }
}
