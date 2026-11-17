import { daysBeforeYear, daysInMonth } from './calendar.js';
/** Instante exacto desde epoch, independiente del reloj/zona del proceso. */
export type InstantUs = bigint;
export class InstantInputError extends Error { readonly code = 'INVALID_INSTANT'; }
export const RESERVATION_DURATION_US = 86_400_000_000n;
const EPOCH_DAY = 719162n;
const MAX_DAY = daysBeforeYear(1000000n);
function floorDivide(value: bigint, divisor: bigint): bigint {
  const quotient = value / divisor;
  return value % divisor < 0n ? quotient - 1n : quotient;
}
/** Transporte canónico: 0001–9999 o año ampliado positivo de seis cifras. */
export function parseInstant(value: unknown): InstantUs {
  if (typeof value !== 'string') throw new InstantInputError();
  const match = /^(\d{4}|\+\d{6})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/.exec(value);
  if (!match || match[0] !== value) throw new InstantInputError();
  const [year, month, day, hour, minute, second, fraction] = match.slice(1).map(BigInt);
  if (year < 1n || (match[1].startsWith('+') && year < 10000n) || month < 1n || month > 12n
    || day < 1n || day > daysInMonth(year, month) || hour > 23n || minute > 59n || second > 59n) throw new InstantInputError();
  let ordinal = daysBeforeYear(year) + day - 1n;
  for (let m = 1n; m < month; m++) ordinal += daysInMonth(year, m);
  return (ordinal - EPOCH_DAY) * RESERVATION_DURATION_US + (hour * 3600n + minute * 60n + second) * 1_000_000n + fraction;
}
export function formatInstant(value: InstantUs): string {
  if (typeof value !== 'bigint') throw new InstantInputError();
  const epochDays = floorDivide(value, RESERVATION_DURATION_US);
  let day = epochDays + EPOCH_DAY;
  if (day < 0n || day >= MAX_DAY) throw new InstantInputError();
  // Ciclos gregorianos completos; como máximo 399 iteraciones, incluso para años ampliados.
  let year = day / 146097n * 400n + 1n;
  day %= 146097n;
  while (day >= daysBeforeYear(year + 1n) - daysBeforeYear(year)) {
    day -= daysBeforeYear(year + 1n) - daysBeforeYear(year); year++;
  }
  let month = 1n;
  while (day >= daysInMonth(year, month)) { day -= daysInMonth(year, month); month++; }
  const remainder = value - epochDays * RESERVATION_DURATION_US;
  const seconds = remainder / 1_000_000n;
  const pad = (n: bigint, width = 2) => n.toString().padStart(width, '0');
  const y = year <= 9999n ? pad(year, 4) : '+' + pad(year, 6);
  return `${y}-${pad(month)}-${pad(day + 1n)}T${pad(seconds / 3600n)}:${pad(seconds / 60n % 60n)}:${pad(seconds % 60n)}.${pad(remainder % 1_000_000n, 6)}Z`;
}
export function reservationExpiresAt(confirmedAt: InstantUs): InstantUs { return confirmedAt + RESERVATION_DURATION_US; }
export function containsInstant(start: InstantUs, end: InstantUs, at: InstantUs): boolean { return start <= at && at < end; }
export function beforeDeadline(at: InstantUs, deadline: InstantUs): boolean { return at < deadline; }
