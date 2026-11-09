import { schedulesOverlap } from '../domain/schedule.js';
import type { AcademicTimeZone, CivilDate, Slot } from './offer.js';

export interface EffectiveSchedule {
  readonly periodStart: CivilDate;
  readonly periodEnd: CivilDate;
  readonly timeZone: AcademicTimeZone;
  readonly schedule: readonly Slot[];
}
/** Misma regla D06 del dueño: incluye ocurrencia semanal y adyacencia permitida. */
export function effectiveSchedulesOverlap(first: EffectiveSchedule, second: EffectiveSchedule): boolean {
  return schedulesOverlap(first, second);
}
