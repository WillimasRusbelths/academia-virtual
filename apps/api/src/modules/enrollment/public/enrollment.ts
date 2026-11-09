import type { InstantUs } from '../domain/instant.js';
import type { EffectiveSchedule } from '../../academic-offering/public/schedule.js';
export type { InstantUs } from '../domain/instant.js';
export type { PenPrice } from '../domain/money.js';

/** Referencias internas y transportes exactos. Nunca serializar bigint nativo en JSON. */
export type UUID = string;
export type Revision = string;
export type UTCInstant = string;
export type MinorUnits = string;
export interface ReservationSelection { readonly intentionId: UUID; readonly groupIds: readonly UUID[] }
export interface OriginalPeriodBounds {
  readonly groupStartAt: InstantUs;
  readonly enrollmentValidUntil: InstantUs;
}
/** Condiciones congeladas al confirmar; las matrículas copian estos límites. */
export interface OriginalOrderItem extends OriginalPeriodBounds, EffectiveSchedule {
  readonly courseId: UUID; readonly groupId: UUID;
  readonly courseName: string; readonly groupName: string;
  readonly priceMinor: bigint; readonly currency: 'PEN';
}
export type ReservationDecision =
  | { readonly state: 'ADMITTED'; readonly intentionId: UUID; readonly admittedAt: UTCInstant }
  | { readonly state: 'CONFIRMED'; readonly intentionId: UUID; readonly orderId: UUID }
  | { readonly state: 'REJECTED'; readonly intentionId: UUID; readonly decisionCode: string };
export type OrderState = 'RESERVED' | 'ENROLLED' | 'EXPIRED';
export interface EnrollmentOrderSnapshot {
  readonly id: UUID; readonly studentId: UUID; readonly revision: Revision; readonly state: OrderState;
  readonly confirmedAt: InstantUs; readonly expiresAt: InstantUs;
  readonly currency: 'PEN'; readonly totalMinor: bigint; readonly items: readonly OriginalOrderItem[];
}
