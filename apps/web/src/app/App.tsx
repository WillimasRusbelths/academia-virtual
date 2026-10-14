import { useState } from 'react';
import { AppRouter,navigate } from './router';
import { createApiClient } from './http';
import { SessionProvider, useSession } from './session';
import { LoginPage } from '../features/auth/login-page';
import { HomePage } from '../features/profile/home-page';
import { RegisterPage } from '../features/auth/register-page';
import { VerifyEmailPage } from '../features/auth/verify-email-page';
import { InitialPasswordPage } from '../features/auth/initial-password-page';
export function App() {
  return <SessionProvider><SessionRoutes/></SessionProvider>;
}
function SessionRoutes() {
  const session=useSession();
  const [publicApi]=useState(()=>createApiClient(()=>navigate('/login',true)));
  return <AppRouter routes={[
    {path:'/',element:<main><h1>Academia virtual</h1><p><a href="/login">Iniciar sesión</a></p></main>},
    {path:'/login',element:<LoginPage onLogin={session.login} notice={session.notice}/>},
    {path:'/registro',element:<RegisterPage api={publicApi}/>},
    {path:'/verificar-correo',element:<VerifyEmailPage api={publicApi}/>},
    {path:'/establecer-contrasena',element:<InitialPasswordPage api={publicApi}/>},
    {path:'/inicio',element:<HomePage user={session.user} loading={session.loading} error={session.error}
      onLogout={session.logout} onRefresh={session.refresh}/>},
  ]}/>;
}
