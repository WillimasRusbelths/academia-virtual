import { useState } from 'react';
import { AppRouter,navigate } from './router';
import { createApiClient } from './http';
import { SessionProvider, useSession } from './session';
import { ProtectedRoute } from './protected-route';
import { LoginPage } from '../features/auth/login-page';
import { HomePage } from '../features/profile/home-page';
import { ProfilePage } from '../features/profile/profile-page';
import { RegisterPage } from '../features/auth/register-page';
import { VerifyEmailPage } from '../features/auth/verify-email-page';
import { InitialPasswordPage } from '../features/auth/initial-password-page';
import { ForgotPasswordPage } from '../features/auth/forgot-password-page';
import { ResetPasswordPage } from '../features/auth/reset-password-page';
import { AccountsPage } from '../features/admin-users/accounts-page';
import { AccountDetailPage } from '../features/admin-users/account-detail-page';
import { AdminCoursesPage } from '../features/academic-offering/admin-courses-page';
import { AdminCoursePage } from '../features/academic-offering/admin-course-page';
import { AdminGroupPage } from '../features/academic-offering/admin-group-page';
import { CatalogPage } from '../features/academic-offering/catalog-page';
import { CoursePage } from '../features/academic-offering/course-page';
import { GroupPage } from '../features/academic-offering/group-page';
export function App() {
  return <SessionProvider><SessionRoutes/></SessionProvider>;
}
function SessionRoutes() {
  const session=useSession();
  const [publicApi]=useState(()=>createApiClient(()=>navigate('/login',true)));
  return <AppRouter protect={(element,access)=><ProtectedRoute access={access}>{element}</ProtectedRoute>} routes={[
    {path:'/',element:<main><h1>Academia virtual</h1><p><a href="/login">Iniciar sesión</a></p></main>},
    {path:'/login',element:<LoginPage onLogin={session.login} notice={session.notice}/>},
    {path:'/registro',element:<RegisterPage api={publicApi}/>},
    {path:'/verificar-correo',element:<VerifyEmailPage api={publicApi}/>},
    {path:'/establecer-contrasena',element:<InitialPasswordPage api={publicApi}/>},
    {path:'/recuperar',element:<ForgotPasswordPage api={publicApi}/>},
    {path:'/restablecer',element:<ResetPasswordPage api={publicApi}/>},
    {path:'/inicio',access:'authenticated',element:<HomePage user={session.user} loading={session.loading} error={session.error}
      onLogout={session.logout} onRefresh={session.refresh}/>},
    {path:'/perfil',access:'authenticated',element:<ProfilePage user={session.user} loading={session.loading} error={session.error}
      onLogout={session.logout} onRefresh={session.refresh}/>},
    {path:'/admin/cuentas',access:'admin',element:<AccountsPage api={session.api}/>},
    {path:'/admin/cuentas/:id',access:'admin',render:params=><AccountDetailPage api={session.api} id={params.id}/>},
    {path:'/admin/oferta',access:'admin',element:<AdminCoursesPage api={session.api} navigate={navigate}/>},
    {path:'/admin/oferta/cursos/:id',access:'admin',render:params=><AdminCoursePage api={session.api} id={params.id} navigate={navigate}/>},
    {path:'/admin/oferta/grupos/:id',access:'admin',render:params=><AdminGroupPage api={session.api} id={params.id} navigate={navigate}/>},
    {path:'/oferta',access:'student',element:<CatalogPage api={session.api}/>},
    {path:'/oferta/cursos/:id',access:'student',render:params=><CoursePage api={session.api} id={params.id}/>},
    {path:'/oferta/cursos/:courseId/grupos/:id',access:'student',render:params=><GroupPage api={session.api} courseId={params.courseId} id={params.id}/>},
  ]}/>;
}
