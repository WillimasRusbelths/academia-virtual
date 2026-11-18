import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { classesRoutes,classesGroupHref } from './classes-routes';
import { isProtectedPath,matchRoute,permitsRoute } from './router';
import { createClassesApi } from '../features/classes/api';
import { HomePage } from '../features/profile/home-page';
import type { UserView } from '../shared/user-view';
const id='11111111-1111-4111-8111-111111111111',api=createClassesApi({request:vi.fn()});
test.each(['ADMIN','TEACHER','STUDENT'] as const)('management navigation is closed for %s',role=>{
  expect(permitsRoute(role,'classes-manager')).toBe(role!=='STUDENT');
  const user:UserView={id,name:'Prueba',email:'synthetic@example.invalid',role,status:'ACTIVE',emailVerified:true,mustSetPassword:false,createdAt:'2026-11-18T12:00:00.000Z'};
  const html=renderToStaticMarkup(<HomePage user={user} loading={false} onLogout={async()=>{}} onRefresh={async()=>{}}/>);
  expect(html.includes('href="/clases"')).toBe(role!=='STUDENT');
});
test('all three management routes hydrate direct access with role policy',()=>{
  const routes=classesRoutes(api,'account:1');
  expect(routes.map(r=>[r.path,r.access])).toEqual([['/clases','classes-manager'],['/clases/grupos/:groupId','classes-manager'],['/clases/sesiones/:classId','classes-manager']]);
  for(const path of ['/clases',classesGroupHref(id),'/clases/sesiones/'+id])expect(isProtectedPath(path)).toBe(true);
  expect(matchRoute(routes[1].path,classesGroupHref(id))).toEqual({groupId:id});
  const html=renderToStaticMarkup(routes[1].render!({groupId:id}));expect(html).toContain('Consultando clases');expect(html).not.toContain('Preparar clase');
});
test('account and session generation changes remount the scope, including the same account',()=>{
  const one=classesRoutes(api,'account:1')[1].render!({groupId:id});
  for(const identity of ['account:2','other:1']) {
    const next=classesRoutes(api,identity)[1].render!({groupId:id});
    expect(isValidElement(one)&&isValidElement(next)&&one.key!==next.key).toBe(true);
  }
});
test('session refresh or logout unmounts management rather than mounting another active editor',()=>{
  const routes=classesRoutes(api,'account:2',false);
  for(const route of routes) {
    const html=renderToStaticMarkup(route.render?route.render({groupId:id,classId:id}):route.element);
    expect(html).toContain('Consultando sesión');expect(html).not.toContain('Consultando clases');expect(html).not.toContain('Preparar clase');
  }
});
