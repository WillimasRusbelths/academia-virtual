import { randomUUID } from 'node:crypto';
import { expect,test } from 'vitest';
import { adminFixture,unknownIncident,economicFingerprint } from '../support/enrollment-admin.js';
import type { AdminFixture } from '../support/enrollment-admin.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';

function auth(name:string,work:(f:AdminFixture)=>Promise<void>){test(name,async()=>{const f=await adminFixture();try{await work(f);}finally{await f.close();}},120000);}
for(const role of ['STUDENT','OTHER','TEACHER','VISITOR'] as const)for(const resource of ['orders','order','incidents','incident','follow-up'] as const)auth('AZ01 US4.07 '+role+' denegado en '+resource,async f=>{
  const secret=role==='STUDENT'?f.student.secret:role==='OTHER'?f.other.secret:role==='TEACHER'?f.teacher.secret:null;
  const path='/admin/enrollment/'+(resource==='orders'?'orders':resource==='order'?'orders/'+f.orderId:resource==='incidents'?'incidents':'incidents/'+f.incidentId+(resource==='follow-up'?'/follow-ups':''));
  const before=await financialFingerprint(f.pool),response=await f.request(resource==='follow-up'?'POST':'GET',path,resource==='follow-up'?f.command():undefined,secret);
  expect(response.status,'T075 pendiente: autorización de rutas administrativas US4 no implementada.').toBe(role==='VISITOR'?401:403);const body=await response.json();expect(body.error.code).toBe(role==='VISITOR'?'AUTH_REQUIRED':'FORBIDDEN');expect(JSON.stringify(body)).not.toMatch(/12500|LATE_PAYMENT|studentId|providerPaymentId/);expect(await financialFingerprint(f.pool)).toBe(before);
});
auth('AZ02 US4.01 propietario consulta original; ajeno e inexistente son404 indistinguibles',async f=>{
  const before=await financialFingerprint(f.pool),own=await f.http.get('/enrollment/orders/'+f.orderId,f.student.secret);expect(own.status).toBe(200);expect((await own.json()).data.id).toBe(f.orderId);
  const codes=[];for(const id of [f.orderId,randomUUID()]){const response=await f.http.get('/enrollment/orders/'+id,f.other.secret);expect(response.status).toBe(404);codes.push((await response.json()).error.code);}expect(codes).toEqual(['NOT_FOUND','NOT_FOUND']);expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const actor of ['ADMIN','STUDENT','TEACHER','VISITOR'] as const)for(const method of ['DELETE','PATCH'] as const)auth('AZ03 US4.09 '+actor+' no tiene '+method+' voluntario de orden',async f=>{
  const secret=actor==='ADMIN'?f.admin.secret:actor==='STUDENT'?f.student.secret:actor==='TEACHER'?f.teacher.secret:null,before=await financialFingerprint(f.pool);
  const response=await f.request(method,'/enrollment/orders/'+f.orderId,{state:'EXPIRED'},secret);expect(response.status).toBe(404);expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const kind of ['RESERVED','ENROLLED','INCIDENT','EXPIRED','FINISHED'] as const)test('AZ04 US4.03 guard real '+kind+' frente a cancelación',async()=>{
  const f=await adminFixture(kind);try{const before=await financialFingerprint(f.pool),economy=await economicFingerprint(f.pool),group=(await f.pool.query('SELECT to_jsonb(g) AS row FROM "AcademicGroup" g WHERE id=$1',[f.groupId])).rows[0].row;
    const response=await f.request('POST','/admin/academic/groups/'+f.groupId+'/cancel',{commandId:randomUUID(),expectedRevision:'1',cancellationReason:'Motivo ficticio'}),blocked=['RESERVED','ENROLLED','INCIDENT'].includes(kind);
    expect(response.status).toBe(blocked?409:200);if(blocked){expect((await response.json()).error.code).toBe('GROUP_COMMITMENTS_BLOCK_OPERATION');expect((await f.pool.query('SELECT to_jsonb(g) AS row FROM "AcademicGroup" g WHERE id=$1',[f.groupId])).rows[0].row).toEqual(group);expect(await financialFingerprint(f.pool)).toBe(before);}
    else expect((await f.pool.query('SELECT state FROM "AcademicGroup" WHERE id=$1',[f.groupId])).rows[0].state).toBe('CANCELLED');expect(await economicFingerprint(f.pool)).toBe(economy);
  }finally{await f.close();}
},120000);
test('AZ05 US4.06 referencia económica desconocida no bloquea grupo arbitrario',async()=>{
  const f=await adminFixture('NONE');try{await unknownIncident(f);const response=await f.request('POST','/admin/academic/groups/'+f.groupId+'/cancel',{commandId:randomUUID(),expectedRevision:'1',cancellationReason:'Motivo ficticio'});expect(response.status).toBe(200);expect((await f.pool.query('SELECT "affectedGroupIds" FROM "PaymentIncident"')).rows).toEqual([{affectedGroupIds:[]}]);}finally{await f.close();}
},120000);
auth('AZ06 US4.11 PATCH courseId nunca traslada grupo',async f=>{
  const before=await financialFingerprint(f.pool),response=await f.request('PATCH','/admin/academic/groups/'+f.groupId,{commandId:randomUUID(),expectedRevision:'1',courseId:f.otherCourseId});expect(response.status).toBe(400);expect((await f.pool.query('SELECT "courseId" FROM "AcademicGroup" WHERE id=$1',[f.groupId])).rows[0].courseId).toBe(f.courseId);expect(await financialFingerprint(f.pool)).toBe(before);
});
