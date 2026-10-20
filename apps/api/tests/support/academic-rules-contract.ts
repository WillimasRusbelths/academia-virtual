/// <reference types="vite/client" />
import { expect } from 'vitest';
import type { CourseState, GroupState, Slot } from '../../src/modules/academic-offering/public/offer.js';

/** Puerto SOLO de conformidad UNIT para T023. No implementa reglas ni genera IDs.
 * La aplicación entregará UUID del servidor; aquí son referencias ficticias estables.
 * Los nombres de funciones son un enlace de pruebas, no un nuevo contrato público.
 * Si T023 elige otra firma, adaptar únicamente este enlace a funciones reales.
 */
export interface CourseFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly state: CourseState;
}
export interface GroupFixture {
  readonly id: string;
  readonly courseId: string;
  readonly name: string;
  readonly state: GroupState;
  readonly capacity: number | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly timeZone: string;
  readonly teacherUserId: string | null;
}
export interface ScheduleFixture {
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly timeZone: string;
  readonly schedule: readonly Slot[];
}
interface CourseRules {
  createCourse(id: string, input: unknown): CourseFixture;
  editCourse(current: CourseFixture, changes: unknown): CourseFixture;
}
interface GroupRules {
  createGroup(id: string, courseId: string, input: unknown): GroupFixture;
  editGroup(current: GroupFixture, changes: unknown): GroupFixture;
}
interface ScheduleRules {
  validateSchedule(input: unknown): void;
  schedulesOverlap(a: ScheduleFixture, b: ScheduleFixture): boolean;
}
// Globs estáticos, sin catch, import ficticio, skip/fails ni regla de reemplazo.
// La comprobación de capacidad sucede DENTRO de cada caso, nunca en beforeAll.
const courses = import.meta.glob<Partial<CourseRules>>('../../src/modules/academic-offering/domain/course.ts', { eager: true });
const groups = import.meta.glob<Partial<GroupRules>>('../../src/modules/academic-offering/domain/group.ts', { eager: true });
const schedules = import.meta.glob<Partial<ScheduleRules>>('../../src/modules/academic-offering/domain/schedule.ts', { eager: true });
function target<T extends object, K extends keyof T>(modules: Record<string, Partial<T>>, name: K): T[K] {
  const rule = Object.values(modules)[0]?.[name];
  expect(rule, `T023 pendiente: regla ${String(name)} ausente; caso ejecutado, sin error de carga`).toBeTypeOf('function');
  return rule!;
}
export const courseRule = <K extends keyof CourseRules>(name: K) => target<CourseRules, K>(courses, name);
export const groupRule = <K extends keyof GroupRules>(name: K) => target<GroupRules, K>(groups, name);
export const scheduleRule = <K extends keyof ScheduleRules>(name: K) => target<ScheduleRules, K>(schedules, name);

export const COURSE_ID = '77777777-0000-4000-8000-000000000001';
export const GROUP_ID = '77777777-0000-4000-8000-000000000002';
export const OTHER_GROUP_ID = '77777777-0000-4000-8000-000000000003';
export function courseFixture(changes: Partial<CourseFixture> = {}): CourseFixture {
  return { id: COURSE_ID, name: 'Álgebra', description: 'Ecuaciones', state: 'DRAFT', ...changes };
}
export function groupFixture(changes: Partial<GroupFixture> = {}): GroupFixture {
  return { id: GROUP_ID, courseId: COURSE_ID, name: 'Turno A', state: 'DRAFT', capacity: 25,
    periodStart: '2026-10-19', periodEnd: '2026-10-25', timeZone: 'America/Lima', teacherUserId: null, ...changes };
}
export function scheduleFixture(changes: Partial<ScheduleFixture> = {}): ScheduleFixture {
  return { periodStart: '2026-10-19', periodEnd: '2026-10-25', timeZone: 'America/Lima',
    schedule: [{ dayOfWeek: 1, startTime: '18:00', endTime: '19:00' }], ...changes };
}
export function expectValidation(work: () => unknown, field: string): void {
  expect(work).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR',
    failure: expect.objectContaining({ fields: expect.arrayContaining([field]) }) }));
}
export function expectStateConflict(work: () => unknown): void {
  expect(work).toThrowError(expect.objectContaining({ code: 'OFFERING_STATE_CONFLICT' }));
}
