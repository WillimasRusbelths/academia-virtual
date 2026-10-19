export const LOGIN_WINDOW_MS = 15 * 60_000;
export const LOGIN_BLOCK_MS = LOGIN_WINDOW_MS;
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_RESERVATION_MS = 30_000;

export interface LoginEvent {
  occurredAt: number;
  status: 'RESERVED' | 'FAILED' | 'ACCEPTED';
  reservationExpiresAt: number | null;
}
export interface LoginLimit {
  allowed: boolean;
  retryAfterSeconds: number;
  blockedUntil: number | null;
}

/** El reloj se recibe del llamador; una reserva vencida cuenta en el instante de vencimiento. */
export function loginLimit(events: readonly LoginEvent[], blockedUntil: number | null, now: number): LoginLimit {
  if (!Number.isFinite(now)) throw new Error('Instante inválido.');
  const failures = events.flatMap(event => {
    if (event.status === 'FAILED') return [event.occurredAt];
    if (event.status === 'RESERVED' && event.reservationExpiresAt !== null && event.reservationExpiresAt <= now) {
      return [event.reservationExpiresAt];
    }
    return [];
  }).filter(instant => instant > now - LOGIN_WINDOW_MS && instant <= now).sort((a, b) => a - b);
  const block = blockedUntil !== null && blockedUntil > now ? blockedUntil
    : failures.length >= LOGIN_MAX_FAILURES ? failures[LOGIN_MAX_FAILURES - 1] + LOGIN_BLOCK_MS : null;
  if (block !== null && block > now) return { allowed: false, retryAfterSeconds: Math.ceil((block - now) / 1000), blockedUntil: block };
  const pending = events.filter(event => event.status === 'RESERVED' && event.occurredAt <= now
    && event.reservationExpiresAt !== null && event.reservationExpiresAt > now);
  if (failures.length + pending.length >= LOGIN_MAX_FAILURES) {
    const availableAt = Math.min(...failures.map(instant => instant + LOGIN_WINDOW_MS), ...pending.map(event => event.reservationExpiresAt!));
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((availableAt - now) / 1000)), blockedUntil: null };
  }
  return { allowed: true, retryAfterSeconds: 0, blockedUntil: null };
}

export function failuresAfterSuccess(events: readonly LoginEvent[]): LoginEvent[] {
  return events.filter(event => event.status !== 'FAILED');
}
