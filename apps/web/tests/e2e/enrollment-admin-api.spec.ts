import { randomUUID } from 'node:crypto';
import { test,expect } from '../support/enrollment-admin-fixture';
import { createApiClient,enrollmentAdminApi,enrollmentApi } from '../../src/app/http';
/** Puente de ensayo: cookie ficticia explícita y transporte HTTP real hacia Vite/API.
 * Sin respuestas fabricadas ni UI nueva. La cookie HttpOnly de producto no se lee. */
function client(secret:string){const transport:typeof fetch=(path,options)=>fetch(new URL(String(path),'http://localhost:5173'),{...options,headers:{...options?.headers,cookie:'av_session_dev='+secret,origin:'http://localhost:5173'}});const shared=createApiClient(()=>{},transport);return {admin:enrollmentAdminApi(shared),own:enrollmentApi(shared)};}
test('CA01 US4.06 cliente real consulta y anota por HTTP sin efectos económicos',async({payment,adminScenario})=>{
  const api=client(payment.prepared.actors.admin.secret).admin,before=await adminScenario.fingerprint(),input={commandId:randomUUID(),content:'Seguimiento ficticio pendiente de resolución económica.'};
  expect((await api.orders({studentId:payment.prepared.actors.owner.id})).items[0].id).toBe(payment.orderId);expect((await api.order(payment.orderId)).studentId).toBe(payment.prepared.actors.owner.id);
  expect((await api.incidents()).items[0].id).toBe(adminScenario.incidentId);expect((await api.incident(adminScenario.incidentId)).followUps).toEqual([]);
  const first=await api.followUp(adminScenario.incidentId,input),replay=await api.followUp(adminScenario.incidentId,input);expect(replay.resource).toEqual(first.resource);expect(replay.command.replayed).toBe(true);expect((await api.incident(adminScenario.incidentId)).followUps).toEqual([first.resource]);expect(await adminScenario.notes()).toBe(1);expect(await adminScenario.fingerprint()).toBe(before);
});
test('CA02 US4.07 cliente real separa alumno/administrador y conserva conflicto seguro',async({payment,adminScenario})=>{
  const admin=client(payment.prepared.actors.admin.secret).admin,student=client(payment.prepared.actors.owner.secret),input={commandId:randomUUID(),content:'Nota interna ficticia, no publicar al alumno.'},before=await adminScenario.fingerprint();await admin.followUp(adminScenario.incidentId,input);
  await expect(student.admin.incidents()).rejects.toMatchObject({code:'FORBIDDEN',status:403});const own=await student.own.order(payment.orderId);expect(own.incidentSummary).toBe('Pago en conciliación, sin matrícula.');expect(JSON.stringify(own)).not.toContain(input.content);
  await expect(admin.followUp(adminScenario.incidentId,{...input,content:'Contenido distinto'})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT',status:409});expect(await adminScenario.notes()).toBe(1);expect(await adminScenario.fingerprint()).toBe(before);
});
test('CA03 US4.06 cliente real modifica precio con revisión sin reprecificar orden',async({payment})=>{
  const api=client(payment.prepared.actors.admin.secret).admin,id=payment.prepared.offer.courseId,price=await api.price(id);expect(price.defined).toBe(true);if(!price.defined)throw new Error('Precio de fixture ausente');
  const result=await api.setPrice(id,{commandId:randomUUID(),expectedRevision:price.revision,amountMinor:'14000',currency:'PEN'});expect(result.resource.amountMinor).toBe('14000');expect((await api.order(payment.orderId)).totalMinor).toBe(payment.original.totalMinor);expect(payment.calls).toHaveLength(0);
});
