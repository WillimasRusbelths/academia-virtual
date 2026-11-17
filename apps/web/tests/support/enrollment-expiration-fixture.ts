import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test as paymentTest,expect } from './enrollment-payment-fixture';
import { repositoryRoot } from '../../../api/src/infrastructure/config/environment.js';
import { createReservationOfferingParticipant } from '../../../api/dist/src/modules/academic-offering/infrastructure/reservation-participant.js';

interface Worker {tick():Promise<{examined:number;expired:number;failed:number}>;beforeApplicationShutdown():Promise<void>}
export const test=paymentTest.extend<{expiration:{boundary:(delta:number)=>Promise<void>;snapshot:()=>Promise<{state:string;revision:string;expires:string;processed:string|null;expired:number;converted:number;audit:number}>;worker:()=>Promise<Worker>;futureGroup:()=>Promise<string>}}>({
  expiration:async({payment},use)=>{
    const workers:Worker[]=[];
    try{await use({
      async boundary(delta){
        const client=await payment.applicationPool.connect();
        try{await client.query('BEGIN');await client.query(`UPDATE "BrowserClock" SET instant=(SELECT "expiresAt" FROM "EnrollmentOrder" WHERE id=$1)+($2*interval '1 microsecond')`,[payment.orderId,delta]);
          await client.query(`UPDATE "Session" SET "createdAt"=(SELECT instant FROM "BrowserClock")-interval '1 minute',"lastAcceptedAt"=(SELECT instant FROM "BrowserClock")-interval '1 minute',"absoluteExpiresAt"=(SELECT instant FROM "BrowserClock")+interval '7 hours 59 minutes'`);await client.query('COMMIT');
        }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
      },
      async snapshot(){return (await payment.pool.query(`SELECT state,revision::text,to_char("expiresAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS expires,
        to_char("expirationProcessedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS processed,
        (SELECT count(*)::int FROM "SeatReservation" WHERE state='EXPIRED') AS expired,
        (SELECT count(*)::int FROM "SeatReservation" WHERE state='CONVERTED') AS converted,
        (SELECT count(*)::int FROM "EnrollmentAuditEvent" WHERE "effectKey"='ORDER_EXPIRED/'||$1::text) AS audit
        FROM "EnrollmentOrder" WHERE id=$1::uuid`,[payment.orderId])).rows[0];},
      async worker(){
        const filename=path.join(repositoryRoot(),'apps/api/dist/src/modules/enrollment/infrastructure/expiration-scheduler.js');
        expect(existsSync(filename),'T063 pendiente: worker real de vencimiento ausente; no es error de import o navegador').toBe(true);
        const exports=await import(pathToFileURL(filename).href),factory=exports.createReservationExpiration;
        expect(typeof factory,'T063 pendiente: composición del worker ausente').toBe('function');const worker=factory(payment.applicationPool,createReservationOfferingParticipant) as Worker;workers.push(worker);return worker;
      },
      async futureGroup(){
        const courseId=randomUUID(),groupId=randomUUID(),pool=payment.applicationPool;
        await pool.query(`INSERT INTO "AcademicCourse" (id,name,description,state) VALUES ($1,'Curso posterior ficticio','Ensayo de nueva intención','PUBLISHED')`,[courseId]);
        await pool.query(`INSERT INTO "CoursePrice" ("courseId","amountMinor",currency,revision,"changedBy") VALUES ($1,9000,'PEN',1,$2)`,[courseId,payment.prepared.actors.admin.id]);
        await pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,state,capacity,"periodStart","periodEnd","teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion") SELECT $1,$2,'Grupo posterior ficticio','PUBLISHED',1,'2090-01-05','2090-03-31',"teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion" FROM "AcademicGroup" WHERE id=$3`,[groupId,courseId,payment.prepared.offer.groupId]);
        await pool.query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,3,1080,1140)',[groupId]);return groupId;
      },
    });}finally{for(const worker of workers)await worker.beforeApplicationShutdown();}
  },
});
export {expect};
