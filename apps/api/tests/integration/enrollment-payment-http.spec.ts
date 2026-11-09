import { randomUUID } from 'node:crypto';
import { expect,test } from 'vitest';
import { attemptFixture,paymentHttp } from '../support/payment-attempt.js';
import type { AttemptFixture } from '../support/payment-attempt.js';
import { sessionFixture } from '../support/session-fixture.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { receiptReceiver,gatewayBinding } from '../support/payment-attempt-contract.js';
import type { ReceiptAdapter } from '../support/payment-attempt-contract.js';
import { paymentFixture,assertApplied } from '../support/enrollment-payment.js';

type Http=Awaited<ReturnType<typeof paymentHttp>>;
function http(name:string,body:(f:AttemptFixture,h:Http)=>Promise<void>){test(name,async()=>{const f=await attemptFixture();let h:Http|undefined;try{h=await paymentHttp(f);await body(f,h);}finally{f.gateway.release.resolve();await h?.close();await f.close();}},120000);}
const path=(f:AttemptFixture)=>'/enrollment/orders/'+f.orderId+'/payment-attempts';
/** Se ejercita HTTP real incluso si falta la ruta. No convertir un 404 en 401/200. */
async function routeStatus(response:Response,expected:number){expect(response.status,'T053 pendiente: ruta HTTP de intentos/matrículas ausente o sin contrato; no es fallo de arranque/configuración').toBe(expected);}
function privateFree(value:unknown){expect(JSON.stringify(value)).not.toMatch(/externalIdempotencyKey|merchantReference|providerReference|providerPaymentId|providerScope|payloadDigest|normalizedEvidence|receiptId|tokenHash|passwordHash|actorSessionReference|authVersion|PRIVATE_FIXTURE/);}
http('PH00a control: composición real, orden propia consultable y ninguna ruta de aprobación añadida',async(f,h)=>{
  const response=await h.get('/enrollment/orders/'+f.orderId,f.student.secret);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');const body=await response.json();expect(body.data.totalMinor).toBe('25000');privateFree(body);expect(await f.rows()).toEqual([]);
});
for(const spoof of ['browser-success','browser-failure'] as const)http('PH00b control PV16: '+spoof+' no fabrica verificación o matrícula',async(f,h)=>{
  const before=await financialFingerprint(f.pool),response=await fetch(h.url+'/mis-ordenes/'+f.orderId+'?success='+String(spoof==='browser-success'),{headers:h.headers(f.student.secret)});
  expect(response.status).toBe(404);const order=await h.get('/enrollment/orders/'+f.orderId,f.student.secret);expect(order.status).toBe(200);expect((await order.json()).data.state).toBe('RESERVED');expect(await financialFingerprint(f.pool)).toBe(before);await f.noFinancialEffects();
});
// Son rutas de ataque ficticias, NO contrato de URL/firma del proveedor.
for(const route of ['/payments/callback','/enrollment/payments/approve','/enrollment/payments/simulate','/system/enrollment/payments'])http('PH00c control: URL inventada '+route+' no expone aprobación',async(f,h)=>{
  const before=await financialFingerprint(f.pool),response=await h.post(route,{success:true,orderId:f.orderId,actorKind:'SYSTEM'},f.student.secret);expect(response.status).toBe(404);expect(await financialFingerprint(f.pool)).toBe(before);await f.noFinancialEffects();
});
for(const attack of [{origin:'https://foreign.example.test'},{'x-csrf-protection':''},{'sec-fetch-site':'cross-site'}] as Record<string,string>[])http('PH00d control: mutación financiera conserva protección global '+Object.keys(attack)[0],async(f,h)=>{
  const before=await financialFingerprint(f.pool),response=await h.post(path(f),{initiationId:randomUUID()},f.student.secret,attack);expect(response.status).toBe(403);expect((await response.json()).error.code).toBe('REQUEST_NOT_ALLOWED');expect(await financialFingerprint(f.pool)).toBe(before);expect(f.gateway.calls).toHaveLength(0);
});
for(const role of ['VISITOR','TEACHER','ADMIN'] as const)http('PH01 autorización: '+role+' no inicia pago propio de alumno',async(f,h)=>{
  const secret=role==='VISITOR'?undefined:role==='ADMIN'?f.admin.secret:f.teacher.secret;
  const before=await financialFingerprint(f.pool),response=await h.post(path(f),{initiationId:randomUUID()},secret);await routeStatus(response,role==='VISITOR'?401:403);privateFree(await response.json());expect(await financialFingerprint(f.pool)).toBe(before);expect(f.gateway.calls).toHaveLength(0);
});
http('PH02 propiedad: orden ajena e inexistente son indistinguibles',async(f,h)=>{
  const other=await sessionFixture(f,'STUDENT');await f.boundary(-1);const before=await financialFingerprint(f.pool);
  const bodies=[];for(const orderId of [f.orderId,randomUUID()]){const response=await h.post('/enrollment/orders/'+orderId+'/payment-attempts',{initiationId:randomUUID()},other.secret);await routeStatus(response,404);bodies.push(await response.json());}
  // Un 404 de router no acredita propiedad: exigir el enlace real de pagos antes
  // de aceptar la ausencia de diferencias entre recursos autorizados/ajenos.
  expect(gatewayBinding,'T053 pendiente: enlace real de pagos ausente; 404 de router no acredita pertenencia').toBeDefined();expect(bodies.map(b=>b.error.code)).toEqual(['NOT_FOUND','NOT_FOUND']);bodies.forEach(privateFree);expect(await financialFingerprint(f.pool)).toBe(before);expect(f.gateway.calls).toHaveLength(0);
});
for(const field of ['studentId','orderId','amountMinor','currency','confirmedAt','verificationFinishedAt','actorKind','providerPaymentId','receiptId','success'])http('PH03 DTO cerrado: cliente no controla '+field,async(f,h)=>{
  const before=await financialFingerprint(f.pool),response=await h.post(path(f),{initiationId:randomUUID(),[field]:'PRIVATE_FIXTURE'},f.student.secret);await routeStatus(response,400);const error=await response.json();expect(error.error.code).toBe('VALIDATION_ERROR');privateFree(error);expect(await financialFingerprint(f.pool)).toBe(before);expect(f.gateway.calls).toHaveLength(0);
});
http('PH04 iniciación válida y replay tienen DTO seguro y una llamada externa',async(f,h)=>{
  const body={initiationId:randomUUID()},first=await h.post(path(f),body,f.student.secret);await routeStatus(first,200);const value=await first.json();privateFree(value);expect(first.headers.get('cache-control')).toBe('no-store');expect(value.data.state).toBe('PENDING');
  const again=await h.post(path(f),body,f.student.secret);await routeStatus(again,200);expect(await again.json()).toEqual(value);expect(await f.rows()).toHaveLength(1);expect(f.gateway.calls).toHaveLength(1);await f.noFinancialEffects();await f.unchangedOrder();
});
http('PH05 logout revoca inicio/replay y consulta de matrículas',async(f,h)=>{
  const body={initiationId:randomUUID()},first=await h.post(path(f),body,f.student.secret);await routeStatus(first,200);
  expect((await h.post('/auth/logout',{},f.student.secret)).status).toBe(204);const before=await financialFingerprint(f.pool);
  for(const next of [body,{initiationId:randomUUID()}])await routeStatus(await h.post(path(f),next,f.student.secret),401);
  await routeStatus(await h.get('/enrollment/enrollments',f.student.secret),401);expect(await financialFingerprint(f.pool)).toBe(before);expect(f.gateway.calls).toHaveLength(1);
});
for(const request of ['body','headers'] as const)http('PH06 identidad SYSTEM enviada por usuario en '+request+' no concede capacidad técnica',async(f,h)=>{
  const before=await financialFingerprint(f.pool),response=await h.post(path(f),request==='body'?{initiationId:randomUUID(),actorKind:'SYSTEM',success:true}:{initiationId:randomUUID()},undefined,request==='headers'?{'x-actor-kind':'SYSTEM','x-system-origin':'true','authorization':'Bearer PRIVATE_FIXTURE'}:{});
  await routeStatus(response,401);privateFree(await response.json());expect(await financialFingerprint(f.pool)).toBe(before);expect(f.gateway.calls).toHaveLength(0);
});
http('PH07 consulta propia de matrículas vacía no filtra recibos ni claves',async(f,h)=>{
  const response=await h.get('/enrollment/enrollments',f.student.secret);await routeStatus(response,200);const value=await response.json();expect(value.data.items).toEqual([]);expect(value.data.total).toBe(0);privateFree(value);expect(response.headers.get('cache-control')).toBe('no-store');
});
// Adaptador interno explícito: prueba autenticidad como capacidad inyectada,
// nunca un booleano del cuerpo, un endpoint simulado o una firma Izipay inventada.
const adapter:ReceiptAdapter={async authenticate(delivery){if(!delivery||typeof delivery!=='object'||!('fixtureProof'in delivery)||delivery.fixtureProof!=='PRIVATE_FIXTURE_INTERNAL_ONLY')return null;return {providerScope:'fixture/provider/merchant/sandbox',normalizedEvidenceReference:'fixture/internal/evidence',merchantReferenceHint:null,observation:{state:'UNRESOLVED'}};}};
for(const delivery of [{success:true},{actorKind:'SYSTEM',authentic:true},{fixtureProof:'forged'},{fixtureProof:null}])http('PH08 entrada técnica rechaza evidencia no autenticada '+JSON.stringify(delivery),async f=>{
  const receiver=receiptReceiver(f.pool,adapter),before=await financialFingerprint(f.pool);expect((await receiver.receive(delivery,randomUUID())).state).toBe('REJECTED');expect(await financialFingerprint(f.pool)).toBe(before);await f.noFinancialEffects();
});
http('PH09 recibo técnico mínimo durable antes del acuse no decide pago ni toma lock de orden',async f=>{
  const receiver=receiptReceiver(f.pool,adapter),lock=await f.pool.connect();
  try{await lock.query('BEGIN');await lock.query('SELECT id FROM "EnrollmentOrder" WHERE id=$1 FOR UPDATE',[f.orderId]);
    const result=await Promise.race([receiver.receive({fixtureProof:'PRIVATE_FIXTURE_INTERNAL_ONLY',rawPan:'PRIVATE_FIXTURE_PAN',token:'PRIVATE_FIXTURE_TOKEN'},randomUUID()),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Recibo tomó lock de orden antes del acuse.')),3000))]);
    expect(result.state).toBe('ACCEPTED');expect(result.receiptId).toEqual(expect.any(String));
    const row=(await f.pool.query('SELECT to_jsonb(r) AS value FROM "ProviderReceipt" r WHERE id=$1',[result.receiptId])).rows[0].value;
    expect(row).toMatchObject({state:'RECEIVED',processedAt:null,terminalPaymentId:null});expect(JSON.stringify(row)).not.toMatch(/PRIVATE_FIXTURE|rawPan|token|fixtureProof/);expect(row).not.toHaveProperty('orderId');await f.noFinancialEffects();
  }finally{await lock.query('ROLLBACK');lock.release();}
});
test('PH10 PV24: entrada SYSTEM y finalizador siguen tras logout sin facultad de usuario',async()=>{
  const f=await paymentFixture();try{
    const receiver=receiptReceiver(f.pool,{async authenticate(){return {providerScope:f.evidence.providerScope,normalizedEvidenceReference:f.evidence.normalizedEvidenceReference,merchantReferenceHint:f.evidence.merchantReference,observation:f.first.observation};}});const processor=f.processor();
    await f.sessions.revoke(f.student.secret);expect(await f.sessions.lookup(f.student.secret)).toBeNull();
    const received=await receiver.receive({fixture:'technical-only'},randomUUID());expect(received.state).toBe('ACCEPTED');
    const result=await processor.finalize({...f.first,receiptId:received.receiptId!});expect(result.state).toBe('APPLIED');await assertApplied(f,result.paymentId);
  }finally{await f.close();}
},120000);
