import { expect,test } from 'vitest';
import { expirationDecision } from './expire-reservations.js';
import type { TemporalDecision } from './ports.js';
import type { EnrollmentOrderSnapshot } from '../public/enrollment.js';
import { at,item,ref } from '../../../../tests/support/reservation-domain.js';
import { parseInstant } from '../domain/instant.js';

const order=(changes:Partial<EnrollmentOrderSnapshot>={}):EnrollmentOrderSnapshot=>({id:ref(90),studentId:ref(80),revision:'1',state:'RESERVED',confirmedAt:at,expiresAt:at+86400000000n,totalMinor:12500n,currency:'PEN',items:[item()],...changes});
const token=(instant:bigint)=>({at:instant}) as TemporalDecision;
for(const [delta,result] of [[-1n,'NOT_DUE'],[0n,'EXPIRED'],[1n,'EXPIRED']] as const)test('XE01 TV13 límite exacto '+delta+'µs',()=>{
  const original=order();expect(expirationDecision(original,token(original.expiresAt+delta))).toBe(result);
  expect(original.expiresAt-original.confirmedAt).toBe(86400000000n);expect(original.state).toBe('RESERVED');expect(original.revision).toBe('1');
});
for(const state of ['ENROLLED','EXPIRED'] as const)for(const delta of [-1n,0n,1n])test('XE02 TV16 terminal '+state+' en '+delta+'µs conserva identidad',()=>{
  const original=Object.freeze(order({state}));expect(expirationDecision(original,token(original.expiresAt+delta))).toBe('ALREADY_TERMINAL');
  expect(original.state).toBe(state);expect(original.expiresAt-original.confirmedAt).toBe(86400000000n);
});
for(const state of ['RESERVED','ENROLLED','EXPIRED'] as const)test('XE03 TV24 retroceso anterior a confirmación '+state+' falla seguro',()=>{
  const original=order({state});expect(()=>expirationDecision(original,token(at-1n))).toThrowError(expect.objectContaining({code:'TEMPORARILY_UNAVAILABLE'}));
  expect(original.state).toBe(state);expect(original.confirmedAt).toBe(at);expect(original.expiresAt).toBe(at+86400000000n);
});
for(const instant of ['1969-12-31T23:59:59.999999Z','9999-12-31T23:59:59.999999Z'])test('XE04 TV07/TV08 normalización exacta sin Date '+instant,()=>{
  const confirmedAt=parseInstant(instant),original=order({confirmedAt,expiresAt:confirmedAt+86400000000n});
  expect(expirationDecision(original,token(original.expiresAt-1n))).toBe('NOT_DUE');expect(expirationDecision(original,token(original.expiresAt))).toBe('EXPIRED');
});
test('XE05 TV16 decidir no materializa ni modifica detalles originales',()=>{
  const original=order(),before={...original,items:original.items.map(value=>({...value}))};
  expect(expirationDecision(original,token(original.expiresAt+86400000000n))).toBe('EXPIRED');expect(original).toEqual(before);
});
