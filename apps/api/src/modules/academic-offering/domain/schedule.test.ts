import { describe, expect, test } from 'vitest';
import { expectValidation, scheduleFixture, scheduleRule } from '../../../../tests/support/academic-rules-contract.js';
import type { ScheduleFixture } from '../../../../tests/support/academic-rules-contract.js';
import type { Slot } from '../public/offer.js';

const slot = (dayOfWeek: Slot['dayOfWeek'] = 1, startTime = '18:00', endTime = '19:00'): Slot => ({ dayOfWeek, startTime, endTime });

describe('T020 validación semanal — FR-003/004; PA-05; V-A02', () => {
  test('S01 borrador permite cero franjas y periodo todavía incompleto', () => {
    const validate = scheduleRule('validateSchedule');
    expect(() => validate(scheduleFixture({ periodStart: null, periodEnd: null, schedule: [] }))).not.toThrow();
  });
  test.each([
    ['2026-10-19', null], [null, '2026-10-25'], [null, null],
  ])('S02 periodo parcial %s/%s valida las franjas sin exigir publicación', (periodStart, periodEnd) => {
    const validate = scheduleRule('validateSchedule');
    expect(() => validate(scheduleFixture({ periodStart, periodEnd }))).not.toThrow();
  });
  test.each([
    [1, '2026-10-19'], [2, '2026-10-20'], [3, '2026-10-21'], [4, '2026-10-22'],
    [5, '2026-10-23'], [6, '2026-10-24'], [7, '2026-10-25'],
  ] as const)('S03 día ISO %s ocurre en periodo de un día inclusivo %s', (dayOfWeek, date) => {
    const validate = scheduleRule('validateSchedule');
    expect(() => validate(scheduleFixture({ periodStart: date, periodEnd: date, schedule: [slot(dayOfWeek)] }))).not.toThrow();
  });
  test.each([
    ['2024-02-29', 4], ['2000-02-29', 2], ['2026-12-31', 4], ['2027-01-01', 5],
  ] as const)('S04 fecha civil real %s, incluidos bisiesto y cambio de año', (date, dayOfWeek) => {
    const validate = scheduleRule('validateSchedule');
    expect(() => validate(scheduleFixture({ periodStart: date, periodEnd: date, schedule: [slot(dayOfWeek)] }))).not.toThrow();
  });
  test.each(['2026-02-29', '2100-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-10-00',
    '2026-1-9', '19/10/2026', '2026-10-19T00:00:00Z', ''])('S05 rechaza inicio civil inválido %j, sin rollover ni zona de navegador', periodStart => {
    const validate = scheduleRule('validateSchedule');
    expectValidation(() => validate(scheduleFixture({ periodStart })), 'periodStart');
  });
  test.each(['2026-02-30', '2026-11-31', '2026-10-25T00:00:00-05:00'])('S06 rechaza fin civil inválido %s', periodEnd => {
    const validate = scheduleRule('validateSchedule');
    expectValidation(() => validate(scheduleFixture({ periodEnd })), 'periodEnd');
  });
  test('S07 rechaza periodo invertido aunque no haya franjas', () => {
    const validate = scheduleRule('validateSchedule');
    expect(() => validate(scheduleFixture({ periodStart: '2026-10-25', periodEnd: '2026-10-19', schedule: [] })))
      .toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
  test.each(['UTC', 'America/Bogota', 'America/New_York', '', null])('S08 solo admite America/Lima, rechaza %j', timeZone => {
    const validate = scheduleRule('validateSchedule');
    expectValidation(() => validate({ ...scheduleFixture(), timeZone }), 'timeZone');
  });
  test.each([0, 8, -1, 1.5, '1', null])('S09 rechaza día ISO %j sin coerción', dayOfWeek => {
    const validate = scheduleRule('validateSchedule');
    expectValidation(() => validate({ ...scheduleFixture(), schedule: [{ ...slot(), dayOfWeek }] }), 'schedule');
  });
  test.each([
    ['00:00', '00:01'], ['23:58', '23:59'], ['00:00', '23:59'],
  ])('S10 acepta extremos dentro del día %s–%s', (startTime, endTime) => {
    const validate = scheduleRule('validateSchedule');
    expect(() => validate(scheduleFixture({ schedule: [slot(1, startTime, endTime)] }))).not.toThrow();
  });
  test.each(['24:00', '23:60', '-1:00', '9:00', '18:00:00', '18:00Z', '', null, 1080])('S11 rechaza hora inicial %j fuera del contrato HH:mm', startTime => {
    const validate = scheduleRule('validateSchedule');
    expectValidation(() => validate({ ...scheduleFixture(), schedule: [{ ...slot(), startTime }] }), 'schedule');
  });
  test.each(['24:00', '19:60', '19:00:00', '', null])('S12 rechaza hora final %j', endTime => {
    const validate = scheduleRule('validateSchedule');
    expectValidation(() => validate({ ...scheduleFixture(), schedule: [{ ...slot(), endTime }] }), 'schedule');
  });
  test.each([
    ['18:00', '18:00'], ['19:00', '18:00'], ['23:00', '01:00'], ['23:59', '00:00'], ['00:00', '00:00'],
  ])('S13 rechaza fin igual/invertido o medianoche %s–%s', (startTime, endTime) => {
    const validate = scheduleRule('validateSchedule');
    expectValidation(() => validate(scheduleFixture({ schedule: [slot(1, startTime, endTime)] })), 'schedule');
  });
  test.each([
    [slot(), slot()],
    [slot(), slot(1, '18:30', '19:30')],
    [slot(), slot(1, '17:00', '20:00')],
    [slot(1, '18:30', '18:45'), slot()],
  ])('S14 caso %# rechaza duplicados y solapamiento interno, incluso contención y orden inverso (%j)', (...schedule) => {
    const validate = scheduleRule('validateSchedule');
    expectValidation(() => validate(scheduleFixture({ schedule })), 'schedule');
  });
  test.each([
    [slot(), slot(1, '19:00', '20:00')],
    [slot(1, '19:00', '20:00'), slot()],
    [slot(), slot(2)],
    [slot(), slot(1, '20:00', '21:00')],
  ])('S15 caso %# permite adyacencia en ambos órdenes, distinto día o separación (%j)', (...schedule) => {
    const validate = scheduleRule('validateSchedule');
    expect(() => validate(scheduleFixture({ schedule }))).not.toThrow();
  });
  test('S16 exige ocurrencia de CADA franja; una válida no oculta otra fuera de periodo', () => {
    const validate = scheduleRule('validateSchedule');
    expectValidation(() => validate(scheduleFixture({ periodEnd: '2026-10-19', schedule: [slot(1), slot(2)] })), 'schedule');
  });
  test('S17 periodo inclusivo sin lunes rechaza la franja; no basta con fechas ordenadas', () => {
    const validate = scheduleRule('validateSchedule');
    expectValidation(() => validate(scheduleFixture({ periodStart: '2026-10-20', periodEnd: '2026-10-25' })), 'schedule');
  });
  test('S18 al cambiar el periodo se vuelve a validar el horario completo', () => {
    const validate = scheduleRule('validateSchedule'); const before = scheduleFixture();
    expect(() => validate(before)).not.toThrow();
    expectValidation(() => validate({ ...before, periodStart: '2026-10-20' }), 'schedule');
  });
});

describe('T020 coincidencia efectiva — fórmula de R05/modelo; sin política de publicación', () => {
  const pairs: { label: string; a: Partial<ScheduleFixture>; b: Partial<ScheduleFixture>; expected: boolean }[] = [
    { label: 'O01 misma franja y periodo', a: {}, b: {}, expected: true },
    { label: 'O02 solapamiento parcial', a: {}, b: { schedule: [slot(1, '18:30', '19:30')] }, expected: true },
    { label: 'O03 contención de horas', a: {}, b: { schedule: [slot(1, '17:00', '20:00')] }, expected: true },
    { label: 'O04 franjas contiguas', a: {}, b: { schedule: [slot(1, '19:00', '20:00')] }, expected: false },
    { label: 'O05 horas separadas', a: {}, b: { schedule: [slot(1, '20:00', '21:00')] }, expected: false },
    { label: 'O06 distinto día ISO', a: {}, b: { schedule: [slot(2)] }, expected: false },
    { label: 'O07 periodos disjuntos, mismas horas', a: {}, b: { periodStart: '2026-10-26', periodEnd: '2026-11-01' }, expected: false },
    { label: 'O08 intersección de fechas sin lunes: cada grupo sí tiene su lunes',
      a: {}, b: { periodStart: '2026-10-20', periodEnd: '2026-10-26' }, expected: false },
    { label: 'O09 primera ocurrencia común justo en U (lunes 26)',
      a: { periodEnd: '2026-10-26' }, b: { periodStart: '2026-10-20', periodEnd: '2026-10-26' }, expected: true },
    { label: 'O10 único día compartido lunes 19 incluido en ambos extremos',
      a: { periodStart: '2026-10-12', periodEnd: '2026-10-19' }, b: { periodStart: '2026-10-19', periodEnd: '2026-10-19' }, expected: true },
    { label: 'O11 único día compartido martes sin lunes',
      a: { periodEnd: '2026-10-20' }, b: { periodStart: '2026-10-20', periodEnd: '2026-10-26' }, expected: false },
    { label: 'O12 domingo ISO 7 en extremo inclusivo',
      a: { schedule: [slot(7)] }, b: { periodStart: '2026-10-25', periodEnd: '2026-10-25', schedule: [slot(7)] }, expected: true },
    { label: 'O13 paso de domingo a lunes con ajuste modular',
      a: { periodStart: '2026-10-25', periodEnd: '2026-10-26' }, b: { periodStart: '2026-10-26', periodEnd: '2026-10-26' }, expected: true },
    { label: 'O14 coincidencia solo en segunda franja, no solo primera',
      a: { schedule: [slot(1), slot(2)] }, b: { schedule: [slot(2, '18:30', '19:30')] }, expected: true },
    { label: 'O15 conjunto vacío no coincide', a: { schedule: [] }, b: {}, expected: false },
    { label: 'O16 extremos horarios adyacentes 00:01',
      a: { schedule: [slot(1, '00:00', '00:01')] }, b: { schedule: [slot(1, '00:01', '23:59')] }, expected: false },
    { label: 'O17 fecha bisiesta efectiva compartida',
      a: { periodStart: '2024-02-29', periodEnd: '2024-02-29', schedule: [slot(4)] },
      b: { periodStart: '2024-02-28', periodEnd: '2024-03-01', schedule: [slot(4)] }, expected: true },
    { label: 'O18 periodo de 400 años devuelve decisión, sin materializar clases',
      a: { periodStart: '2000-01-01', periodEnd: '2400-12-31' },
      b: { periodStart: '2400-12-25', periodEnd: '2400-12-31' }, expected: true },
  ];
  test.each(pairs)('$label', ({ a, b, expected }) => {
    const overlap = scheduleRule('schedulesOverlap');
    const first = scheduleFixture(a); const second = scheduleFixture(b);
    const before = structuredClone([first, second]);
    // Oráculos calendáricos explícitos, sin copiar la fórmula ni expandir fechas en tests.
    expect(overlap(first, second)).toBe(expected);
    expect(overlap(second, first)).toBe(expected); // Simetría, también con adyacencia.
    expect([first, second]).toEqual(before);
  });
});
