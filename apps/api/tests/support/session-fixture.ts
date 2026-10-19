import { randomUUID } from 'node:crypto';
import { hash, argon2id } from 'argon2';
import type { identityDatabase } from './identity-database.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import type { Role } from '../../src/modules/users/public/account.js';

export type IdentityTestDatabase = Awaited<ReturnType<typeof identityDatabase>>;
let passwordHash: Promise<string> | undefined;

/** Solo fixtures en esquemas aislados; no existe comando o ruta de producto equivalente. */
export async function sessionFixture(context: IdentityTestDatabase, role: Role = 'STUDENT') {
  passwordHash ??= hash(randomUUID(), { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const email = `${randomUUID()}@example.test`;
  const user = await context.database.pool.query<{ id: string }>(`INSERT INTO "User"
    (name, email, "emailCanonical", role, "passwordHash", "emailVerifiedAt")
    VALUES ('Persona de ensayo', $1, $1, $2, $3, statement_timestamp()) RETURNING id`, [email, role, await passwordHash]);
  const issued = accessSecrets.issue();
  const session = await context.database.pool.query<{ id: string }>(`INSERT INTO "Session"
    ("tokenHash", "userId", "authVersion", "createdAt", "lastAcceptedAt", "absoluteExpiresAt")
    VALUES ($1, $2, 0, statement_timestamp() - interval '1 minute',
      statement_timestamp() - interval '1 minute', statement_timestamp() - interval '1 minute' + interval '8 hours')
    RETURNING id`, [Buffer.from(issued.digest), user.rows[0]!.id]);
  return { secret: issued.secret, userId: user.rows[0]!.id, sessionId: session.rows[0]!.id };
}

export async function activity(context: IdentityTestDatabase, sessionId: string) {
  const result = await context.database.pool.query<{ lastAcceptedAt: Date; absoluteExpiresAt: Date; revokedAt: Date | null }>(
    'SELECT "lastAcceptedAt", "absoluteExpiresAt", "revokedAt" FROM "Session" WHERE id = $1', [sessionId]);
  return result.rows[0]!;
}
