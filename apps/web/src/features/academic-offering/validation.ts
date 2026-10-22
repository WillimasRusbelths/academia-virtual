import type { Slot } from './api';
export type FieldErrors = Readonly<Record<string, string>>;
export const capacityMessage = 'La capacidad debe ser un número entero entre 1 y 50';
export function nameError(value: string): string | undefined { return value.trim() ? undefined : 'Escribe un nombre.'; }
function day(value: string): number | undefined {
  if (!/^\d{4}-\d\d-\d\d$/.test(value) || value.startsWith('0000')) return undefined;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed.getTime() / 86400000 : undefined;
}
/** Validación local para orientar el formulario; la API sigue siendo la autoridad. */
export function scheduleErrors(start: string | null, end: string | null, slots: readonly Slot[]): FieldErrors {
  const errors: Record<string, string> = {};
  const lower = start === null ? undefined : day(start), upper = end === null ? undefined : day(end);
  if (start !== null && lower === undefined) errors.periodStart = 'Indica una fecha de inicio válida.';
  if (end !== null && upper === undefined) errors.periodEnd = 'Indica una fecha de fin válida.';
  if (lower !== undefined && upper !== undefined && lower > upper) errors.periodEnd = 'La fecha de fin debe ser igual o posterior al inicio.';
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    if (!Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 1 || slot.dayOfWeek > 7
      || !time.test(slot.startTime) || !time.test(slot.endTime) || slot.startTime >= slot.endTime) {
      errors.schedule = 'Revisa día y horas: el inicio debe ser anterior al fin, sin cruzar medianoche.'; continue;
    }
    if (slots.slice(0, index).some(other => other.dayOfWeek === slot.dayOfWeek && other.startTime < slot.endTime && slot.startTime < other.endTime)) {
      errors.schedule = 'No se permiten franjas duplicadas ni solapadas. Las franjas contiguas sí se permiten.';
    }
    if (lower !== undefined && upper !== undefined && lower <= upper) {
      const weekday = ((lower + 3) % 7 + 7) % 7 + 1;
      if (lower + (slot.dayOfWeek - weekday + 7) % 7 > upper) errors.schedule = 'Cada franja debe ocurrir al menos una vez dentro del periodo.';
    }
  }
  return errors;
}
export function capacityError(value: string): string | undefined {
  return value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 50 ? undefined : capacityMessage;
}
