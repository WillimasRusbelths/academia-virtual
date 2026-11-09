import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { ArgumentsHost } from '@nestjs/common';
import { afterAll, expect, test, vi } from 'vitest';
import { SafeErrorFilter, TransportFailure } from '../../src/http/error.filter.js';
import type { HttpRequest, HttpResponse } from '../../src/http/error.filter.js';
import { SecurityEvents } from '../../src/infrastructure/logging/security-events.js';
import { EnrollmentError } from '../../src/modules/enrollment/public/errors.js';
import type { EnrollmentFailure } from '../../src/modules/enrollment/public/errors.js';
import { preEnrollmentDatabase } from '../support/enrollment-migration.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { createEnrollmentCommandWriter } from '../../src/modules/enrollment/infrastructure/audit.js';
import { us1Http } from '../support/us1-http.js';

const directory=mkdtempSync(path.join(tmpdir(),'enrollment-errors-'));
afterAll(()=>rmSync(directory,{recursive:true,force:true}));
const privateText='PRIVATE_SQL_cookie_callback_signature_session_evidence@example.test';
/** Plantillas previstas para ensayar filtro/DTO, NO controladores de producto. */
const routes=[
  ['GET','/admin/enrollment/courses/:courseId/price',[],'COURSE','courseId'],
  ['PUT','/admin/enrollment/courses/:courseId/price',['commandId','expectedRevision','amountMinor','currency'],'COURSE','courseId'],
  ['GET','/enrollment/offerings',['q','page','pageSize'],'NONE',null],
  ['POST','/enrollment/selection-preview',['groupIds'],'NONE',null],
  ['POST','/enrollment/reservation-requests',['intentionId','groupIds'],'NONE',null],
  ['GET','/enrollment/reservation-requests',['page','pageSize'],'NONE',null],
  ['GET','/enrollment/reservation-requests/:intentionId',[],'RESERVATION_REQUEST','intentionId'],
  ['GET','/enrollment/orders',['page','pageSize'],'NONE',null],
  ['GET','/enrollment/orders/current',[],'NONE',null],
  ['GET','/enrollment/orders/:orderId',[],'ORDER','orderId'],
  ['POST','/enrollment/orders/:orderId/payment-attempts',['initiationId'],'ORDER','orderId'],
  ['GET','/enrollment/enrollments',['page','pageSize'],'NONE',null],
  ['GET','/enrollment/enrollments/:enrollmentId',[],'ENROLLMENT','enrollmentId'],
  ['GET','/admin/enrollment/orders',['page','pageSize','studentId'],'NONE',null],
  ['GET','/admin/enrollment/orders/:orderId',[],'ORDER','orderId'],
  ['GET','/admin/enrollment/incidents',['page','pageSize'],'NONE',null],
  ['GET','/admin/enrollment/incidents/:incidentId',[],'INCIDENT','incidentId'],
  ['POST','/admin/enrollment/incidents/:incidentId/follow-ups',['commandId','content'],'INCIDENT','incidentId'],
] as const;
type Route=typeof routes[number];
function request(route:Route):HttpRequest {
  return {headers:{cookie:privateText},method:route[0],route:{path:'/api/v1'+route[1]},requestId:randomUUID(),
    actor:{userId:randomUUID(),role:route[1].startsWith('/admin/')?'ADMIN':'STUDENT'},params:route[4]?{[route[4]]:randomUUID()}:{},commandId:randomUUID()};
}
function filter(error:unknown,input:HttpRequest){
  let body:{error:Record<string,unknown>}|undefined;
  const response:HttpResponse={statusCode:200,setHeader:vi.fn(),status(status){this.statusCode=status;return this;},json(value){body=value as typeof body;}};
  const location=path.join(directory,randomUUID()),logs=new SecurityEvents(location),record=vi.spyOn(logs,'record');
  const host={switchToHttp:()=>({getRequest:()=>input,getResponse:()=>response})} as unknown as ArgumentsHost;
  new SafeErrorFilter(logs).catch(error,host);return {response,body:body!,record,location};
}
const allFields=['commandId','expectedRevision','amountMinor','currency','intentionId','groupIds','initiationId','content','page','pageSize','q','studentId','email','password','providerReceiptId','evidence','sessionId',privateText];
for(const route of routes){
  test(`EE01 ${route[0]} ${route[1]}: campos cerrados de operación`,()=>{
    const input=request(route),failure={code:'VALIDATION_ERROR',fields:[...allFields,...allFields]} as unknown as EnrollmentFailure;
    const error=new EnrollmentError(failure);error.message=privateText;
    const result=filter(error,input);expect(result.response.statusCode).toBe(400);
    expect(result.body.error).toMatchObject({code:'VALIDATION_ERROR',requestId:input.requestId});
    expect([...(result.body.error.fields as {field:string}[]??[])].sort((a,b)=>a.field.localeCompare(b.field))).toEqual(route[2].map(field=>({field,message:'Campo inválido.'})).sort((a,b)=>a.field.localeCompare(b.field)));
    expect(Object.keys(result.body.error).sort()).toEqual((route[2].length?['code','message','requestId','fields']:['code','message','requestId']).sort());
    expect(JSON.stringify(result.body)).not.toContain(privateText);
    const transport=filter(new TransportFailure(400,'VALIDATION_ERROR',allFields.map(field=>({field,message:privateText}))),input);
    expect(transport.body.error.fields??[]).toEqual(result.body.error.fields??[]);
  });
  test(`EE02 ${route[0]} ${route[1]}: log mínimo de referencia`,()=>{
    const input=request(route),result=filter(new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'}),input);
    expect(result.response.statusCode).toBe(503);
    expect(result.record).toHaveBeenCalledWith(expect.objectContaining({targetKind:route[3],routeTemplate:route[1]}),input.requestId);
    const saved=readdirSync(result.location).map(file=>JSON.parse(readFileSync(path.join(result.location,file),'utf8')));
    expect(saved).toHaveLength(1);expect(saved[0].targetKind).toBe(route[3]);expect(JSON.stringify(saved)).not.toContain(privateText);
    if(route[4])expect(saved[0].requestedTargetId).toBe(input.params![route[4]]);
    expect(saved[0]).not.toHaveProperty('body');expect(saved[0]).not.toHaveProperty('sessionId');
    expect(saved[0].commandId).toBe(route[0]!=='GET'&&route[1].startsWith('/admin/')?input.commandId:undefined);
  });
}
const conflicts=[
  [1,'ENROLLMENT_VERSION_CONFLICT'],[1,'IDEMPOTENCY_CONFLICT'],[4,'ACTIVE_ORDER_EXISTS'],[4,'COURSE_COMMITMENT_EXISTS'],
  [4,'OFFERING_NOT_RESERVABLE'],[4,'CAPACITY_UNAVAILABLE'],[4,'STUDENT_SCHEDULE_CONFLICT'],[4,'IDEMPOTENCY_CONFLICT'],
  [3,'OFFERING_NOT_RESERVABLE'],[10,'RESERVATION_EXPIRED'],[10,'PAYMENT_NOT_ALLOWED'],[10,'IDEMPOTENCY_CONFLICT'],[17,'IDEMPOTENCY_CONFLICT'],
] as const;
for(const [index,code] of conflicts)test(`EE03 ${routes[index][0]} ${routes[index][1]} admite ${code}`,()=>{
  const error=new EnrollmentError({code,fields:['amountMinor']});error.message=privateText;
  const result=filter(error,request(routes[index]));expect(result.response.statusCode).toBe(409);
  expect(result.body.error).toEqual({code,message:expect.any(String),requestId:expect.any(String)});expect(JSON.stringify(result.body)).not.toContain(privateText);
});
for(const [index,code] of [[9,'ACTIVE_ORDER_EXISTS'],[6,'OFFERING_NOT_RESERVABLE'],[10,'ENROLLMENT_VERSION_CONFLICT'],[1,'PAYMENT_NOT_ALLOWED'],[17,'RESERVATION_EXPIRED']] as const){
  test(`EE04 ${routes[index][1]} no admite ${code}`,()=>{
    const input=request(routes[index]);const result=filter(new EnrollmentError({code}),input);
    expect(result.response.statusCode).toBe(503);expect(result.body.error.code).toBe('TEMPORARILY_UNAVAILABLE');
  });
}
for(const index of [1,4,10,17] as const)test(`EE05 audiencia incorrecta ${routes[index][1]} no recibe conflicto ni campos`,()=>{
  const input=request(routes[index]);input.actor!.role=input.actor!.role==='ADMIN'?'STUDENT':'ADMIN';
  const result=filter(new EnrollmentError({code:'IDEMPOTENCY_CONFLICT',fields:['content']}),input);
  expect(result.response.statusCode).toBe(503);expect(result.body.error).not.toHaveProperty('fields');
});
for(const route of ['/me','/admin/users/:id','/enrollment/callback','/enrollment/orders/raw?signature='+privateText])test(`EE06 contexto ajeno/desconocido ${route.split('?')[0]}`,()=>{
  const input=request(routes[1]);input.route={path:route};
  const result=filter(new EnrollmentError({code:'ENROLLMENT_VERSION_CONFLICT'}),input);
  expect(result.response.statusCode).toBe(503);expect(result.body.error).not.toHaveProperty('fields');
  expect(result.record.mock.calls[0][0]).not.toHaveProperty('commandId');expect(result.record.mock.calls[0][0]).not.toHaveProperty('requestedTargetId');
});
test('EE07 petición/cause/driver privados y requestId inválido nunca salen',()=>{
  const input=request(routes[10]);input.requestId=privateText;
  for(const error of [new Error(privateText),Object.assign(new Error(privateText),{code:'23505',detail:privateText,cause:{signature:privateText}})]){
    const result=filter(error,input);expect(result.response.statusCode).toBe(503);expect(result.body.error.code).toBe('TEMPORARILY_UNAVAILABLE');
    expect(result.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);expect(JSON.stringify(result.body)).not.toContain(privateText);
  }
});
test('EE08 escritor real PG: conflicto de revisión llega al filtro, cero cambios',async()=>{
  const context=await preEnrollmentDatabase();
  try{
    await context.applyEnrollment();const pool=context.database.pool,sessions=new PostgresSessionStore(pool),actor=(await sessions.lookup(context.admin.secret))!;
    const before=await financialFingerprint(pool),topology={accountIds:[],courseIds:[context.courseId],groupIds:[],orderIds:[],attemptIds:[],receiptIds:[],paymentIds:[],enrollmentIds:[],incidentIds:[]};
    const error=await createEnrollmentCommandWriter(pool,{revalidateInTransaction:sessions.revalidateInTransaction.bind(sessions)})({actor,operation:'COURSE_PRICE_SET',targetId:context.courseId,commandId:randomUUID(),requestId:randomUUID(),expectedRevision:'1',payload:{amountMinor:'100',currency:'PEN'},discover:async()=>topology,recheck:async()=>topology,apply:async()=>{throw new Error('No debe mutar');},project:async()=>null}).catch(error=>error);
    const result=filter(error,request(routes[1]));expect(result.response.statusCode).toBe(409);expect(result.body.error.code).toBe('ENROLLMENT_VERSION_CONFLICT');
    expect(await financialFingerprint(pool)).toBe(before);
  }finally{await context.cleanup();}
},120000);
test('EE10 log financiero rechaza payload, callback, evidencia y referencia de otra familia',()=>{
  const logs=new SecurityEvents(path.join(directory,randomUUID())),warn=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
  const base={category:'SECURITY',action:'ENROLLMENT_COMMAND_REJECTED',result:'DENIED',reasonCode:'PAYMENT_NOT_ALLOWED',actorKind:'ACCOUNT',actorUserId:randomUUID(),targetKind:'ORDER',requestedTargetId:randomUUID(),routeTemplate:'/enrollment/orders/:orderId/payment-attempts'};
  try{
    expect(logs.record(base,randomUUID())).toBe(true);
    for(const extra of [{payload:privateText},{body:privateText},{callback:privateText},{evidence:privateText},{sessionId:privateText},{headers:{cookie:privateText}},
      {targetKind:'USER_REFERENCE'},{targetKind:'INCIDENT'},{routeTemplate:'/enrollment/callback'},{reasonCode:privateText}]){
      expect(logs.record({...base,...extra},randomUUID())).toBe(false);
    }
  }finally{warn.mockRestore();}
});
test('EE11 conflicto financiero usa acción propia sin simular comando administrativo',()=>{
  for(const [index,code] of [[1,'ENROLLMENT_VERSION_CONFLICT'],[4,'CAPACITY_UNAVAILABLE'],[10,'RESERVATION_EXPIRED'],[17,'IDEMPOTENCY_CONFLICT']] as const){
    const result=filter(new EnrollmentError({code}),request(routes[index]));
    const saved=readdirSync(result.location).map(file=>JSON.parse(readFileSync(path.join(result.location,file),'utf8')));
    expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({action:'ENROLLMENT_COMMAND_REJECTED',reasonCode:code});
    expect(JSON.stringify(saved)).not.toContain(privateText);
  }
});
test('EE09 HTTP real mantiene tamaño, CSRF/origen y no crea endpoints financieros',async()=>{
  const context=await preEnrollmentDatabase();let http:Awaited<ReturnType<typeof us1Http>>|undefined;
  try{
    await context.applyEnrollment();http=await us1Http({context});const before=await financialFingerprint(context.database.pool);
    const url=`${http.url}/api/v1/admin/academic/groups/${context.groupId}`;
    for(const [headers,body,status] of [[{...http.headers(context.admin.secret),origin:'https://foreign.example.test'},{name:'Texto'},403],
      [{...http.headers(context.admin.secret),'x-csrf-protection':''},{name:'Texto'},403],
      [http.headers(context.admin.secret),{name:'x'.repeat(17000)},413]] as const){
      const response=await fetch(url,{method:'PATCH',headers,body:JSON.stringify(body)});expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');expect(JSON.stringify(await response.json())).not.toContain(privateText);
    }
    expect((await http.get('/admin/enrollment/orders',context.admin.secret)).status).toBe(404);
    expect(await financialFingerprint(context.database.pool)).toBe(before);
  }finally{try{await http?.close();}finally{await context.cleanup();}}
},120000);
