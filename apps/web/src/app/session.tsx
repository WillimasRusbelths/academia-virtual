import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createApiClient } from './http';
import { isProtectedPath, navigate, useLocation } from './router';
import { ApiFailure, RequestCancelled } from '../shared/api-client';
import { readUserView } from '../shared/user-view';
import type { UserView } from '../shared/user-view';
import type { ApiClient } from '../shared/api-client';

interface Session {
  api:ApiClient;
  user:UserView|null;loading:boolean;error:ApiFailure|undefined;notice:string|undefined;
  login(email:string,password:string):Promise<void>;logout():Promise<void>;refresh():Promise<void>;
}
const SessionContext=createContext<Session|null>(null);
function safeFailure(error:unknown):ApiFailure {
  return error instanceof ApiFailure?error:new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Servicio temporalmente no disponible. Puedes reintentar manualmente.');
}
export function SessionProvider({children}:{readonly children:ReactNode}) {
  const [user,setUser]=useState<UserView|null>(null);const current=useRef<UserView|null>(null);
  const [loading,setLoading]=useState(()=>typeof window!=='undefined'&&isProtectedPath(window.location.pathname));
  const [error,setError]=useState<ApiFailure>();const [notice,setNotice]=useState<string>();
  const generation=useRef(0);const path=useLocation();
  const [api]=useState(()=>createApiClient(()=>{
    generation.current++;current.current=null;setUser(null);setLoading(false);setError(undefined);
    setNotice('Debes volver a iniciar sesión.');navigate('/login',true);
  }));
  async function refresh() {
    const started=++generation.current;setLoading(true);setError(undefined);
    try {const view=readUserView(await api.request('/me'));
      if(started===generation.current){current.current=view;setUser(view);setLoading(false);}}
    catch(failure){if(started===generation.current){current.current=null;setUser(null);setLoading(false);
      if(!(failure instanceof RequestCancelled))setError(safeFailure(failure));}}
  }
  async function login(email:string,password:string) {
    const started=++generation.current;setError(undefined);setNotice(undefined);
    readUserView(await api.request('/auth/login',{method:'POST',body:{email,password}}));
    const view=readUserView(await api.request('/me'));
    if(started!==generation.current)throw new RequestCancelled();
    current.current=view;setUser(view);setLoading(false);navigate('/inicio');
  }
  async function logout() {
    const started=++generation.current;setLoading(true);setError(undefined);
    try {await api.request('/auth/logout',{method:'POST'});
      if(started===generation.current){current.current=null;setUser(null);setLoading(false);setNotice(undefined);navigate('/login',true);}}
    catch(failure){if(started===generation.current){setLoading(false);setError(safeFailure(failure));}}
  }
  const refreshRef=useRef(refresh);refreshRef.current=refresh;
  useEffect(()=>{
    if(isProtectedPath(path)&&current.current===null)void refreshRef.current();
    // La hidratación se inicia por navegación, no por cambios de error ni reintentos automáticos.
  },[path]);
  return <SessionContext.Provider value={{api,user,loading,error,notice,login,logout,refresh}}>{children}</SessionContext.Provider>;
}
export function useSession():Session {
  const session=useContext(SessionContext);if(!session)throw new Error('Sesión de aplicación no disponible.');return session;
}
