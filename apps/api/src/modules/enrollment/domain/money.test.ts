import { test, expect } from 'vitest';
import { parsePenMinor, sumPenMinor, penPrice, MoneyInputError, PriceNotDefined } from './money.js';

function expectMoneyError(operation: () => unknown, expected: typeof MoneyInputError | typeof PriceNotDefined = MoneyInputError) {
  let received: unknown;
  try { operation(); } catch (error) { received = error; }
  expect(received instanceof expected,
    `Se exige ${expected.name}; recibido: ${received instanceof Error ? received.message : 'ningún error'}`).toBe(true);
}

test.each([['0', 0n], ['1', 1n], ['12500', 12500n], ['9007199254740993', 9007199254740993n]] as const)(
  'PEN unidades menores exactas: %s', (value, expected) => { expect(parsePenMinor(value)).toBe(expected); });

test.each([
  ['negativo', '-1'], ['decimal', '1.25'], ['exponente', '1e2'], ['ceros iniciales', '01'],
  ['signo positivo', '+1'], ['vacío', ''], ['espacio', ' 1'], ['número', 1],
  ['null', null], ['NaN', Number.NaN], ['infinito', Number.POSITIVE_INFINITY],
])('PEN representación inválida: %s', (_label, value) => { expectMoneyError(() => parsePenMinor(value)); });

test('PEN suma por servidor más allá de Number.MAX_SAFE_INTEGER', () => {
  expect(sumPenMinor([9007199254740993n, 7n, 0n])).toBe(9007199254741000n);
});
test('ausencia de precio es explícita y no se sustituye por cero', () => { expectMoneyError(() => penPrice(null), PriceNotDefined); });
test('PEN cero explícito conserva representación sin inferir matrícula gratuita', () => {
  expect(penPrice({ amountMinor: '0', currency: 'PEN' })).toEqual({ amountMinor: 0n, currency: 'PEN' });
});
test('PEN precio exacto conserva moneda', () => {
  expect(penPrice({ amountMinor: '12500', currency: 'PEN' })).toEqual({ amountMinor: 12500n, currency: 'PEN' });
});
test.each(['USD', 'pen', '', null])('precio no acepta moneda ajena %s', currency => {
  expectMoneyError(() => penPrice({ amountMinor: '12500', currency }));
});
