import { expect, test } from 'vitest';
import { paymentDecision, paymentDecisionTarget } from '../../../../tests/support/payment-verification-contract.js';
import type { PaymentInput, PaymentDecision } from '../../../../tests/support/payment-verification-contract.js';
import type { AuthenticPaymentEvidence } from '../public/payments.js';
import { at, item, ref, commitment } from '../../../../tests/support/reservation-domain.js';
import { parseInstant } from './instant.js';

const expiresAt=parseInstant('2030-01-02T00:00:00.123456Z');
function evidence(changes:Partial<AuthenticPaymentEvidence>={}):AuthenticPaymentEvidence{return {providerScope:'fixture/merchant/sandbox',providerPaymentId:'payment-fixture',merchantReference:'issued-reference',amountUnits:12500n,amountScale:2,currency:'PEN',normalizedEvidenceReference:'fixture/evidence/1',...changes};}
function input(changes:Partial<PaymentInput>={}):PaymentInput{return {
  order:{id:ref(70),studentId:ref(80),revision:'1',state:'RESERVED',confirmedAt:at,expiresAt,totalMinor:12500n,currency:'PEN',items:[item()]},
  merchantReference:'issued-reference',providerScope:'fixture/merchant/sandbox',observation:{state:'ECONOMIC_FACT',evidence:evidence()},at:at+1n,
  groups:[{groupId:ref(10),studentVisible:true,teacherEligible:true,teacherReviewRequired:false,seatState:'CONFIRMED',capacity:1,reserved:1,occupied:0,currentPriceMinor:19000n,currentName:'Texto posterior'}],commitments:[],...changes};}
function incident(value:PaymentInput):Extract<PaymentDecision,{state:'INCIDENT'}>{const result=paymentDecision(value);expect(result.state).toBe('INCIDENT');if(result.state!=='INCIDENT')throw new Error('Se esperaba incidencia de todo el conjunto.');return result;}

