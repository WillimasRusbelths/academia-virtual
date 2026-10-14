import { Fragment,useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export interface AppRoute { readonly path:string; readonly element:ReactNode }
let fragmentRevision=0;
function subscribeFragment(listener:()=>void) {
  // Un nuevo enlace puede abrirse sobre la misma pantalla, sin recargar el documento.
  // La revisión no conserva el fragmento; una nueva instancia lo captura y retira.
  const changed=()=>{fragmentRevision++;listener();};
  window.addEventListener('hashchange',changed);
  return ()=>window.removeEventListener('hashchange',changed);
}
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
  const revision=useSyncExternalStore(subscribeFragment,()=>fragmentRevision,()=>0);
  return <Fragment key={`${location}:${revision}`}>{routes.find(route => route.path===location)?.element??<main><h1>Página no disponible</h1><p>Revisa la dirección o vuelve al inicio.</p></main>}</Fragment>;
}
export function useLocation():string {return useSyncExternalStore(subscribe,() => window.location.pathname,() => '/');}
