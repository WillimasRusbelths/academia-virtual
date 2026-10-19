import type { Pool } from 'pg';
import type { VerificationRule,VerificationStore } from '../application/verify-email.js';
import type { AccountAccess,ActionAccess } from '../domain/access.js';
import { actionTransaction } from './action-transaction.js';

type AccountRow=Omit<AccountAccess,'authVersion'>&{authVersion:string;id:string};
export class PostgresVerificationStore implements VerificationStore {
  constructor(private readonly pool:Pool){}
  consume(digest:Uint8Array,accepts:VerificationRule):Promise<boolean> {
    if(digest.length!==32)return Promise.resolve(false);
    return actionTransaction(this.pool,async client=>{
      const candidate=(await client.query<{userId:string}>('SELECT "userId" FROM "ActionToken" WHERE "tokenHash"=$1',[Buffer.from(digest)])).rows[0];
      if(!candidate)return false;
      const account=(await client.query<AccountRow>('SELECT * FROM "User" WHERE id=$1 FOR UPDATE',[candidate.userId])).rows[0];
      if(!account)return false;
      // Releer bajo locks; el lookup inicial no autoriza consumo ni fija condiciones.
      const token=(await client.query<ActionAccess&{id:string}>(`SELECT * FROM "ActionToken"
        WHERE "tokenHash"=$1 AND "userId"=$2 FOR UPDATE`,[Buffer.from(digest),account.id])).rows[0];
      if(!token)return false;
      const now=(await client.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now;
      if(!accepts({...account,authVersion:BigInt(account.authVersion)},token,now))return false;
      await client.query('UPDATE "ActionToken" SET "consumedAt"=$2 WHERE id=$1',[token.id,now]);
      await client.query('UPDATE "User" SET "emailVerifiedAt"=$2,"updatedAt"=$2 WHERE id=$1',[account.id,now]);
      return true;
    });
  }
}
