import { expect, test } from 'vitest';
import { parseInstant, formatInstant, reservationExpiresAt, containsInstant, beforeDeadline, InstantInputError } from './instant.js';

function expectInstantError(operation: () => unknown) {
  let received: unknown;
  try { operation(); } catch (error) { received = error; }
  expect(received instanceof InstantInputError,
    `Se exige InstantInputError; recibido: ${received instanceof Error ? received.message : 'ningún error'}`).toBe(true);
}

test.each([
  ['1970-01-01T00:00:00.000000Z', 0n],
  ['1970-01-01T00:00:00.000001Z', 1n],
  ['1969-12-31T23:59:59.999999Z', -1n],
  ['1969-12-31T23:59:58.999999Z', -1_000_001n],
  ['0001-01-01T00:00:00.000000Z', -62_135_596_800_000_000n],
  ['2000-01-01T00:00:00.000000Z', 946_684_800_000_000n],
  ['+010000-01-01T05:00:00.000000Z', 253_402_318_800_000_000n],
] as const)('TV07/08 parser exacto %s', (text, expected) => {
  expect(parseInstant(text)).toBe(expected);
});

test.each([
  [0n, '1970-01-01T00:00:00.000000Z'],
  [-1n, '1969-12-31T23:59:59.999999Z'],
  [-1_000_001n, '1969-12-31T23:59:58.999999Z'],
  [999_999n, '1970-01-01T00:00:00.999999Z'],
  [1_000_000n, '1970-01-01T00:00:01.000000Z'],
  [253_402_318_800_000_000n, '+010000-01-01T05:00:00.000000Z'],
] as const)('TV07/08 formatter exacto %s', (value, expected) => {
  expect(formatInstant(value)).toBe(expected);
});

test.each([0n, -1n, 999_999n, -1_000_001n])('TV01 duración de 86400 segundos desde %s', confirmedAt => {
  expect(reservationExpiresAt(confirmedAt) - confirmedAt).toBe(86_400_000_000n);
});

test.each([
  ['antes del inicio', -1n, false], ['inicio inclusivo', 0n, true],
  ['un microsegundo antes del fin', 86_399_999_999n, true],
  ['fin exclusivo', 86_400_000_000n, false], ['después del fin', 86_400_000_001n, false],
] as const)('TV02/05 intervalo: %s', (_label, at, expected) => {
  expect(containsInstant(0n, 86_400_000_000n, at)).toBe(expected);
});

test.each([
  ['antes', -1n, true], ['igual', 0n, false], ['después', 1n, false],
] as const)('TV03/04 comparación estricta de pago/corte: %s', (_label, at, expected) => {
  // Solo predicado temporal; no atribuye reserva, pago ni matrícula al helper.
  expect(beforeDeadline(at, 0n)).toBe(expected);
});

test.each([
  ['infinito', 'infinity'], ['infinito negativo', '-infinity'], ['NaN', Number.NaN],
  ['número infinito', Number.POSITIVE_INFINITY], ['null', null], ['número', 0],
  ['precisión sobrante', '1970-01-01T00:00:00.0000001Z'],
  ['fecha imposible', '2025-02-29T00:00:00.000000Z'],
  ['mes imposible', '2026-13-01T00:00:00.000000Z'],
  ['hora imposible', '2026-01-01T24:00:00.000000Z'],
  ['año cero', '0000-01-01T00:00:00.000000Z'],
  ['offset no canónico', '1970-01-01T00:00:00.000000-05:00'],
  ['fracción no canónica', '1970-01-01T00:00:00.000Z'],
])('TV07 rechaza %s sin normalizar/redondear', (_label, value) => {
  expectInstantError(() => parseInstant(value));
});

test('TV07 conserva acarreo al siguiente segundo, sin pasar por Date', () => {
  expect(formatInstant(parseInstant('1969-12-31T23:59:59.999999Z') + 1n)).toBe('1970-01-01T00:00:00.000000Z');
});
