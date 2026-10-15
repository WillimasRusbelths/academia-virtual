import type { ReactNode } from 'react';
import type { RouteAccess } from './router';
import { useSession } from './session';
import { Feedback } from '../shared/ui/feedback';

/** Resguardo visual: la API revalida sesión, estado y permisos en cada operación. */
export function ProtectedRoute({children,access}:{readonly children:ReactNode;readonly access:RouteAccess}) {
  const {user,error,refresh}=useSession();
  if(!user)return <main><h1>Acceso</h1>{error
    ?<Feedback error={error} onRetry={()=>void refresh()}/>
    :<p role="status">Consultando sesión…</p>}</main>;
  if(access==='admin'&&user.role!=='ADMIN')return <main><h1>Acceso no permitido</h1>
    <p role="alert">No tienes permiso para esta acción.</p><a href="/inicio">Volver al inicio</a></main>;
  return children;
}
