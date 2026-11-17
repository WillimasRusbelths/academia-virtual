import { randomUUID } from 'node:crypto';
import { expect,test } from 'vitest';
import { processingFixture,processingClock,dispatchTarget } from '../support/reservation-processing.js';
import { paymentFixture } from '../support/enrollment-payment.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { us1Http } from '../support/us1-http.js';
import { createEnrollmentQueries } from '../../src/modules/enrollment/infrastructure/queries.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';

for(const delta of [-1,0,1])test('TC01 TV04 admisión anterior no evita corte Lima '+delta+'µs',async()=>{
  const f=await processingFixture();
  try{
    const clock=await processingClock(f),admitted=await f.target(clock.pool).admit(f.actor,f.selection([f.groupId]),randomUUID());
    expect(admitted.state).toBe('ADMITTED');
    await f.pool.query(`UPDATE "DispatchTestClock" SET instant='2090-01-02T05:00:00.000000Z'::timestamptz+($1*interval '1 microsecond')`,[delta]);
    const result=await dispatchTarget(f,clock.pool).dispatchNext(randomUUID());expect(result.state).toBe(delta<0?'CONFIRMED':'REJECTED');
    const request=(await f.pool.query('SELECT state,"decisionCode" FROM "ReservationRequest"')).rows;
    expect(request).toEqual([{state:delta<0?'CONFIRMED':'REJECTED',decisionCode:delta<0?'RESERVATION_CONFIRMED':'OFFERING_NOT_RESERVABLE'}]);
    const counts=(await f.pool.query(`SELECT (SELECT count(*)::int FROM "EnrollmentOrder") AS orders,
      (SELECT count(*)::int FROM "EnrollmentOrderItem") AS items,(SELECT count(*)::int FROM "SeatReservation") AS seats,
      (SELECT count(*)::int FROM "Enrollment") AS enrollments,(SELECT count(*)::int FROM "EnrollmentAuditEvent") AS audits`)).rows[0];
    expect(counts).toEqual({orders:delta<0?1:0,items:delta<0?1:0,seats:delta<0?1:0,enrollments:0,audits:1});
    if(delta<0){
      const row=(await f.pool.query(`SELECT to_char("confirmedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at,
        (extract(epoch FROM ("expiresAt"-"confirmedAt"))*1000000)::bigint::text AS duration FROM "EnrollmentOrder"`)).rows[0];
      expect(row.at).toBe('2090-01-02T04:59:59.999999Z');expect(row.duration).toBe('86400000000');
    }
  }finally{await f.close();}
},120000);

for(const delta of [-1,0,1])test('TC02 TV05 matrícula real en fin original '+delta+'µs conserva historial y cupo efectivo',async()=>{
  const f=await paymentFixture();let h:Awaited<ReturnType<typeof us1Http>>|undefined;
  try{
    expect((await f.processor().finalize(f.first)).state).toBe('APPLIED');
    h=await us1Http({context:f,clock:{configure(pool){pool.options.options=`-c search_path=${f.isolated.schema},pg_catalog -c timezone=UTC`;}}});
    const initial=await h.get('/enrollment/enrollments',f.student.secret);expect(initial.status).toBe(200);
    const before=(await initial.json()).data.items as Record<string,unknown>[];expect(before).toHaveLength(2);
    await f.pool.query(`UPDATE "DispatchTestClock" SET instant=(SELECT min("validUntil") FROM "Enrollment")+($1*interval '1 microsecond')`,[delta]);await f.refreshSessions();
    const fingerprint=await financialFingerprint(f.pool),response=await h.get('/enrollment/enrollments',f.student.secret);expect(response.status).toBe(200);
    const after=(await response.json()).data.items as Record<string,unknown>[];expect(after).toHaveLength(2);
    for(const item of after){
      expect(item).toEqual({...before.find(original=>original.id===item.id),state:delta<0?'ENROLLED':'HISTORICAL'});
      const detail=await h.get('/enrollment/enrollments/'+item.id,f.student.secret);expect(detail.status).toBe(200);expect((await detail.json()).data).toEqual(item);
    }
    const inventory=await createEnrollmentQueries(f.pool,f.authorization,createReservationOfferingParticipant).offerings(f.actor,{page:1,pageSize:20});
    expect(inventory.items.find(item=>item.groupId===f.groupId)).toMatchObject({reserved:0,occupied:delta<0?1:0,available:delta<0?0:1});
    expect((await f.pool.query('SELECT state,revision::text FROM "EnrollmentOrder"')).rows).toEqual([{state:'ENROLLED',revision:'2'}]);
    expect((await f.pool.query(`SELECT state FROM "SeatReservation" ORDER BY id`)).rows).toEqual([{state:'CONVERTED'},{state:'CONVERTED'}]);
    expect(await financialFingerprint(f.pool)).toBe(fingerprint);
  }finally{await h?.close();await f.close();}
},120000);
