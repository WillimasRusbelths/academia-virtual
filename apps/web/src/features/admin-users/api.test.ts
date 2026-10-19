import { expect,test,vi } from 'vitest';
import { administrativeApi } from './api';
import type { ApiClient } from '../../shared/api-client';
const user={id:'00000000-0000-4000-8000-000000000001',name:'Ensayo',email:'ensayo@example.test',role:'TEACHER',status:'DISABLED',
  emailVerified:false,mustSetPassword:true,createdAt:'2026-10-15T00:00:00.000Z'};
test('consulta filtros sin interpolar correo en paths y acepta cuentas sin sesión habilitada',async()=>{
  const request=vi.fn().mockResolvedValue({items:[user],page:1,pageSize:20,total:1});
  const api=administrativeApi({request} as ApiClient);const filter={q:'%_\\+ &@example.test',role:'TEACHER',status:'DISABLED',page:1,pageSize:20};
  expect((await api.list(filter)).items[0]).toEqual(user);
  expect(request).toHaveBeenCalledWith('/admin/users',{signal:undefined,query:{...filter}});
});
for(const extra of [{items:[{...user,passwordHash:'dato-no-permitido'}],page:1,pageSize:20,total:1},{items:[{...user,status:['DISABLED']}],page:1,pageSize:20,total:1},{items:[user],page:0,pageSize:20,total:1},
  {items:[user],page:1,pageSize:51,total:1},{items:[user],page:1,pageSize:20,total:-1},{items:[],page:1,pageSize:20,total:0,secret:true}])test('rechaza proyecciones y metadatos no contractuales',async()=>{
  await expect(administrativeApi({request:vi.fn().mockResolvedValue(extra)} as ApiClient).list({q:'',role:'',status:'',page:1,pageSize:20})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
test('comandos envían solo campos permitidos y nunca reintentan un fallo',async()=>{
  const request=vi.fn().mockResolvedValue(user);const api=administrativeApi({request} as ApiClient);
  await api.name(user.id,'Nombre');await api.role(user.id,'STUDENT');await api.status(user.id,'ACTIVE');
  expect(request.mock.calls.map(call=>call[1])).toEqual([{method:'PATCH',body:{name:'Nombre'}},{method:'PUT',body:{role:'STUDENT'}},{method:'PUT',body:{status:'ACTIVE'}}]);
  request.mockRejectedValueOnce(new Error('Fallo controlado.'));await expect(api.create({name:'Ensayo',email:user.email,role:'TEACHER',provisionalPassword:'solo-sintetica'})).rejects.toThrow('Fallo controlado.');
  expect(request.mock.calls.length).toBe(4);
});
