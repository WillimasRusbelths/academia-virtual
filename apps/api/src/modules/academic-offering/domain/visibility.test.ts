/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest';
import type { TeacherEligibility } from '../../users/public/teaching-directory.js';
import type { CatalogGroup, CourseState, GroupState, Slot } from '../public/offer.js';

/** Enlace de conformidad de pruebas, no API de producción ni reglas sustitutas.
 * T036 puede adaptar este enlace a sus firmas reales conservando todas las expectativas.
 * La ausencia se comprueba EN CADA CASO; no hay import inexistente, catch, skip o mock.
 */
interface Input {
  readonly courseState: CourseState;
  readonly group: {
    readonly id: string; readonly courseId: string; readonly name: string; readonly state: GroupState;
    readonly teacherUserId: string | null; readonly publishedTeacherUserId: string | null;
    readonly publishedTeacherEligibilityVersion: bigint | null; readonly capacity: number;
    readonly periodStart: string; readonly periodEnd: string; readonly timeZone: 'America/Lima'; readonly schedule: readonly Slot[];
  };
  readonly teacher: TeacherEligibility | null;
}
interface Rules {
  groupVisibility(input: Input): { readonly studentVisible: boolean; readonly teacherReviewRequired: boolean };
  courseVisibility(state: CourseState, children: readonly Input[]): boolean;
  catalogGroup(input: Input): CatalogGroup | null;
}
const modules = import.meta.glob<Partial<Rules>>('./visibility.ts', { eager: true });
function rule<K extends keyof Rules>(name: K): Rules[K] {
  const value = Object.values(modules)[0]?.[name];
  expect(value, `T036 pendiente: regla pura ${name} ausente; caso descubierto y ejecutado`).toBeTypeOf('function');
  return value!;
}
const teacherId = '88888888-0000-4000-8000-000000000001';
const otherTeacherId = '88888888-0000-4000-8000-000000000002';
function fixture(): Input {
  return { courseState: 'PUBLISHED', group: {
    id: '88888888-0000-4000-8000-000000000003', courseId: '88888888-0000-4000-8000-000000000004',
    name: 'Turno ficticio', state: 'PUBLISHED', teacherUserId: teacherId, publishedTeacherUserId: teacherId,
    publishedTeacherEligibilityVersion: 0n, capacity: 45, periodStart: '2026-10-19', periodEnd: '2026-10-25',
    timeZone: 'America/Lima', schedule: [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }],
  }, teacher: { userId: teacherId, name: 'Docente ficticio', eligible: true, eligibilityVersion: 0n } };
}
const states: CourseState[] = ['DRAFT', 'PUBLISHED', 'WITHDRAWN'];
const groupStates: GroupState[] = ['DRAFT', 'PUBLISHED', 'WITHDRAWN', 'CANCELLED'];
describe('T031 visibilidad pura — FR-007/009/012; V-A05/A06', () => {
  for (const parent of states) for (const child of groupStates) test(`V01 padre ${parent}, hijo ${child}`, () => {
    const input = fixture(); const result = rule('groupVisibility')({ ...input, courseState: parent, group: { ...input.group, state: child } });
    expect(result).toEqual({ studentVisible: parent === 'PUBLISHED' && child === 'PUBLISHED', teacherReviewRequired: false });
  });
  const changes: { name: string; change: (input: Input) => Input; review: boolean }[] = [
    { name: 'sin publicación previa', change: i => ({ ...i, group: { ...i.group, state: 'DRAFT', publishedTeacherUserId: null, publishedTeacherEligibilityVersion: null } }), review: false },
    { name: 'asignación quitada', change: i => ({ ...i, group: { ...i.group, teacherUserId: null }, teacher: null }), review: true },
    { name: 'asignación sustituida', change: i => ({ ...i, group: { ...i.group, teacherUserId: otherTeacherId }, teacher: { ...i.teacher!, userId: otherTeacherId } }), review: true },
    { name: 'docente no habilitado', change: i => ({ ...i, teacher: { ...i.teacher!, eligible: false, eligibilityVersion: 1n } }), review: true },
    { name: 'directorio sin asignado', change: i => ({ ...i, teacher: null }), review: true },
    { name: 'cuenta recuperada con generación posterior', change: i => ({ ...i, teacher: { ...i.teacher!, eligibilityVersion: 1n } }), review: true },
  ];
  for (const scenario of changes) test(`V02 ${scenario.name}: oculta y revisión derivada`, () => {
    expect(rule('groupVisibility')(scenario.change(fixture()))).toEqual({ studentVisible: false, teacherReviewRequired: scenario.review });
  });
  test('V03 generación bigint no se compara redondeándola a number', () => {
    const i = fixture();
    expect(rule('groupVisibility')({ ...i, group: { ...i.group, publishedTeacherEligibilityVersion: 9007199254740992n },
      teacher: { ...i.teacher!, eligibilityVersion: 9007199254740993n } })).toEqual({ studentVisible: false, teacherReviewRequired: true });
  });
  test.each(['rol', 'estado', 'verificación'])('V04 pérdida/recuperación de %s sin consultas intermedias no rehabilita snapshot', () => {
    // Solo modela entradas finales del contrato de identidad. T006/T032 prueban el trigger real.
    const i = fixture(); const saved = structuredClone(i);
    const recovered = { ...i, teacher: { ...i.teacher!, eligible: true, eligibilityVersion: 1n } };
    expect(rule('groupVisibility')(recovered)).toEqual({ studentVisible: false, teacherReviewRequired: true });
    expect(i).toEqual(saved); expect(recovered.group.publishedTeacherEligibilityVersion).toBe(0n);
  });
  test('V05 nombre/reset sin pérdida de habilitación conserva la visibilidad, no depende de authVersion', () => {
    const i = fixture();
    expect(rule('groupVisibility')({ ...i, teacher: { ...i.teacher!, name: 'Nombre corregido' } }))
      .toEqual({ studentVisible: true, teacherReviewRequired: false });
  });
  test('V06 captura explícita nueva vuelve a habilitar grupo; no muta entrada ni cuenta', () => {
    const i = fixture(); const reviewed = { ...i, group: { ...i.group, publishedTeacherEligibilityVersion: 1n }, teacher: { ...i.teacher!, eligibilityVersion: 1n } };
    const before = structuredClone(reviewed);
    expect(rule('groupVisibility')(reviewed)).toEqual({ studentVisible: true, teacherReviewRequired: false });
    expect(reviewed).toEqual(before);
  });
  test.each(states)('V07 curso %s sin hijos no visible', state => {
    expect(rule('courseVisibility')(state, [])).toBe(false);
  });
  test.each(['DRAFT', 'WITHDRAWN', 'CANCELLED'] as const)('V08 curso publicado solo con hijo %s no visible', state => {
    const i = fixture(); expect(rule('courseVisibility')('PUBLISHED', [{ ...i, group: { ...i.group, state } }])).toBe(false);
  });
  test('V09 curso con hijos que requieren revisión no visible aunque editorialmente publicados', () => {
    const i = fixture(); expect(rule('courseVisibility')('PUBLISHED', [{ ...i, teacher: { ...i.teacher!, eligibilityVersion: 1n } }])).toBe(false);
  });
  test('V10 un hijo visible basta; hijos ocultos no se vuelven visibles', () => {
    const i = fixture(); const hidden = { ...i, group: { ...i.group, state: 'WITHDRAWN' as const } }; const before = structuredClone(hidden);
    expect(rule('courseVisibility')('PUBLISHED', [hidden, i])).toBe(true); expect(hidden).toEqual(before);
  });
  test.each(['DRAFT', 'WITHDRAWN'] as const)('V11 padre %s oculta aunque hijo fuera apto', state => {
    const i = fixture(); expect(rule('courseVisibility')(state, [{ ...i, courseState: state }])).toBe(false);
  });
});
describe('T031 proyección pura mínima — FR-006/011', () => {
  test.each([1, 45, 50])('V12 capacidad %i no es ocupación ni disponibilidad', capacity => {
    const i = fixture(); const value = rule('catalogGroup')({ ...i, group: { ...i.group, capacity } });
    expect(value).toEqual({ id: i.group.id, courseId: i.group.courseId, name: i.group.name, periodStart: i.group.periodStart,
      periodEnd: i.group.periodEnd, timeZone: 'America/Lima', capacity, occupancy: null, availability: null,
      capacityStatus: 'NOT_CALCULATED', schedule: i.group.schedule, teacher: { name: i.teacher!.name } });
  });
  test('V13 no proyecta metadatos editoriales, revisión, generación, IDs docentes o privados', () => {
    const i = fixture(); const value = rule('catalogGroup')(i); expect(value).not.toBeNull();
    expect(Object.keys(value!).sort()).toEqual(['id','courseId','name','periodStart','periodEnd','timeZone','capacity','occupancy','availability','capacityStatus','schedule','teacher'].sort());
    expect(Object.keys(value!.teacher)).toEqual(['name']);
    for (const key of ['revision','state','teacherReviewRequired','publishedTeacherUserId','publishedTeacherEligibilityVersion','cancellationReason','email','passwordHash','authVersion']) expect(value).not.toHaveProperty(key);
  });
  test.each(['WITHDRAWN', 'CANCELLED'] as const)('V14 no proyecta grupo oculto %s', state => {
    const i = fixture(); expect(rule('catalogGroup')({ ...i, group: { ...i.group, state } })).toBeNull();
  });
  test('V15 no proyecta generación invalidada y recuperada', () => {
    const i = fixture(); expect(rule('catalogGroup')({ ...i, teacher: { ...i.teacher!, eligibilityVersion: 1n } })).toBeNull();
  });
  test('V16 proyectar no muta snapshot, horarios ni docente', () => {
    const i = fixture(); const before = structuredClone(i); const value = rule('catalogGroup')(i);
    expect(value).not.toBeNull(); expect(i).toEqual(before);
  });
});
