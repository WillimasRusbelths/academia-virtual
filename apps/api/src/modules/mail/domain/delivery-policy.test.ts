import { expect, test } from 'vitest';
import { MAIL_WINDOW_MS, mailLimit } from './delivery-policy.js';
const now = 4_000_000;

test('mínimo de 60 s exactos por destinatario y propósito', () => {
  expect(mailLimit([now - 59_999], [], now)).toEqual({ allowed: false, retryAfterSeconds: 1, nextAllowedAt: now + 1 });
  expect(mailLimit([now - 60_000], [], now).allowed).toBe(true);
});

test('cinco por hora con ventana móvil, frontera exacta y Retry-After según ambos límites', () => {
  const events = [now - 3600_000 + 1000, now - 3000_000, now - 2400_000, now - 1800_000, now - 59_000];
  expect(mailLimit(events, [], now).retryAfterSeconds).toBe(1);
  expect(mailLimit(events, [], now + 1000).allowed).toBe(true);
  expect(mailLimit(Array(5).fill(now - MAIL_WINDOW_MS), [], now).allowed).toBe(true);
  expect(mailLimit(Array(6).fill(now - 120_000), [], now).allowed).toBe(false);
});

test('veinte por origen sumando propósitos; la cuota limita aun con destinatario nuevo', () => {
  expect(mailLimit([], Array(19).fill(now), now).allowed).toBe(true);
  expect(mailLimit([], Array(20).fill(now), now).retryAfterSeconds).toBe(3600);
  expect(mailLimit([], Array(20).fill(now), now + MAIL_WINDOW_MS).allowed).toBe(true);
  expect(mailLimit([now + 1], [now + 1], now).allowed).toBe(true);
});
