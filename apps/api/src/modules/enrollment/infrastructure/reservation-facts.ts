import type { EnrollmentTransactionContext } from '../../../infrastructure/database/enrollment-transaction.js';
import type { ReservationOfferingAccess } from '../../academic-offering/public/reservation-boundary.js';
import type { EffectiveCommitment } from '../domain/compatibility.js';
import type { ReservableGroup, ReservationInput } from '../domain/reservation.js';
import { EnrollmentError } from '../domain/enrollment-error.js';
import { createEnrollmentCalendar, postgresInstantParameter } from './temporal.js';
import { createEnrollmentFinancialParticipant } from './enrollment-store.js';

/** Solo consultas propias y participante público de oferta, tras locks y token. */
export async function reservationFacts(context:EnrollmentTransactionContext,offering:ReservationOfferingAccess,studentId:string,groupIds:readonly string[]):Promise<{facts:Omit<ReservationInput,'at'>;previousOrderId:string|null}> {
  context.assertActive();
  const at=postgresInstantParameter(context.decision.at),snapshots=await offering.snapshots(groupIds),calendar=createEnrollmentCalendar(context.client);
  const groups:ReservableGroup[]=[];
  for(const s of snapshots){
    if(s.periodStart===null||s.periodEnd===null)throw new EnrollmentError({code:'OFFERING_NOT_RESERVABLE'});
    const price=(await context.client.query<{amount:string;currency:'PEN'}>('SELECT "amountMinor"::text AS amount,currency FROM "CoursePrice" WHERE "courseId"=$1',[s.courseId])).rows[0];
    const counts=(await context.client.query<{reserved:number;enrolled:number}>(`SELECT
      (SELECT count(*)::int FROM "SeatReservation" r JOIN "EnrollmentOrderItem" i ON i.id=r."orderItemId" JOIN "EnrollmentOrder" o ON o.id=i."orderId"
        WHERE i."groupId"=$1 AND r.state='CONFIRMED' AND o.state='RESERVED' AND o."confirmedAt"<=$2::timestamptz AND $2::timestamptz<o."expiresAt") AS reserved,
      (SELECT count(*)::int FROM "Enrollment" e WHERE e."groupId"=$1 AND e."confirmedAt"<=$2::timestamptz AND $2::timestamptz<e."validUntil") AS enrolled`,[s.groupId,at])).rows[0];
    groups.push({courseId:s.courseId,groupId:s.groupId,courseName:s.courseName,groupName:s.groupName,studentVisible:s.studentVisible,teacherEligible:s.teacherEligible,teacherReviewRequired:s.teacherReviewRequired,
      capacity:s.capacity,reserved:counts.reserved,enrolled:counts.enrolled,price:price?{amountMinor:BigInt(price.amount),currency:price.currency}:null,
      periodStart:s.periodStart,periodEnd:s.periodEnd,timeZone:s.timeZone,schedule:s.schedule,...await calendar.originalBounds(s.periodStart,s.periodEnd)});
  }
  type Row={courseId:string;groupId:string;kind:EffectiveCommitment['kind'];state:EffectiveCommitment['state'];start:string;end:string;periodStart:string;periodEnd:string;timeZone:'America/Lima';schedule:EffectiveCommitment['schedule']};
  const rows=(await context.client.query<Row>(`SELECT i."courseId",i."groupId",'RESERVATION' AS kind,r.state::text,
      (extract(epoch FROM o."confirmedAt")*1000000)::numeric(30,0)::text AS start,(extract(epoch FROM o."expiresAt")*1000000)::numeric(30,0)::text AS end,
      to_char(i."periodStart",'YYYY-MM-DD') AS "periodStart",to_char(i."periodEnd",'YYYY-MM-DD') AS "periodEnd",i."timeZone",i."scheduleSnapshot" AS schedule
      FROM "EnrollmentOrder" o JOIN "EnrollmentOrderItem" i ON i."orderId"=o.id JOIN "SeatReservation" r ON r."orderItemId"=i.id WHERE o."studentId"=$1 AND o.state='RESERVED'
    UNION ALL SELECT e."courseId",e."groupId",'ENROLLMENT','ENROLLED',
      (extract(epoch FROM e."confirmedAt")*1000000)::numeric(30,0)::text,(extract(epoch FROM e."validUntil")*1000000)::numeric(30,0)::text,
      to_char(e."originalPeriodStart",'YYYY-MM-DD'),to_char(e."originalPeriodEnd",'YYYY-MM-DD'),e."timeZone",e."scheduleSnapshot" FROM "Enrollment" e WHERE e."studentId"=$1`,[studentId])).rows;
  const commitments:EffectiveCommitment[]=rows.map(r=>({courseId:r.courseId,groupId:r.groupId,kind:r.kind,state:r.state,confirmedAt:BigInt(r.start),validUntil:BigInt(r.end),studentVisible:false,periodStart:r.periodStart,periodEnd:r.periodEnd,timeZone:r.timeZone,schedule:r.schedule}));
  const previous=await createEnrollmentFinancialParticipant(context).currentOrder(studentId);
  if(previous&&context.decision.at<previous.confirmedAt)throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
  return {facts:{groupIds,groups,commitments,activeOrder:previous?{state:previous.state,expiresAt:previous.expiresAt}:null},previousOrderId:previous?.id??null};
}
