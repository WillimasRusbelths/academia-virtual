import { AppRouter } from './router';
import { SessionProvider, useSession } from './session';
import { LoginPage } from '../features/auth/login-page';
import { HomePage } from '../features/profile/home-page';
export function App() {
  return <SessionProvider><SessionRoutes/></SessionProvider>;
}
function SessionRoutes() {
  const session=useSession();
  return <AppRouter routes={[
    {path:'/',element:<main><h1>Academia virtual</h1><p><a href="/login">Iniciar sesión</a></p></main>},
    {path:'/login',element:<LoginPage onLogin={session.login} notice={session.notice}/>},
    {path:'/inicio',element:<HomePage user={session.user} loading={session.loading} error={session.error}
      onLogout={session.logout} onRefresh={session.refresh}/>},
  ]}/>;
}
