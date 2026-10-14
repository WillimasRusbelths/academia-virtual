import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export interface AppRoute { readonly path:string; readonly element:ReactNode }
function subscribe(listener:()=>void) {
  window.addEventListener('popstate',listener);window.addEventListener('av:navigation',listener);
  return () => { window.removeEventListener('popstate',listener);window.removeEventListener('av:navigation',listener); };
}
/** Navegación local sin retorno a URLs recibidas ni historial con datos de formularios. */
export function navigate(path:string,replace = false):void {
  if (!/^\/[A-Za-z0-9/_-]*$/.test(path) || path.includes('//')) throw new Error('Destino de navegación inválido.');
  if (replace) window.history.replaceState(null,'',path);else window.history.pushState(null,'',path);
  window.dispatchEvent(new Event('av:navigation'));
}
export function AppRouter({routes}: {readonly routes:readonly AppRoute[]}) {
  const location = useLocation();
  return routes.find(route => route.path===location)?.element??<main><h1>Página no disponible</h1><p>Revisa la dirección o vuelve al inicio.</p></main>;
}
export function useLocation():string {return useSyncExternalStore(subscribe,() => window.location.pathname,() => '/');}
