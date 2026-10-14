import { expect, test } from 'vitest';
import { AdminInvariant, decideAccessChange } from './account-administration.js';
import type { AccessChange } from './account-administration.js';

const account={id:'destino',role:'ADMIN',status:'ACTIVE'} as const;
for(const change of [{kind:'role',role:'STUDENT'},{kind:'role',role:'TEACHER'},{kind:'status',status:'DISABLED'}] as const) {
  test(`impide cambio propio ${change.kind}/${Object.values(change)[1]}`,()=>{
    expect(()=>decideAccessChange(account.id,account,change,2)).toThrow(AdminInvariant);
  });
  test(`impide retirar último ADMIN ACTIVE mediante ${change.kind}/${Object.values(change)[1]}`,()=>{
    expect(()=>decideAccessChange('otro',account,change,1)).toThrow(AdminInvariant);
  });
}
test('otro ADMIN puede retirarse cuando queda otro activo; no exige correo verificado para contar',()=>{
  expect(decideAccessChange('otro',account,{kind:'role',role:'STUDENT'},2)).toEqual({role:'STUDENT',status:'ACTIVE',changed:true,revokeSessions:true,revokeActions:false});
});
for(const change of [{kind:'role',role:'ADMIN'},{kind:'status',status:'ACTIVE'}] as const)test(`no-op propio ${change.kind} no revoca ni restaura`,()=>{
  const snapshot={...account};expect(decideAccessChange(account.id,account,change,1)).toEqual({role:'ADMIN',status:'ACTIVE',changed:false,revokeSessions:false,revokeActions:false});
  expect(account).toEqual(snapshot);
});
test('desactivar revoca sesiones y acciones; cambiar rol solo sesiones',()=>{
  const target={...account,role:'STUDENT'} as const;
  expect(decideAccessChange('actor',target,{kind:'status',status:'DISABLED'},1).revokeActions).toBe(true);
  expect(decideAccessChange('actor',target,{kind:'role',role:'ADMIN'},1).revokeActions).toBe(false);
});
test('reactivar y no-op desactivado no reconstruyen sesiones, tokens ni provisional',()=>{
  const target={...account,status:'DISABLED'} as const;
  for(const change of [{kind:'status',status:'ACTIVE'},{kind:'status',status:'DISABLED'}] as AccessChange[]) {
    const decision=decideAccessChange('actor',target,change,0);
    expect(decision.revokeSessions||decision.revokeActions).toBe(false);
    expect(Object.keys(decision).sort()).toEqual(['role','status','changed','revokeSessions','revokeActions'].sort());
  }
});
test('ADMIN desactivado no cuenta como último activo para un cambio de rol',()=>{
  expect(decideAccessChange('otro',{...account,status:'DISABLED'},{kind:'role',role:'TEACHER'},1).changed).toBe(true);
});
