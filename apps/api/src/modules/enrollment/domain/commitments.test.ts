import { expect,test } from 'vitest';
import { requiresGroupCommitmentCheck } from '../public/commitments.js';
import type { GroupCommitmentChange } from '../public/commitments.js';
import { createGroup,editGroup } from '../../academic-offering/domain/group.js';

// Reglas puras de operaciones. Los tres tipos de compromiso y su vigencia se
// prueban con PostgreSQL en reservation-authorization, sin simular filas SQL aquí.
for(const operation of ['GROUP_CANCEL','GROUP_SCHEDULE'] as const)test('CU01 US4.11 '+operation+' consulta guard de compromisos',()=>{
  expect(requiresGroupCommitmentCheck({operation})).toBe(true);
});
for(const field of ['periodStart','periodEnd','capacity','timeZone'] as const)test('CU02 US4.11 editar '+field+' requiere guard',()=>{
  expect(requiresGroupCommitmentCheck({operation:'GROUP_EDIT',fields:[field]})).toBe(true);
});
for(const field of ['name','description','teacherUserId'] as const)test('CU03 US4.12 '+field+' conserva validaciones propias de oferta',()=>{
  expect(requiresGroupCommitmentCheck({operation:'GROUP_EDIT',fields:[field]})).toBe(false);
});
for(const operation of ['GROUP_WITHDRAW','GROUP_PUBLISH'] as const)test('CU04 US4.12 '+operation+' no cancela compromisos',()=>{
  expect(requiresGroupCommitmentCheck({operation})).toBe(false);
});
test('CU05 US4.11 texto junto a capacidad no evita el guard',()=>{
  const change:GroupCommitmentChange={operation:'GROUP_EDIT',fields:['name','capacity']};expect(requiresGroupCommitmentCheck(change)).toBe(true);
});
test('CU06 US4.11 curso permanece inmutable incluso sin compromisos',()=>{
  const group=createGroup('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',{name:'Grupo ficticio'});
  expect(editGroup(group,{courseId:'00000000-0000-4000-8000-000000000003'}).courseId).toBe(group.courseId);expect(group.courseId).toBe('00000000-0000-4000-8000-000000000002');
});
