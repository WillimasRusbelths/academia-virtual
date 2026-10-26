import { expect, test } from 'vitest';
import * as courses from './course.js';
import * as groups from './group.js';
import type { Course } from './course.js';
import type { Group } from './group.js';
import type { GroupState } from '../public/offer.js';

const course = (state = 'PUBLISHED') => Object.freeze({ id: '00000000-0000-4000-8000-000000000001', name: 'Curso ficticio', description: 'Descripción', state, revision: '7' });
const group = (state: GroupState = 'PUBLISHED') => Object.freeze({ id: '00000000-0000-4000-8000-000000000002', courseId: course().id, name: 'Grupo ficticio', state,
  capacity: 45, periodStart: '2026-10-19', periodEnd: '2026-10-25', timeZone: 'America/Lima' as const, teacherUserId: '00000000-0000-4000-8000-000000000003',
  schedule: Object.freeze([{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }]),
  publishedTeacherUserId: '00000000-0000-4000-8000-000000000003', publishedTeacherEligibilityVersion: '7', revision: '4',
  cancellationReason: null, cancelledAt: null });
type Transition = (value: object, detail?: unknown) => Record<string, unknown>;
function transition(module: object, name: string): Transition {
  const value = (module as Record<string, unknown>)[name];
  expect(value, `T048 pendiente: regla pura ${name} ausente; caso independiente, sin error de carga`).toBeTypeOf('function');
  return value as Transition;
}
test('M01 retirar curso publicado conserva datos, no muta entrada ni decide hijos', () => {
  const current = course(); const next = transition(courses, 'withdrawCourse')(current);
  expect(next).toEqual({ ...current, state: 'WITHDRAWN' }); expect(current.state).toBe('PUBLISHED');
});
test.each(['DRAFT','WITHDRAWN','CANCELLED'])('M02 retirar curso %s es transición inválida, nunca NO_CHANGE', state => {
  const withdraw = transition(courses, 'withdrawCourse');
  expect(() => withdraw(course(state))).toThrowError(expect.objectContaining({ code: 'OFFERING_STATE_CONFLICT' }));
});
test('M03 retirar grupo conserva snapshot/periodo/capacidad/franjas, sin reloj o revisión propios', () => {
  const current = group(); expect(transition(groups, 'withdrawGroup')(current)).toEqual({ ...current, state: 'WITHDRAWN' });
  expect(current.state).toBe('PUBLISHED');
});
test.each(['DRAFT','WITHDRAWN','CANCELLED'] as const)('M04 retirar grupo %s no es no-op', state => {
  const withdraw = transition(groups, 'withdrawGroup');
  expect(() => withdraw(group(state))).toThrowError(expect.objectContaining({ code: 'OFFERING_STATE_CONFLICT' }));
});
for (const state of ['DRAFT','PUBLISHED','WITHDRAWN'] as const) test(`M05 cancelar ${state} conserva snapshot/datos y usa instante suministrado por aplicación`, () => {
  const current = group(state); const detail = { cancellationReason: '  Motivo ficticio  ', cancelledAt: '2026-10-23T12:00:00.000Z' };
  expect(transition(groups, 'cancelGroup')(current, detail)).toEqual({ ...current, state: 'CANCELLED',
    cancellationReason: 'Motivo ficticio', cancelledAt: detail.cancelledAt });
  expect(current.state).toBe(state);
});
test('M06 cancelar otra vez nunca responde NO_CHANGE ni cambia el motivo', () => {
  const cancel = transition(groups, 'cancelGroup');
  expect(() => cancel(group('CANCELLED'), { cancellationReason: 'Otro', cancelledAt: '2026-10-23T12:00:00.000Z' }))
    .toThrowError(expect.objectContaining({ code: 'OFFERING_STATE_CONFLICT' }));
});
test.each(['', ' ', '\n', null, undefined, 3, false])('M07 motivo inválido %# se rechaza sin normalizar a éxito', reason => {
  const cancel = transition(groups, 'cancelGroup');
  expect(() => cancel(group(), { cancellationReason: reason, cancelledAt: '2026-10-23T12:00:00.000Z' }))
    .toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR', failure: expect.objectContaining({ fields: ['cancellationReason'] }) }));
});
for (const state of ['DRAFT','WITHDRAWN'] as const) {
  test(`M08 datos idénticos de curso ${state} conservan estado y revisión para NO_CHANGE del escritor`, () => {
    const current = { ...course(state), state }; expect(courses.editCourse(current, { name: current.name, description: current.description })).toEqual(current);
  });
  test(`M09 grupo ${state}: edición efectiva preserva captura previa y no publica`, () => {
    const current = group(state); expect(groups.editGroup(current, { capacity: 50 })).toEqual({ ...current, capacity: 50 });
    expect(groups.editGroup(current, { name: current.name })).toEqual(current); expect(current.capacity).toBe(45);
  });
}
test.each(['PUBLISHED','CANCELLED'] as const)('M10 editar grupo %s incluso con datos iguales se rechaza', state => {
  expect(() => groups.editGroup(group(state), { name: 'Grupo ficticio' })).toThrowError(expect.objectContaining({ code: 'OFFERING_STATE_CONFLICT' }));
});
test('M11 curso publicado no admite edición idéntica; curso no tiene cancelación', () => {
  expect(() => courses.editCourse(course() as Course, { name: 'Curso ficticio' })).toThrowError(expect.objectContaining({ code: 'OFFERING_STATE_CONFLICT' }));
  expect(() => courses.editCourse(course('CANCELLED') as Course, { name: 'Curso ficticio' })).toThrowError(expect.objectContaining({ code: 'OFFERING_STATE_CONFLICT' }));
});
test('M12 retirar el padre no vuelve editable al hijo publicado', () => {
  const current: Group & { courseState: string } = { ...group(), courseState: 'WITHDRAWN' };
  expect(() => groups.editGroup(current, { capacity: 50 })).toThrowError(expect.objectContaining({ code: 'OFFERING_STATE_CONFLICT' }));
});
