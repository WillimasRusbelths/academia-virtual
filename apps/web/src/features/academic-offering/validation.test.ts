import { expect, test } from 'vitest';
import { capacityError, nameError, scheduleErrors } from './validation';
const monday = { dayOfWeek: 1, startTime: '18:00', endTime: '19:00' };
test.each(['', ' ', '\t\n'])('nombre vacío %j', value => expect(nameError(value)).toBeDefined());
test.each(['Curso', ' Álgebra ', 'x'.repeat(16000)])('nombre sin límite de negocio inventado %#', value => expect(nameError(value)).toBeUndefined());
test.each(['1', '50', '25'])('capacidad válida %s', value => expect(capacityError(value)).toBeUndefined());
test.each(['', ' ', '0', '-1', '1.5', '51', 'NaN', 'Infinity'])('capacidad inválida %j', value => expect(capacityError(value)).toBeDefined());
test('preparación incompleta admite cero franjas y fechas omitidas', () => expect(scheduleErrors(null, null, [])).toEqual({}));
test('extremos incluidos y franjas contiguas', () => {
  expect(scheduleErrors('2026-10-19', '2026-10-19', [monday, { ...monday, startTime: '19:00', endTime: '20:00' }])).toEqual({});
});
test.each(['2026-02-30', '2025-02-29', '0000-01-01', '19/10/2026'])('fecha civil inválida %s', value => {
  expect(scheduleErrors(value, '2026-12-31', [])).toHaveProperty('periodStart');
});
test('periodo invertido', () => expect(scheduleErrors('2026-10-26', '2026-10-25', [])).toHaveProperty('periodEnd'));
test('día sin ocurrencia y periodo de un lunes con ocurrencia', () => {
  expect(scheduleErrors('2026-10-20', '2026-10-25', [monday])).toHaveProperty('schedule');
  expect(scheduleErrors('0001-01-01', '0001-01-01', [monday])).toEqual({});
});
test.each([
  { label: 'duplicado', slots: [monday, monday] },
  { label: 'solapamiento', slots: [monday, { ...monday, startTime: '18:30', endTime: '20:00' }] },
  { label: 'medianoche', slots: [{ ...monday, startTime: '23:00', endTime: '01:00' }] },
  { label: 'horas iguales', slots: [{ ...monday, endTime: '18:00' }] },
  { label: '24:00', slots: [{ ...monday, endTime: '24:00' }] },
  { label: 'día inválido', slots: [{ ...monday, dayOfWeek: 0 }] },
])('horario inválido $label', ({ slots }) => expect(scheduleErrors('2026-10-19', '2026-10-25', slots)).toHaveProperty('schedule'));
