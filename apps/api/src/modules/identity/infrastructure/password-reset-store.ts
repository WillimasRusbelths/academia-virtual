import type { Pool } from 'pg';
import type { PasswordResetRule,PasswordResetStore } from '../application/reset-password.js';
import type { AccountAccess,ActionAccess } from '../domain/access.js';
import { actionTransaction } from './action-transaction.js';

type AccountRow=Omit<AccountAccess,'authVersion'>&{id:string;authVersion:string};
type TokenRow=ActionAccess&{id:string;tokenHash:Buffer};
export class PostgresPasswordResetStore implements PasswordResetStore {
  constructor(private readonly pool:Pool){}
  consume(digest:Uint8Array,newHash:string,accepts:PasswordResetRule):Promise<boolean> {
    if(digest.length!==32)return Promise.resolve(false);
    return actionTransaction(this.pool,async client=>{
      const hash=Buffer.from(digest);
      const candidate=(await client.query<{userId:string}>('SELECT "userId" FROM "ActionToken" WHERE "tokenHash"=$1',[hash])).rows[0];
      if(!candidate)return false;
      // Orden compartido con cambios de acceso: usuario → sesiones → tokens → correo.
      const account=(await client.query<AccountRow>('SELECT * FROM "User" WHERE id=$1 FOR UPDATE',[candidate.userId])).rows[0];
      if(!account)return false;
      await client.query('SELECT id FROM "Session" WHERE "userId"=$1 ORDER BY id FOR UPDATE',[account.id]);
      const tokens=(await client.query<TokenRow>(`SELECT * FROM "ActionToken" WHERE "userId"=$1
        AND ("tokenHash"=$2 OR (purpose='RESET_PASSWORD' AND "consumedAt" IS NULL)) ORDER BY id FOR UPDATE`,[account.id,hash])).rows;
      const token=tokens.find(row=>row.tokenHash.equals(hash));if(!token)return false;
      const now=(await client.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now;
      if(!accepts({...account,authVersion:BigInt(account.authVersion)},token,now))return false;
      await client.query(`UPDATE "User" SET "passwordHash"=$2,"mustSetPassword"=false,"provisionalPasswordHash"=NULL,
        "provisionalExpiresAt"=NULL,"authVersion"="authVersion"+1,"updatedAt"=$3 WHERE id=$1`,[account.id,newHash,now]);
      await client.query('UPDATE "ActionToken" SET "consumedAt"=$2 WHERE id=$1',[token.id,now]);
      const others=(await client.query<{id:string}>(`UPDATE "ActionToken" SET "revokedAt"=COALESCE("revokedAt",$3)
        WHERE "userId"=$1 AND purpose='RESET_PASSWORD' AND id<>$2 AND "consumedAt" IS NULL RETURNING id`,[account.id,token.id,now])).rows;
      await client.query('UPDATE "Session" SET "revokedAt"=COALESCE("revokedAt",$2) WHERE "userId"=$1',[account.id,now]);
      const finished=[token.id,...others.map(row=>row.id)];
      await client.query('SELECT id FROM "MailDelivery" WHERE "tokenId"=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[finished]);
      await client.query(`UPDATE "MailDelivery" SET status='CANCELLED',"finishedAt"=$2,"encryptedPayload"=NULL,nonce=NULL,"authTag"=NULL,
        "keyId"=NULL,"leaseUntil"=NULL,"claimId"=NULL WHERE "tokenId"=ANY($1::uuid[]) AND status IN ('PENDING','SENDING')`,[finished,now]);
      return true;
    });
  }
}
