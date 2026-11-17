import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { EnrollmentMigrationContext, EnrollmentTable, FixtureRow } from './enrollment-migration.js';
import { enrollmentTables } from './enrollment-migration.js';
import { postgresInstantParameter } from '../../src/modules/enrollment/infrastructure/temporal.js';

export type CommitmentFixture='NONE'|'RESERVED'|'ENROLLED'|'INCIDENT'|'EXPIRED'|'FINISHED'|'DEADLINE_PASSED';
/** Solo hechos ficticios. No ofrece un sustituto de confirmar/pagar/expirar. Puede
 * usar una conexión titular para dejar los hechos sin confirmar durante la carrera. */
export async function seedCommitment(f:Pick<EnrollmentMigrationContext,'database'|'courseId'|'groupId'>&{student:Pick<EnrollmentMigrationContext['student'],'userId'|'sessionId'>},kind:CommitmentFixture,sql:Pick<PoolClient,'query'>=f.database.pool,sequence:string='1'){
  if(kind==='NONE')return;
  const at=BigInt((await sql.query('SELECT (extract(epoch FROM clock_timestamp())*1000000)::numeric(30,0)::text AS at')).rows[0].at);
  const ended=['EXPIRED','INCIDENT','DEADLINE_PASSED'].includes(kind),finished=kind==='FINISHED';
  const confirmedAt=finished?'2020-01-01T00:00:00.000000Z':postgresInstantParameter(at-(ended?172800000000n:1000000n));
  const expiresAt=finished?'2020-01-02T00:00:00.000000Z':postgresInstantParameter(at+(ended?-86400000000n:86399000000n));
  const verifiedAt=finished?'2020-01-01T00:01:00.000000Z':postgresInstantParameter(at);
  const requestId=randomUUID(),orderId=randomUUID(),itemId=randomUUID(),paymentId=randomUUID();
  const schedule=[{dayOfWeek:1,startTime:'18:00',endTime:'19:00'}];
  const start=finished?'2020-01-06':'2090-01-02',end=finished?'2020-01-31':'2090-03-31';
  const validUntil=finished?'2020-02-01T05:00:00.000000Z':'2090-04-01T05:00:00.000000Z';
  async function insert(table:EnrollmentTable,row:FixtureRow){
    const columns=Object.keys(row);
    await sql.query(`INSERT INTO "${table}" (${columns.map(c=>'"'+c+'"').join(',')}) VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')})`,
      columns.map(c=>c==='scheduleSnapshot'?JSON.stringify(row[c]):row[c]));
  }
  await insert('ReservationRequest',{id:requestId,studentId:f.student.userId,intentionId:randomUUID(),selectionDigest:randomBytes(32),groupIds:[f.groupId],admittedAt:confirmedAt,admissionSequence:sequence,actorSessionReference:f.student.sessionId,authVersion:'0',state:'CONFIRMED',decisionCode:'RESERVATION_CONFIRMED',decidedAt:confirmedAt});
  const state=kind==='ENROLLED'||finished?'ENROLLED':ended&&kind!=='DEADLINE_PASSED'?'EXPIRED':'RESERVED';
  await insert('EnrollmentOrder',{id:orderId,studentId:f.student.userId,requestId,currency:'PEN',totalMinor:'12500',state,revision:'1',confirmedAt,expiresAt,expirationProcessedAt:state==='EXPIRED'?postgresInstantParameter(at):null});
  await insert('EnrollmentOrderItem',{id:itemId,orderId,courseId:f.courseId,groupId:f.groupId,priceMinor:'12500',courseName:'Curso original ficticio',groupName:'Grupo original ficticio',periodStart:start,periodEnd:end,timeZone:'America/Lima',groupStartAt:start+'T05:00:00.000000Z',enrollmentValidUntil:validUntil,scheduleSnapshot:schedule});
  await insert('SeatReservation',{id:randomUUID(),orderItemId:itemId,state:state==='ENROLLED'?'CONVERTED':state==='EXPIRED'?'EXPIRED':'CONFIRMED'});
  if(kind==='ENROLLED'||finished||kind==='INCIDENT'){
    await insert('VerifiedPayment',{id:paymentId,providerScope:'fixture/provider/merchant/sandbox',providerPaymentId:randomUUID(),orderId,amountUnits:'12500',amountScale:2,currency:'PEN',merchantReference:'fixture-'+orderId,verificationFinishedAt:verifiedAt,reconciliationState:kind==='INCIDENT'?'INCIDENT':'APPLIED',normalizedEvidenceReference:'fixture-maintenance'});
    if(kind==='INCIDENT')await insert('PaymentIncident',{id:randomUUID(),orderId,verifiedPaymentId:paymentId,reason:'LATE_PAYMENT',affectedGroupIds:[f.groupId],openedAt:postgresInstantParameter(at)});
    else await insert('Enrollment',{id:randomUUID(),orderItemId:itemId,studentId:f.student.userId,courseId:f.courseId,groupId:f.groupId,paymentId,confirmedAt:verifiedAt,originalPeriodStart:start,originalPeriodEnd:end,timeZone:'America/Lima',scheduleSnapshot:schedule,validUntil});
  }
}
export async function financialFingerprint(pool:Pool){
  const hash=createHash('sha256');
  for(const table of enrollmentTables){hash.update(table);hash.update((await pool.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text AS data FROM "${table}" t`)).rows[0].data);}
  return hash.digest('hex');
}
