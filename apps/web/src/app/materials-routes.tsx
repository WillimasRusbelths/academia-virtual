import type { AppRoute } from './router';
import type { MaterialsApi } from '../features/materials/api';
import { MaterialsScreen } from '../features/materials/management-screen';
import { MaterialsStudentScreen, MaterialsStudentGroupsScreen } from '../features/materials/student-page';

export const materialsGroupHref=(groupId:string)=>`/materiales/grupos/${groupId}`;
export function materialsRoutes(api:MaterialsApi,accountId='session',role?:'ADMIN'|'TEACHER'|'STUDENT'):readonly AppRoute[] {
  if(role==='STUDENT') {
    const navigation=<nav aria-label="Navegación de materiales"><a href="/inicio">Inicio</a>{' · '}<a href="/mis-matriculas">Mis matrículas</a>{' · '}<a href="/materiales">Materiales</a></nav>;
    return [
      {path:'/materiales',access:'enrollment',element:<MaterialsStudentGroupsScreen key={accountId} api={api} navigation={navigation}/>},
      {path:'/materiales/grupos/:groupId',access:'enrollment',render:params=><MaterialsStudentScreen key={`${accountId}:${params.groupId}`} api={api} groupId={params.groupId} navigation={navigation}/>},
    ];
  }
  return [
    {path:'/materiales',access:'materials-manager',element:<MaterialsScreen key={accountId} api={api}/>},
    {path:'/materiales/grupos/:groupId',access:'materials-manager',render:params=><MaterialsScreen key={`${accountId}:${params.groupId}`} api={api} groupId={params.groupId}/>},
  ];
}
