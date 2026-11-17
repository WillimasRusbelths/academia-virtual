import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
/** Comparte solo lectura/hash entre Vitest y Playwright; sin dependencia del runner. */
export async function economicFingerprint(pool:Pool){
  const hash=createHash('sha256');for(const table of ['EnrollmentOrder','EnrollmentOrderItem','SeatReservation','VerifiedPayment','PaymentIncident','Enrollment','ProviderReceipt','PaymentAttempt','ReservationRequest','CoursePrice']){
    hash.update(table);hash.update((await pool.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text AS data FROM "${table}" t`)).rows[0].data);
  }return hash.digest('hex');
}
