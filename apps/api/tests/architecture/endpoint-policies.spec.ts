import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA,PATH_METADATA } from '@nestjs/common/constants.js';
import { expect,test } from 'vitest';
import { ACCESS_POLICY } from '../../src/modules/authorization/public/session.js';
import { MATERIALS_MANAGEMENT_POLICY, MATERIALS_READ_POLICY } from '../../src/modules/authorization/public/session.js';
import { CLASSES_MANAGEMENT_POLICY, CLASSES_PARTICIPATION_POLICY } from '../../src/modules/authorization/public/session.js';

const classesRoutes = ['POST /api/v1/classes/groups/:groupId/sessions', 'PATCH /api/v1/classes/sessions/:classId',
  'POST /api/v1/classes/sessions/:classId/start', 'POST /api/v1/classes/sessions/:classId/finish',
  'POST /api/v1/classes/sessions/:classId/cancel', 'GET /api/v1/classes/commands/:commandId',
  'GET /api/v1/classes/groups', 'GET /api/v1/classes/groups/:groupId', 'GET /api/v1/classes/groups/:groupId/sessions',
  'GET /api/v1/classes/sessions/:classId', 'GET /api/v1/classes/sessions/:classId/video'];
const classesPolicy = (route: string) => route.startsWith('GET ')
  ? CLASSES_PARTICIPATION_POLICY : CLASSES_MANAGEMENT_POLICY;

const materialsRoutes = ['GET /api/v1/materials/groups', 'GET /api/v1/materials/groups/:groupId',
  'GET /api/v1/materials/groups/:groupId/items', 'GET /api/v1/materials/items/:materialId',
  'GET /api/v1/materials/items/:materialId/content', 'HEAD /api/v1/materials/items/:materialId/content',
  'POST /api/v1/materials/groups/:groupId/uploads', 'GET /api/v1/materials/uploads/:uploadId',
  'PUT /api/v1/materials/uploads/:uploadId/content', 'POST /api/v1/materials/items/:materialId/publish',
  'PATCH /api/v1/materials/items/:materialId', 'POST /api/v1/materials/items/:materialId/withdraw'];
const materialsPolicy = (route: string) => /^(GET|HEAD) /.test(route) && !route.includes('/uploads/') ? MATERIALS_READ_POLICY : MATERIALS_MANAGEMENT_POLICY;

/** Contrato futuro, solo fixtures de la puerta de políticas. No son rutas existentes. */
const enrollmentRoutePolicies: Record<string,string> = {
  'GET /api/v1/admin/enrollment/courses/:courseId/price':'enrollment:price-manage',
  'PUT /api/v1/admin/enrollment/courses/:courseId/price':'enrollment:price-manage',
  'GET /api/v1/enrollment/offerings':'enrollment:reserve-own',
  'POST /api/v1/enrollment/selection-preview':'enrollment:reserve-own',
  'POST /api/v1/enrollment/reservation-requests':'enrollment:reserve-own',
  'GET /api/v1/enrollment/reservation-requests':'enrollment:read-own',
  'GET /api/v1/enrollment/reservation-requests/:intentionId':'enrollment:read-own',
  'GET /api/v1/enrollment/orders':'enrollment:read-own',
  'GET /api/v1/enrollment/orders/current':'enrollment:read-own',
  'GET /api/v1/enrollment/orders/:orderId':'enrollment:read-own',
  'POST /api/v1/enrollment/orders/:orderId/payment-attempts':'enrollment:pay-own',
  'GET /api/v1/enrollment/enrollments':'enrollment:read-own',
  'GET /api/v1/enrollment/enrollments/:enrollmentId':'enrollment:read-own',
  'GET /api/v1/admin/enrollment/orders':'enrollment:read-all',
  'GET /api/v1/admin/enrollment/orders/:orderId':'enrollment:read-all',
  'GET /api/v1/admin/enrollment/incidents':'enrollment:read-all',
  'GET /api/v1/admin/enrollment/incidents/:incidentId':'enrollment:read-all',
  'POST /api/v1/admin/enrollment/incidents/:incidentId/follow-ups':'enrollment:incident-follow-up',
};
const enrollmentPermissions = ['enrollment:price-manage','enrollment:reserve-own','enrollment:pay-own',
  'enrollment:read-own','enrollment:read-all','enrollment:incident-follow-up'];

