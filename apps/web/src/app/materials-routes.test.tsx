import { expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { materialsRoutes, materialsGroupHref } from './materials-routes';
import { createMaterialsApi } from '../features/materials/api';
import { isProtectedPath, matchRoute, permitsRoute } from './router';
const id='11111111-1111-4111-8111-111111111111';
test.each(['ADMIN','TEACHER','STUDENT'] as const)('materials manager audience %s is closed',role=>{
  expect(permitsRoute(role,'materials-manager')).toBe(role!=='STUDENT');
});
test('both materials routes hydrate direct access and bind the current account identity',()=>{
  const routes=materialsRoutes(createMaterialsApi({request:vi.fn()}),'account');
  expect(routes.map(route=>[route.path,route.access])).toEqual([['/materiales','materials-manager'],['/materiales/grupos/:groupId','materials-manager']]);
  expect(isProtectedPath('/materiales')).toBe(true);expect(isProtectedPath(materialsGroupHref(id))).toBe(true);
  expect(matchRoute(routes[1].path,materialsGroupHref(id))).toEqual({groupId:id});
  const view=renderToStaticMarkup(routes[1].render!({groupId:id}));expect(view).toContain('Consultando materiales');expect(view).not.toContain('Preparar material');
  expect(matchRoute(routes[1].path,materialsGroupHref(id)+'/other')).toBeNull();
});
