import type { Pool } from 'pg';
import type { SessionActor } from '../../authorization/public/session.js';
import { canUseSession } from '../../identity/public/access.js';
import { UserReadUnavailable } from '../application/get-me.js';
import type { UserQueries } from '../application/get-me.js';
import { userView } from '../public/account.js';
import type { UserViewSource } from '../public/account.js';
import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { AdministrativeUserQueries, UserListFilter } from '../application/list-users.js';

interface Row extends UserViewSource {
  emailCanonical:string;passwordHash:string|null;authVersion:string;sessionVersion:string;
  sessionCreatedAt:Date;lastAcceptedAt:Date;absoluteExpiresAt:Date;revokedAt:Date|null;now:Date;
}
/** Consultas en la base primaria; reciben argumentos de aplicación, nunca Request/DTO HTTP. */
export class PostgresUserQueries implements UserQueries, AdministrativeUserQueries {
  constructor(private readonly pool:Pool){}
  private async authorize(actor:SessionActor) {
    if(!permits(actor.role,'users:manage'))throw new AuthorizationFailure('FORBIDDEN');
    if(!await this.getOwn(actor))throw new AuthorizationFailure('AUTH_REQUIRED');
  }
  async list(actor:SessionActor,filter:UserListFilter) {
    await this.authorize(actor);
    try {
      const pattern=filter.q===undefined?null:`%${filter.q.replace(/[\\%_]/g,'\\$&')}%`;
      const offset=(BigInt(filter.page)-1n)*BigInt(filter.pageSize);
      const result=(await this.pool.query<{total:string;items:(Omit<UserViewSource,'createdAt'|'emailVerifiedAt'>&{createdAt:string;emailVerifiedAt:string|null})[]}>(`
        WITH filtered AS (SELECT id,name,email,role,status,"emailVerifiedAt","mustSetPassword","createdAt"
          FROM "User" WHERE ($1::text IS NULL OR name ILIKE $1 ESCAPE '\\' OR email ILIKE $1 ESCAPE '\\')
          AND ($2::"Role" IS NULL OR role=$2) AND ($3::"AccountStatus" IS NULL OR status=$3)),
        page AS (SELECT * FROM filtered ORDER BY "createdAt",id LIMIT $4 OFFSET $5)
        SELECT (SELECT count(*)::text FROM filtered) AS total,
          COALESCE((SELECT json_agg(page ORDER BY "createdAt",id) FROM page),'[]'::json) AS items`,
        [pattern,filter.role??null,filter.status??null,filter.pageSize,offset.toString()])).rows[0];
      return {items:result.items.map(row=>userView({...row,createdAt:new Date(row.createdAt),
        emailVerifiedAt:row.emailVerifiedAt===null?null:new Date(row.emailVerifiedAt)})),
        page:filter.page,pageSize:filter.pageSize,total:Number(result.total)};
    }catch{throw new UserReadUnavailable();}
  }
  async get(actor:SessionActor,id:string) {
    await this.authorize(actor);
    try {
      const row=(await this.pool.query<UserViewSource>(`SELECT id,name,email,role,status,"emailVerifiedAt","mustSetPassword","createdAt"
        FROM "User" WHERE id=$1`,[id])).rows[0];
      return row?userView(row):null;
    }catch{throw new UserReadUnavailable();}
  }
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
