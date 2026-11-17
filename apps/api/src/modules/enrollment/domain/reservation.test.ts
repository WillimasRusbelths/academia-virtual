import { expect, test } from 'vitest';
import { prepareReservation } from './reservation.js';
import { at, commitment, group, input, item, ref } from '../../../../tests/support/reservation-domain.js';

const rejects=(value:Parameters<typeof prepareReservation>[0],code:string)=>expect(()=>prepareReservation(value)).toThrowError(expect.objectContaining({code}));
test('RS01 un grupo válido conserva detalle y PEN exacto sin input financiero cliente',()=>{
  expect(prepareReservation(input())).toEqual({items:[item()],totalMinor:12500n,currency:'PEN'});
});
test('RS02 varios cursos: total exacto sin flotantes ni cambio del conjunto',()=>{
  const a=group({price:{amountMinor:9007199254740993n,currency:'PEN'}}),b=group({groupId:ref(11),courseId:ref(2),price:{amountMinor:7n,currency:'PEN'},schedule:[{dayOfWeek:1,startTime:'19:00',endTime:'20:00'}]});
  const result=prepareReservation(input({groupIds:[b.groupId,a.groupId],groups:[a,b]}));
  expect(result.totalMinor).toBe(9007199254741000n);expect(result.currency).toBe('PEN');
  expect(result.items.map(i=>[i.courseId,i.groupId,i.priceMinor]).sort()).toEqual([[ref(1),ref(10),9007199254740993n],[ref(2),ref(11),7n]].sort());
});
test('RS03 cero es precio explícito, no precio ausente ni matrícula automática',()=>{
  const result=prepareReservation(input({groups:[group({price:{amountMinor:0n,currency:'PEN'}})]}));
  expect(result.totalMinor).toBe(0n);expect(result.items[0].priceMinor).toBe(0n);expect(result).not.toHaveProperty('enrollment');
});
for(const [name,ids]of [['vacía',[]],['UUID inválido',['invalid']],['duplicada',[ref(10),ref(10)]],['UUID con salto',[ref(10)+'\n']]] as const){
  test(`RS04 selección ${name} rechaza todo el conjunto`,()=>rejects(input({groupIds:ids}),'VALIDATION_ERROR'));
}
test('RS05 normaliza UUID canónico sin mutar selección recibida',()=>{
  const selected=[ref(10).toUpperCase()],before=[...selected],result=prepareReservation(input({groupIds:selected}));
  expect(result.items[0].groupId).toBe(ref(10));expect(selected).toEqual(before);
});
test('RS06 dos grupos del mismo curso se rechazan, no se elige uno silenciosamente',()=>{
  rejects(input({groupIds:[ref(10),ref(11)],groups:[group(),group({groupId:ref(11),schedule:[{dayOfWeek:2,startTime:'18:00',endTime:'19:00'}]})]}),'VALIDATION_ERROR');
});
test('RS07 referencia sin snapshot no produce reserva parcial',()=>rejects(input({groupIds:[ref(10),ref(99)]}),'OFFERING_NOT_RESERVABLE'));
for(const [name,changes]of [['oculto',{studentVisible:false}],['docente no habilitado',{teacherEligible:false}],['revisión docente pendiente',{teacherReviewRequired:true}],['precio ausente',{price:null}]] as const){
  test(`RS08 ${name} no permite reservar`,()=>rejects(input({groups:[group(changes)]}),'OFFERING_NOT_RESERVABLE'));
}
for(let capacity=1;capacity<=50;capacity++)test(`RS09 inventario configurado ${capacity}: queda exactamente una plaza`,()=>{
  const result=prepareReservation(input({groups:[group({capacity,reserved:capacity-1})]}));
  expect(result.items).toHaveLength(1);expect(result.totalMinor).toBe(12500n);
});
for(const capacity of [null,-1,0,51])test(`RS10 capacidad inválida ${capacity} no se normaliza`,()=>rejects(input({groups:[group({capacity})]}),'OFFERING_NOT_RESERVABLE'));
for(const [reserved,enrolled]of [[2,0],[1,1],[0,2]] as const)test(`RS11 lleno ${reserved} reservas/${enrolled} matrículas`,()=>{
  rejects(input({groups:[group({capacity:2,reserved,enrolled})]}),'CAPACITY_UNAVAILABLE');
});
for(const [reserved,enrolled]of [[-1,0],[0,-1],[2,1],[0.5,0]] as const)test(`RS12 inventario anómalo ${reserved}/${enrolled} falla seguro`,()=>{
  rejects(input({groups:[group({capacity:2,reserved,enrolled})]}),'TEMPORARILY_UNAVAILABLE');
});
test('RS13 multigrupo sin plaza en uno: ningún detalle parcial, input intacto',()=>{
  const value=input({groupIds:[ref(10),ref(11)],groups:[group(),group({courseId:ref(2),groupId:ref(11),reserved:2,schedule:[{dayOfWeek:2,startTime:'18:00',endTime:'19:00'}]})]});
  const before=structuredClone(value);rejects(value,'CAPACITY_UNAVAILABLE');expect(value).toEqual(before);
});
for(const delta of [-1n,0n,1n])test(`RS14 corte Lima: instante inicial ${delta} microsegundos`,()=>{
  const g=group(),value=input({groups:[g],at:g.groupStartAt+delta});
  if(delta<0n)expect(prepareReservation(value).items).toHaveLength(1);else rejects(value,'OFFERING_NOT_RESERVABLE');
});
test('RS15 orden RESERVED vigente impide otra reserva sin penalidad inventada',()=>{
  rejects(input({activeOrder:{state:'RESERVED',expiresAt:at+1n}}),'ACTIVE_ORDER_EXISTS');
});
for(const [state,end]of [['RESERVED',at],['EXPIRED',at-1n],['ENROLLED',at+1n]] as const)test(`RS16 orden ${state}/${end} no es otra reserva vigente`,()=>{
  expect(prepareReservation(input({activeOrder:{state,expiresAt:end}})).items).toHaveLength(1);
});
for(const kind of ['RESERVATION','ENROLLMENT'] as const)test(`RS17 mismo curso comprometido ${kind} aunque oculto`,()=>{
  rejects(input({commitments:[commitment({kind,state:kind==='RESERVATION'?'CONFIRMED':'ENROLLED',courseId:ref(1),studentVisible:false,schedule:[{dayOfWeek:2,startTime:'18:00',endTime:'19:00'}]})]}),'COURSE_COMMITMENT_EXISTS');
});
test('RS18 copia snapshots y no conserva alias de catálogo/precio/franjas',()=>{
  const g={...group(),price:{amountMinor:12500n,currency:'PEN' as const},schedule:[{dayOfWeek:1 as const,startTime:'18:00',endTime:'19:00'}]};
  const result=prepareReservation(input({groups:[g]}));g.courseName='Editado';g.price.amountMinor=99000n;g.schedule[0].startTime='17:00';
  expect(result.items[0]).toEqual(item());expect(result.totalMinor).toBe(12500n);
});
