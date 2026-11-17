import type { PoolClient } from 'pg';
import type { ReservationOfferingAccess } from '../../academic-offering/public/reservation-boundary.js';
import type { EnrollmentTopology } from '../application/ports.js';
import { canonicalLockIds } from '../../../infrastructure/database/account-locks.js';
import { EnrollmentTransactionUnavailable } from '../../../infrastructure/database/enrollment-transaction.js';

export interface AdministrativeSelection {readonly orderIds:readonly string[];readonly incidentIds:readonly string[]}
/** Solo descubre referencias. El coordinador conserva el orden de locks y repite
 * este descubrimiento después de bloquear. Una incidencia sin orden no inventa dueño. */
export async function administrativeTopology(client:PoolClient,offering:ReservationOfferingAccess,selection:AdministrativeSelection,write=false):Promise<EnrollmentTopology>{
  const row=(await client.query<Omit<EnrollmentTopology,'accountIds'>&{studentIds:string[]}>(`WITH
    requested_incidents AS (SELECT * FROM "PaymentIncident" WHERE id=ANY($2::uuid[])),
    o AS (SELECT id,"studentId" FROM "EnrollmentOrder" WHERE id=ANY($1::uuid[]) OR id IN (SELECT "orderId" FROM requested_incidents)),
    i AS (SELECT * FROM "PaymentIncident" WHERE id=ANY($2::uuid[]) OR "orderId" IN (SELECT id FROM o)),
    p AS (SELECT id FROM "VerifiedPayment" WHERE "orderId" IN (SELECT id FROM o) UNION SELECT "verifiedPaymentId" FROM i),
    e AS (SELECT * FROM "Enrollment" WHERE "orderItemId" IN (SELECT id FROM "EnrollmentOrderItem" WHERE "orderId" IN (SELECT id FROM o))),
    items AS (SELECT "courseId","groupId" FROM "EnrollmentOrderItem" WHERE "orderId" IN (SELECT id FROM o))
    SELECT ARRAY(SELECT id FROM o ORDER BY id) AS "orderIds",ARRAY(SELECT DISTINCT "studentId" FROM o) AS "studentIds",
      ARRAY(SELECT id FROM i ORDER BY id) AS "incidentIds",ARRAY(SELECT id FROM p ORDER BY id) AS "paymentIds",
      ARRAY(SELECT id FROM e ORDER BY id) AS "enrollmentIds",
      ARRAY(SELECT id FROM "PaymentAttempt" WHERE "orderId" IN (SELECT id FROM o) ORDER BY id) AS "attemptIds",
      ARRAY(SELECT id FROM "ProviderReceipt" WHERE "terminalPaymentId" IN (SELECT id FROM p) ORDER BY id) AS "receiptIds",
      ARRAY(SELECT "courseId" FROM items UNION SELECT "courseId" FROM e) AS "courseIds",
      ARRAY(SELECT "groupId" FROM items UNION SELECT "groupId" FROM e UNION SELECT unnest("affectedGroupIds") FROM i) AS "groupIds"`,[selection.orderIds,selection.incidentIds])).rows[0];
  const refs=await offering.discover(row.groupIds);
  if(refs.length!==row.groupIds.length)throw new EnrollmentTransactionUnavailable();
  return {accountIds:write?canonicalLockIds([...row.studentIds,...refs.flatMap(r=>r.teacherUserId?[r.teacherUserId]:[])]):[],
    courseIds:canonicalLockIds([...row.courseIds,...refs.map(r=>r.courseId)]),groupIds:canonicalLockIds(row.groupIds),
    orderIds:canonicalLockIds(row.orderIds),attemptIds:canonicalLockIds(row.attemptIds),receiptIds:canonicalLockIds(row.receiptIds),
    paymentIds:canonicalLockIds(row.paymentIds),enrollmentIds:canonicalLockIds(row.enrollmentIds),incidentIds:canonicalLockIds(row.incidentIds)};
}
