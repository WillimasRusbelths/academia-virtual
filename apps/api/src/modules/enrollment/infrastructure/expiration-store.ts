import type { EnrollmentTransactionContext } from '../../../infrastructure/database/enrollment-transaction.js';
import { EnrollmentTransactionUnavailable } from '../../../infrastructure/database/enrollment-transaction.js';
import type { ExpirationNormalizer } from '../application/ports.js';
import { expirationDecision } from '../application/expire-reservations.js';
import { readEnrollmentOrder } from './financial-reads.js';
import { createEnrollmentAudit } from './audit.js';
import { postgresInstantParameter } from './temporal.js';

export function createExpirationNormalizer(context:EnrollmentTransactionContext,requestId:string):ExpirationNormalizer {
  return {normalize:(orderId,decision)=>context.use(async()=>{
    context.assertDecision(decision);
    if(context.mode!=='WRITE'||context.authority.kind!=='SYSTEM')throw new EnrollmentTransactionUnavailable();
    if(!context.locked.orderIds.includes(orderId))throw new EnrollmentTransactionUnavailable();
    const order=await readEnrollmentOrder(context.client,orderId);
    if(!order)throw new EnrollmentTransactionUnavailable();
    const result=expirationDecision(order,decision);if(result!=='EXPIRED')return result;
    const seats=await context.client.query(`UPDATE "SeatReservation" SET state='EXPIRED' WHERE "orderItemId" IN
      (SELECT id FROM "EnrollmentOrderItem" WHERE "orderId"=$1) AND state='CONFIRMED'`,[orderId]);
    if(seats.rowCount!==order.items.length)throw new EnrollmentTransactionUnavailable();
    await context.client.query(`UPDATE "EnrollmentOrder" SET state='EXPIRED',revision=revision+1,"expirationProcessedAt"=$2 WHERE id=$1 AND state='RESERVED'`,[orderId,postgresInstantParameter(decision.at)]);
    await createEnrollmentAudit(context).write({operation:'ORDER_EXPIRED',targetId:orderId,requestId,beforeRevision:order.revision,afterRevision:String(BigInt(order.revision)+1n),result:'EXPIRED'});
    return result;
  })};
}
