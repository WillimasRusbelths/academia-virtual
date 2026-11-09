import 'reflect-metadata';
import { test as base,expect } from '@playwright/test';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { academicOfferingDataset } from '../../../api/tests/support/academic-offering.js';
import { prepareEnrollmentFixture } from '../../../api/tests/support/enrollment.js';
import { enrollmentClock } from './enrollment-clock';
import { AppModule } from '../../../api/dist/src/app.module.js';
import * as paymentBindings from '../../../api/dist/src/modules/enrollment/application/payments.js';
import * as paymentStores from '../../../api/dist/src/modules/enrollment/infrastructure/enrollment-store.js';
import { createDatabase } from '../../../api/dist/src/infrastructure/database/database.js';
import { configureTransport } from '../../../api/dist/src/http/transport.js';
import { repositoryRoot } from '../../../api/src/infrastructure/config/environment.js';
import { createReservationOfferingParticipant } from '../../../api/dist/src/modules/academic-offering/infrastructure/reservation-participant.js';
import type { GatewayAttempt,GatewayInitiation,GatewayObservation,PaymentGateway } from '../../../api/src/modules/enrollment/public/payments.js';

/** Pago ficticio solo en soporte de Playwright. Nunca ruta de aprobación,
 * respuesta HTTP financiera fabricada o sustituto del finalizador de producto. */
