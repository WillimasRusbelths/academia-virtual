import { randomInt } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import type { Pool, PoolClient } from 'pg';
import { LoginUnavailable } from '../application/login.js';
import type { LoginCandidate, LoginStore } from '../application/login.js';
import { acceptsVerifiedLogin } from '../domain/login.js';
import { ABSOLUTE_SESSION_MS } from '../domain/access.js';
import type { AccountAccess } from '../domain/access.js';
import { userView } from '../../users/public/account.js';
import type { UserViewSource } from '../../users/public/account.js';

interface Row extends UserViewSource {emailCanonical:string;passwordHash:string|null;authVersion:string}
const columns='id,name,email,"emailCanonical",role,status,"emailVerifiedAt","mustSetPassword","passwordHash","authVersion","createdAt"';
function access(row:Row):AccountAccess {return {...row,authVersion:BigInt(row.authVersion)};}
function transient(error:unknown):boolean {
  return !!error&&typeof error==='object'&&'code'in error&&['40001','40P01'].includes(String(error.code));
}
export class PostgresLoginStore implements LoginStore {
  constructor(private readonly pool:Pool){}
  async find(emailCanonical:string):Promise<LoginCandidate|null> {
    try {const row=(await this.pool.query<Row>(`SELECT ${columns} FROM "User" WHERE "emailCanonical"=$1`,[emailCanonical])).rows[0];
      return row?{id:row.id,account:access(row)}:null;
    }catch{throw new LoginUnavailable();}
  }
  async createSession(verified:LoginCandidate,digest:Uint8Array) {
    if(digest.length!==32)throw new LoginUnavailable();
    for(let attempt=0;;attempt++) {
      let client:PoolClient|undefined;let connectionFailed=false;let rolledBack=false;
      const onError=()=>{connectionFailed=true;};
      try {
        client=await this.pool.connect();client.on('error',onError);
        await client.query('BEGIN');await client.query("SET LOCAL lock_timeout = '3s'");
        const row=(await client.query<Row>(`SELECT ${columns} FROM "User" WHERE id=$1 FOR UPDATE`,[verified.id])).rows[0];
        if(!row||!acceptsVerifiedLogin(verified.account,access(row))) {await client.query('ROLLBACK');return null;}
        const now=(await client.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now;
        await client.query(`INSERT INTO "Session" ("userId","tokenHash","authVersion","createdAt","lastAcceptedAt","absoluteExpiresAt")
          VALUES ($1,$2,$3,$4,$4,$5)`,[row.id,Buffer.from(digest),row.authVersion,now,new Date(now.getTime()+ABSOLUTE_SESSION_MS)]);
        const view=userView(row);
        await client.query('COMMIT');return view;
      }catch(error) {
        if(client) {try{await client.query('ROLLBACK');rolledBack=true;}catch{connectionFailed=true;}}
        // Reintentar solo conflictos abortados; nunca un commit de resultado incierto.
        if(attempt>=2||!rolledBack||!transient(error))throw new LoginUnavailable();
      }finally {if(client){client.release(connectionFailed);client.removeListener('error',onError);}}
      await pause(randomInt(5,26));
    }
  }
}
