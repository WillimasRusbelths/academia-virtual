/** PEN exacto, sin mínimos comerciales ni reglas de matrícula. */
export interface PenPrice { readonly amountMinor: bigint; readonly currency: 'PEN' }
export class MoneyInputError extends Error { readonly code = 'INVALID_MONEY'; }
export class PriceNotDefined extends Error { readonly code = 'PRICE_NOT_DEFINED'; }
export function parsePenMinor(value: unknown): bigint {
  if (typeof value !== 'string' || value.trim() !== value || !/^(0|[1-9]\d*)$/.test(value)) throw new MoneyInputError();
  return BigInt(value);
}
export function sumPenMinor(values: readonly bigint[]): bigint {
  return Array.from(values).reduce((total, value) => {
    if (typeof value !== 'bigint' || value < 0n) throw new MoneyInputError();
    return total + value;
  }, 0n);
}
export function penPrice(value: { amountMinor: unknown; currency: unknown } | null): PenPrice {
  if (value === null) throw new PriceNotDefined();
  if (!value || value.currency !== 'PEN') throw new MoneyInputError();
  return Object.freeze({ amountMinor: parsePenMinor(value.amountMinor), currency: 'PEN' });
}