async function createPaymentBrowser(){
  const probe=createServer();await new Promise<void>((resolve,reject)=>{probe.once('error',reject);probe.listen(5173,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
  const data=await academicOfferingDataset('payment_browser');
  let app:NestExpressApplication|undefined,web:ReturnType<typeof spawn>|undefined,database:ReturnType<typeof createDatabase>|undefined;
  try{
    const clock=await enrollmentClock(data),prepared=await prepareEnrollmentFixture(data),pool=data.context.database.pool;
    await pool.query(`UPDATE "Session" SET "createdAt"='2090-01-02T04:58:00Z',"lastAcceptedAt"='2090-01-02T04:58:00Z',"absoluteExpiresAt"='2090-01-02T12:58:00Z'`);
    await pool.query(`INSERT INTO "CoursePrice" ("courseId","amountMinor",currency,revision,"changedBy") VALUES ($1,12500,'PEN',1,$2)`,[prepared.offer.courseId,prepared.actors.admin.id]);
    const courseId=randomUUID(),groupId=randomUUID();
    await pool.query(`INSERT INTO "AcademicCourse" (id,name,description,state) VALUES ($1,'Segundo curso ficticio','Oferta ficticia','PUBLISHED')`,[courseId]);
    await pool.query(`INSERT INTO "CoursePrice" ("courseId","amountMinor",currency,revision,"changedBy") VALUES ($1,7000,'PEN',1,$2)`,[courseId,prepared.actors.admin.id]);
    await pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,state,capacity,"periodStart","periodEnd","teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion") SELECT $1,$2,'Segundo grupo ficticio','PUBLISHED',2,"periodStart","periodEnd","teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion" FROM "AcademicGroup" WHERE id=$3`,[groupId,courseId,prepared.offer.groupId]);
    await pool.query(`INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,2,1080,1140)`,[groupId]);
    const calls:GatewayAttempt[]=[],control={result:{state:'PENDING',providerReference:'fixture-operation'} as GatewayInitiation};
    const gateway:PaymentGateway={async initiate(input){calls.push({...input});return control.result;},async recover(){return {state:'UNRESOLVED'};},async verify(){return {state:'UNRESOLVED'};}};
    const environment={...data.context.environment,appOrigin:'http://localhost:5173'};
    database=createDatabase(environment);clock.configure(database.pool);
    const builder=Test.createTestingModule({imports:[AppModule.forRoot(environment,database)]});
    const binding=Reflect.get(paymentBindings,'PAYMENT_GATEWAY');if(binding!==undefined){builder.overrideProvider(binding).useValue(gateway);builder.overrideProvider(Reflect.get(paymentBindings,'PAYMENT_CONFIGURATION')).useValue({providerScope:'fixture/provider/merchant/sandbox'});}
    app=(await builder.compile()).createNestApplication<NestExpressApplication>({logger:false,bodyParser:false});configureTransport(app,environment);await app.listen(0,'127.0.0.1');const backend=await app.getUrl();
    web=spawn(process.execPath,[path.join(repositoryRoot(),'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5173','--strictPort'],{cwd:path.join(repositoryRoot(),'apps/web'),env:{...process.env,API_PROXY_TARGET:backend},stdio:'ignore'});
    let ready=false;for(let i=0;i<100;i++){if(web.exitCode!==null)break;try{ready=(await fetch('http://localhost:5173/',{signal:AbortSignal.timeout(1000)})).ok;}catch{/* Espera acotada de readiness. */}if(ready)break;await pause(100);}
    if(!ready)throw new Error('Web de pago no disponible; valores omitidos.');expect((await fetch(backend+'/health/ready')).status).toBe(200);
    const headers={'content-type':'application/json',origin:environment.appOrigin,'x-csrf-protection':'1',cookie:'av_session_dev='+prepared.actors.owner.secret};
    const intentionId=randomUUID(),admit=await fetch(backend+'/api/v1/enrollment/reservation-requests',{method:'POST',headers,body:JSON.stringify({intentionId,groupIds:[prepared.offer.groupId,groupId]})});expect(admit.status).toBe(200);
    const row=async()=>(await pool.query(`SELECT r.state,o.id FROM "ReservationRequest" r LEFT JOIN "EnrollmentOrder" o ON o."requestId"=r.id WHERE r."intentionId"=$1`,[intentionId])).rows[0];
    await expect.poll(async()=>(await row())?.state).toBe('CONFIRMED');const orderId=(await row()).id as string;
    const order=await (await fetch(backend+'/api/v1/enrollment/orders/'+orderId,{headers})).json();
    async function counts(){return (await pool.query(`SELECT (SELECT count(*)::int FROM "PaymentAttempt") AS attempts,(SELECT count(*)::int FROM "VerifiedPayment") AS payments,(SELECT count(*)::int FROM "Enrollment") AS enrollments,(SELECT count(*)::int FROM "PaymentIncident") AS incidents`)).rows[0];}
    async function close(){if(web?.pid&&web.exitCode===null){const closed=new Promise<void>(resolve=>web!.once('exit',()=>resolve()));web.kill('SIGTERM');await closed;}try{await app?.close();}finally{try{await database?.close();}finally{await data.cleanup();}}}
    return {data,prepared,pool,orderId,original:order.data,calls,control,counts,close,
      async expire(){
        // El salto de reloj y las sesiones ficticias se publican juntos. Una
        // petición concurrente no debe observar reloj nuevo con sesión antigua.
        const client=await database!.pool.connect();
        try{
          await client.query('BEGIN');
          await client.query(`UPDATE "BrowserClock" SET instant=(SELECT "expiresAt" FROM "EnrollmentOrder" WHERE id=$1)`,[orderId]);
          await client.query(`UPDATE "Session" SET "createdAt"=(SELECT instant FROM "BrowserClock")-interval '1 minute',"lastAcceptedAt"=(SELECT instant FROM "BrowserClock")-interval '1 minute',"absoluteExpiresAt"=(SELECT instant FROM "BrowserClock")+interval '7 hours 59 minutes'`);
          await client.query('COMMIT');
        }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
      },
      async economicFact(){
        expect(calls).toHaveLength(1);const attempt=calls[0],observation:GatewayObservation={state:'ECONOMIC_FACT',evidence:{providerScope:attempt.providerScope,providerPaymentId:randomUUID(),merchantReference:attempt.merchantReference,amountUnits:19500n,amountScale:2,currency:'PEN',normalizedEvidenceReference:'fixture/browser/evidence'}};
        const receiptPath=path.join(repositoryRoot(),'apps/api/dist/src/modules/enrollment/infrastructure/payment-receipts.js');
        expect(existsSync(receiptPath),'T050 pendiente: receptor técnico real ausente; sin aprobación ficticia').toBe(true);
        const receipts=await import(pathToFileURL(receiptPath).href);
        const receiver=receipts.createPaymentReceiptReceiver;
        expect(typeof receiver,'T050 pendiente: receptor técnico real ausente').toBe('function');
        const finalizer=Reflect.get(paymentStores,'createPaymentVerification');expect(typeof finalizer,'T051 pendiente: finalizador real ausente').toBe('function');
        const received=await receiver(database!.pool,{async authenticate(){return {providerScope:attempt.providerScope,merchantReferenceHint:attempt.merchantReference,normalizedEvidenceReference:'fixture/browser/evidence',observation};}}).receive({fixture:'browser-internal-only'},randomUUID());
        return finalizer(database!.pool,createReservationOfferingParticipant).finalize({receiptId:received.receiptId,observation,requestId:randomUUID()});
      },
    };
  }catch(error){if(web?.pid&&web.exitCode===null)web.kill('SIGTERM');try{await app?.close();}finally{try{await database?.close();}finally{await data.cleanup();}}throw error;}
}
export const test=base.extend<{payment:Awaited<ReturnType<typeof createPaymentBrowser>>}>({payment:[async({baseURL},use)=>{if(baseURL!=='http://localhost:5173')throw new Error('Origen del ensayo de pago discrepante.');const payment=await createPaymentBrowser();try{await use(payment);}finally{await payment.close();}},{timeout:120000}]});
export {expect};
