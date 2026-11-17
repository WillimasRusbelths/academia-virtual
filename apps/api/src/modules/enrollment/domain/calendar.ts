/** Calendario gregoriano puro. La conversión regional pertenece a PostgreSQL. */
export class CivilDateInputError extends Error { readonly code = 'INVALID_CIVIL_DATE'; }
export function daysInMonth(year: bigint, month: bigint): bigint {
  if (month === 2n) return year % 4n === 0n && (year % 100n !== 0n || year % 400n === 0n) ? 29n : 28n;
  return [4n, 6n, 9n, 11n].includes(month) ? 30n : 31n;
}
/** Días antes del año positivo; no usa división truncada sobre negativos. */
export function daysBeforeYear(year: bigint): bigint {
  const prior = year - 1n;
  return prior * 365n + prior / 4n - prior / 100n + prior / 400n;
}
export function civilDate(value: unknown): string {
  if (typeof value !== 'string' || value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new CivilDateInputError();
  const [year, month, day] = value.split('-').map(BigInt);
  if (year < 1n || month < 1n || month > 12n || day < 1n || day > daysInMonth(year, month)) throw new CivilDateInputError();
  return value;
}
export function nextCivilDate(value: unknown): string {
  let [year, month, day] = civilDate(value).split('-').map(BigInt);
  day++;
  if (day > daysInMonth(year, month)) { day = 1n; month++; }
  if (month > 12n) { month = 1n; year++; }
  const y = year === 10000n ? '+010000' : year.toString().padStart(4, '0');
  return `${y}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}
