import { randomUUID } from 'node:crypto';
import { expect,test } from 'vitest';
import { adminFixture,economicFingerprint,unknownIncident,adminReads,followUpStore } from '../support/enrollment-admin.js';
import type { AdminFixture } from '../support/enrollment-admin.js';
import { insertEnrollmentRow } from '../support/enrollment-migration.js';
import { seedCommitment,financialFingerprint } from '../support/enrollment-maintenance.js';

function admin(name:string,work:(f:AdminFixture)=>Promise<void>){test(name,async()=>{const f=await adminFixture();try{await work(f);}finally{await f.close();}},120000);}
async function success(response:Response){expect(response.status,'T075 pendiente: ruta administrativa de US4 no implementada.').toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');return (await response.json()).data;}
function privateFields(value:unknown){expect(JSON.stringify(value)).not.toMatch(/actorSessionReference|authVersion|normalizedEvidenceReference|cardNumber|signature|providerPayload/);}
admin('AU00 control: incidencia ficticia y API real sin notas/ledger sembrados',async f=>{
  expect((await f.pool.query('SELECT reason,"affectedGroupIds" FROM "PaymentIncident"')).rows).toEqual([{reason:'LATE_PAYMENT',affectedGroupIds:[f.groupId]}]);expect(await f.counts()).toEqual({notes:0,commands:0,audits:0});expect((await f.http.get('/me',f.admin.secret)).status).toBe(200);
});
admin('AU01 US4.06 lista administrativa filtra titular y conserva detalle original',async f=>{
  await seedCommitment({...f,student:f.other},'RESERVED',f.pool,'2');const before=await financialFingerprint(f.pool);
  const all=await success(await f.request('GET','/admin/enrollment/orders?page=1&pageSize=20'));expect(all.total).toBe(2);
  const filtered=await success(await f.request('GET','/admin/enrollment/orders?studentId='+f.student.userId));expect(filtered.total).toBe(1);expect(filtered.items[0]).toMatchObject({id:f.orderId,studentId:f.student.userId});privateFields(all);
  const detail=await success(await f.request('GET','/admin/enrollment/orders/'+f.orderId));expect(detail).toMatchObject({id:f.orderId,totalMinor:'12500',state:'EXPIRED'});expect(detail.items).toHaveLength(1);privateFields(detail);expect(await financialFingerprint(f.pool)).toBe(before);
});
admin('AU02 US4.06 lista/detalle de incidencia no expone evidencia privada',async f=>{
  const before=await financialFingerprint(f.pool),list=await success(await f.request('GET','/admin/enrollment/incidents?page=1&pageSize=20'));expect(list.total).toBe(1);
  const detail=await success(await f.request('GET','/admin/enrollment/incidents/'+f.incidentId));expect(detail).toMatchObject({id:f.incidentId,orderId:f.orderId});privateFields(list);privateFields(detail);expect(await financialFingerprint(f.pool)).toBe(before);
});
admin('AU03 US4.06 registrar seguimiento conserva economía y bloqueo académico',async f=>{
  const before=await economicFingerprint(f.pool),input=f.command(),data=await success(await f.follow(input));
  expect(data.resource).toMatchObject({incidentId:f.incidentId,adminUserId:f.admin.userId,content:input.content,recordedAt:expect.stringMatching(/\.\d{6}Z$/)});
  expect(await f.counts()).toEqual({notes:1,commands:1,audits:1});expect(await economicFingerprint(f.pool)).toBe(before);
  const denied=await f.request('POST','/admin/academic/groups/'+f.groupId+'/cancel',{commandId:randomUUID(),expectedRevision:'1',cancellationReason:'Motivo ficticio'});expect(denied.status).toBe(409);expect((await denied.json()).error.code).toBe('GROUP_COMMITMENTS_BLOCK_OPERATION');
});
admin('AU04 US4.06 mismo commandId concurrente recupera una nota y una auditoría',async f=>{
  const input=f.command(),before=await economicFingerprint(f.pool),responses=await Promise.all([f.follow(input),f.follow(input)]),data=[];
  for(const response of responses)data.push(await success(response));expect(data[0].resource.id).toBe(data[1].resource.id);expect(data.map(d=>d.command.replayed).sort()).toEqual([false,true]);
  expect(await f.counts()).toEqual({notes:1,commands:1,audits:1});expect(await economicFingerprint(f.pool)).toBe(before);
});
admin('AU05 US4.06 commandId con otro contenido devuelve409 sin otra nota',async f=>{
  const input=f.command();await success(await f.follow(input));const before=await financialFingerprint(f.pool),response=await f.follow({...input,content:'Texto distinto'});expect(response.status).toBe(409);expect((await response.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');expect(await financialFingerprint(f.pool)).toBe(before);
});
admin('AU06 US4.06 notas distintas concurrentes permanecen append-only',async f=>{
  const before=await economicFingerprint(f.pool),responses=await Promise.all([f.follow(f.command()),f.follow(f.command())]);for(const response of responses)await success(response);
  expect(await f.counts()).toEqual({notes:2,commands:2,audits:2});expect(await economicFingerprint(f.pool)).toBe(before);expect((await f.pool.query('SELECT count(DISTINCT id)::int AS n FROM "IncidentFollowUp"')).rows[0].n).toBe(2);
});
admin('AU07 US4.06 fallo real de auditoría revierte nota y resultado',async f=>{
  await f.isolated.ownerQuery(`CREATE FUNCTION reject_follow_up_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='INCIDENT_FOLLOW_UP' THEN RAISE EXCEPTION 'fixture audit failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_follow_up_audit BEFORE INSERT ON "EnrollmentAuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_follow_up_audit();`);
  const before=await financialFingerprint(f.pool),response=await f.follow(f.command());expect(response.status,'T075 pendiente: ruta administrativa de US4 no implementada.').toBe(503);
  expect(await f.counts()).toEqual({notes:0,commands:0,audits:0});expect(await financialFingerprint(f.pool)).toBe(before);
});
admin('AU08 control: PG impide actualizar o borrar una nota existente',async f=>{
  const id=randomUUID();await insertEnrollmentRow(f.pool,'IncidentFollowUp',{id,incidentId:f.incidentId,adminUserId:f.admin.userId,commandId:randomUUID(),recordedAt:'2026-01-01T00:00:00.123456Z',content:'Nota ficticia append-only'});
  const before=await financialFingerprint(f.pool);await expect(f.pool.query('UPDATE "IncidentFollowUp" SET content=$2 WHERE id=$1',[id,'Otro texto'])).rejects.toMatchObject({code:'23514'});
  await expect(f.pool.query('DELETE FROM "IncidentFollowUp" WHERE id=$1',[id])).rejects.toMatchObject({code:'23514'});expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const field of ['adminUserId','recordedAt','resolved','expectedRevision'])admin('AU09 US4.06 rechaza campo no autorizado '+field,async f=>{
  const before=await financialFingerprint(f.pool),response=await f.follow({...f.command(),[field]:field==='resolved'?true:'valor-cliente'});expect(response.status,'T075 pendiente: ruta administrativa de US4 no implementada.').toBe(400);expect((await response.json()).error.code).toBe('VALIDATION_ERROR');expect(await financialFingerprint(f.pool)).toBe(before);
});
admin('AU10 US4.06 referencia desconocida solo admin, sin titular/grupo inventado',async f=>{
  const id=await unknownIncident(f),before=await financialFingerprint(f.pool),detail=await success(await f.request('GET','/admin/enrollment/incidents/'+id));expect(detail).toMatchObject({id,orderId:null,affectedGroupIds:[]});privateFields(detail);expect(await financialFingerprint(f.pool)).toBe(before);
});
admin('AU11 US4.01 nota interna no llega como texto arbitrario al alumno',async f=>{
  const input=f.command();await success(await f.follow(input));const response=await f.http.get('/enrollment/orders/'+f.orderId,f.student.secret);expect(response.status).toBe(200);const body=await response.json();expect(JSON.stringify(body)).not.toContain(input.content);expect(body.data.incidentSummary).toBe('Pago en conciliación, sin matrícula.');
});
admin('AU12 US4.06 replay reautoriza después de revocar la sesión',async f=>{
  const input=f.command();await success(await f.follow(input));await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[f.admin.sessionId]);const before=await financialFingerprint(f.pool),response=await f.follow(input);expect(response.status).toBe(401);expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const query of ['page=0','pageSize=51','studentId=no-uuid','unknown=1'])admin('AU13 US4.06 lista administrativa rechaza query '+query,async f=>{
  const before=await financialFingerprint(f.pool),response=await f.request('GET','/admin/enrollment/orders?'+query);expect(response.status,'T075 pendiente: ruta administrativa de US4 no implementada.').toBe(400);expect(await financialFingerprint(f.pool)).toBe(before);
});
admin('DP01 US4.06 lector PG administrativo conserva proyección y titular autorizado',async f=>{
  const target=adminReads(f),before=await financialFingerprint(f.pool),list=await target.adminOrders(f.adminActor,{page:1,pageSize:20,studentId:f.student.userId});expect(list.total).toBe(1);expect(list.items[0]).toMatchObject({id:f.orderId,studentId:f.student.userId});
  expect(await target.adminOrder(f.adminActor,f.orderId!)).toMatchObject({id:f.orderId,totalMinor:'12500'});privateFields(list);expect(await financialFingerprint(f.pool)).toBe(before);
});
admin('DP02 US4.06 lector PG de incidencias conserva historia sin escribir',async f=>{
  const target=adminReads(f),before=await financialFingerprint(f.pool),list=await target.incidents(f.adminActor,{page:1,pageSize:20});expect(list.total).toBe(1);expect(await target.incident(f.adminActor,f.incidentId)).toMatchObject({id:f.incidentId});privateFields(list);expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const role of ['STUDENT','TEACHER'] as const)admin('DP03 US4.07 lector PG reautoriza '+role,async f=>{
  const target=adminReads(f),actor=(await f.sessions.lookup(role==='STUDENT'?f.student.secret:f.teacher.secret))!,before=await financialFingerprint(f.pool);await expect(target.adminOrders(actor,{page:1,pageSize:20})).rejects.toMatchObject({code:'FORBIDDEN'});expect(await financialFingerprint(f.pool)).toBe(before);
});
admin('DP04 US4.06 escritor PG concurrente deduplica comando sin alterar economía',async f=>{
  const store=followUpStore(f),input=f.command(),before=await economicFingerprint(f.pool);await Promise.all([store.append(f.adminActor,f.incidentId,input,randomUUID()),store.append(f.adminActor,f.incidentId,input,randomUUID())]);expect(await f.counts()).toEqual({notes:1,commands:1,audits:1});expect(await economicFingerprint(f.pool)).toBe(before);
});
admin('DP05 US4.06 escritor PG revierte nota y ledger al fallar auditoría',async f=>{
  const store=followUpStore(f);await f.isolated.ownerQuery(`CREATE FUNCTION reject_direct_follow_up_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit failure' USING ERRCODE='23514'; END $$; CREATE TRIGGER reject_direct_follow_up_audit BEFORE INSERT ON "EnrollmentAuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_direct_follow_up_audit();`);
  const before=await financialFingerprint(f.pool);await expect(store.append(f.adminActor,f.incidentId,f.command(),randomUUID())).rejects.toBeDefined();expect(await f.counts()).toEqual({notes:0,commands:0,audits:0});expect(await financialFingerprint(f.pool)).toBe(before);
});
