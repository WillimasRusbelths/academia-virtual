import type { UserView } from '../../shared/user-view';
import type { ApiFailure } from '../../shared/api-client';
import { Feedback } from '../../shared/ui/feedback';

const roles={STUDENT:'Alumno',TEACHER:'Docente',ADMIN:'Administrador'};
const statuses={ACTIVE:'Cuenta activa',DISABLED:'Cuenta desactivada'};
export function ProfilePage({user,loading,error,onLogout,onRefresh}:{readonly user:UserView|null;readonly loading:boolean;
  readonly error?:ApiFailure;readonly onLogout:()=>Promise<void>;readonly onRefresh:()=>Promise<void>}) {
  return <main className="profile-page">
    <h1>Mi perfil</h1>
    <nav aria-label="Navegación del perfil"><a href="/inicio">Inicio</a></nav>
    {loading&&<p role="status">Consultando sesión…</p>}
    {user&&<>
      <dl className="profile-facts">
        <dt>Nombre</dt><dd>{user.name}</dd>
        <dt>Correo</dt><dd>{user.email}</dd>
        <dt>Rol</dt><dd>{roles[user.role]}</dd>
        <dt>Estado</dt><dd>{statuses[user.status]}</dd>
      </dl>
      <button type="button" disabled={loading} onClick={()=>void onLogout()}>Cerrar sesión</button>
    </>}
    <Feedback error={error} onRetry={()=>void(user?onLogout():onRefresh())}/>
  </main>;
}
