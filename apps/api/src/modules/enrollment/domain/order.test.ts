import { expect, test } from 'vitest';
import { createReservedOrder } from './order.js';
import { at, item, ref } from '../../../../tests/support/reservation-domain.js';
import { parseInstant, formatInstant } from './instant.js';

test('OR01 orden inicial reservada conserva detalle, total, titular y revisión',()=>{
  expect(createReservedOrder({id:ref(100),studentId:ref(101),confirmedAt:at,items:[item()]})).toEqual({
    id:ref(100),studentId:ref(101),revision:'1',state:'RESERVED',confirmedAt:at,expiresAt:at+86400000000n,currency:'PEN',totalMinor:12500n,items:[item()],
  });
});
const lastCivilDay=parseInstant('9999-12-31T04:59:59.999999Z');
for(const confirmedAt of [-86400000001n,-1n,0n,at,lastCivilDay])test(`OR02 duración exacta desde ${confirmedAt}`,()=>{
  // El caso ampliado sigue siendo anterior a las 00:00 iniciales Lima del grupo.
  const original=confirmedAt===lastCivilDay?item({periodStart:'9999-12-31',periodEnd:'9999-12-31',
    groupStartAt:parseInstant('9999-12-31T05:00:00.000000Z'),enrollmentValidUntil:parseInstant('+010000-01-01T05:00:00.000000Z'),
    schedule:([1,2,3,4,5,6,7] as const).map(dayOfWeek=>({dayOfWeek,startTime:'18:00',endTime:'19:00'}))}):item();
  const order=createReservedOrder({id:ref(100),studentId:ref(101),confirmedAt,items:[original]});
  expect(order.confirmedAt).toBe(confirmedAt);expect(order.expiresAt).toBe(confirmedAt+86400000000n);
  expect(parseInstant(formatInstant(order.expiresAt))).toBe(order.expiresAt);
});
test('OR03 total mayor al entero seguro de JS no pierde unidades menores',()=>{
  const order=createReservedOrder({id:ref(100),studentId:ref(101),confirmedAt:at,items:[item({priceMinor:9007199254740993n}),item({courseId:ref(2),groupId:ref(11),priceMinor:7n})]});
  expect(order.totalMinor).toBe(9007199254741000n);expect(order.items.map(i=>i.priceMinor)).toEqual([9007199254740993n,7n]);
});
test('OR04 cero explícito conserva RESERVED y nunca ENROLLED',()=>{
  const order=createReservedOrder({id:ref(100),studentId:ref(101),confirmedAt:at,items:[item({priceMinor:0n})]});
  expect(order.totalMinor).toBe(0n);expect(order.state).toBe('RESERVED');expect(order).not.toHaveProperty('payment');
});
for(const [name,items]of [['vacío',[]],['mismo curso',[item(),item({groupId:ref(11)})]],['precio negativo',[item({priceMinor:-1n})]],['total fuera de BIGINT',[item({priceMinor:9223372036854775807n}),item({courseId:ref(2),groupId:ref(11),priceMinor:1n})]]] as const){
  test(`OR05 conjunto ${name} no crea orden parcial`,()=>expect(()=>createReservedOrder({id:ref(100),studentId:ref(101),confirmedAt:at,items})).toThrowError(expect.objectContaining({code:'VALIDATION_ERROR'})));
}
test('OR06 copia nombres, período, límites y franjas originales sin alias',()=>{
  const original={...item(),schedule:[{dayOfWeek:1 as const,startTime:'18:00',endTime:'19:00'}]},items=[original];
  const order=createReservedOrder({id:ref(100),studentId:ref(101),confirmedAt:at,items});
  original.courseName='Nuevo nombre';original.priceMinor=1n;original.periodEnd='2090-01-31';original.enrollmentValidUntil+=1000000n;original.schedule[0].startTime='17:00';items.length=0;
  expect(order.items).toEqual([item()]);expect(order.totalMinor).toBe(12500n);
});
