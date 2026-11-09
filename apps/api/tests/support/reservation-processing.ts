/// <reference types="vite/client" />
import { randomBytes, randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { Pool } from 'pg';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import { reservationAdmissionFixture } from './reservation-admission.js';
import type { ReservationAdmissionFixture } from './reservation-admission.js';
import { insertEnrollmentRow } from './enrollment-migration.js';

/** Puertos de conformidad del ensayo. No son implementaciones ni APIs públicas.
 * Globs literales permiten ejecutar preparación antes de T031/T034, sin imports
 * rotos, mocks de SQL, test.fails ni resultados de negocio sustitutos. */
type Dependencies=ReservationAdmissionFixture['authorization'];
export interface DispatchTarget { dispatchNext(requestId:string):Promise<{state:'IDLE'|'CONFIRMED'|'REJECTED';requestId?:string}> }
export interface InventoryRow {groupId:string;capacity:number;reserved:number;occupied:number;available:number;priceMinor:string|null}
export interface InventoryResult {items:InventoryRow[];evaluatedAt:string;totalMinor?:string}
export interface QueryTarget {
  offerings(actor:SessionActor,input:{page:number;pageSize:number;q?:string}):Promise<InventoryResult>;
  preview(actor:SessionActor,groupIds:readonly string[]):Promise<InventoryResult>;
  order(actor:SessionActor,id:string):Promise<{id:string;state:string;paymentAllowed:boolean;serverNow:string;items:readonly unknown[]} | null>;
  currentOrder(actor:SessionActor):Promise<{id:string}|null>;
}
interface DispatchExports {createReservationDispatcher?:(pool:Pool,authorization:Dependencies,offering:typeof createReservationOfferingParticipant)=>DispatchTarget}
interface QueryExports {createEnrollmentQueries?:(pool:Pool,authorization:Dependencies,offering:typeof createReservationOfferingParticipant)=>QueryTarget}
const dispatchModules=import.meta.glob<DispatchExports>('../../src/modules/enrollment/infrastructure/dispatch.ts',{eager:true});
const queryModules=import.meta.glob<QueryExports>('../../src/modules/enrollment/infrastructure/queries.ts',{eager:true});
export function dispatchTarget(f:ReservationAdmissionFixture,pool=f.pool){
  const factory=Object.values(dispatchModules)[0]?.createReservationDispatcher;
  expect(factory,'T031-T033 pendientes: despacho real ausente; no es fallo de PG/import').toBeTypeOf('function');
  return factory!(pool,f.authorization,createReservationOfferingParticipant);
}
export function queriesTarget(f:ReservationAdmissionFixture,pool=f.pool){
  const factory=Object.values(queryModules)[0]?.createEnrollmentQueries;
  expect(factory,'T034 pendiente: lector real ausente; no es fallo de PG/import').toBeTypeOf('function');
  return factory!(pool,f.authorization,createReservationOfferingParticipant);
}
export async function processingFixture(http=false){
  const f=await reservationAdmissionFixture(http);
  try{
    await f.pool.query(`UPDATE "AcademicCourse" SET description='Oferta ficticia',state='PUBLISHED'`);
    await f.pool.query(`UPDATE "AcademicGroup" SET capacity=1,"periodStart"='2090-01-02',"periodEnd"='2090-03-31',"teacherUserId"=$1`,[f.teacher.userId]);
    await f.pool.query(`INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,2,1080,1140)`,[f.otherGroupId]);
    await f.pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId",
      "publishedTeacherEligibilityVersion"=(SELECT "eligibilityVersion" FROM "AcademicTeacherDirectory" WHERE "userId"="teacherUserId")`);
    for(const courseId of [f.courseId,f.otherCourseId])await insertEnrollmentRow(f.pool,'CoursePrice',{courseId,amountMinor:'12500',currency:'PEN',revision:'1',changedBy:f.admin.userId});
    return f;
  }catch(error){await f.close();throw error;}
}
/** Solo solicitudes ficticias ADMITTED; no acredita el admisor pendiente T030. */
export async function queueRequest(f:ReservationAdmissionFixture,groupIds:readonly string[]=[f.groupId],student=f.student){
  const client=await f.pool.connect(),id=randomUUID(),intentionId=randomUUID();
  try{
    await client.query('BEGIN');
    const sequence=(await client.query('SELECT "nextSequence"::text AS n FROM "AdmissionSequence" WHERE id=1 FOR UPDATE')).rows[0].n;
    await client.query(`INSERT INTO "ReservationRequest" (id,"studentId","intentionId","selectionDigest","groupIds","admittedAt","admissionSequence","actorSessionReference","authVersion",state)
      VALUES ($1,$2,$3,$4,$5,clock_timestamp(),$6,$7,0,'ADMITTED')`,[id,student.userId,intentionId,randomBytes(32),[...groupIds].sort(),sequence,student.sessionId]);
    await client.query('UPDATE "AdmissionSequence" SET "nextSequence"="nextSequence"+1 WHERE id=1');
    await client.query('COMMIT');return {id,intentionId,sequence};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export const observe=<T>(work:Promise<T>)=>work.then(value=>({ok:true as const,value}),error=>({ok:false as const,error: error as unknown}));
export async function milestone<T>(signal:Promise<void>,work:ReturnType<typeof observe<T>>){
  await Promise.race([signal,work.then(result=>{if(!result.ok)throw result.error;throw new Error('Objetivo terminó sin alcanzar barrera requerida.');})]);
}
export async function unwrap<T>(work:ReturnType<typeof observe<T>>){const result=await work;if(!result.ok)throw result.error;return result.value;}
/** Reloj SQL controlado solo en schema t_. Cambia el instante del ensayo, nunca
 * acepta timestamps del cliente ni sustituye la captura PG del coordinador. */
export async function processingClock(f:ReservationAdmissionFixture){
  const schema=f.isolated.schema;if(!/^t_[a-z0-9_]+$/.test(schema))throw new Error('Reloj fuera de schema de prueba.');
  await f.isolated.ownerQuery(`CREATE TABLE "DispatchTestClock" (id int PRIMARY KEY,instant timestamptz NOT NULL);
    INSERT INTO "DispatchTestClock" VALUES (1,'2090-01-02T04:59:59.999999Z');
    CREATE FUNCTION clock_timestamp() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$ SELECT instant FROM "DispatchTestClock" WHERE id=1 $$`);
  await f.pool.query(`UPDATE "Session" SET "createdAt"='2090-01-02T04:58:00Z',"lastAcceptedAt"='2090-01-02T04:58:00Z',"absoluteExpiresAt"='2090-01-02T12:58:00Z'`);
  const pool=new Proxy(f.pool,{get(target,key){
    if(key==='connect')return async()=>{const client=await target.connect();await client.query(`SET search_path=${schema},pg_catalog`);return client;};
    const value:unknown=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  return {pool,advance:()=>f.pool.query(`UPDATE "DispatchTestClock" SET instant='2090-01-02T05:00:00.000000Z' WHERE id=1`)};
}