test('PU00 control: snapshots y evidencia ficticios exactos, sin decidir pago',()=>{
  const f=input();expect(f.order!.expiresAt-f.order!.confirmedAt).toBe(86400000000n);expect(f.groups[0].reserved).toBe(f.groups[0].capacity);expect(evidence().amountUnits).toBe(12500n);
});
test('PU01 PV01 plan total copia condiciones originales y no consume otra plaza',()=>{
  const f=input(),before=structuredClone(f),result=paymentDecision(f);expect(result.state).toBe('APPLIED');
  if(result.state!=='APPLIED')throw new Error('No se obtuvo plan de matrícula.');
  expect(result.items).toEqual([{...item(),confirmedAt:f.at,validUntil:item().enrollmentValidUntil}]);expect(f).toEqual(before);expect(result).not.toHaveProperty('additionalSeat');
});
for(const delta of [-1n,0n,1n])test(`PU02 PV02 límite ${delta}µs`,()=>{
  const result=paymentDecision(input({at:expiresAt+delta}));expect(result.state).toBe(delta<0n?'APPLIED':'INCIDENT');if(delta>=0n)expect(result).not.toHaveProperty('items');
});
test('PU03 PV03 recepción y observación anteriores no retrotraen la decisión final',()=>{
  const result=incident(input({at:expiresAt,receivedAt:expiresAt-1000000n,externalObservedAt:expiresAt-2000000n}));expect(result).not.toHaveProperty('items');
});
for(const actual of [12499n,12501n,0n,-1n,9007199254740993n])test(`PU04 PV14 importe real ${actual} no se suma, redondea ni falsea`,()=>{
  const actualEvidence=evidence({amountUnits:actual}),result=incident(input({observation:{state:'ECONOMIC_FACT',evidence:actualEvidence}}));expect(result.evidence).toEqual(actualEvidence);expect(result).not.toHaveProperty('items');
});
for(const [currency,scale,units] of [['USD',2,12500n],['PEN',3,12500n],['PEN',0,12500n]] as const)test(`PU05 PV14 moneda/escala ${currency}/${scale}`,()=>{
  const actualEvidence=evidence({currency,amountScale:scale,amountUnits:units});expect(incident(input({observation:{state:'ECONOMIC_FACT',evidence:actualEvidence}})).evidence).toEqual(actualEvidence);
});
test('PU06 PV14 representación decimal equivalente no usa coma flotante',()=>{
  expect(paymentDecision(input({observation:{state:'ECONOMIC_FACT',evidence:evidence({amountUnits:125000n,amountScale:3})}})).state).toBe('APPLIED');
});
test('PU07 PV14 total mayor que precisión Number se contrasta exactamente',()=>{
  const f=input(),amount=9007199254740993n,order={...f.order!,totalMinor:amount,items:[item({priceMinor:amount})]};
  expect(paymentDecision({...f,order,observation:{state:'ECONOMIC_FACT',evidence:evidence({amountUnits:amount})}}).state).toBe('APPLIED');
  expect(incident({...f,order,observation:{state:'ECONOMIC_FACT',evidence:evidence({amountUnits:amount-1n})}}).evidence.amountUnits).toBe(amount-1n);
});
for(const field of ['studentVisible','teacherEligible','teacherReviewRequired'] as const)test(`PU08 PV17 condición actual ${field} impide aplicación`,()=>{
  const f=input();expect(incident({...f,groups:[{...f.groups[0],[field]:field==='teacherReviewRequired'}]})).not.toHaveProperty('items');
});
test('PU09 PV20 precio, nombre y comienzo posteriores no reemplazan el original',()=>{
  const f=input({at:item().groupStartAt+1n});const order={...f.order!,confirmedAt:item().groupStartAt-1000000n,expiresAt:item().groupStartAt+86399000000n};
  const result=paymentDecision({...f,order});expect(result.state).toBe('APPLIED');if(result.state==='APPLIED')expect(result.items[0]).toMatchObject({priceMinor:12500n,courseName:'Curso original',periodStart:'2030-01-07',validUntil:item().enrollmentValidUntil});
});
for(const state of ['UNRESOLVED','FAILED_NO_CHARGE'] as const)test(`PU10 PV23 ${state} no crea hecho económico o matrícula`,()=>{
  expect(paymentDecision(input({observation:{state}}))).toEqual({state:'UNCONFIRMED'});
});
test('PU11 PV16 success del navegador sin hecho económico no acredita pago',()=>{
  const f={...input({observation:{state:'UNRESOLVED'}}),browserSuccess:true};expect(paymentDecision(f)).toEqual({state:'UNCONFIRMED'});
});
test('PU12 D06 excluye únicamente reservas de la orden que se convierte',()=>{
  const f=input(),own={...commitment({courseId:ref(1),groupId:ref(10),validUntil:expiresAt}),orderId:f.order!.id};
  expect(paymentDecision({...f,commitments:[own]}).state).toBe('APPLIED');
  expect(incident({...f,commitments:[{...own,orderId:ref(99)}]})).not.toHaveProperty('items');
});
for(const kind of ['RESERVATION','ENROLLMENT'] as const)test(`PU13 D06 compromiso vigente oculto ${kind} sigue bloqueando`,()=>{
  const f=input(),other={...commitment({kind,state:kind==='RESERVATION'?'CONFIRMED':'ENROLLED',validUntil:expiresAt}),orderId:ref(99)};
  expect(incident({...f,commitments:[other]})).not.toHaveProperty('items');
});
test('PU14 D06 franjas contiguas no generan incidencia',()=>{
  const other={...commitment({schedule:[{dayOfWeek:1,startTime:'19:00',endTime:'20:00'}]}),orderId:ref(99)};expect(paymentDecision(input({commitments:[other]})).state).toBe('APPLIED');
});
for(const state of ['EXPIRED','CONVERTED'] as const)test(`PU15 D06 historial ${state} no bloquea`,()=>{
  const other={...commitment({state}),orderId:ref(99)};expect(paymentDecision(input({commitments:[other]})).state).toBe('APPLIED');
});
test('PU16 conjunto de dos cursos es total; un grupo oculto impide cualquier matrícula',()=>{
  const f=input(),other=item({courseId:ref(2),groupId:ref(11),priceMinor:7000n,schedule:[{dayOfWeek:2,startTime:'18:00',endTime:'19:00'}]}),order={...f.order!,items:[item(),other],totalMinor:19500n};
  const combined={...f,order,groups:[...f.groups,{...f.groups[0],groupId:ref(11)}],observation:{state:'ECONOMIC_FACT' as const,evidence:evidence({amountUnits:19500n})}};
  const result=paymentDecision(combined);expect(result.state).toBe('APPLIED');if(result.state==='APPLIED')expect(result.items.map(i=>i.groupId).sort()).toEqual([ref(10),ref(11)]);
  expect(incident({...combined,groups:combined.groups.map(g=>g.groupId===ref(11)?{...g,studentVisible:false}:g)})).not.toHaveProperty('items');
});
for(const state of ['EXPIRED','ENROLLED'] as const)test(`PU17 orden ${state} conserva terminalidad ante otro hecho auténtico`,()=>{
  const f=input();expect(incident({...f,order:{...f.order!,state}})).not.toHaveProperty('items');
});
for(const seatState of ['EXPIRED','CONVERTED'] as const)test(`PU18 plaza propia ${seatState} no se resucita`,()=>{
  const f=input();expect(incident({...f,groups:[{...f.groups[0],seatState}]})).not.toHaveProperty('items');
});
test('PU19 referencia desconocida conserva dinero real sin adjudicar grupos',()=>{
  const result=incident(input({order:null,merchantReference:null,groups:[]}));expect(result.affectedGroupIds).toEqual([]);expect(result.evidence).toEqual(evidence());
});
for(const field of ['merchantReference','providerScope'] as const)test(`PU20 asociación incompatible ${field} nunca aplica a la orden`,()=>{
  const actual=evidence({[field]:'fixture/other'});expect(incident(input({observation:{state:'ECONOMIC_FACT',evidence:actual}})).evidence).toEqual(actual);
});
test('PU21 fecha final antes de confirmación es infraestructura inconsistente, no pago aplicable',()=>{
  const decide=paymentDecisionTarget();expect(()=>decide(input({at:at-1n}))).toThrowError(expect.objectContaining({code:'TEMPORARILY_UNAVAILABLE'}));
});
