import { randomUUID } from 'node:crypto';
import { test as paymentTest,expect } from './enrollment-payment-fixture';
import { economicFingerprint } from '../../../api/tests/support/enrollment-admin-facts.js';
interface AdminScenario {readonly incidentId:string;fingerprint():Promise<string>;notes():Promise<number>}
/** Hecho económico simulado explícitamente; usa receptor/finalizador de producto.
 * Sin endpoints ficticios de aprobación ni respuestas HTTP administrativas falsas. */
export const test=paymentTest.extend<{adminScenario:AdminScenario}>({adminScenario:async({payment,request},use)=>{
  const response=await request.post('/api/v1/enrollment/orders/'+payment.orderId+'/payment-attempts',{headers:{cookie:'av_session_dev='+payment.prepared.actors.owner.secret,origin:'http://localhost:5173','x-csrf-protection':'1'},data:{initiationId:randomUUID()}});expect(response.status()).toBe(200);
  await payment.expire();expect((await payment.economicFact()).state).toBe('INCIDENT');
  const row=(await payment.pool.query('SELECT id FROM "PaymentIncident" WHERE "orderId"=$1',[payment.orderId])).rows[0];expect(row?.id).toEqual(expect.any(String));
  await use({incidentId:row.id,fingerprint:()=>economicFingerprint(payment.pool),notes:async()=>(await payment.pool.query('SELECT count(*)::int AS n FROM "IncidentFollowUp" WHERE "incidentId"=$1',[row.id])).rows[0].n});
}});
export {expect};
