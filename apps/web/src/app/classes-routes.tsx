import type { AppRoute } from './router';
import type { ClassesApi } from '../features/classes/api';
import { ClassesManagementPage } from '../features/classes/management-page';

export const classesGroupHref=(groupId:string)=>'/clases/grupos/'+groupId;
/** App supplies the session generation; suspended session operations unmount
 * the editor and abort its scope before any refreshed authority is accepted. */
export function classesRoutes(api:ClassesApi,identity='session',active=true):readonly AppRoute[] {
  const waiting=<main><h1>Clases</h1><p role="status">Consultando sesión…</p></main>;
  return [
    {path:'/clases',access:'classes-manager',element:active?<ClassesManagementPage key={identity} api={api}/>:waiting},
    {path:'/clases/grupos/:groupId',access:'classes-manager',render:p=>active?<ClassesManagementPage key={`${identity}:${p.groupId}`} api={api} groupId={p.groupId}/>:waiting},
    {path:'/clases/sesiones/:classId',access:'classes-manager',render:p=>active?<ClassesManagementPage key={`${identity}:${p.classId}`} api={api} classId={p.classId}/>:waiting},
  ];
}
