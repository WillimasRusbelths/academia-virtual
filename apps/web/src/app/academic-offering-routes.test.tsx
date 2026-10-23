import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { isProtectedPath, matchRoute, permitsRoute } from './router';
import { HomePage } from '../features/profile/home-page';
const id = '00000000-0000-4000-8000-000000000001';
test.each(['/admin/oferta', `/admin/oferta/cursos/${id}`, `/admin/oferta/grupos/${id}`,
  '/oferta', `/oferta/cursos/${id}`, `/oferta/cursos/${id}/grupos/${id}`])('hidrata sesión en acceso directo %s', path => {
  expect(isProtectedPath(path)).toBe(true);
});
test.each(['STUDENT', 'TEACHER', 'ADMIN'] as const)('políticas de audiencia %s', role => {
  expect(permitsRoute(role, 'admin')).toBe(role === 'ADMIN');
  expect(permitsRoute(role, 'student')).toBe(role === 'ADMIN' || role === 'STUDENT');
  expect(permitsRoute(role, 'teacher')).toBe(role === 'TEACHER');
  expect(permitsRoute(role, 'authenticated')).toBe(true);
});
test('rutas no aceptan subrutas ni referencias externas', () => {
  expect(matchRoute('/admin/oferta/grupos/:id', `/admin/oferta/grupos/${id}`)).toEqual({ id });
  expect(matchRoute('/admin/oferta/grupos/:id', `/admin/oferta/grupos/${id}/publish`)).toBeNull();
  expect(matchRoute('/admin/oferta/grupos/:id', '/admin/oferta/grupos/https:%2F%2Fexterno')).toBeNull();
});
test.each(['STUDENT','TEACHER','ADMIN'] as const)('inicio conserva perfil/cierre y enlace administrativo solo para %s', role => {
  const output = renderToStaticMarkup(<HomePage user={{ id, role, name: 'Ensayo', email: 'ficticio@example.test', status: 'ACTIVE',
    emailVerified: true, mustSetPassword: false, createdAt: '2026-10-21T00:00:00.000Z' }} loading={false}
    onLogout={async () => undefined} onRefresh={async () => undefined}/>);
  expect(output).toContain('Mi perfil'); expect(output).toContain('Cerrar sesión');
  expect(output.includes('Gestionar oferta')).toBe(role === 'ADMIN'); expect(output.includes('Gestionar cuentas')).toBe(role === 'ADMIN');
  expect(output.includes('Consultar oferta')).toBe(role !== 'TEACHER');
});
