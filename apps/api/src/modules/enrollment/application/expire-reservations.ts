import type { EnrollmentOrderSnapshot } from '../public/enrollment.js';
import type { TemporalDecision } from './ports.js';
import { EnrollmentError } from '../domain/enrollment-error.js';

/** Misma regla para normalización oportuna y scheduler; no captura otro reloj. */
export function expirationDecision(order:EnrollmentOrderSnapshot,decision:TemporalDecision):'EXPIRED'|'NOT_DUE'|'ALREADY_TERMINAL' {
  if(decision.at<order.confirmedAt)throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
  if(order.state!=='RESERVED')return 'ALREADY_TERMINAL';
  return decision.at<order.expiresAt?'NOT_DUE':'EXPIRED';
}
