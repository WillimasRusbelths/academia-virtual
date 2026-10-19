import { expect, test } from 'vitest';
import { LOGIN_BLOCK_MS, LOGIN_RESERVATION_MS, LOGIN_WINDOW_MS, failuresAfterSuccess, loginLimit } from './limits.js';
import type { LoginEvent } from './limits.js';
const now = 2_000_000;
const failed = (time = now): LoginEvent => ({ occurredAt: time, status: 'FAILED', reservationExpiresAt: null });

test('quinto fallo bloquea 15 minutos; solicitudes rechazadas no prolongan bloqueo', () => {
  expect(loginLimit(Array.from({ length: 4 }, () => failed()), null, now).allowed).toBe(true);
  const initial = loginLimit(Array.from({ length: 5 }, () => failed()), null, now);
  expect(initial).toEqual({ allowed: false, retryAfterSeconds: 900, blockedUntil: now + LOGIN_BLOCK_MS });
  expect(loginLimit(Array.from({ length: 5 }, () => failed()), initial.blockedUntil, now + 10_000).blockedUntil).toBe(initial.blockedUntil);
  expect(loginLimit(Array.from({ length: 5 }, () => failed()), initial.blockedUntil, now + LOGIN_BLOCK_MS).allowed).toBe(true);
});

test('ventana móvil: frontera inferior excluida y ninguna actividad futura', () => {
  expect(loginLimit(Array.from({ length: 5 }, () => failed(now - LOGIN_WINDOW_MS)), null, now).allowed).toBe(true);
  expect(loginLimit(Array.from({ length: 5 }, () => failed(now - LOGIN_WINDOW_MS + 1)), null, now).retryAfterSeconds).toBe(1);
  expect(loginLimit(Array.from({ length: 5 }, () => failed(now + 1)), null, now).allowed).toBe(true);
});

test('cinco reservas en vuelo consumen capacidad; al vencer se convierten en fallos conservadores', () => {
  const reservations: LoginEvent[] = Array.from({ length: 5 }, () => ({ occurredAt: now, status: 'RESERVED', reservationExpiresAt: now + LOGIN_RESERVATION_MS }));
  expect(loginLimit(reservations, null, now)).toEqual({ allowed: false, retryAfterSeconds: 30, blockedUntil: null });
  expect(loginLimit(reservations, null, now + LOGIN_RESERVATION_MS)).toEqual({ allowed: false, retryAfterSeconds: 900, blockedUntil: now + LOGIN_RESERVATION_MS + LOGIN_BLOCK_MS });
  expect(loginLimit(reservations, null, now + LOGIN_RESERVATION_MS + LOGIN_BLOCK_MS).allowed).toBe(true);
});

test('éxito elimina fallos sin eliminar reservas de solicitudes concurrentes', () => {
  const reserved: LoginEvent = { occurredAt: now, status: 'RESERVED', reservationExpiresAt: now + LOGIN_RESERVATION_MS };
  expect(failuresAfterSuccess([failed(), reserved])).toEqual([reserved]);
  expect(loginLimit(failuresAfterSuccess([failed(), reserved]), null, now).allowed).toBe(true);
});
