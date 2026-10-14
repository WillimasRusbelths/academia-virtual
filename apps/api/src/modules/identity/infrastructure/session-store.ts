import type { Pool, PoolClient } from 'pg';
import { randomInt } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { canUseSession, type AccountAccess, type SessionAccess } from '../domain/access.js';
import { accessSecrets } from './credentials.js';
import { AuthorizationFailure, SessionStoreUnavailable, permits, type Permission,
  type SessionActor, type SessionRepository } from '../../authorization/public/session.js';

interface Row {
  actor: SessionActor;
  account: AccountAccess;
  session: SessionAccess;
  now: Date;
}

class TransientSessionFailure extends SessionStoreUnavailable {
  constructor(){super(true);}
}
function transient(error: unknown): boolean {
  return error instanceof TransientSessionFailure || (typeof error === 'object' && error !== null
    && 'code' in error && ['40001', '40P01'].includes(String(error.code)));
}

const snapshot = `SELECT json_build_object('sessionId', s.id, 'userId', u.id,
  'authVersion', s."authVersion"::text, 'role', u.role) AS actor,
  json_build_object('status', u.status, 'emailCanonical', u."emailCanonical",
    'emailVerifiedAt', u."emailVerifiedAt", 'mustSetPassword', u."mustSetPassword",
    'passwordHash', u."passwordHash", 'authVersion', u."authVersion"::text,
    'createdAt', u."createdAt") AS account,
  json_build_object('authVersion', s."authVersion"::text, 'createdAt', s."createdAt",
    'lastAcceptedAt', s."lastAcceptedAt", 'absoluteExpiresAt', s."absoluteExpiresAt",
    'revokedAt', s."revokedAt") AS session, clock_timestamp() AS now
  FROM "Session" s JOIN "User" u ON u.id = s."userId"`;

function eligible(row: Row | undefined): SessionActor | null {
  if (!row) return null;
  const account = { ...row.account, authVersion: BigInt(row.account.authVersion),
    createdAt: new Date(row.account.createdAt),
    emailVerifiedAt: row.account.emailVerifiedAt === null ? null : new Date(row.account.emailVerifiedAt) };
  const session = { ...row.session, authVersion: BigInt(row.session.authVersion),
    createdAt: new Date(row.session.createdAt), lastAcceptedAt: new Date(row.session.lastAcceptedAt),
    absoluteExpiresAt: new Date(row.session.absoluteExpiresAt),
    revokedAt: row.session.revokedAt === null ? null : new Date(row.session.revokedAt) };
  return canUseSession(account, session, row.now)
    ? { ...row.actor, authVersion: BigInt(row.actor.authVersion) } : null;
}

/** Sin caché: cada operación consulta la base primaria y la cuenta vigente. */
export class PostgresSessionStore implements SessionRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let client: PoolClient | undefined;
      try {
        client = await this.pool.connect();
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => undefined);
        if (error instanceof AuthorizationFailure) throw error;
        if (attempt >= 2 || !transient(error)) throw new SessionStoreUnavailable();
      } finally { client?.release(); }
      await pause(randomInt(5, 26));
    }
  }

  async lookup(secret: string): Promise<SessionActor | null> {
    const digest = accessSecrets.digest(secret);
    if (!digest) return null;
    try {
      const result = await this.pool.query<Row>(`${snapshot} WHERE s."tokenHash" = $1`, [Buffer.from(digest)]);
      return eligible(result.rows[0]);
    } catch { throw new SessionStoreUnavailable(); }
  }

  /** Usar dentro de la transacción de la mutación, tras gobierno/usuarios en orden UUID.
   * Mantiene bloqueados actor y sesión hasta commit; no renueva actividad por sí mismo. */
  async revalidateInTransaction(client: PoolClient, actor: SessionActor, permission: Permission): Promise<void> {
    try {
      // SAVEPOINT falla fuera de BEGIN: los bloqueos no pueden liberarse antes de la escritura.
      await client.query('SAVEPOINT identity_authorization');
      await client.query('SELECT id FROM "User" WHERE id = $1 FOR UPDATE', [actor.userId]);
      await client.query('SELECT id FROM "Session" WHERE id = $1 AND "userId" = $2 FOR UPDATE',
        [actor.sessionId, actor.userId]);
      const result = await client.query<Row>(`${snapshot} WHERE s.id = $1 AND u.id = $2`,
        [actor.sessionId, actor.userId]);
      const current = eligible(result.rows[0]);
      if (!current || current.authVersion !== actor.authVersion) throw new AuthorizationFailure('AUTH_REQUIRED');
      if (current.role !== actor.role || !permits(current.role, permission)) throw new AuthorizationFailure('FORBIDDEN');
      await client.query('RELEASE SAVEPOINT identity_authorization');
    } catch (error) {
      if (error instanceof AuthorizationFailure) throw error;
      if (transient(error)) throw new TransientSessionFailure();
      throw new SessionStoreUnavailable();
    }
  }

  async accept(actor: SessionActor): Promise<boolean> {
    try {
      await this.transaction(async (client) => {
        await this.revalidateInTransaction(client, actor, 'profile:read');
        // El instante validado bajo bloqueo evita cruzar la caducidad entre dos sentencias.
        const result = await client.query<Row>(`${snapshot} WHERE s.id = $1`, [actor.sessionId]);
        const row = result.rows[0];
        if (!eligible(row)) throw new AuthorizationFailure('AUTH_REQUIRED');
        await client.query(`UPDATE "Session" SET "lastAcceptedAt" = GREATEST("lastAcceptedAt", $2)
          WHERE id = $1 AND "revokedAt" IS NULL`, [actor.sessionId, row!.now]);
      });
      return true;
    } catch (error) {
      if (error instanceof AuthorizationFailure) return false;
      throw new SessionStoreUnavailable();
    }
  }

  async revoke(secret: string): Promise<void> {
    const digest = accessSecrets.digest(secret);
    if (!digest) return;
    await this.transaction(async (client) => {
      const result = await client.query<{ userId: string }>(
        'SELECT "userId" FROM "Session" WHERE "tokenHash" = $1', [Buffer.from(digest)]);
      if (result.rows[0]) {
        await client.query('SELECT id FROM "User" WHERE id = $1 FOR UPDATE', [result.rows[0].userId]);
        await client.query(`UPDATE "Session" SET "revokedAt" = clock_timestamp()
          WHERE "tokenHash" = $1 AND "revokedAt" IS NULL`, [Buffer.from(digest)]);
      }
    });
  }
}
