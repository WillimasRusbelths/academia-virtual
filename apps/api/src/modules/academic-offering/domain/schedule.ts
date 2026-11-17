import { OfferingError } from './offering-error.js';
import type { OfferingField } from './offering-error.js';

interface Period { readonly start: number | null; readonly end: number | null }
interface WeeklySlot { readonly day: number; readonly start: number; readonly end: number }
interface WeeklySchedule { readonly period: Period; readonly slots: readonly WeeklySlot[] }
function invalid(field: OfferingField): never {
  throw new OfferingError({ code: 'VALIDATION_ERROR', fields: [field] });
}
function record(value: unknown, field: OfferingField): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid(field);
  return value as Record<string, unknown>;
}
/** Ordinal gregoriano, 0001-01-01 = 0 (lunes). Sin reloj, Date, ms ni zona local.
 * YYYY-MM-DD civil compatible con DATE; no se normalizan fechas imposibles.
 */
export function civilDay(value: unknown, field: 'periodStart' | 'periodEnd'): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid(field);
  const year = Number(value.slice(0, 4)); const month = Number(value.slice(5, 7)); const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) return invalid(field);
  const priorYear = year - 1;
  const offsets = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return priorYear * 365 + Math.floor(priorYear / 4) - Math.floor(priorYear / 100) + Math.floor(priorYear / 400)
    + offsets[month - 1] + (leap && month > 2 ? 1 : 0) + day - 1;
}
function minute(value: unknown): number {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return invalid('schedule');
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}
function slot(value: unknown): WeeklySlot {
  const values = record(value, 'schedule'); const day = values.dayOfWeek;
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7) return invalid('schedule');
  const start = minute(values.startTime); const end = minute(values.endTime);
  if (start >= end) return invalid('schedule');
  return { day, start, end };
}
function hoursOverlap(a: WeeklySlot, b: WeeklySlot): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}
/** Primera ocurrencia semanal >= L; cálculo O(1), sin enumerar fechas/clases. */
function occurs(day: number, lower: number, upper: number): boolean {
  return lower <= upper && lower + ((day - (lower % 7 + 1) + 7) % 7) <= upper;
}
function parse(input: unknown): WeeklySchedule {
  const values = record(input, 'schedule');
  if (values.timeZone !== 'America/Lima') return invalid('timeZone');
  const start = values.periodStart == null ? null : civilDay(values.periodStart, 'periodStart');
  const end = values.periodEnd == null ? null : civilDay(values.periodEnd, 'periodEnd');
  if (start !== null && end !== null && start > end) return invalid('periodEnd');
  if (!Array.isArray(values.schedule)) return invalid('schedule');
  // Array.from también valida huecos de arrays internos como franjas inválidas.
  const slots = Array.from(values.schedule, slot);
  for (let index = 0; index < slots.length; index++) {
    if (start !== null && end !== null && !occurs(slots[index].day, start, end)) return invalid('schedule');
    for (let other = 0; other < index; other++) {
      // Una sola regla rechaza tanto duplicados como solapamientos; adyacencia permitida.
      if (hoursOverlap(slots[index], slots[other])) return invalid('schedule');
    }
  }
  return { period: { start, end }, slots };
}
/** Preparación admite periodo incompleto y cero franjas; las enviadas sí se validan. */
export function validateSchedule(input: unknown): void { parse(input); }

/** Predicado geométrico de dos agendas completas. No decide elegibilidad, estados,
 * permisos ni qué docentes comparar; esas comprobaciones van bajo locks al publicar.
 */
export function schedulesOverlap(first: unknown, second: unknown): boolean {
  const a = parse(first); const b = parse(second);
  if (a.period.start === null || b.period.start === null) return invalid('periodStart');
  if (a.period.end === null || b.period.end === null) return invalid('periodEnd');
  const lower = Math.max(a.period.start, b.period.start); const upper = Math.min(a.period.end, b.period.end);
  if (lower > upper) return false;
  return a.slots.some(left => b.slots.some(right => hoursOverlap(left, right) && occurs(left.day, lower, upper)));
}
