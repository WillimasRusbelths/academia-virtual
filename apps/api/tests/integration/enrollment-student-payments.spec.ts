import { expect,test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { paymentFixture } from '../support/enrollment-payment.js';
import type { PaymentFixture } from '../support/enrollment-payment.js';
import { us1Http } from '../support/us1-http.js';
import { sessionFixture } from '../support/session-fixture.js';

async function applied(){const f=await paymentFixture();try{await f.processor().finalize(f.first);return f;}catch(error){await f.close();throw error;}}
function check(name:string,work:(f:PaymentFixture,h:Awaited<ReturnType<typeof us1Http>>)=>Promise<void>){test(name,async()=>{
  const f=await applied();let h:Awaited<ReturnType<typeof us1Http>>|undefined;
  try{h=await us1Http({context:f,clock:{configure(pool){pool.options.options=`-c search_path=${f.isolated.schema},pg_catalog -c timezone=UTC`;}}});
    await work(f,h);
  }finally{await h?.close();await f.close();}
},120000);}
check('SP01 lista y detalle propios conservan condiciones originales aunque oferta se retire',async(f,h)=>{
  await f.pool.query('UPDATE "AcademicCourse" SET state=\'WITHDRAWN\' WHERE id=$1',[f.courseId]);
  const response=await h.get('/enrollment/enrollments',f.student.secret);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  const list=(await response.json()).data;expect(list.total).toBe(2);expect(list.items).toHaveLength(2);
  for(const item of list.items){
    expect(Object.keys(item).sort()).toEqual(['id','orderId','courseId','groupId','courseName','groupName','state','periodStart','periodEnd','timeZone','schedule','confirmedAt','validUntil'].sort());
    expect(item).toMatchObject({orderId:f.original.id,state:'ENROLLED',timeZone:'America/Lima',confirmedAt:f.original.confirmedAt});
    expect((await (await h.get('/enrollment/enrollments/'+item.id,f.student.secret)).json()).data).toEqual(item);
    const original=f.originalItems.find(i=>i.groupId===item.groupId);expect(item.courseName).toBe(original.courseName);expect(item.schedule).toEqual(original.scheduleSnapshot);
  }
  expect(JSON.stringify(list)).not.toMatch(/provider|paymentId|studentId|receipt|Evidence|secret|authVersion/i);
});
check('SP02 ajeno e inexistente devuelven404 indistinguible sin datos financieros',async(f,h)=>{
  const other=await sessionFixture(f,'STUDENT'),id=(await f.pool.query('SELECT id FROM "Enrollment" LIMIT 1')).rows[0].id;
  await f.refreshSessions();
  const values=[];for(const ref of [id,randomUUID()]){const response=await h.get('/enrollment/enrollments/'+ref,other.secret);expect(response.status).toBe(404);values.push((await response.json()).error.code);}
  expect(values).toEqual(['NOT_FOUND','NOT_FOUND']);expect((await (await h.get('/enrollment/enrollments',other.secret)).json()).data.total).toBe(0);
});
for(const role of ['ADMIN','TEACHER','VISITOR'] as const)check('SP03 deniega matrículas a '+role,async(f,h)=>{
  const secret=role==='VISITOR'?undefined:(await sessionFixture(f,role)).secret;
  await f.refreshSessions();
  const id=(await f.pool.query('SELECT id FROM "Enrollment" LIMIT 1')).rows[0].id;
  for(const path of ['/enrollment/enrollments','/enrollment/enrollments/'+id])expect((await h.get(path,secret)).status).toBe(role==='VISITOR'?401:403);
});
check('SP04 límite original hace histórica la matrícula sin editarla ni reactivarla',async(f,h)=>{
  const before=(await (await h.get('/enrollment/enrollments',f.student.secret)).json()).data.items;
  await f.pool.query('UPDATE "DispatchTestClock" SET instant=(SELECT max("validUntil") FROM "Enrollment")');await f.refreshSessions();
  const after=(await (await h.get('/enrollment/enrollments',f.student.secret)).json()).data.items;
  expect(after).toHaveLength(2);for(const item of after)expect(item).toEqual({...before.find((original:{id:string})=>original.id===item.id),state:'HISTORICAL'});
});
check('SP05 configuración ausente cierra iniciación antes de persistir otro intento',async(f,h)=>{
  const before=(await f.pool.query('SELECT count(*)::int AS n FROM "PaymentAttempt"')).rows[0].n;
  const response=await h.post('/enrollment/orders/'+f.original.id+'/payment-attempts',{initiationId:randomUUID()},f.student.secret);
  expect(response.status).toBe(503);expect((await response.json()).error.code).toBe('TEMPORARILY_UNAVAILABLE');
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "PaymentAttempt"')).rows[0].n).toBe(before);
});
check('SP06 query extra, UUID inválido y sesión revocada no permiten consultar datos',async(f,h)=>{
  expect((await h.get('/enrollment/enrollments?studentId='+f.student.userId,f.student.secret)).status).toBe(400);
  expect((await h.get('/enrollment/enrollments/no-uuid',f.student.secret)).status).toBe(400);
  await f.sessions.revoke(f.student.secret);expect((await h.get('/enrollment/enrollments',f.student.secret)).status).toBe(401);
});
check('SP07 pago adicional en incidencia conserva las matrículas propias originales',async(f,h)=>{
  const before=(await (await h.get('/enrollment/enrollments',f.student.secret)).json()).data;
  const additional=await f.receipt({providerPaymentId:randomUUID()});expect((await f.processor().finalize(additional)).state).toBe('INCIDENT');
  expect((await (await h.get('/enrollment/enrollments',f.student.secret)).json()).data).toEqual(before);
  expect((await (await h.get('/enrollment/orders/'+f.original.id,f.student.secret)).json()).data).toMatchObject({state:'ENROLLED',paymentState:'INCIDENT'});
});
