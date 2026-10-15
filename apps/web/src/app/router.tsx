import { Fragment,useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export type RouteAccess='authenticated'|'admin';
export interface AppRoute { readonly path:string; readonly access?:RouteAccess;readonly element?:ReactNode;readonly render?:(params:Readonly<Record<string,string>>)=>ReactNode }
export function isProtectedPath(path:string):boolean {
  return path==='/inicio'||path==='/admin/cuentas'||matchRoute('/admin/cuentas/:id',path)!==null;
}
export function matchRoute(pattern:string,path:string):Readonly<Record<string,string>>|null {
  const parts=pattern.split('/');const actual=path.split('/');const parameters:Record<string,string>={};
  if(parts.length!==actual.length)return null;
  for(let index=0;index<parts.length;index++) {
    if(parts[index].startsWith(':')) {if(!/^[A-Za-z0-9_-]+$/.test(actual[index]))return null;parameters[parts[index].slice(1)]=actual[index];}
    else if(parts[index]!==actual[index])return null;
  }
  return parameters;
}
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
export function AppRouter({routes,protect}: {readonly routes:readonly AppRoute[];readonly protect:(element:ReactNode,access:RouteAccess)=>ReactNode}) {
  const location = useLocation();
  const revision=useSyncExternalStore(subscribeFragment,()=>fragmentRevision,()=>0);
  const route=routes.find(candidate=>matchRoute(candidate.path,location)!==null);
  const element=route?.render?route.render(matchRoute(route.path,location)!):route?.element;
  return <Fragment key={`${location}:${revision}`}>{route?.access?protect(element,route.access):element??<main><h1>Página no disponible</h1><p>Revisa la dirección o vuelve al inicio.</p></main>}</Fragment>;
}
export function useLocation():string {return useSyncExternalStore(subscribe,() => window.location.pathname,() => '/');}
