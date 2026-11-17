import { test, expect } from 'vitest';
import { civilDate, nextCivilDate, CivilDateInputError } from './calendar.js';

function expectCivilError(operation: () => unknown) {
  let received: unknown;
  try { operation(); } catch (error) { received = error; }
  expect(received instanceof CivilDateInputError,
    `Se exige CivilDateInputError; recibido: ${received instanceof Error ? received.message : 'ningún error'}`).toBe(true);
}

test.each(['0001-01-01', '1900-02-28', '2000-02-29', '2024-02-29', '9999-12-31'])(
  'TV08 acepta fecha civil %s', value => { expect(civilDate(value)).toBe(value); });

test.each([
  ['2026-01-31', '2026-02-01'], ['2024-02-28', '2024-02-29'],
  ['2024-02-29', '2024-03-01'], ['1900-02-28', '1900-03-01'],
  ['2000-02-28', '2000-02-29'], ['2026-12-31', '2027-01-01'],
  ['0001-01-01', '0001-01-02'], ['9999-12-31', '+010000-01-01'],
] as const)('TV08 día civil posterior a %s', (value, expected) => { expect(nextCivilDate(value)).toBe(expected); });

test.each([
  ['bisiesto imposible', '1900-02-29'], ['fecha imposible', '2026-04-31'],
  ['año cero', '0000-01-01'], ['año civil fuera de rango', '+010000-01-01'],
  ['sin ceros', '2026-1-1'], ['timestamp', '2026-01-01T00:00:00Z'],
  ['null', null], ['número', 20260101],
])('TV08 fecha inválida: %s', (_label, value) => { expectCivilError(() => civilDate(value)); });

test('TV08 no normaliza una fecha final inválida al calcular su límite', () => {
  expectCivilError(() => nextCivilDate('2026-02-30'));
});
