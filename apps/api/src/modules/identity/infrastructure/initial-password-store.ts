import type { Pool } from 'pg';
import type { AccountAccess } from '../domain/access.js';
import type { InitialPasswordCandidate,InitialPasswordStore } from '../application/set-initial-password.js';
import { LoginUnavailable } from '../application/login.js';
import { acceptsVerifiedProvisional } from '../domain/initial-password.js';
import { actionTransaction } from './action-transaction.js';

interface Row extends Omit<AccountAccess,'authVersion'> {id:string;authVersion:string;observedAt:Date}
const columns='id,status,"emailCanonical","emailVerifiedAt","mustSetPassword","passwordHash","authVersion","createdAt","provisionalPasswordHash","provisionalExpiresAt"';
const access=(row:Row):AccountAccess=>({...row,authVersion:BigInt(row.authVersion)});
export class PostgresInitialPasswordStore implements InitialPasswordStore {
  constructor(private readonly pool:Pool){}
  async find(emailCanonical:string) {
    try{
      const row=(await this.pool.query<Row>(`WITH instant AS (SELECT clock_timestamp() AS "observedAt")
        SELECT u.*,instant."observedAt" FROM instant LEFT JOIN "User" u ON u."emailCanonical"=$1`,[emailCanonical])).rows[0];
      return {candidate:row.id?{id:row.id,account:access(row)}:null,now:row.observedAt};
    }catch{throw new LoginUnavailable();}
  }
  async replace(verified:InitialPasswordCandidate,newHash:string):Promise<boolean> {
    try{return await actionTransaction(this.pool,async client=>{
      const row=(await client.query<Row>(`SELECT ${columns} FROM "User" WHERE id=$1 FOR UPDATE`,[verified.id])).rows[0];
      const now=(await client.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now;
      if(!row||!acceptsVerifiedProvisional(verified.account,access(row),now))return false;
      await client.query(`UPDATE "User" SET "passwordHash"=$2,"mustSetPassword"=false,"provisionalPasswordHash"=NULL,
        "provisionalExpiresAt"=NULL,"authVersion"="authVersion"+1,"updatedAt"=$3 WHERE id=$1`,[row.id,newHash,now]);
      return true;
    });}catch{throw new LoginUnavailable();}
  }
}
