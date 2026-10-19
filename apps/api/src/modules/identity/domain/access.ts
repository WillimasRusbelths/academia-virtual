import type { AccountStatus } from '../../users/public/account.js';

export const IDLE_SESSION_MS = 30 * 60_000;
export const ABSOLUTE_SESSION_MS = 8 * 60 * 60_000;
export const VERIFY_EMAIL_MS = 24 * 60 * 60_000;
export const RESET_PASSWORD_MS = 30 * 60_000;
export const PROVISIONAL_PASSWORD_MS = VERIFY_EMAIL_MS;
export type TokenPurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

export interface AccountAccess {
  status: AccountStatus;
  emailCanonical: string;
  emailVerifiedAt: Date | null;
  mustSetPassword: boolean;
  passwordHash: string | null;
  authVersion: bigint;
  createdAt: Date;
  provisionalPasswordHash?: string | null;
  provisionalExpiresAt?: Date | null;
}

export interface SessionAccess {
  authVersion: bigint;
  createdAt: Date;
  lastAcceptedAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
}

export interface ActionAccess {
  purpose: TokenPurpose;
  emailCanonicalSnapshot: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
}

function before(now: Date, expiry: Date): boolean {
  return Number.isFinite(now.getTime()) && Number.isFinite(expiry.getTime()) && now.getTime() < expiry.getTime();
}

export function canAccessApplication(account: AccountAccess): boolean {
  return account.status === 'ACTIVE' && account.emailVerifiedAt !== null
    && Number.isFinite(account.emailVerifiedAt.getTime()) && !account.mustSetPassword && account.passwordHash !== null;
}

export function canUseSession(account: AccountAccess, session: SessionAccess, now: Date): boolean {
  return canAccessApplication(account) && session.revokedAt === null && account.authVersion === session.authVersion
    && now.getTime() >= session.createdAt.getTime()
    && before(now, session.absoluteExpiresAt)
    && before(now, new Date(session.createdAt.getTime() + ABSOLUTE_SESSION_MS))
    && before(now, new Date(session.lastAcceptedAt.getTime() + IDLE_SESSION_MS));
}

export function canUseProvisionalPassword(account: AccountAccess, now: Date): boolean {
  return account.status === 'ACTIVE' && account.mustSetPassword && !!account.provisionalPasswordHash
    && !!account.provisionalExpiresAt && now.getTime() >= account.createdAt.getTime()
    && before(now, account.provisionalExpiresAt) && before(now, provisionalExpiresAt(account.createdAt));
}

export function provisionalExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PROVISIONAL_PASSWORD_MS);
}

export function actionExpiresAt(purpose: TokenPurpose, createdAt: Date): Date {
  if (purpose !== 'VERIFY_EMAIL' && purpose !== 'RESET_PASSWORD') throw new Error('Propósito inválido.');
  return new Date(createdAt.getTime() + (purpose === 'VERIFY_EMAIL' ? VERIFY_EMAIL_MS : RESET_PASSWORD_MS));
}

export function canConsumeAction(account: AccountAccess, token: ActionAccess, purpose: TokenPurpose, now: Date): boolean {
  return (purpose === 'VERIFY_EMAIL' || purpose === 'RESET_PASSWORD') && account.status === 'ACTIVE'
    && token.purpose === purpose && token.emailCanonicalSnapshot === account.emailCanonical
    && token.consumedAt === null && token.revokedAt === null && now.getTime() >= token.createdAt.getTime()
    && before(now, token.expiresAt) && before(now, actionExpiresAt(purpose, token.createdAt))
    && (purpose !== 'RESET_PASSWORD' || (account.emailVerifiedAt !== null && Number.isFinite(account.emailVerifiedAt.getTime())));
}
