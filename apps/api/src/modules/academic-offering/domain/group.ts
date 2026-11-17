import { OfferingError } from './offering-error.js';
import { civilDay, validateSchedule } from './schedule.js';
import type { AcademicTimeZone, GroupState, Slot } from '../public/offer.js';

export interface Group {
  readonly id: string; readonly courseId: string; readonly name: string; readonly description: string | null; readonly state: GroupState;
  readonly capacity: number | null; readonly periodStart: string | null; readonly periodEnd: string | null;
  readonly timeZone: AcademicTimeZone; readonly teacherUserId: string | null;
  /** El llamante puede aportar las franjas persistidas para revalidar al editar. */
  readonly schedule?: readonly Slot[];
}
function attributes(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['name'] });
  }
  return input as Record<string, unknown>;
}
function name(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['name'] });
  return value.trim();
}
function description(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['description'] });
  return value.trim() || null;
}
function capacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 50) {
    throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['capacity'] });
  }
  return value;
}
function date(value: unknown, field: 'periodStart' | 'periodEnd'): string {
  civilDay(value, field); return value as string;
}
function timeZone(value: unknown): AcademicTimeZone {
  if (value !== 'America/Lima') throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['timeZone'] });
  return value;
}
function teacher(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['teacherUserId'] });
  }
  // Solo forma de referencia. La habilitación pertenece al directorio de usuarios.
  return value;
}
function changes(values: Record<string, unknown>): Partial<Omit<Group, 'id' | 'courseId' | 'state' | 'schedule'>> {
  return {
    ...(Object.hasOwn(values, 'name') ? { name: name(values.name) } : {}),
    ...(Object.hasOwn(values, 'description') ? { description: description(values.description) } : {}),
    ...(Object.hasOwn(values, 'capacity') ? { capacity: capacity(values.capacity) } : {}),
    ...(Object.hasOwn(values, 'periodStart') ? { periodStart: date(values.periodStart, 'periodStart') } : {}),
    ...(Object.hasOwn(values, 'periodEnd') ? { periodEnd: date(values.periodEnd, 'periodEnd') } : {}),
    ...(Object.hasOwn(values, 'timeZone') ? { timeZone: timeZone(values.timeZone) } : {}),
    ...(Object.hasOwn(values, 'teacherUserId') ? { teacherUserId: teacher(values.teacherUserId) } : {}),
  };
}
export function assertGroupEditable(state: GroupState): void {
  if (state !== 'DRAFT' && state !== 'WITHDRAWN') throw new OfferingError({ code: 'OFFERING_STATE_CONFLICT' });
}
export function createGroup(id: string, courseId: string, input: unknown): Group {
  const values = attributes(input);
  const group: Group = { id, courseId, name: name(values.name), description: null, state: 'DRAFT', capacity: null,
    periodStart: null, periodEnd: null, timeZone: 'America/Lima', teacherUserId: null, ...changes(values) };
  validateSchedule({ ...group, schedule: [] });
  return group;
}
/** Solo campos editables presentes; referencias, estado y metadatos previos se conservan. */
export function editGroup<T extends Group>(current: T, input: unknown): T {
  assertGroupEditable(current.state);
  const group = { ...current, ...changes(attributes(input)) };
  validateSchedule({ ...group, schedule: current.schedule ?? [] });
  return group;
}

export function withdrawGroup<T extends Group>(current: T): Omit<T, 'state'> & { readonly state: 'WITHDRAWN' } {
  if (current.state !== 'PUBLISHED') throw new OfferingError({ code: 'OFFERING_STATE_CONFLICT' });
  return { ...current, state: 'WITHDRAWN' };
}
export function cancellationReason(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['cancellationReason'] });
  }
  return value.trim();
}
/** El instante lo aporta la aplicación desde el servidor, nunca un reloj del dominio. */
export function cancelGroup<T extends Group>(current: T, detail: { cancellationReason: unknown; cancelledAt: string }):
Omit<T, 'state' | 'cancellationReason' | 'cancelledAt'> & { readonly state: 'CANCELLED'; readonly cancellationReason: string; readonly cancelledAt: string } {
  if (!['DRAFT', 'PUBLISHED', 'WITHDRAWN'].includes(current.state)) throw new OfferingError({ code: 'OFFERING_STATE_CONFLICT' });
  return { ...current, state: 'CANCELLED', cancellationReason: cancellationReason(detail.cancellationReason), cancelledAt: detail.cancelledAt };
}
