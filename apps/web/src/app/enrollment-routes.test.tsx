import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { enrollmentRoutes,enrollmentAdminRoutes } from './enrollment-routes';
import { isProtectedPath, matchRoute, permitsRoute } from './router';
import { HomePage } from '../features/profile/home-page';
import { CatalogPage } from '../features/academic-offering/catalog-page';
import { CoursePage } from '../features/academic-offering/course-page';
import { GroupPage } from '../features/academic-offering/group-page';
import { createApiClient, enrollmentApi,enrollmentAdminApi } from './http';
const id='00000000-0000-4000-8000-000000000001';
const client=createApiClient(()=>undefined);
test.each(['/admin/precios','/admin/compromisos',`/admin/incidencias/${id}`])('EN04 administración directa protegida %s',path=>{
  expect(isProtectedPath(path)).toBe(true);const route=enrollmentAdminRoutes(enrollmentAdminApi(client),{courses:async()=>({items:[],total:0,page:1,pageSize:20})}).find(r=>matchRoute(r.path,path)!==null);expect(route?.access).toBe('admin');
  expect(permitsRoute('ADMIN',route!.access!)).toBe(true);expect(permitsRoute('STUDENT',route!.access!)).toBe(false);expect(permitsRoute('TEACHER',route!.access!)).toBe(false);
  const element=route?.render?route.render(matchRoute(route.path,path)!):route?.element;expect(renderToStaticMarkup(<>{element}</>)).toContain('<main');
});
test.each(['ADMIN','STUDENT','TEACHER'] as const)('EN05 enlaces administrativos solo para ADMIN %s',role=>{
  const html=renderToStaticMarkup(<HomePage user={{id,role,name:'Ensayo',email:'ficticio@example.test',status:'ACTIVE',emailVerified:true,mustSetPassword:false,createdAt:'2026-11-04T00:00:00.000Z'}} loading={false} onLogout={async()=>undefined} onRefresh={async()=>undefined}/>);
  expect(html.includes('href="/admin/precios"')).toBe(role==='ADMIN');expect(html.includes('href="/admin/compromisos"')).toBe(role==='ADMIN');
});
test.each(['/reservar','/mis-ordenes',`/mis-ordenes/${id}`,'/mis-matriculas',`/mis-matriculas/${id}`])('EN01 acceso directo protegido %s',path=>{
  expect(isProtectedPath(path)).toBe(true);
  const route=enrollmentRoutes(enrollmentApi(client)).find(r=>matchRoute(r.path,path)!==null);
  expect(route?.access).toBe('enrollment');
  const element=route?.render?route.render(matchRoute(route.path,path)!):route?.element;
  expect(renderToStaticMarkup(<>{element}</>)).toContain('<main');
});
test.each(['STUDENT','ADMIN','TEACHER'] as const)('EN02 acceso y navegación financiera %s',role=>{
  expect(permitsRoute(role,'enrollment')).toBe(role==='STUDENT');
  expect(permitsRoute(role,'student')).toBe(role!=='TEACHER');
  const output=renderToStaticMarkup(<HomePage user={{id,role,name:'Ensayo',email:'ficticio@example.test',status:'ACTIVE',emailVerified:true,mustSetPassword:false,createdAt:'2026-11-04T00:00:00.000Z'}} loading={false} onLogout={async()=>undefined} onRefresh={async()=>undefined}/>);
  expect(output.includes('href="/reservar"')).toBe(role==='STUDENT');
  expect(output.includes('href="/mis-ordenes"')).toBe(role==='STUDENT');
  expect(output.includes('href="/mis-matriculas"')).toBe(role==='STUDENT');
});
test('EN03 oferta recibe enlace de composición; conserva disponibilidad no calculada',()=>{
  for(const reservationHref of [undefined,'/reservar']){
    for(const element of [<CatalogPage api={client} reservationHref={reservationHref}/>,<CoursePage api={client} id={id} reservationHref={reservationHref}/>,<GroupPage api={client} courseId={id} id={id} reservationHref={reservationHref}/>]){
      const html=renderToStaticMarkup(element);
      expect(html.includes('href="/reservar"')).toBe(Boolean(reservationHref));
    }
  }
  expect(renderToStaticMarkup(<CatalogPage api={client}/>)).toContain('Ocupación y disponibilidad no calculadas');
});
