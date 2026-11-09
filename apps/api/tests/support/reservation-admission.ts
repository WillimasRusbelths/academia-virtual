import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { preEnrollmentDatabase, insertEnrollmentRow } from './enrollment-migration.js';
import type { EnrollmentTable } from './enrollment-migration.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { createReservationAdmission } from '../../src/modules/enrollment/infrastructure/admission.js';
import { us1Http } from './us1-http.js';

/** Harness PG real. Ningún helper decide admisión, prioridad, reserva o respuesta HTTP. */
export async function reservationAdmissionFixture(withHttp=false){
  const f=await preEnrollmentDatabase();let http:Awaited<ReturnType<typeof us1Http>>|undefined;
  try{
    await f.applyEnrollment();const pool=f.database.pool,sessions=new PostgresSessionStore(pool),actor=(await sessions.lookup(f.student.secret))!;
    const authorization={revalidateInTransaction:sessions.revalidateInTransaction.bind(sessions)};
    const otherGroupId=randomUUID();
    await pool.query('INSERT INTO "AcademicGroup" (id,"courseId",name) VALUES ($1,$2,$3)',[otherGroupId,f.otherCourseId,'Otro grupo ficticio']);
    if(withHttp)http=await us1Http({context:f});
    const selection=(groupIds:readonly string[]=[f.groupId])=>({intentionId:randomUUID(),groupIds});
    const target=(selectedPool:Pool=pool)=>createReservationAdmission(selectedPool,authorization);
    const counts=async()=>(await pool.query(`SELECT (SELECT count(*)::int FROM "ReservationRequest") AS requests,
      (SELECT count(*)::int FROM "EnrollmentOrder") AS orders,(SELECT count(*)::int FROM "SeatReservation") AS seats,
      (SELECT count(*)::int FROM "EnrollmentCommand") AS commands,(SELECT "nextSequence"::text FROM "AdmissionSequence" WHERE id=1) AS next`)).rows[0];
    const row=async(intentionId:string,studentId:string=f.student.userId)=>(await pool.query(`SELECT r.id,r."studentId",r."intentionId",r."groupIds",r.state,r."decisionCode",r."admissionSequence"::text AS sequence,
      to_char(r."admittedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "admittedAt",o.id AS "orderId"
      FROM "ReservationRequest" r LEFT JOIN "EnrollmentOrder" o ON o."requestId"=r.id WHERE r."intentionId"=$1 AND r."studentId"=$2`,[intentionId,studentId])).rows[0];
    return {...f,http,pool,sessions,actor,otherGroupId,authorization,selection,target,counts,row,
      close:async()=>{try{await http?.close();}finally{await f.cleanup();}}};
  }catch(error){try{await http?.close();}finally{await f.cleanup();}throw error;}
}
export type ReservationAdmissionFixture=Awaited<ReturnType<typeof reservationAdmissionFixture>>;
/** Secuencia exclusivamente de inyección de fallos: nunca asigna prioridad. */
export async function installAdmissionSerializationFault(f:ReservationAdmissionFixture){
  await f.isolated.ownerQuery(`CREATE SEQUENCE admission_fault_counter;
    CREATE FUNCTION abort_admission_once() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF nextval('admission_fault_counter')=1 THEN RAISE SQLSTATE '40001'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER abort_admission_once BEFORE INSERT ON "ReservationRequest" FOR EACH ROW EXECUTE FUNCTION abort_admission_once()`);
}
/** Solo hechos históricos ficticios: reutiliza el digest opaco de una solicitud
 * fuente. No calcula el hash del producto, no cambia timestamps inmutables ni
 * acredita que el sistema haya confirmado/expirado una reserva. */
export async function expiredAdmissionFixture(f:ReservationAdmissionFixture,sourceRequestId:string){
  const client=await f.pool.connect();
  const id=randomUUID(),intentionId=randomUUID(),orderId=randomUUID(),itemId=randomUUID();
  try{
    await client.query('BEGIN');
    const sequence=(await client.query('SELECT "nextSequence"::text AS value FROM "AdmissionSequence" WHERE id=1 FOR UPDATE')).rows[0].value;
    await client.query(`INSERT INTO "ReservationRequest" (id,"studentId","intentionId","selectionDigest","groupIds","admittedAt","admissionSequence","actorSessionReference","authVersion",state,"decisionCode","decidedAt")
      SELECT $1,"studentId",$2,"selectionDigest","groupIds",'2026-01-01T00:00:00.123456Z',$3,"actorSessionReference","authVersion",'CONFIRMED','RESERVATION_CONFIRMED','2026-01-01T00:00:00.123456Z' FROM "ReservationRequest" WHERE id=$4`,[id,intentionId,sequence,sourceRequestId]);
    await client.query('UPDATE "AdmissionSequence" SET "nextSequence"="nextSequence"+1 WHERE id=1');
    await client.query(`INSERT INTO "EnrollmentOrder" (id,"studentId","requestId",currency,"totalMinor",state,revision,"confirmedAt","expiresAt","expirationProcessedAt")
      VALUES ($1,$2,$3,'PEN',12500,'EXPIRED',1,'2026-01-01T00:00:00.123456Z','2026-01-02T00:00:00.123456Z','2026-01-02T00:00:00.123456Z')`,[orderId,f.student.userId,id]);
    await client.query(`INSERT INTO "EnrollmentOrderItem" (id,"orderId","courseId","groupId","priceMinor","courseName","groupName","periodStart","periodEnd","timeZone","groupStartAt","enrollmentValidUntil","scheduleSnapshot")
      VALUES ($1,$2,$3,$4,12500,'Curso histórico ficticio','Grupo histórico ficticio','2030-01-07','2030-01-31','America/Lima','2030-01-07T05:00:00.000000Z','2030-02-01T05:00:00.000000Z','[{"dayOfWeek":1,"startTime":"18:00","endTime":"19:00"}]')`,[itemId,orderId,f.courseId,f.groupId]);
    await client.query('INSERT INTO "SeatReservation" ("orderItemId",state) VALUES ($1,\'EXPIRED\')',[itemId]);
    await client.query('COMMIT');return {id,intentionId,orderId,sequence};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
/** Semilla independiente para verificar restricciones del helper histórico aun
 * cuando el objetivo de admisión todavía falla antes de escribir. */
export async function seedAdmissionSource(f:ReservationAdmissionFixture){
  const id=randomUUID(),intentionId=randomUUID();
  await insertEnrollmentRow(f.pool,'ReservationRequest',{id,studentId:f.student.userId,intentionId,selectionDigest:randomBytes(32),groupIds:[f.groupId],
    admittedAt:'2026-01-01T00:00:00.123456Z',admissionSequence:'1',actorSessionReference:f.student.sessionId,authVersion:'0',state:'ADMITTED'});
  await f.pool.query('UPDATE "AdmissionSequence" SET "nextSequence"=2 WHERE id=1');return {id,intentionId};
}
export async function commitmentRows(pool:Pool){
  const result:Record<string,unknown>={};
  for(const table of ['EnrollmentOrder','EnrollmentOrderItem','SeatReservation','Enrollment','VerifiedPayment','CoursePrice'] satisfies EnrollmentTable[]){
    result[table]=(await pool.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM "${table}" t`)).rows[0].rows;
  }
  return result;
}
