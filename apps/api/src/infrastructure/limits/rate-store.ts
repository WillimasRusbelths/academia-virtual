import { createHmac, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { Pool, PoolClient } from 'pg';
import { normalizeEmail } from '../../modules/users/public/account.js';
import { LOGIN_RESERVATION_MS, LOGIN_WINDOW_MS, failuresAfterSuccess, loginLimit } from '../../modules/identity/domain/limits.js';
import type { LoginEvent, LoginLimit } from '../../modules/identity/domain/limits.js';
import type { TokenPurpose } from '../../modules/identity/domain/access.js';
import { MAIL_WINDOW_MS, mailLimit } from '../../modules/mail/domain/delivery-policy.js';
import type { MailLimitPhase } from '../../modules/mail/domain/delivery-policy.js';

export class RateStoreUnavailable extends Error {
  readonly code = 'TEMPORARILY_UNAVAILABLE';
  constructor() { super('Servicio de límites temporalmente no disponible.'); }
}
export interface LoginReservation { bucketKey: string; eventId: string }
export type LoginAdmission = { allowed: true; retryAfterSeconds: 0; reservation: LoginReservation }
  | { allowed: false; retryAfterSeconds: number };
interface Bucket { key: string; scope: 'LOGIN_PAIR' | 'MAIL_RECIPIENT_PURPOSE' | 'MAIL_ORIGIN'; phase: MailLimitPhase }
interface StoredEvent { id: string; occurredAt: Date; status: LoginEvent['status']; reservationExpiresAt: Date | null }

function originKeyInput(origin: string): string {
  if (isIP(origin) === 4) return origin;
  if (isIP(origin) !== 6) throw new Error('Origen de red inválido.');
  const canonical = new URL(`http://[${origin}]`).hostname.slice(1, -1);
  const mapped = canonical.match(/^::ffff:([a-f0-9]+):([a-f0-9]+)$/);
  if (mapped) {
    const high = parseInt(mapped[1], 16); const low = parseInt(mapped[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return canonical;
}

/** Adaptador de cuotas, sin consultas de cuentas ni callbacks de hash/SMTP. */
export class PostgresRateStore {
  private readonly key: Buffer;
  constructor(private readonly pool: Pool, hmacKey: Uint8Array) {
    if (hmacKey.length !== 32) throw new Error('Clave de límites inválida.');
    this.key = Buffer.from(hmacKey);
  }

  private bucket(scope: Bucket['scope'], phase: MailLimitPhase, components: string[]): Bucket {
    return { scope, phase, key: createHmac('sha256', this.key).update(JSON.stringify([scope, phase, ...components])).digest('hex') };
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '3s'");
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch {
      if (client) await client.query('ROLLBACK').catch(() => undefined);
      throw new RateStoreUnavailable();
    } finally { client?.release(); }
  }

  private async lockBuckets(client: PoolClient, buckets: Bucket[]) {
    // Upsert y lock en el mismo orden: también evita carreras al crear los buckets.
    for (const bucket of [...buckets].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) {
      await client.query('INSERT INTO "RateBucket" (key,scope,phase) VALUES ($1,$2,$3) ON CONFLICT (key) DO NOTHING', [bucket.key, bucket.scope, bucket.phase]);
      await client.query('SELECT key FROM "RateBucket" WHERE key=$1 FOR UPDATE', [bucket.key]);
    }
  }

  private async now(client: PoolClient): Promise<Date> {
    // Tomar el reloj después de adquirir los locks, no al iniciar la transacción.
    return (await client.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0].now;
  }

  private async loginEvents(client: PoolClient, key: string, now: Date): Promise<StoredEvent[]> {
    await client.query(`UPDATE "RateEvent" SET status='FAILED',"occurredAt"="reservationExpiresAt","reservationExpiresAt"=NULL
      WHERE "bucketKey"=$1 AND status='RESERVED' AND "reservationExpiresAt" <= $2`, [key, now]);
    return (await client.query<StoredEvent>(`SELECT id,"occurredAt",status,"reservationExpiresAt" FROM "RateEvent"
      WHERE "bucketKey"=$1 AND ("occurredAt" > $2 OR status='RESERVED')`, [key, new Date(now.getTime() - LOGIN_WINDOW_MS)])).rows;
  }

  private async loginDecision(client: PoolClient, key: string, events: StoredEvent[], now: Date): Promise<LoginLimit> {
    const row = (await client.query<{ blockedUntil: Date | null }>('SELECT "blockedUntil" FROM "RateBucket" WHERE key=$1', [key])).rows[0];
    const result = loginLimit(events.map(event => ({ occurredAt: event.occurredAt.getTime(), status: event.status,
      reservationExpiresAt: event.reservationExpiresAt?.getTime() ?? null })), row.blockedUntil?.getTime() ?? null, now.getTime());
    await client.query('UPDATE "RateBucket" SET "blockedUntil"=$2 WHERE key=$1', [key, result.blockedUntil === null ? null : new Date(result.blockedUntil)]);
    return result;
  }

  async reserveLogin(email: string, origin: string): Promise<LoginAdmission> {
    const bucket = this.bucket('LOGIN_PAIR', 'ADMISSION', [normalizeEmail(email).emailCanonical, originKeyInput(origin)]);
    return this.transaction(async client => {
      await this.lockBuckets(client, [bucket]);
      const now = await this.now(client);
      const decision = await this.loginDecision(client, bucket.key, await this.loginEvents(client, bucket.key, now), now);
      if (!decision.allowed) return { allowed: false, retryAfterSeconds: decision.retryAfterSeconds };
      const eventId = randomUUID();
      await client.query(`INSERT INTO "RateEvent"(id,"bucketKey","occurredAt",status,"reservationExpiresAt","attemptId")
        VALUES ($1,$2,$3,'RESERVED',$4,$1)`, [eventId, bucket.key, now, new Date(now.getTime() + LOGIN_RESERVATION_MS)]);
      return { allowed: true, retryAfterSeconds: 0, reservation: { bucketKey: bucket.key, eventId } };
    });
  }

  async finishLogin(reservation: LoginReservation, succeeded: boolean): Promise<boolean> {
    if (!/^[a-f0-9]{64}$/.test(reservation.bucketKey) || !/^[a-f0-9-]{36}$/.test(reservation.eventId)) return false;
    return this.transaction(async client => {
      const locked = await client.query(`SELECT key FROM "RateBucket" WHERE key=$1 AND scope='LOGIN_PAIR' AND phase='ADMISSION' FOR UPDATE`, [reservation.bucketKey]);
      if (!locked.rowCount) return false;
      const now = await this.now(client);
      const events = await this.loginEvents(client, reservation.bucketKey, now);
      const event = events.find(event => event.id === reservation.eventId && event.status === 'RESERVED');
      if (!event) { await this.loginDecision(client, reservation.bucketKey, events, now); return false; }
      await client.query(`UPDATE "RateEvent" SET status=$2,"occurredAt"=$3,"reservationExpiresAt"=NULL WHERE id=$1`,
        [event.id, succeeded ? 'ACCEPTED' : 'FAILED', now]);
      if (succeeded) {
        const cleaned = failuresAfterSuccess(events.filter(candidate => candidate.id !== event.id).map(event => ({ occurredAt: event.occurredAt.getTime(), status: event.status,
          reservationExpiresAt: event.reservationExpiresAt?.getTime() ?? null })));
        // La regla pura conserva reservas concurrentes; solo se limpian los fallos.
        await client.query(`DELETE FROM "RateEvent" WHERE "bucketKey"=$1 AND status='FAILED'`, [reservation.bucketKey]);
        await client.query('UPDATE "RateBucket" SET "blockedUntil"=$2 WHERE key=$1', [reservation.bucketKey, loginLimit(cleaned, null, now.getTime()).blockedUntil]);
      } else await this.loginDecision(client, reservation.bucketKey, await this.loginEvents(client, reservation.bucketKey, now), now);
      return true;
    });
  }

  async admitMail(email: string, purpose: TokenPurpose, origin: string, phase: MailLimitPhase) {
    if (!['VERIFY_EMAIL', 'RESET_PASSWORD'].includes(purpose) || !['ADMISSION', 'SMTP'].includes(phase)) {
      throw new Error('Ámbito de cuota inválido.');
    }
    const recipient = this.bucket('MAIL_RECIPIENT_PURPOSE', phase, [normalizeEmail(email).emailCanonical, purpose]);
    const sender = this.bucket('MAIL_ORIGIN', phase, [originKeyInput(origin)]);
    return this.transaction(async client => {
      await this.lockBuckets(client, [recipient, sender]);
      const now = await this.now(client);
      const times = async (key: string): Promise<number[]> => (await client.query<{ occurredAt: Date }>(`SELECT "occurredAt" FROM "RateEvent"
        WHERE "bucketKey"=$1 AND "occurredAt" > $2`, [key, new Date(now.getTime() - MAIL_WINDOW_MS)])).rows.map(row => row.occurredAt.getTime());
      const decision = mailLimit(await times(recipient.key), await times(sender.key), now.getTime());
      if (decision.allowed) {
        const attempt = randomUUID();
        for (const bucket of [recipient, sender]) await client.query(`INSERT INTO "RateEvent"("bucketKey","occurredAt",status,"attemptId") VALUES ($1,$2,'ACCEPTED',$3)`, [bucket.key, now, attempt]);
      }
      return decision;
    });
  }
}
