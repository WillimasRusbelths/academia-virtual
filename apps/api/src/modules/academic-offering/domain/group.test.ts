import { describe, expect, test } from 'vitest';
import { COURSE_ID, GROUP_ID, OTHER_GROUP_ID, courseFixture, groupFixture, groupRule,
  expectStateConflict, expectValidation } from '../../../../tests/support/academic-rules-contract.js';

describe('T019 grupo — FR-001/002/005; PA-02/04; V-A01/A03', () => {
  test('G01 omisión inicial permite DRAFT incompleto con capacidad null y zona explícita', () => {
    const create = groupRule('createGroup');
    expect(create(GROUP_ID, COURSE_ID, { name: '  Turno A  ' })).toMatchObject({ id: GROUP_ID, courseId: COURSE_ID,
      name: 'Turno A', state: 'DRAFT', capacity: null, periodStart: null, periodEnd: null,
      timeZone: 'America/Lima', teacherUserId: null });
  });
  test.each([1, 50, 25])('G02 capacidad configurada válida %s se conserva exactamente', capacity => {
    const create = groupRule('createGroup');
    const group = create(GROUP_ID, COURSE_ID, { name: 'Grupo', capacity });
    expect(group.capacity).toBe(capacity);
    // Capacidad de diseño, nunca ocupación ni plazas disponibles calculadas por el dominio.
    expect(group).not.toHaveProperty('occupancy'); expect(group).not.toHaveProperty('availability');
  });
  test.each([
    { label: 'null', capacity: null }, { label: 'vacía', capacity: '' }, { label: 'blanco', capacity: ' ' },
    { label: 'string 25', capacity: '25' }, { label: 'cero', capacity: 0 }, { label: 'negativa', capacity: -1 },
    { label: 'fracción', capacity: 1.5 }, { label: '51', capacity: 51 }, { label: 'NaN', capacity: NaN },
    { label: 'Infinity', capacity: Infinity },
  ])('G03 alta rechaza capacidad enviada $label, no la confunde con omisión', ({ capacity }) => {
    const create = groupRule('createGroup');
    expectValidation(() => create(GROUP_ID, COURSE_ID, { name: 'Grupo', capacity }), 'capacity');
  });
  test.each([null, '', 0, -1, 1.5, 51])('G04 edición rechaza capacidad %j y conserva la configurada', capacity => {
    const edit = groupRule('editGroup'); const before = groupFixture(); const snapshot = structuredClone(before);
    expectValidation(() => edit(before, { name: 'Otro', capacity }), 'capacity');
    expect(before).toEqual(snapshot);
  });
  test.each([1, 50])('G05 edición configura el extremo válido %s sin publicar', capacity => {
    const edit = groupRule('editGroup');
    expect(edit(groupFixture({ capacity: null }), { capacity })).toMatchObject({ capacity, state: 'DRAFT' });
  });
  test.each(['', ' \t\n ', null, 42, undefined])('G06 nombre inválido %j se rechaza por campo', name => {
    const create = groupRule('createGroup');
    expectValidation(() => create(GROUP_ID, COURSE_ID, { name }), 'name');
  });
  test.each(['DRAFT', 'WITHDRAWN'] as const)('G07 edición de %s conserva referencias y estado; omitir capacidad la conserva', state => {
    const edit = groupRule('editGroup'); const before = groupFixture({ state });
    expect(edit(before, { name: '  Tarde  ' })).toMatchObject({ id: GROUP_ID, courseId: COURSE_ID, name: 'Tarde', state, capacity: 25 });
  });
  test.each(['PUBLISHED', 'CANCELLED'] as const)('G08 rechaza edición de %s sin cambios parciales', state => {
    const edit = groupRule('editGroup'); const before = groupFixture({ state }); const snapshot = structuredClone(before);
    expectStateConflict(() => edit(before, { capacity: 50 })); expect(before).toEqual(snapshot);
  });
  test('G09 dos grupos del mismo curso son independientes, incluso con nombre repetido', () => {
    const create = groupRule('createGroup'); const edit = groupRule('editGroup');
    const course = courseFixture(); const courseBefore = structuredClone(course);
    const first = create(GROUP_ID, course.id, { name: 'Turno', capacity: 1 });
    const second = create(OTHER_GROUP_ID, course.id, { name: 'Turno', capacity: 50 }); const secondBefore = structuredClone(second);
    expect(edit(first, { name: 'Mañana', capacity: 25 })).toMatchObject({ id: GROUP_ID, courseId: course.id, capacity: 25 });
    expect(second).toEqual(secondBefore); expect(second.capacity).toBe(50); expect(course).toEqual(courseBefore);
  });
  test('G10 periodo parcial válido permite preparación incompleta', () => {
    const create = groupRule('createGroup');
    expect(create(GROUP_ID, COURSE_ID, { name: 'Grupo', periodStart: '2026-10-19' }))
      .toMatchObject({ periodStart: '2026-10-19', periodEnd: null, state: 'DRAFT' });
  });
  test('G12 grupo admite periodo inclusivo de un solo día real', () => {
    const create = groupRule('createGroup');
    expect(create(GROUP_ID, COURSE_ID, { name: 'Grupo', periodStart: '2024-02-29', periodEnd: '2024-02-29' }))
      .toMatchObject({ periodStart: '2024-02-29', periodEnd: '2024-02-29' });
  });
  test.each([
    ['periodStart', '2026-02-29'], ['periodEnd', '2026-04-31'], ['timeZone', 'UTC'],
  ])('G13 grupo rechaza %s inválido %s', (field, value) => {
    const create = groupRule('createGroup');
    expectValidation(() => create(GROUP_ID, COURSE_ID, { name: 'Grupo', [field]: value }), field);
  });
  test('G14 edición rechaza periodo invertido y no aplica el nombre parcialmente', () => {
    const edit = groupRule('editGroup'); const before = groupFixture(); const snapshot = structuredClone(before);
    expect(() => edit(before, { name: 'Otro', periodStart: '2026-10-26' }))
      .toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(before).toEqual(snapshot);
  });
  test('G11 grupo no exige mínimo 40, código manual ni nombre único', () => {
    const create = groupRule('createGroup');
    expect(create(GROUP_ID, COURSE_ID, { name: 'a'.repeat(512), capacity: 1 }))
      .toMatchObject({ id: GROUP_ID, courseId: COURSE_ID, capacity: 1 });
  });
});
