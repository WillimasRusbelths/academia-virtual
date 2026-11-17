import type { PoolClient } from 'pg';
import type { EnrollmentOrderSnapshot,OriginalOrderItem } from '../public/enrollment.js';
import { instantFromEpochText } from './temporal.js';

/** Lectura interna reutilizada antes de capturar el token; el llamador cubre la orden. */
export async function readEnrollmentOrder(client:PoolClient,id:string):Promise<EnrollmentOrderSnapshot|null>{
      type OrderRow={id:string;studentId:string;revision:string;state:EnrollmentOrderSnapshot['state'];currency:'PEN';totalMinor:string;start:string;end:string};
      const row=(await client.query<OrderRow>(`SELECT id,"studentId",revision::text,state,currency,"totalMinor"::text,
        (extract(epoch FROM "confirmedAt")*1000000)::numeric(30,0)::text AS start,
        (extract(epoch FROM "expiresAt")*1000000)::numeric(30,0)::text AS end FROM "EnrollmentOrder" WHERE id=$1`,[id])).rows[0];
      if(!row)return null;
      type ItemRow={courseId:string;groupId:string;courseName:string;groupName:string;priceMinor:string;periodStart:string;periodEnd:string;
        timeZone:'America/Lima';scheduleSnapshot:OriginalOrderItem['schedule'];start:string;end:string};
      const items=(await client.query<ItemRow>(`SELECT "courseId","groupId","courseName","groupName","priceMinor"::text,
        to_char("periodStart",'YYYY-MM-DD') AS "periodStart",to_char("periodEnd",'YYYY-MM-DD') AS "periodEnd","timeZone","scheduleSnapshot",
        (extract(epoch FROM "groupStartAt")*1000000)::numeric(30,0)::text AS start,
        (extract(epoch FROM "enrollmentValidUntil")*1000000)::numeric(30,0)::text AS end
        FROM "EnrollmentOrderItem" WHERE "orderId"=$1 ORDER BY id`,[id])).rows;
      return Object.freeze({id:row.id,studentId:row.studentId,revision:row.revision,state:row.state,currency:row.currency,totalMinor:BigInt(row.totalMinor),
        confirmedAt:instantFromEpochText(row.start),expiresAt:instantFromEpochText(row.end),items:Object.freeze(items.map(item=>Object.freeze({
          courseId:item.courseId,groupId:item.groupId,courseName:item.courseName,groupName:item.groupName,priceMinor:BigInt(item.priceMinor),currency:'PEN' as const,
          periodStart:item.periodStart,periodEnd:item.periodEnd,timeZone:item.timeZone,
          groupStartAt:instantFromEpochText(item.start),enrollmentValidUntil:instantFromEpochText(item.end),
          schedule:Object.freeze(item.scheduleSnapshot.map(slot=>Object.freeze({dayOfWeek:slot.dayOfWeek,startTime:slot.startTime,endTime:slot.endTime}))),
        })))});
}
