import { expect, test, vi } from 'vitest';
import { createApiClient } from './http';
import { ApiFailure } from '../shared/api-client';
const id='00000000-0000-4000-8000-000000000001';
const privateText='PRIVATE_SQL_cookie_callback_signature_session_evidence@example.test';
const routes=[
  ['GET',`/admin/enrollment/courses/${id}/price`,[]],['PUT',`/admin/enrollment/courses/${id}/price`,['commandId','expectedRevision','amountMinor','currency']],
  ['GET','/enrollment/offerings',['q','page','pageSize']],['POST','/enrollment/selection-preview',['groupIds']],
  ['POST','/enrollment/reservation-requests',['intentionId','groupIds']],['GET','/enrollment/reservation-requests',['page','pageSize']],
  ['GET',`/enrollment/reservation-requests/${id}`,[]],['GET','/enrollment/orders',['page','pageSize']],['GET','/enrollment/orders/current',[]],
  ['GET',`/enrollment/orders/${id}`,[]],['POST',`/enrollment/orders/${id}/payment-attempts`,['initiationId']],
  ['GET','/enrollment/enrollments',['page','pageSize']],['GET',`/enrollment/enrollments/${id}`,[]],
  ['GET','/admin/enrollment/orders',['page','pageSize','studentId']],['GET',`/admin/enrollment/orders/${id}`,[]],
  ['GET','/admin/enrollment/incidents',['page','pageSize']],['GET',`/admin/enrollment/incidents/${id}`,[]],
  ['POST',`/admin/enrollment/incidents/${id}/follow-ups`,['commandId','content']],
] as const;
const fields=['commandId','expectedRevision','amountMinor','currency','intentionId','groupIds','initiationId','content','page','pageSize','q','studentId','password','email','callback','sessionId','evidence'];
const response=(status:number,code:string)=>new Response(JSON.stringify({error:{code,message:privateText,requestId:id,fields:fields.map(field=>({field,message:privateText})),conflictingGroupIds:[id],cause:{callback:privateText}}}),{status});
for(const [method,path,allowed] of routes)test(`WE01 ${method} ${path}: campos propios y error cerrado`,async()=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValue(response(400,'VALIDATION_ERROR')),client=createApiClient(vi.fn(),transport);
  const error=await client.request(path,{method}).catch(error=>error);
  if(!(error instanceof ApiFailure))throw new Error('Se esperaba un fallo seguro del cliente.');
  expect(error).toMatchObject({status:400,code:'VALIDATION_ERROR',conflictingGroupIds:[]});expect([...error.fields].sort()).toEqual([...allowed].sort());expect(error.message).not.toContain(privateText);
  expect(JSON.stringify(error)).not.toContain(privateText);expect(transport).toHaveBeenCalledTimes(1);
});
for(const [index,code] of [[1,'ENROLLMENT_VERSION_CONFLICT'],[4,'ACTIVE_ORDER_EXISTS'],[4,'COURSE_COMMITMENT_EXISTS'],[4,'OFFERING_NOT_RESERVABLE'],[4,'CAPACITY_UNAVAILABLE'],[4,'STUDENT_SCHEDULE_CONFLICT'],[10,'RESERVATION_EXPIRED'],[10,'PAYMENT_NOT_ALLOWED'],[10,'IDEMPOTENCY_CONFLICT'],[17,'IDEMPOTENCY_CONFLICT']] as const){
  test(`WE02 ${routes[index][1]} reconoce ${code}`,async()=>{
    const [method,path]=routes[index],transport=vi.fn<typeof fetch>().mockResolvedValue(response(409,code));
    const error=await createApiClient(vi.fn(),transport).request(path,{method}).catch(error=>error);
    if(!(error instanceof ApiFailure))throw new Error('Se esperaba un fallo seguro del cliente.');
    expect(error).toMatchObject({status:409,code,fields:[],conflictingGroupIds:[]});expect(error.message).not.toContain(privateText);expect(transport).toHaveBeenCalledTimes(1);
  });
}
for(const [index,code] of [[9,'ACTIVE_ORDER_EXISTS'],[6,'OFFERING_NOT_RESERVABLE'],[10,'ENROLLMENT_VERSION_CONFLICT'],[1,'PAYMENT_NOT_ALLOWED'],[17,'RESERVATION_EXPIRED']] as const)test(`WE03 código ajeno ${routes[index][1]} ${code}`,async()=>{
  const [method,path]=routes[index],client=createApiClient(vi.fn(),vi.fn<typeof fetch>().mockResolvedValue(response(409,code)));
  await expect(client.request(path,{method})).rejects.toMatchObject({status:503,code:'TEMPORARILY_UNAVAILABLE',fields:[]});
});
for(const [path,query] of [['/enrollment/offerings',{q:'Curso',page:1,pageSize:20}],['/enrollment/orders',{page:1,pageSize:20}],['/admin/enrollment/orders',{studentId:id,pageSize:50}]] as const)test(`WE04 query permitida ${path}`,async()=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({data:{items:[],page:1,pageSize:20,total:0}})));
  await createApiClient(vi.fn(),transport).request(path,{query});expect(transport).toHaveBeenCalledTimes(1);
});
test('WE05 query ajena no sale; body/UUID inválido de ruta no habilita campos',async()=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValue(response(400,'VALIDATION_ERROR')),client=createApiClient(vi.fn(),transport);
  await expect(client.request('/enrollment/orders',{query:{studentId:id}})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(transport).not.toHaveBeenCalled();
  await expect(client.request('/enrollment/orders/not-uuid')).rejects.toMatchObject({fields:[],code:'VALIDATION_ERROR'});
});
test('WE06 200 ADMITTED y REJECTED son datos; 503 nunca equivale a rechazo confirmado',async()=>{
  for(const state of ['ADMITTED','REJECTED']){
    const data={id,intentionId:id,state,admittedAt:'2026-11-04T00:00:00.000001Z'};
    const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({data})));
    await expect(createApiClient(vi.fn(),transport).request(`/enrollment/reservation-requests/${id}`)).resolves.toEqual(data);
  }
  const transport=vi.fn<typeof fetch>().mockRejectedValue(new Error(privateText));
  await expect(createApiClient(vi.fn(),transport).request('/enrollment/reservation-requests',{method:'POST',body:{intentionId:id,groupIds:[id]}})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(transport).toHaveBeenCalledTimes(1);
});
test.each([202,204])('WE07 respuesta financiera %s no se descarta como éxito sin resultado',async status=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(status===204?null:JSON.stringify({data:{state:'ADMITTED'}}),{status}));
  await expect(createApiClient(vi.fn(),transport).request('/enrollment/reservation-requests',{method:'POST'})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('WE08 envelope financiero de éxito cerrado',async()=>{
  const client=createApiClient(vi.fn(),vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({data:{state:'ADMITTED'},callback:privateText}))));
  await expect(client.request('/enrollment/reservation-requests',{method:'POST'})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('WE09 transporte conserva CSRF, no-store y no reenvía tras AUTH_REQUIRED',async()=>{
  const auth=vi.fn(),transport=vi.fn<typeof fetch>().mockResolvedValue(response(401,'AUTH_REQUIRED'));
  await expect(createApiClient(auth,transport).request(`/enrollment/orders/${id}/payment-attempts`,{method:'POST',body:{initiationId:id}})).rejects.toMatchObject({code:'AUTH_REQUIRED'});
  expect(auth).toHaveBeenCalledTimes(1);expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0][1]).toMatchObject({cache:'no-store',credentials:'same-origin',mode:'same-origin',redirect:'error',headers:{'X-CSRF-Protection':'1','Content-Type':'application/json'}});
});
test('WE10 503 indica resultado no confirmado y consultar antes de repetir',async()=>{
  const client=createApiClient(vi.fn(),vi.fn<typeof fetch>().mockRejectedValue(new Error(privateText)));
  const error=await client.request('/enrollment/reservation-requests',{method:'POST'}).catch(error=>error);
  if(!(error instanceof ApiFailure))throw new Error('Se esperaba un fallo seguro del cliente.');
  expect(error).toMatchObject({status:503,code:'TEMPORARILY_UNAVAILABLE'});expect(error.message).toMatch(/resultado/);expect(error.message).toMatch(/[Cc]ons[uú]lt/);
});
