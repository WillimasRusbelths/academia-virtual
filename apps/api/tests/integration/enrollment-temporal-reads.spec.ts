import { expect,test } from 'vitest';
import { expirationFixture } from '../support/reservation-expiration.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { us1Http } from '../support/us1-http.js';

const routes=['offerings','preview','current','order','orders','enrollments','requests'] as const;
for(const route of routes)test('TR01 TV24 '+route+' rechaza tiempo anterior a materialización conocida sin escribir',async()=>{
  const f=await expirationFixture();let h:Awaited<ReturnType<typeof us1Http>>|undefined;
  try{
    await f.boundary(0);await f.normalize();await f.boundary(-1);await f.refreshSessions();
    h=await us1Http({context:f,clock:{configure(pool){pool.options.options=`-c search_path=${f.isolated.schema},pg_catalog -c timezone=UTC`;}}});
    const before=await financialFingerprint(f.pool);
    const path=route==='order'?'/enrollment/orders/'+f.original.id:route==='current'?'/enrollment/orders/current':route==='offerings'?'/enrollment/offerings?page=1&pageSize=20':route==='orders'?'/enrollment/orders?page=1&pageSize=20':route==='enrollments'?'/enrollment/enrollments?page=1&pageSize=20':'/enrollment/reservation-requests?page=1&pageSize=20';
    const response=route==='preview'?await h.post('/enrollment/selection-preview',{groupIds:[f.groupId]},f.student.secret):await h.get(path,f.student.secret);
    expect(response.status).toBe(503);expect(await financialFingerprint(f.pool)).toBe(before);
  }finally{await h?.close();await f.close();}
},120000);
for(const route of ['order','offerings'] as const)test('TR02 TV24 '+route+' no proyecta pago futuro como matrícula o cupo actual',async()=>{
  const f=await expirationFixture();let h:Awaited<ReturnType<typeof us1Http>>|undefined;
  try{
    await f.boundary(-1);expect((await f.processor().finalize(f.first)).state).toBe('APPLIED');await f.boundary(-2);await f.refreshSessions();
    h=await us1Http({context:f,clock:{configure(pool){pool.options.options=`-c search_path=${f.isolated.schema},pg_catalog -c timezone=UTC`;}}});
    const before=await financialFingerprint(f.pool),path=route==='order'?'/enrollment/orders/'+f.original.id:'/enrollment/offerings?page=1&pageSize=20';
    expect((await h.get(path,f.student.secret)).status).toBe(503);expect(await financialFingerprint(f.pool)).toBe(before);
    expect((await f.pool.query('SELECT state FROM "EnrollmentOrder"')).rows[0].state).toBe('ENROLLED');
  }finally{await h?.close();await f.close();}
},120000);
