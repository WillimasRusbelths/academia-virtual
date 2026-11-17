import { describe, expect, test } from 'vitest';
import { COURSE_ID, courseFixture, courseRule, expectStateConflict, expectValidation } from '../../../../tests/support/academic-rules-contract.js';

describe('T019 curso — FR-001/002; V-A01', () => {
  test('C01 alta incompleta: referencia del servidor estable, nombre recortado, DRAFT y descripción null', () => {
    const create = courseRule('createCourse');
    expect(create(COURSE_ID, { name: '  Álgebra  ' })).toMatchObject({
      id: COURSE_ID, name: 'Álgebra', description: null, state: 'DRAFT',
    });
  });
  test.each([null, '', ' \t\n '])('C02 descripción %j se normaliza a null en preparación', description => {
    const create = courseRule('createCourse');
    expect(create(COURSE_ID, { name: 'Álgebra', description }).description).toBeNull();
  });
  test('C03 recorta descripción; no interpreta HTML ni elimina contenido interno', () => {
    const create = courseRule('createCourse');
    expect(create(COURSE_ID, { name: 'Álgebra  I', description: '  <b>Teoría</b>  y práctica  ' }))
      .toMatchObject({ name: 'Álgebra  I', description: '<b>Teoría</b>  y práctica' });
  });
  test.each(['', ' \t\n ', null, 123, undefined])('C04 rechaza nombre inválido %j con error de campo', name => {
    const create = courseRule('createCourse');
    expectValidation(() => create(COURSE_ID, { name }), 'name');
  });
  test.each([42, false, {}])('C05 rechaza descripción no textual %j', description => {
    const create = courseRule('createCourse');
    expectValidation(() => create(COURSE_ID, { name: 'Curso', description }), 'description');
  });
  test('C06 nombres repetidos permitidos, referencias distintas y sin límite nuevo de longitud', () => {
    const create = courseRule('createCourse');
    const name = 'a'.repeat(512);
    const first = create(COURSE_ID, { name });
    const second = create('77777777-0000-4000-8000-000000000004', { name });
    expect(first.name).toBe(name); expect(second.name).toBe(name);
    expect(first.id).not.toBe(second.id);
  });
  test.each(['DRAFT', 'WITHDRAWN'] as const)('C07 edita %s sin publicar ni cambiar referencia', state => {
    const edit = courseRule('editCourse'); const before = courseFixture({ state });
    expect(edit(before, { name: '  Nuevo  ', description: '  ' })).toMatchObject({
      id: before.id, name: 'Nuevo', description: null, state,
    });
  });
  test('C08 PATCH de descripción conserva nombre; PATCH de nombre conserva descripción', () => {
    const edit = courseRule('editCourse'); const before = courseFixture();
    expect(edit(before, { description: ' Otra ' })).toMatchObject({ id: before.id, name: before.name, description: 'Otra' });
    expect(edit(before, { name: 'Nuevo' })).toMatchObject({ id: before.id, name: 'Nuevo', description: before.description });
  });
  test('C09 publicado exige retiro antes de editar, aunque el cambio sea válido', () => {
    const edit = courseRule('editCourse'); const before = courseFixture({ state: 'PUBLISHED' });
    expectStateConflict(() => edit(before, { name: 'Nuevo' }));
    expect(before).toEqual(courseFixture({ state: 'PUBLISHED' }));
  });
  test('C10 cambio inválido no modifica parcialmente el curso recibido', () => {
    const edit = courseRule('editCourse'); const before = courseFixture(); const snapshot = structuredClone(before);
    expectValidation(() => edit(before, { name: ' ', description: 'Otra' }), 'name');
    expect(before).toEqual(snapshot);
  });
  test('C11 curso solo posee datos académicos generales, sin capacidad, docente ni horario', () => {
    const create = courseRule('createCourse'); const course = create(COURSE_ID, { name: 'Curso' });
    for (const key of ['capacity', 'teacherUserId', 'schedule', 'occupancy', 'availability', 'price', 'enrollment']) {
      expect(course).not.toHaveProperty(key);
    }
  });
});
