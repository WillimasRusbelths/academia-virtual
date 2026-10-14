import type { Pool } from 'pg';
import type { SessionActor } from '../../authorization/public/session.js';
import { canUseSession } from '../../identity/public/access.js';
import { UserReadUnavailable } from '../application/get-me.js';
import type { UserQueries } from '../application/get-me.js';
import { userView } from '../public/account.js';
import type { UserViewSource } from '../public/account.js';

interface Row extends UserViewSource {
  emailCanonical:string;passwordHash:string|null;authVersion:string;sessionVersion:string;
  sessionCreatedAt:Date;lastAcceptedAt:Date;absoluteExpiresAt:Date;revokedAt:Date|null;now:Date;
}
/** Una instantánea de la base primaria; no recibe filtros ni IDs provenientes del cliente HTTP. */
export class PostgresUserQueries implements UserQueries {
  constructor(private readonly pool:Pool){}
  async getOwn(actor:SessionActor) {
    try {
      const row=(await this.pool.query<Row>(`SELECT u.id,u.name,u.email,u."emailCanonical",u.role,u.status,
        u."emailVerifiedAt",u."mustSetPassword",u."passwordHash",u."authVersion",u."createdAt",
        s."authVersion" AS "sessionVersion",s."createdAt" AS "sessionCreatedAt",s."lastAcceptedAt",
        s."absoluteExpiresAt",s."revokedAt",clock_timestamp() AS now FROM "User" u JOIN "Session" s ON s."userId"=u.id
        WHERE u.id=$1 AND s.id=$2`,[actor.userId,actor.sessionId])).rows[0];
      if(!row||BigInt(row.authVersion)!==actor.authVersion||row.role!==actor.role)return null;
      const account={...row,authVersion:BigInt(row.authVersion)};
      const session={...row,createdAt:row.sessionCreatedAt,authVersion:BigInt(row.sessionVersion)};
      return canUseSession(account,session,row.now)?userView(row):null;
    }catch{throw new UserReadUnavailable();}
  }
}
