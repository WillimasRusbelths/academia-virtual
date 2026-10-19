import { expect, test } from 'vitest';
import { ABSOLUTE_SESSION_MS, IDLE_SESSION_MS, actionExpiresAt, canAccessApplication, canConsumeAction, canUseProvisionalPassword, canUseSession, provisionalExpiresAt } from './access.js';
import type { AccountAccess, ActionAccess, SessionAccess } from './access.js';

const createdAt = new Date('2026-01-01T00:00:00Z');
const account: AccountAccess = { status: 'ACTIVE', emailCanonical: 'fixture@example.test', emailVerifiedAt: createdAt,
  mustSetPassword: false, passwordHash: 'hash-presente', authVersion: 2n, createdAt };
const session: SessionAccess = { authVersion: 2n, createdAt, lastAcceptedAt: createdAt,
  absoluteExpiresAt: new Date(createdAt.getTime() + ABSOLUTE_SESSION_MS), revokedAt: null };

test('elegibilidad exige cuenta activa, correo verificado y contraseña propia', () => {
  expect(canAccessApplication(account)).toBe(true);
  for (const patch of [{ status: 'DISABLED' as const }, { emailVerifiedAt: null }, { mustSetPassword: true }, { passwordHash: null }]) {
    expect(canAccessApplication({ ...account, ...patch })).toBe(false);
    expect(canUseSession({ ...account, ...patch }, session, createdAt)).toBe(false);
  }
});

test('sesión vence exactamente a 30 minutos; no cambia ni renueva sus fechas', () => {
  expect(canUseSession(account, session, new Date(createdAt.getTime() + IDLE_SESSION_MS - 1))).toBe(true);
  expect(canUseSession(account, session, new Date(createdAt.getTime() + IDLE_SESSION_MS))).toBe(false);
  expect(canUseSession(account, { ...session, authVersion: 1n }, createdAt)).toBe(false);
  expect(canUseSession(account, { ...session, revokedAt: createdAt }, createdAt)).toBe(false);
  expect(canUseSession(account, session, new Date(createdAt.getTime() - 1))).toBe(false);
  expect(session.lastAcceptedAt).toBe(createdAt);
});

test('sesión vence a ocho horas aunque haya actividad reciente', () => {
  const recent = { ...session, lastAcceptedAt: new Date(createdAt.getTime() + ABSOLUTE_SESSION_MS - 1000) };
  expect(canUseSession(account, recent, new Date(createdAt.getTime() + ABSOLUTE_SESSION_MS - 1))).toBe(true);
  expect(canUseSession(account, recent, new Date(createdAt.getTime() + ABSOLUTE_SESSION_MS))).toBe(false);
});

test.each(['VERIFY_EMAIL', 'RESET_PASSWORD'] as const)('acción %s: propósito, destinatario, vigencia y uso único', purpose => {
  const token: ActionAccess = { purpose, createdAt, expiresAt: actionExpiresAt(purpose, createdAt),
    emailCanonicalSnapshot: account.emailCanonical, consumedAt: null, revokedAt: null };
  expect(token.expiresAt.getTime() - createdAt.getTime()).toBe(purpose === 'VERIFY_EMAIL' ? 86_400_000 : 1_800_000);
  expect(canConsumeAction(account, token, purpose, new Date(token.expiresAt.getTime() - 1))).toBe(true);
  expect(canConsumeAction(account, token, purpose, token.expiresAt)).toBe(false);
  for (const patch of [{ consumedAt: createdAt }, { revokedAt: createdAt }, { emailCanonicalSnapshot: 'otro@example.test' }]) {
    expect(canConsumeAction(account, { ...token, ...patch }, purpose, createdAt)).toBe(false);
  }
  expect(canConsumeAction(account, token, purpose === 'VERIFY_EMAIL' ? 'RESET_PASSWORD' : 'VERIFY_EMAIL', createdAt)).toBe(false);
  expect(canConsumeAction({ ...account, status: 'DISABLED' }, token, purpose, createdAt)).toBe(false);
  expect(canConsumeAction({ ...account, emailVerifiedAt: null }, token, purpose, createdAt)).toBe(purpose === 'VERIFY_EMAIL');
});

test('credencial provisional vence a 24 h; no exige correo para establecer clave, ni concede sesión', () => {
  const pending = { ...account, mustSetPassword: true, emailVerifiedAt: null, passwordHash: null,
    provisionalPasswordHash: 'hash-presente', provisionalExpiresAt: provisionalExpiresAt(createdAt) };
  expect(pending.provisionalExpiresAt.getTime() - createdAt.getTime()).toBe(86_400_000);
  expect(canUseProvisionalPassword(pending, new Date(pending.provisionalExpiresAt.getTime() - 1))).toBe(true);
  expect(canUseProvisionalPassword(pending, pending.provisionalExpiresAt)).toBe(false);
  expect(canUseProvisionalPassword({ ...pending, status: 'DISABLED' }, createdAt)).toBe(false);
  expect(canAccessApplication(pending)).toBe(false);
  const verified = { ...pending, emailVerifiedAt: createdAt };
  const reset: ActionAccess = { purpose: 'RESET_PASSWORD', createdAt, expiresAt: actionExpiresAt('RESET_PASSWORD', createdAt), emailCanonicalSnapshot: account.emailCanonical, consumedAt: null, revokedAt: null };
  expect(canConsumeAction(verified, reset, 'RESET_PASSWORD', createdAt)).toBe(true);
});
