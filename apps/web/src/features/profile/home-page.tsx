import type { UserView } from '../../shared/user-view';
import type { ApiFailure } from '../../shared/api-client';
import { Feedback } from '../../shared/ui/feedback';

const labels={STUDENT:'Alumno',TEACHER:'Docente',ADMIN:'Administrador'};
export function HomePage({user,loading,error,onLogout,onRefresh}:{readonly user:UserView|null;readonly loading:boolean;
  readonly error?:ApiFailure;readonly onLogout:()=>Promise<void>;readonly onRefresh:()=>Promise<void>}) {
  return <main style={{maxWidth:'40rem',margin:'2rem auto',padding:'0 1rem',overflowWrap:'anywhere'}}>
    <h1>Inicio</h1>
    {loading&&<p role="status">Consultando sesión…</p>}
    {user&&<><p>{user.name}</p><p>{labels[user.role]}</p>
      <nav aria-label="Navegación de inicio">
        <p><a href="/perfil">Mi perfil</a></p>
        {user.role==='STUDENT'&&<><p><a href="/reservar">Reservar cursos</a></p><p><a href="/mis-ordenes">Mis órdenes</a></p><p><a href="/mis-matriculas">Mis matrículas</a></p></>}
        {user.role==='TEACHER'&&<p><a href="/mis-grupos">Mis grupos</a></p>}
        {user.role!=='TEACHER'&&<p><a href="/oferta">Consultar oferta</a></p>}
        {user.role==='ADMIN'&&<p><a href="/admin/cuentas">Gestionar cuentas</a></p>}
        {user.role==='ADMIN'&&<p><a href="/admin/oferta">Gestionar oferta</a></p>}
      </nav>
      <button type="button" disabled={loading} onClick={()=>void onLogout()}>Cerrar sesión</button>
    </>}
    <Feedback error={error} onRetry={()=>void(user?onLogout():onRefresh())}/>
  </main>;
}
