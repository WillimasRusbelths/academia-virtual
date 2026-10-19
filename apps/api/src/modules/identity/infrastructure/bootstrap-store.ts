import { randomInt } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import type { Pool, PoolClient } from 'pg';
import type { PostgresRateStore } from '../../../infrastructure/limits/rate-store.js';
import { bootstrapAccount, BootstrapUnavailable } from '../application/identity-store.js';
import type { BootstrapResult, IdentityStore, PreparedBootstrap } from '../application/identity-store.js';
import { actionExpiresAt, provisionalExpiresAt } from '../domain/access.js';
import { BootstrapAlreadyInitialized, requireUninitialized } from '../domain/bootstrap.js';
import type { BootstrapState } from '../domain/bootstrap.js';

/** Capacidad transaccional inyectada por composición; pg permanece en infraestructura. */
export interface BootstrapAuditWriter {
  write(client: PoolClient, event: unknown): Promise<void>;
}

function transient(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error.code === '40001' || error.code === '40P01');
}

/** Base persistida de US6; no entrada CLI/HTTP, hash, cifrado ni transporte SMTP. */
export class PostgresBootstrapStore implements IdentityStore {
  constructor(private readonly pool: Pool,
    private readonly rates: Pick<PostgresRateStore, 'admitMail' | 'mailKeys'>,
    private readonly audit: BootstrapAuditWriter) {}

  async bootstrap(input: PreparedBootstrap): Promise<BootstrapResult> {
    const account = bootstrapAccount(input);
    let admitted: boolean;
    let keys: { recipientKey: string; originKey: string };
    try {
      // Transacción corta separada; nunca adquirir locks de cuotas bajo SystemState/User.
      admitted = (await this.rates.admitMail(account.email, 'VERIFY_EMAIL', input.origin, 'ADMISSION')).allowed;
      keys = this.rates.mailKeys(account.email, 'VERIFY_EMAIL', input.origin, 'SMTP');
    } catch { throw new BootstrapUnavailable(); }

    for (let attempt = 0; ; attempt++) {
      let client: PoolClient | undefined;
      let connectionFailed = false;
      const onConnectionError = () => { connectionFailed = true; };
      try {
        client = await this.pool.connect();
        // pg emite errores también sobre clientes prestados, no solo sobre el pool o query.
        client.on('error',onConnectionError);
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '3s'");
        const state = (await client.query<BootstrapState>(
          'SELECT "bootstrapCompletedAt","firstAdminUserId" FROM "SystemState" WHERE id=1 FOR UPDATE')).rows[0];
        if (!state) throw new BootstrapUnavailable();
        const hasAdmin = (await client.query<{ exists: boolean }>(
          'SELECT EXISTS (SELECT 1 FROM "User" WHERE role=\'ADMIN\') AS exists')).rows[0].exists;
        requireUninitialized(state, hasAdmin);
        const now = (await client.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0].now;
        const userId = (await client.query<{ id: string }>(`INSERT INTO "User"
          (name,email,"emailCanonical",role,status,"mustSetPassword","provisionalPasswordHash",
            "provisionalExpiresAt","createdAt","updatedAt")
          VALUES ($1,$2,$3,'ADMIN','ACTIVE',true,$4,$5,$6,$6) RETURNING id`,
        [account.name,account.email,account.emailCanonical,input.provisionalPasswordHash,provisionalExpiresAt(now),now])).rows[0].id;
        await this.audit.write(client, { actorKind: 'SYSTEM_BOOTSTRAP', actorUserId: null,
          targetUserId: userId, action: 'BOOTSTRAP_ADMIN_CREATED', result: 'APPLIED', requestId: input.requestId });
        if (admitted) {
          const tokenId = (await client.query<{ id: string }>(`INSERT INTO "ActionToken"
            ("userId",purpose,"tokenHash","emailCanonicalSnapshot","createdAt","expiresAt")
            VALUES ($1,'VERIFY_EMAIL',$2,$3,$4,$5) RETURNING id`,
          [userId,Buffer.from(input.verification.tokenHash),account.emailCanonical,now,actionExpiresAt('VERIFY_EMAIL',now)])).rows[0].id;
          const payload = input.verification.payload;
          await client.query(`INSERT INTO "MailDelivery" ("tokenId","recipientKey","originKey",
            "encryptedPayload",nonce,"authTag","keyId","createdAt","nextAttemptAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
          [tokenId,keys.recipientKey,keys.originKey,Buffer.from(payload.encryptedPayload),Buffer.from(payload.nonce),
            Buffer.from(payload.authTag),payload.keyId,now]);
        }
        await client.query('UPDATE "SystemState" SET "bootstrapCompletedAt"=$1,"firstAdminUserId"=$2 WHERE id=1', [now,userId]);
        await client.query('COMMIT');
        return { userId, email: account.email, verificationQueued: admitted };
      } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => undefined);
        if (error instanceof BootstrapAlreadyInitialized) throw error;
        if (attempt >= 2 || !transient(error)) throw new BootstrapUnavailable();
      } finally {
        if (client) {
          client.release(connectionFailed);
          client.removeListener('error',onConnectionError);
        }
      }
      // Solo rollback confirmado por PostgreSQL se reintenta; no repetir commit de resultado ambiguo.
      await pause(randomInt(5,26));
    }
  }
}
