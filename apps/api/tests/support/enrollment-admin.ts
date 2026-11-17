import { randomUUID } from 'node:crypto';
import { preEnrollmentDatabase,insertEnrollmentRow } from './enrollment-migration.js';
import { seedCommitment } from './enrollment-maintenance.js';
import type { CommitmentFixture } from './enrollment-maintenance.js';
import { sessionFixture } from './session-fixture.js';
import { us1Http } from './us1-http.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { createEnrollmentQueries } from '../../src/modules/enrollment/infrastructure/queries.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import * as stores from '../../src/modules/enrollment/infrastructure/enrollment-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import type { FollowUpStore } from './follow-up-contract.js';
/** Hechos ficticios explícitos, no finalizador ni API administrativa sustitutos. */
export async function adminFixture(kind:CommitmentFixture='INCIDENT'){
  const f=await preEnrollmentDatabase();let http:Awaited<ReturnType<typeof us1Http>>|undefined;
  try{
    await f.applyEnrollment();const pool=f.database.pool;
    await pool.query(`UPDATE "AcademicCourse" SET state='PUBLISHED' WHERE id=$1`,[f.courseId]);
    await pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',capacity=2,"periodStart"='2090-01-02',"periodEnd"='2090-03-31',
      "teacherUserId"=$2,"publishedTeacherUserId"=$2,"publishedTeacherEligibilityVersion"=(SELECT "eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"=$2) WHERE id=$1`,[f.groupId,f.teacher.userId]);
    await pool.query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`,[f.groupId]);
    await seedCommitment(f,kind);const other=await sessionFixture(f,'STUDENT'),sessions=new PostgresSessionStore(pool);
    const authorization={revalidateInTransaction:sessions.revalidateInTransaction.bind(sessions)},adminActor=(await sessions.lookup(f.admin.secret))!;
    http=await us1Http({context:f});const h=http;
    const orderId=(await pool.query('SELECT id FROM "EnrollmentOrder" LIMIT 1')).rows[0]?.id as string|undefined;
    const incidentId=((await pool.query('SELECT id FROM "PaymentIncident" LIMIT 1')).rows[0]?.id??randomUUID()) as string;
    async function request(method:string,path:string,body?:unknown,secret:string|null=f.admin.secret,headers:Record<string,string>={}){
      return fetch(h.url+'/api/v1'+path,{method,headers:{...h.headers(secret??undefined),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    }
    return {...f,pool,http:h,other,orderId,incidentId,request,sessions,authorization,adminActor,
      follow:(body:unknown,secret:string|undefined=f.admin.secret)=>request('POST',`/admin/enrollment/incidents/${incidentId}/follow-ups`,body,secret),
      command:()=>({commandId:randomUUID(),content:'Seguimiento interno ficticio: pendiente de resolución económica.'}),
      async counts(){return (await pool.query(`SELECT (SELECT count(*)::int FROM "IncidentFollowUp") AS notes,
        (SELECT count(*)::int FROM "EnrollmentCommand") AS commands,(SELECT count(*)::int FROM "EnrollmentAuditEvent") AS audits`)).rows[0] as {notes:number;commands:number;audits:number};},
      async close(){try{await h.close();}finally{await f.cleanup();}}
    };
  }catch(error){try{await http?.close();}finally{await f.cleanup();}throw error;}
}
export type AdminFixture=Awaited<ReturnType<typeof adminFixture>>;
interface AdminReads {
  adminOrders(actor:SessionActor,input:{page:number;pageSize:number;studentId?:string}):Promise<{items:Record<string,unknown>[];total:number}>;
  adminOrder(actor:SessionActor,id:string):Promise<Record<string,unknown>|null>;
  incidents(actor:SessionActor,input:{page:number;pageSize:number}):Promise<{items:Record<string,unknown>[];total:number}>;
  incident(actor:SessionActor,id:string):Promise<Record<string,unknown>|null>;
}
export function adminReads(f:AdminFixture):AdminReads {
  const reader=createEnrollmentQueries(f.pool,f.authorization,createReservationOfferingParticipant);
  for(const name of ['adminOrders','adminOrder','incidents','incident'])if(typeof Reflect.get(reader,name)!=='function')throw new Error('T073 pendiente: consulta administrativa no implementada.');
  return reader as unknown as AdminReads;
}
export function followUpStore(f:AdminFixture):FollowUpStore {
  const factory:unknown=Reflect.get(stores,'createIncidentFollowUpStore');if(typeof factory!=='function')throw new Error('T074 pendiente: escritura PG de seguimiento no implementada.');
  return factory(f.pool,f.authorization,createReservationOfferingParticipant) as FollowUpStore;
}
export { economicFingerprint } from './enrollment-admin-facts.js';
export async function unknownIncident(f:AdminFixture){
  const payment=randomUUID(),incident=randomUUID();
  await insertEnrollmentRow(f.pool,'VerifiedPayment',{id:payment,providerScope:'fixture/provider/merchant/sandbox',providerPaymentId:randomUUID(),amountUnits:'12500',amountScale:2,currency:'PEN',merchantReference:'fixture-unknown',verificationFinishedAt:'2026-01-01T00:00:00.123456Z',reconciliationState:'INCIDENT',normalizedEvidenceReference:'fixture/unknown-private'});
  await insertEnrollmentRow(f.pool,'PaymentIncident',{id:incident,verifiedPaymentId:payment,reason:'UNKNOWN_REFERENCE',affectedGroupIds:[],openedAt:'2026-01-01T00:00:00.123456Z'});return incident;
}
