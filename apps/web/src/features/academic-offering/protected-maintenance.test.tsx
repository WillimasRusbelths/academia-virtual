import { expect,test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiFailure } from '../../shared/api-client';
import type { AdminGroup } from './api';
import { groupChanges } from './validation';
import { CommitmentNotice } from './offering-state';
const group={name:'Original',description:null,capacity:12,periodStart:'2090-01-02',periodEnd:'2090-03-31',teacher:{id:'docente'}} as AdminGroup;
const draft={name:group.name,description:'',capacity:'12',periodStart:group.periodStart!,periodEnd:group.periodEnd!,teacherUserId:'docente'};
test('PM01 guardar texto no incluye capacidad, período, zona o curso inmutables',()=>{
  expect(groupChanges({...draft,name:'Nuevo',description:'Descripción opcional'},group)).toEqual({name:'Nuevo',description:'Descripción opcional'});
});
test('PM02 cambiar docente solo envía asignación, sin afirmar publicación',()=>{expect(groupChanges({...draft,teacherUserId:'otro'},group)).toEqual({teacherUserId:'otro'});});
test('PM03 vaciar descripción existente envía null explícito',()=>{expect(groupChanges(draft,{...group,description:'Anterior'})).toEqual({description:null});});
test('PM04 campos sin cambios no producen PATCH',()=>{expect(groupChanges(draft,group)).toEqual({});});
test('PM05 cambios protegidos explícitos se envían para decisión autoritativa del servidor',()=>{
  expect(groupChanges({...draft,capacity:'13',periodEnd:'2090-04-01'},group)).toEqual({capacity:13,periodEnd:'2090-04-01'});
});
test('PM06 creación conserva datos opcionales ausentes y descripción explícita',()=>{
  expect(groupChanges({name:'Borrador',description:'',capacity:'',periodStart:'',periodEnd:'',teacherUserId:''})).toEqual({name:'Borrador'});
});
test('PM07 retirar docente no cambia otros atributos',()=>{expect(groupChanges({...draft,teacherUserId:''},group)).toEqual({teacherUserId:null});});
test('PM08 bloqueo explica opciones seguras sin datos financieros privados',()=>{
  const html=renderToStaticMarkup(<CommitmentNotice error={new ApiFailure(409,'GROUP_COMMITMENTS_BLOCK_OPERATION','PRIVATE_FIXTURE')}/>);
  expect(html).toContain('nombre, descripción o docente');expect(html).toContain('republicación explícita');expect(html).not.toContain('PRIVATE_FIXTURE');expect(html).not.toContain('<button');
});
test('PM09 aviso de bloqueo no se inventa ante otro error',()=>{expect(renderToStaticMarkup(<CommitmentNotice error={new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Error.')}/>)).toBe('');});
