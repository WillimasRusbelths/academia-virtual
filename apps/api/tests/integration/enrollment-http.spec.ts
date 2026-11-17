import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { processingFixture } from '../support/reservation-processing.js';
import type { ReservationAdmissionFixture } from '../support/reservation-admission.js';
import { createReservationDispatcher } from '../../src/modules/enrollment/infrastructure/dispatch.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { sessionFixture } from '../support/session-fixture.js';

function http(name:string,work:(f:ReservationAdmissionFixture)=>Promise<void>){test(name,async()=>{const f=await processingFixture(true);try{await work(f);}finally{await f.close();}},120000);}
http('EH01 ocho rutas propias deniegan visitante, administrador y docente',async f=>{
  const routes=['/enrollment/offerings','/enrollment/reservation-requests','/enrollment/reservation-requests/'+randomUUID(),'/enrollment/orders','/enrollment/orders/current','/enrollment/orders/'+randomUUID()];
  const before=await financialFingerprint(f.pool);
  for(const secret of [undefined,f.admin.secret,f.teacher.secret]){
    const status=secret?403:401;for(const route of routes)expect((await f.http!.get(route,secret)).status).toBe(status);
    expect((await f.http!.post('/enrollment/selection-preview',{groupIds:[f.groupId]},secret)).status).toBe(status);
    expect((await f.http!.post('/enrollment/reservation-requests',f.selection(),secret)).status).toBe(status);
  }
  expect(await financialFingerprint(f.pool)).toBe(before);
});
http('EH02 HTTP admite, recupera y confirma por despachador real; detalle y aislamiento',async f=>{
  const input=f.selection([f.groupId,f.otherGroupId]),admitted=await f.http!.post('/enrollment/reservation-requests',input,f.student.secret);
  expect(admitted.status).toBe(200);const data=(await admitted.json()).data;
  expect((await (await f.http!.get('/enrollment/reservation-requests/'+input.intentionId,f.student.secret)).json()).data.state).toBe('ADMITTED');
  expect((await (await f.http!.get('/enrollment/reservation-requests',f.student.secret)).json()).data).toMatchObject({total:1,page:1,pageSize:20});
  await createReservationDispatcher(f.pool,f.authorization,createReservationOfferingParticipant).dispatchNext(randomUUID());
  const confirmed=(await (await f.http!.get('/enrollment/reservation-requests/'+input.intentionId,f.student.secret)).json()).data;
  expect(confirmed).toMatchObject({id:data.id,state:'CONFIRMED'});
  const path='/enrollment/orders/'+confirmed.orderId,detail=(await (await f.http!.get(path,f.student.secret)).json()).data;
  expect(detail).toMatchObject({id:confirmed.orderId,totalMinor:'25000',paymentAllowed:true});expect(detail.items).toHaveLength(2);
  expect((await (await f.http!.get('/enrollment/orders/current',f.student.secret)).json()).data.id).toBe(confirmed.orderId);
  expect((await (await f.http!.get('/enrollment/orders',f.student.secret)).json()).data.total).toBe(1);
  const before=await financialFingerprint(f.pool);expect((await (await f.http!.post('/enrollment/reservation-requests',input,f.student.secret)).json()).data.orderId).toBe(confirmed.orderId);
  expect(await financialFingerprint(f.pool)).toBe(before);
  const other=await sessionFixture(f,'STUDENT');
  for(const route of [path,'/enrollment/orders/'+randomUUID(),'/enrollment/reservation-requests/'+input.intentionId]){
    const response=await f.http!.get(route,other.secret);expect(response.status).toBe(404);expect((await response.json()).error.code).toBe('NOT_FOUND');
  }
  await f.pool.query('UPDATE "AcademicGroup" SET state=\'WITHDRAWN\' WHERE id=$1',[f.groupId]);
  const hidden=(await (await f.http!.get(path,f.student.secret)).json()).data;expect(hidden.paymentAllowed).toBe(false);expect(hidden.items).toEqual(detail.items);
  expect(JSON.stringify(hidden)).not.toMatch(/actorSessionReference|authVersion|providerPaymentId|teacherEligibilityVersion/);
});
http('EH03 query cerrada, UUID y paginación inválidos fallan antes de persistir',async f=>{
  const before=await financialFingerprint(f.pool);
  for(const path of ['/enrollment/orders?page=1&page=2','/enrollment/orders?page=01','/enrollment/orders?pageSize=51','/enrollment/orders?studentId='+f.student.userId,
    '/enrollment/orders/bad','/enrollment/reservation-requests/bad','/enrollment/orders/current?extra=1','/enrollment/reservation-requests?page=9007199254740991&pageSize=50'])expect((await f.http!.get(path,f.student.secret)).status).toBe(400);
  expect((await f.http!.post('/enrollment/selection-preview',{groupIds:[f.groupId],totalMinor:'0'},f.student.secret)).status).toBe(400);
  expect((await f.http!.post('/enrollment/reservation-requests?extra=1',f.selection(),f.student.secret)).status).toBe(400);
  expect(await financialFingerprint(f.pool)).toBe(before);
});
http('EH04 preview conserva CSRF, JSON y no-store sin efectos',async f=>{
  const before=await financialFingerprint(f.pool),path=f.http!.url+'/api/v1/enrollment/selection-preview';
  for(const headers of [{origin:'https://foreign.example.test'},{'x-csrf-protection':''}]){
    expect((await fetch(path,{method:'POST',headers:{...f.http!.headers(f.student.secret),...headers},body:JSON.stringify({groupIds:[f.groupId]})})).status).toBe(403);
  }
  const response=await f.http!.post('/enrollment/selection-preview',{groupIds:[f.groupId]},f.student.secret);
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect((await response.json()).data.totalMinor).toBe('12500');
  expect(await financialFingerprint(f.pool)).toBe(before);
  await f.sessions.revoke(f.student.secret);expect((await f.http!.get('/enrollment/reservation-requests',f.student.secret)).status).toBe(401);
});
