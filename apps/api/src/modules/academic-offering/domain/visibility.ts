import type { TeacherEligibility } from '../../users/public/teaching-directory.js';
import type { CatalogGroup, CourseState, OfferingField, Slot } from '../public/offer.js';
import { OfferingError } from '../public/offer.js';
import type { Course } from './course.js';
import { createCourse } from './course.js';
import type { Group } from './group.js';
import { createGroup } from './group.js';
import { validateSchedule } from './schedule.js';

export interface PublicationGroup extends Group {
  readonly publishedTeacherUserId: string | null;
  readonly publishedTeacherEligibilityVersion: bigint | null;
  readonly schedule: readonly Slot[];
}
export interface VisibilityInput {
  readonly courseState: CourseState;
  readonly group: PublicationGroup;
  readonly teacher: TeacherEligibility | null;
}
/** La revisión depende de la última captura, no de una consulta previa ni de authVersion. */
export function groupVisibility({ courseState, group, teacher }: VisibilityInput) {
  const matched = group.teacherUserId !== null && group.teacherUserId === group.publishedTeacherUserId
    && teacher !== null && teacher.userId === group.teacherUserId && teacher.eligible
    && group.publishedTeacherEligibilityVersion !== null && teacher.eligibilityVersion === group.publishedTeacherEligibilityVersion;
  return { studentVisible: courseState === 'PUBLISHED' && group.state === 'PUBLISHED' && matched,
    teacherReviewRequired: group.publishedTeacherUserId !== null && !matched };
}
export function courseVisibility(state: CourseState, children: readonly VisibilityInput[]): boolean {
  return state === 'PUBLISHED' && children.some(child => groupVisibility({ ...child, courseState: state }).studentVisible);
}
/** Proyección pura cerrada; el catálogo SQL/HTTP se integra en sus tareas posteriores. */
export function catalogGroup(input: VisibilityInput): CatalogGroup | null {
  const { group, teacher } = input;
  if (!groupVisibility(input).studentVisible || group.capacity === null || group.periodStart === null || group.periodEnd === null || teacher === null) return null;
  return { id: group.id, courseId: group.courseId, name: group.name, periodStart: group.periodStart, periodEnd: group.periodEnd,
    timeZone: group.timeZone, capacity: group.capacity, occupancy: null, availability: null, capacityStatus: 'NOT_CALCULATED',
    schedule: group.schedule.map(slot => ({ dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime })), teacher: { name: teacher.name } };
}
export function assertCoursePublication(course: Course): void {
  if (course.state !== 'DRAFT' && course.state !== 'WITHDRAWN') throw new OfferingError({ code: 'OFFERING_STATE_CONFLICT' });
  createCourse(course.id, course);
  if (course.description === null || course.description.trim() === '') throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['description'] });
}
/** Reutilizable para publicar grupo y revalidar un hijo ya PUBLISHED del curso.
 * No cambia estado, captura, generación ni datos; el adaptador aplica la transición.
 */
export function validateGroupPublication(group: PublicationGroup, teacher: TeacherEligibility | null): void {
  const fields: OfferingField[] = [];
  if (group.capacity === null) fields.push('capacity');
  if (group.periodStart === null) fields.push('periodStart');
  if (group.periodEnd === null) fields.push('periodEnd');
  if (group.teacherUserId === null) fields.push('teacherUserId');
  if (group.schedule.length === 0) fields.push('schedule');
  if (fields.length) throw new OfferingError({ code: 'VALIDATION_ERROR', fields });
  createGroup(group.id, group.courseId, { name: group.name, capacity: group.capacity, periodStart: group.periodStart,
    periodEnd: group.periodEnd, timeZone: group.timeZone, teacherUserId: group.teacherUserId });
  validateSchedule(group);
  if (!teacher || teacher.userId !== group.teacherUserId || !teacher.eligible) throw new OfferingError({ code: 'TEACHER_NOT_ELIGIBLE', fields: ['teacherUserId'] });
}
