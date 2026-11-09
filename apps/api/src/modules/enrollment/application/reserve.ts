import type { SessionActor } from '../../authorization/public/session.js';
import type { ReservationDecision, ReservationSelection, UUID } from '../public/enrollment.js';
import type { EnrollmentDecisionCapabilities } from './ports.js';
import { prepareReservation } from '../domain/reservation.js';
import type { ReservationInput } from '../domain/reservation.js';
export const RESERVATION_ADMISSION=Symbol('RESERVATION_ADMISSION');

/** Puerto preparado en T024. No confirma reservas ni ofrece una transacción a aplicación. */
export type ReservationAdmissionResult=ReservationDecision&{readonly id:UUID};
export interface ReservationAdmission {
  admit(actor:SessionActor,selection:ReservationSelection,requestId:UUID):Promise<ReservationAdmissionResult>;
}

/** El coordinador aporta hechos bajo locks y el token definitivo. La aplicación
 * nunca recibe SQL o una conexión y no vuelve a capturar reloj al normalizar. */
export async function confirmReservation(studentId:UUID,requestId:UUID,selection:ReservationSelection,
  facts:Omit<ReservationInput,'at'>,previousOrderId:UUID|null,
  capabilities:Pick<EnrollmentDecisionCapabilities,'decision'|'expiration'|'store'>):Promise<UUID> {
  const {decision,expiration,store}=capabilities;
  const plan=prepareReservation({...facts,at:decision.at});
  if(previousOrderId&&facts.activeOrder?.state==='RESERVED'&&facts.activeOrder.expiresAt<=decision.at)await expiration.normalize(previousOrderId,decision);
  return store.confirm({studentId,requestId,selection,items:plan.items,totalMinor:plan.totalMinor,decision});
}
