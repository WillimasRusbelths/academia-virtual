import { expect, test } from 'vitest';
import { assertReservationCompatibility } from './compatibility.js';
import { at, commitment, group, ref } from '../../../../tests/support/reservation-domain.js';

const rejects=(selected:Parameters<typeof assertReservationCompatibility>[0],past:Parameters<typeof assertReservationCompatibility>[1],code:string)=>
  expect(()=>assertReservationCompatibility(selected,past,at)).toThrowError(expect.objectContaining({code}));
test('CP01 selección sin compromiso ajeno devuelve compatibilidad',()=>expect(assertReservationCompatibility([group()],[],at)).toBeUndefined());
test('CP02 selección se compara contra sí misma por fecha efectiva',()=>{
  rejects([group(),group({courseId:ref(2),groupId:ref(11)})],[],'STUDENT_SCHEDULE_CONFLICT');
});
test('CP03 períodos comunes sin un lunes común no generan conflicto',()=>{
  const a=group({periodStart:'2030-01-01',periodEnd:'2030-01-13'}),b=group({courseId:ref(2),groupId:ref(11),periodStart:'2030-01-08',periodEnd:'2030-01-14'});
  expect(assertReservationCompatibility([a,b],[],at)).toBeUndefined();
});
for(const [name,schedule]of [['después',[{dayOfWeek:1,startTime:'19:00',endTime:'20:00'}]],['antes',[{dayOfWeek:1,startTime:'17:00',endTime:'18:00'}]],['otro día',[{dayOfWeek:2,startTime:'18:00',endTime:'19:00'}]]] as const){
  test(`CP04 franjas ${name} son compatibles`,()=>expect(assertReservationCompatibility([group(),group({courseId:ref(2),groupId:ref(11),schedule})],[],at)).toBeUndefined());
}
for(const kind of ['RESERVATION','ENROLLMENT'] as const)for(const studentVisible of [true,false])test(`CP05 ${kind} visible=${studentVisible} vigente cuenta para D06`,()=>{
  rejects([group()],[commitment({kind,state:kind==='RESERVATION'?'CONFIRMED':'ENROLLED',studentVisible})],'STUDENT_SCHEDULE_CONFLICT');
});
for(const kind of ['RESERVATION','ENROLLMENT'] as const)for(const delta of [-1n,0n,1n])test(`CP06 ${kind} límite original ${delta}`,()=>{
  const prior=commitment({kind,state:kind==='RESERVATION'?'CONFIRMED':'ENROLLED',validUntil:at+delta});
  if(delta>0n)rejects([group()],[prior],'STUDENT_SCHEDULE_CONFLICT');else expect(assertReservationCompatibility([group()],[prior],at)).toBeUndefined();
});
for(const state of ['EXPIRED','CONVERTED'] as const)test(`CP07 reserva ${state} no bloquea`,()=>{
  expect(assertReservationCompatibility([group()],[commitment({state})],at)).toBeUndefined();
});
for(const groupId of [ref(10),ref(99)])test(`CP08 curso único incluso en grupo ${groupId}`,()=>{
  rejects([group()],[commitment({courseId:ref(1),groupId,schedule:[{dayOfWeek:2,startTime:'18:00',endTime:'19:00'}]})],'COURSE_COMMITMENT_EXISTS');
});
test('CP09 una segunda franja compartida basta para rechazar conjunto',()=>{
  const a=group({schedule:[{dayOfWeek:1,startTime:'10:00',endTime:'11:00'},{dayOfWeek:2,startTime:'18:00',endTime:'19:00'}]});
  const b=group({courseId:ref(2),groupId:ref(11),schedule:[{dayOfWeek:2,startTime:'18:30',endTime:'19:30'}]});
  rejects([a,b],[],'STUDENT_SCHEDULE_CONFLICT');
});
test('CP10 historial con fechas originales finalizadas no revive por oferta posterior',()=>{
  const old=commitment({kind:'ENROLLMENT',state:'ENROLLED',confirmedAt:at-200n,validUntil:at-1n,periodStart:'2020-01-01',periodEnd:'2020-01-31',courseId:ref(1)});
  expect(assertReservationCompatibility([group()],[old],at)).toBeUndefined();
});
