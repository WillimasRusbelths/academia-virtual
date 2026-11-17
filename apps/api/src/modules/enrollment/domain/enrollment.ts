import type { InstantUs,OriginalOrderItem } from '../public/enrollment.js';

export interface EnrollmentPlanItem extends OriginalOrderItem {
  readonly confirmedAt:InstantUs;readonly validUntil:InstantUs;
}
/** Copiar el antecedente completo, sin recalcular período o vigencia actuales. */
export function enrollmentPlan(items:readonly OriginalOrderItem[],at:InstantUs):readonly EnrollmentPlanItem[]{
  return Object.freeze(items.map(item=>Object.freeze({...item,confirmedAt:at,validUntil:item.enrollmentValidUntil,
    schedule:Object.freeze(item.schedule.map(slot=>Object.freeze({...slot})))})));
}
