import { expect, test } from 'vitest';
import { createCourse, editCourse } from './course.js';
import { createGroup, editGroup } from './group.js';
import { civilDay, schedulesOverlap, validateSchedule } from './schedule.js';
import { OfferingError } from './offering-error.js';

const courseId = '77777777-0000-4000-8000-000000000001';
const groupId = '77777777-0000-4000-8000-000000000002';
const schedule = Object.freeze([Object.freeze({ dayOfWeek: 1 as const, startTime: '18:00', endTime: '19:00' })]);

test('R01 ordinal civil contrasta siglos y año contra oráculo UTC independiente, solo en tests', () => {
  const epoch = new Date('0001-01-01T00:00:00.000Z').valueOf();
  for (const date of ['0001-01-01','0099-12-31','0100-03-01','1600-02-29','1900-03-01',
    '2000-02-29','2024-02-29','2100-03-01','2400-12-31','9999-12-31']) {
    const oracle = new Date(`${date}T00:00:00.000Z`);
    const ordinal = civilDay(date, 'periodStart');
    expect(ordinal).toBe((oracle.valueOf() - epoch) / 86400000);
    expect(ordinal % 7 + 1).toBe(oracle.getUTCDay() || 7);
  }
});
test('R02 edición válida del curso conserva entrada congelada y referencia, sin publicar', () => {
  const before = Object.freeze(createCourse(courseId, { name: 'Álgebra', description: 'Base' }));
  const next = editCourse(before, { description: '  Otra  ' });
  expect(next).not.toBe(before); expect(before.description).toBe('Base');
  expect(next).toEqual({ id: courseId, name: 'Álgebra', description: 'Otra', state: 'DRAFT' });
});
test('R03 editar borrador incompleto conserva omisión de capacidad; undefined enviado no configura', () => {
  const before = createGroup(groupId, courseId, { name: 'Inicial' });
  expect(editGroup(before, { name: 'Otro' })).toMatchObject({ capacity: null, periodStart: null, periodEnd: null, state: 'DRAFT' });
  expect(() => editGroup(before, { capacity: undefined })).toThrowError(expect.objectContaining({
    failure: { code: 'VALIDATION_ERROR', fields: ['capacity'] },
  }));
});
test('R04 editar periodo con franjas conservadas revalida ocurrencias sin mutación parcial', () => {
  const before = Object.freeze({ ...createGroup(groupId, courseId, {
    name: 'Turno', periodStart: '2026-10-19', periodEnd: '2026-10-25',
  }), schedule });
  expect(() => editGroup(before, { name: 'No aplicar', periodStart: '2026-10-20' })).toThrowError(expect.objectContaining({
    failure: { code: 'VALIDATION_ERROR', fields: ['schedule'] },
  }));
  expect(before.name).toBe('Turno'); expect(before.periodStart).toBe('2026-10-19');
  expect(editGroup(before, { periodEnd: '2026-10-26' })).toMatchObject({ schedule, periodEnd: '2026-10-26' });
});
test('R05 edición retirada conserva snapshot, revisión recibida y estado; no renueva publicación', () => {
  const before = Object.freeze({ ...createGroup(groupId, courseId, { name: 'Turno', capacity: 1 }),
    state: 'WITHDRAWN' as const, publishedTeacherUserId: '77777777-0000-4000-8000-000000000003',
    publishedTeacherEligibilityVersion: 7n, revision: '9' });
  const next = editGroup(before, { capacity: 50 });
  expect(next).toMatchObject({ id: groupId, courseId, state: 'WITHDRAWN', revision: '9', capacity: 50,
    publishedTeacherUserId: before.publishedTeacherUserId, publishedTeacherEligibilityVersion: 7n });
  expect(before.capacity).toBe(1);
  // El incremento transaccional de revisión será responsabilidad de T024, no de este núcleo.
});
test('R06 comparación exige periodos completos; formas inválidas usan errores seguros del dominio', () => {
  const complete = { timeZone: 'America/Lima', periodStart: '2026-10-19', periodEnd: '2026-10-25', schedule };
  expect(() => schedulesOverlap({ ...complete, periodStart: null }, complete)).toThrowError(expect.objectContaining({
    failure: { code: 'VALIDATION_ERROR', fields: ['periodStart'] },
  }));
  expect(() => validateSchedule({ ...complete, schedule: null })).toThrowError(OfferingError);
  expect(() => createCourse(courseId, null)).toThrowError(OfferingError);
  expect(() => createGroup(groupId, courseId, [])).toThrowError(OfferingError);
});

test.each(['fecha con salto de línea', 'hora con salto de línea', 'UUID con salto de línea', 'franja ausente'])(
  'R07 %s produce validación segura, no coerción ni TypeError', problem => {
    const complete = { timeZone: 'America/Lima', periodStart: '2026-10-19', periodEnd: '2026-10-25', schedule };
    const operation = () => {
      if (problem === 'fecha con salto de línea') return validateSchedule({ ...complete, periodStart: '2026-10-19\n' });
      if (problem === 'hora con salto de línea') return validateSchedule({ ...complete,
        schedule: [{ ...schedule[0], startTime: '18:00\n' }] });
      if (problem === 'UUID con salto de línea') return createGroup(groupId, courseId,
        { name: 'Turno', teacherUserId: '77777777-0000-4000-8000-000000000003\n' });
      return validateSchedule({ ...complete, schedule: new Array<unknown>(1) });
    };
    expect(operation).toThrowError(OfferingError);
    expect(operation).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
