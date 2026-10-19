export type MailLimitPhase = 'ADMISSION' | 'SMTP';
export const MAIL_INTERVAL_MS = 60_000;
export const MAIL_WINDOW_MS = 60 * 60_000;
export const MAIL_RECIPIENT_MAX = 5;
export const MAIL_ORIGIN_MAX = 20;

export function mailLimit(recipientEvents: readonly number[], originEvents: readonly number[], now: number) {
  if (!Number.isFinite(now)) throw new Error('Instante inválido.');
  const recent = (events: readonly number[]) => events.filter(instant => instant > now - MAIL_WINDOW_MS && instant <= now).sort((a, b) => b - a);
  const recipient = recent(recipientEvents);
  const origin = recent(originEvents);
  const nextAllowedAt = Math.max(now, recipient.length ? recipient[0] + MAIL_INTERVAL_MS : now,
    recipient.length >= MAIL_RECIPIENT_MAX ? recipient[MAIL_RECIPIENT_MAX - 1] + MAIL_WINDOW_MS : now,
    origin.length >= MAIL_ORIGIN_MAX ? origin[MAIL_ORIGIN_MAX - 1] + MAIL_WINDOW_MS : now);
  return { allowed: nextAllowedAt === now, retryAfterSeconds: Math.ceil((nextAllowedAt - now) / 1000), nextAllowedAt };
}
