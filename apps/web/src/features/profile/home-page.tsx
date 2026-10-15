import type { UserView } from '../../shared/user-view';
import type { ApiFailure } from '../../shared/api-client';
import { Feedback } from '../../shared/ui/feedback';

const labels={STUDENT:'Alumno',TEACHER:'Docente',ADMIN:'Administrador'};
export function HomePage({user,loading,error,onLogout,onRefresh}:{readonly user:UserView|null;readonly loading:boolean;
  readonly error?:ApiFailure;readonly onLogout:()=>Promise<void>;readonly onRefresh:()=>Promise<void>}) {
  return <main style={{maxWidth:'40rem',margin:'2rem auto',padding:'0 1rem',overflowWrap:'anywhere'}}>
    <h1>Inicio</h1>
    {loading&&<p role="status">Consultando sesión…</p>}
    {user&&<><p>{user.name}</p><p>{labels[user.role]}</p><button type="button" disabled={loading} onClick={()=>void onLogout()}>Cerrar sesión</button></>}
    {user?.role==='ADMIN'&&<p><a href="/admin/cuentas">Gestionar cuentas</a></p>}
    <Feedback error={error} onRetry={()=>void(user?onLogout():onRefresh())}/>
  </main>;
}