function controllers(directory:string):string[] {
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?controllers(path.join(directory,entry.name))
    :entry.name.endsWith('.controller.js')?[path.join(directory,entry.name)]:[]);
}
/** Verifica cada ruta encontrada, además del inventario cerrado inferior.
 * Al añadir rutas se actualiza el inventario y se vuelve a ejecutar esta puerta.
 */
function validPolicy(route: string, policy: unknown): boolean {
  if (/^\/api\/v1\/classes(?:\/|$)/.test(route.slice(route.indexOf(' ') + 1))) {
    const expected = classesPolicy(route);
    return classesRoutes.includes(route) && Array.isArray(policy) && policy.length === expected.length
      && expected.every((value, index) => policy[index] === value);
  }
  if (/^\/api\/v1\/materials(?:\/|$)/.test(route.slice(route.indexOf(' ') + 1))) {
    const expected = materialsPolicy(route);
    return materialsRoutes.includes(route) && Array.isArray(policy) && policy.length === expected.length
      && expected.every((value, index) => policy[index] === value);
  }
  if (typeof policy !== 'string' || !['public','profile:read','users:manage','academic:manage','academic:read-published','academic:read-own',...enrollmentPermissions].includes(policy)) return false;
  const path = route.slice(route.indexOf(' ') + 1);
  if (/^\/api\/v1\/(?:admin\/)?enrollment(?:\/|$)/.test(path)) {
    return Object.hasOwn(enrollmentRoutePolicies,route) && enrollmentRoutePolicies[route] === policy;
  }
  if (/^\/api\/v1\/admin\/academic(?:\/|$)/.test(path)) return policy === 'academic:manage';
  if (/^\/api\/v1\/academic(?:\/|$)/.test(path)) return policy === 'academic:read-published';
  if (/^\/api\/v1\/teaching(?:\/|$)/.test(path)) return policy === 'academic:read-own';
  return true;
}
test('T088: todos los endpoints compilados tienen la política explícita de su contrato',async()=>{
  const routes:Record<string,unknown>={};
  for(const filename of controllers(fileURLToPath(new URL('../../dist/src/',import.meta.url)))) {
    const exports=await import(pathToFileURL(filename).href);
    for(const target of Object.values(exports)) {
      if(typeof target!=='function'||!Reflect.hasMetadata(PATH_METADATA,target))continue;
      for(const name of Object.getOwnPropertyNames(target.prototype).filter(value=>value!=='constructor')) {
        const handler=target.prototype[name];if(typeof handler!=='function')continue;
        const method=Reflect.getMetadata(METHOD_METADATA,handler) as RequestMethod|undefined;if(method===undefined)continue;
        const prefix=Reflect.getMetadata(PATH_METADATA,target) as string;
        const suffix=Reflect.getMetadata(PATH_METADATA,handler) as string;
        const route=(prefix+'/'+suffix).replace(/\/+/g,'/').replace(/\/$/,'');
        const key=RequestMethod[method]+' /'+route.replace(/^\//,'');
        expect(Object.hasOwn(routes,key)).toBe(false);
        const policy: unknown = Reflect.getMetadata(ACCESS_POLICY,handler)??Reflect.getMetadata(ACCESS_POLICY,target);
        expect(validPolicy(key,policy), `Política ausente/incorrecta: ${key}`).toBe(true);
        routes[key]=policy as string;
      }
    }
  }
  expect(routes).toEqual({
    ...Object.fromEntries(classesRoutes.map(route => [route, classesPolicy(route)])),
    ...Object.fromEntries(materialsRoutes.map(route => [route, materialsPolicy(route)])),
    'GET /health/live':'public','GET /health/ready':'public',
    'GET /api/v1/admin/enrollment/courses/:courseId/price':'enrollment:price-manage',
    'PUT /api/v1/admin/enrollment/courses/:courseId/price':'enrollment:price-manage',
    'GET /api/v1/enrollment/offerings':'enrollment:reserve-own',
    'POST /api/v1/enrollment/selection-preview':'enrollment:reserve-own',
    'POST /api/v1/enrollment/reservation-requests':'enrollment:reserve-own',
    'GET /api/v1/enrollment/reservation-requests':'enrollment:read-own',
    'GET /api/v1/enrollment/reservation-requests/:intentionId':'enrollment:read-own',
    'GET /api/v1/admin/enrollment/orders':'enrollment:read-all',
    'GET /api/v1/admin/enrollment/orders/:orderId':'enrollment:read-all',
    'GET /api/v1/admin/enrollment/incidents':'enrollment:read-all',
    'GET /api/v1/admin/enrollment/incidents/:incidentId':'enrollment:read-all',
    'POST /api/v1/admin/enrollment/incidents/:incidentId/follow-ups':'enrollment:incident-follow-up',
    'GET /api/v1/enrollment/orders':'enrollment:read-own',
    'GET /api/v1/enrollment/orders/current':'enrollment:read-own',
    'GET /api/v1/enrollment/orders/:orderId':'enrollment:read-own',
    'POST /api/v1/enrollment/orders/:orderId/payment-attempts':'enrollment:pay-own',
    'GET /api/v1/enrollment/enrollments':'enrollment:read-own',
    'GET /api/v1/enrollment/enrollments/:enrollmentId':'enrollment:read-own',
    'POST /api/v1/auth/login':'public','POST /api/v1/auth/logout':'public',
    'POST /api/v1/auth/register':'public','POST /api/v1/auth/verification/request':'public',
    'POST /api/v1/auth/verification/confirm':'public','POST /api/v1/auth/password/initial':'public',
    'POST /api/v1/auth/password/forgot':'public','POST /api/v1/auth/password/reset':'public',
    'GET /api/v1/me':'profile:read','GET /api/v1/admin/users':'users:manage',
    'GET /api/v1/admin/users/:id':'users:manage','POST /api/v1/admin/users':'users:manage',
    'PATCH /api/v1/admin/users/:id/name':'users:manage','PUT /api/v1/admin/users/:id/role':'users:manage',
    'PUT /api/v1/admin/users/:id/status':'users:manage',
    'GET /api/v1/admin/academic/courses':'academic:manage',
    'GET /api/v1/admin/academic/courses/:id':'academic:manage',
    'GET /api/v1/admin/academic/courses/:courseId/groups':'academic:manage',
    'GET /api/v1/admin/academic/groups/:id':'academic:manage',
    'GET /api/v1/admin/academic/teachers':'academic:manage',
    'POST /api/v1/admin/academic/courses':'academic:manage',
    'PATCH /api/v1/admin/academic/courses/:id':'academic:manage',
    'POST /api/v1/admin/academic/courses/:courseId/groups':'academic:manage',
    'PATCH /api/v1/admin/academic/groups/:id':'academic:manage',
    'PUT /api/v1/admin/academic/groups/:id/schedule':'academic:manage',
    'POST /api/v1/admin/academic/courses/:id/publish':'academic:manage',
    'POST /api/v1/admin/academic/groups/:id/publish':'academic:manage',
    'POST /api/v1/admin/academic/courses/:id/withdraw':'academic:manage',
    'POST /api/v1/admin/academic/groups/:id/withdraw':'academic:manage',
    'POST /api/v1/admin/academic/groups/:id/cancel':'academic:manage',
    'GET /api/v1/academic/courses':'academic:read-published',
    'GET /api/v1/academic/courses/:id':'academic:read-published',
    'GET /api/v1/academic/courses/:courseId/groups':'academic:read-published',
    'GET /api/v1/academic/courses/:courseId/groups/:id':'academic:read-published',
    'GET /api/v1/teaching/groups':'academic:read-own',
    'GET /api/v1/teaching/groups/:id':'academic:read-own',
  });
});

test.each(Object.entries(enrollmentRoutePolicies))('T011 política prevista %s exige %s sin declararla implementada', (route,required) => {
  expect(validPolicy(route,required)).toBe(true);
  for (const policy of [undefined,'public','profile:read','users:manage','academic:manage','academic:read-published','academic:read-own',
    'enrollment:system','enrollment:confirm-manually',...enrollmentPermissions].filter(p=>p!==required)) expect(validPolicy(route,policy)).toBe(false);
});
test('T011 familia financiera desconocida no hereda un permiso genérico', () => {
  for (const route of ['POST /api/v1/admin/enrollment/manual-enrollment','POST /api/v1/enrollment/confirm',
    'DELETE /api/v1/enrollment/orders/:orderId']) for (const permission of ['public','academic:manage',...enrollmentPermissions]) {
    expect(validPolicy(route,permission)).toBe(false);
  }
});

test('T016/T026/T042/T053 materials routes require their closed audience policy and reject unsupported actions', () => {
  for (const route of ['GET /api/v1/materials/groups', 'GET /api/v1/materials/items/:materialId/content',
    'PUT /api/v1/materials/uploads/:uploadId/content', 'DELETE /api/v1/materials/items/:materialId']) {
    for (const permission of ['public', 'profile:read', 'users:manage', 'academic:manage',
      'materials:manage-all', 'materials:manage-own', 'materials:read-enrolled']) expect(validPolicy(route, permission)).toBe(false);
  }
  for (const route of materialsRoutes) {
    expect(validPolicy(route, materialsPolicy(route))).toBe(true);
    expect(validPolicy(route, materialsPolicy(route) === MATERIALS_READ_POLICY ? MATERIALS_MANAGEMENT_POLICY : MATERIALS_READ_POLICY)).toBe(false);
    for (const policy of [undefined, [], ['profile:read'], ['materials:manage-all'],
      ['materials:manage-all', 'materials:read-enrolled'], new Array(2)]) expect(validPolicy(route, policy)).toBe(false);
  }
  for (const route of ['DELETE /api/v1/materials/items/:materialId', 'PUT /api/v1/materials/items/:materialId',
    'POST /api/v1/materials/items/:materialId/replace']) for (const policy of [MATERIALS_READ_POLICY, MATERIALS_MANAGEMENT_POLICY]) expect(validPolicy(route, policy)).toBe(false);
});

test('T023 classes management routes require their exact closed policy and future routes stay absent', () => {
  for (const route of classesRoutes) {
    expect(validPolicy(route, classesPolicy(route))).toBe(true);
    const opposite = classesPolicy(route) === CLASSES_MANAGEMENT_POLICY ? CLASSES_PARTICIPATION_POLICY : CLASSES_MANAGEMENT_POLICY;
    for (const policy of [undefined, 'public', 'profile:read', [], ['classes:manage-all'], opposite,
      ['classes:manage-all', 'classes:manage-own', 'profile:read'], new Array(2)]) expect(validPolicy(route, policy)).toBe(false);
  }
  for (const route of ['GET /api/v1/classes/sessions/:classId/messages', 'GET /api/v1/classes/sessions/:classId/video-reference',
    'POST /api/v1/classes/sessions/:classId/reopen', 'DELETE /api/v1/classes/sessions/:classId'])
    for (const policy of [CLASSES_MANAGEMENT_POLICY, CLASSES_PARTICIPATION_POLICY]) expect(validPolicy(route, policy)).toBe(false);
});

test.each([
  ['GET /api/v1/admin/academic/courses', 'academic:manage'],
  ['GET /api/v1/academic/courses/:courseId/groups/:id', 'academic:read-published'],
  ['GET /api/v1/teaching/groups/:id', 'academic:read-own'],
] as const)('T017 familias académicas: %s exige %s y nunca admite public/ausencia/otra audiencia', (route, required) => {
  expect(validPolicy(route, required)).toBe(true);
  for (const policy of [undefined, 'public', 'profile:read', 'users:manage', 'academic:manage','academic:read-published','academic:read-own'].filter(value => value !== required)) {
    expect(validPolicy(route, policy)).toBe(false);
  }
});
