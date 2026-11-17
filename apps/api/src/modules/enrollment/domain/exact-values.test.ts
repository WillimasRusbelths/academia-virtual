import { expect, test } from 'vitest';
import { parseInstant, formatInstant, InstantInputError } from './instant.js';
import { sumPenMinor, MoneyInputError } from './money.js';

test('T009 ciclos gregorianos y microsegundos sobreviven un round trip en todo el rango', () => {
  for (const year of ['0001', '0099', '0100', '0400', '1600', '1900', '2000', '2400', '9999', '+010000', '+100000', '+999999']) {
    for (const date of ['01-01', '02-28', '03-01', '12-31']) {
      for (const time of ['00:00:00.000000', '12:34:56.123456', '23:59:59.999999']) {
        const text = `${year}-${date}T${time}Z`;
        expect(formatInstant(parseInstant(text))).toBe(text);
      }
    }
  }
});
test.each(['+000001-01-01T00:00:00.000000Z', '+009999-12-31T23:59:59.999999Z',
  '+010000-02-30T00:00:00.000000Z', '2000-01-01T00:00:60.000000Z', '2000-01-01T00:00:00.000000Z\n'])(
  'T009 rechaza transporte no canónico %s', value => { expect(() => parseInstant(value)).toThrow(InstantInputError); });
test('T009 formatter falla fuera del rango de representación, sin saturar', () => {
  expect(() => formatInstant(parseInstant('0001-01-01T00:00:00.000000Z') - 1n)).toThrow(InstantInputError);
  expect(() => formatInstant(parseInstant('+999999-12-31T23:59:59.999999Z') + 1n)).toThrow(InstantInputError);
});
test('T009 sumas no ocultan importes negativos o entradas internas no bigint', () => {
  expect(() => sumPenMinor([1n, -1n])).toThrow(MoneyInputError);
  expect(() => sumPenMinor([1 as unknown as bigint])).toThrow(MoneyInputError);
  expect(sumPenMinor([])).toBe(0n);
});
