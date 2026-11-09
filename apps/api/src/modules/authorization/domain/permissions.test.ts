import { expect, test } from 'vitest';
import { permits, type Permission } from './permissions.js';
import type { Role } from '../../users/public/account.js';
import { SessionLookup } from '../application/session-lookup.js';
import type { SessionActor, SessionRepository } from '../public/session.js';
import { EnrollmentAccess } from '../../enrollment/application/access.js';
import { AuthorizationFailure, SessionStoreUnavailable } from '../public/session.js';
import type { EnrollmentPermission, OwnEnrollmentPermission } from '../../enrollment/application/ports.js';

const academicMatrix = [
  ['ADMIN', 'academic:manage', true], ['ADMIN', 'academic:read-published', true], ['ADMIN', 'academic:read-own', false],
  ['STUDENT', 'academic:manage', false], ['STUDENT', 'academic:read-published', true], ['STUDENT', 'academic:read-own', false],
  ['TEACHER', 'academic:manage', false], ['TEACHER', 'academic:read-published', false], ['TEACHER', 'academic:read-own', true],
] as const;

test.each(academicMatrix)('matriz académica %s / %s = %s', (role, permission, allowed) => {
  expect(permits(role, permission)).toBe(allowed);
});

test.each(academicMatrix)('autorización backend por interfaz de sesión %s / %s = %s', async (role, permission, allowed) => {
  const actor: SessionActor = { userId: 'cuenta-ficticia', sessionId: 'sesión-ficticia', role, authVersion: 0n };
  const repository: SessionRepository = { lookup: async () => actor, accept: async () => true, revoke: async () => {} };
  const result = new SessionLookup(repository).authorize('credencial-ficticia', permission);
  if (allowed) expect(await result).toBe(actor);
  else await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'Acceso no permitido.' });
});

test.each(['academic:manage', 'academic:read-published', 'academic:read-own'] as const)(
  'visitante sin sesión recibe AUTH_REQUIRED en %s, sin consultar repositorio', async permission => {
    let lookups = 0;
    const repository: SessionRepository = { lookup: async () => { lookups++; return null; },
      accept: async () => false, revoke: async () => {} };
    await expect(new SessionLookup(repository).authorize(null, permission)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(lookups).toBe(0);
  });

test('roles desconocidos/visitante y permisos desconocidos siempre se deniegan', () => {
  for (const role of ['UNKNOWN', 'VISITOR', '', undefined, null]) {
    for (const permission of ['profile:read', 'users:manage', 'academic:manage', 'academic:read-published', 'academic:read-own'] as const) {
      expect(permits(role as Role, permission)).toBe(false);
    }
  }
  for (const role of ['ADMIN', 'TEACHER', 'STUDENT'] as const) expect(permits(role, 'academic:unknown' as Permission)).toBe(false);
});

test('matriz de identidad: perfil propio para tres roles; administración solo ADMIN', () => {
  for (const role of ['STUDENT', 'TEACHER', 'ADMIN'] as const) {
    expect(permits(role, 'profile:read')).toBe(true);
    expect(permits(role, 'users:manage')).toBe(role === 'ADMIN');
  }
});
test('operaciones y roles ajenos a la matriz se deniegan', () => {
  expect(permits('ADMIN', 'unknown' as Permission)).toBe(false);
  expect(permits('UNKNOWN' as Role, 'profile:read')).toBe(false);
});

const enrollmentPermissions = ['enrollment:price-manage', 'enrollment:reserve-own', 'enrollment:pay-own',
  'enrollment:read-own', 'enrollment:read-all', 'enrollment:incident-follow-up'] as const;
const ownPermissions = ['enrollment:reserve-own', 'enrollment:pay-own', 'enrollment:read-own'] as const;
const enrollmentMatrix = (['ADMIN', 'STUDENT', 'TEACHER'] as const).flatMap(role => enrollmentPermissions.map(permission => ({
  role, permission, allowed: permission.endsWith('-own') ? role === 'STUDENT' : role === 'ADMIN',
})));
const studentId = 'aaaaaaaa-0000-4000-8000-000000000001';
const otherStudentId = 'bbbbbbbb-0000-4000-8000-000000000002';
const sessionActor = (role: Role = 'STUDENT'): SessionActor => ({ userId: studentId,
  sessionId: 'cccccccc-0000-4000-8000-000000000003', role, authVersion: 0n });

test.each(enrollmentMatrix)('T011 matriz enrollment $role / $permission = $allowed', ({role, permission, allowed}) => {
  expect(permits(role, permission as Permission)).toBe(allowed);
});
test.each(enrollmentMatrix)('T011 sesión backend enrollment $role / $permission = $allowed', async ({role, permission, allowed}) => {
  const actor = sessionActor(role);
  const sessions: SessionRepository = { lookup: async () => actor, accept: async () => true, revoke: async () => {} };
  const result = new SessionLookup(sessions).authorize('credencial-ficticia', permission as Permission);
  if (allowed) expect(await result).toBe(actor);
  else await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
test.each(enrollmentPermissions)('T011 visitante sin sesión en %s', async permission => {
  let calls = 0;
  const sessions: SessionRepository = { lookup: async () => { calls++; return null; }, accept: async () => false, revoke: async () => {} };
  await expect(new SessionLookup(sessions).authorize(null, permission as Permission)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  const access = new EnrollmentAccess({ revalidate: async () => { calls++; } });
  await expect(access.authorize(null, permission)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(calls).toBe(0);
});
test.each(enrollmentMatrix)('T011 capacidad enrollment $role / $permission reautoriza solo si procede', async ({role, permission, allowed}) => {
  const calls: unknown[] = [], actor = sessionActor(role);
  const access = new EnrollmentAccess({ revalidate: async (...args) => { calls.push(args); } });
  if (allowed) { expect(await access.authorize(actor, permission)).toBe(actor); expect(calls).toEqual([[actor, permission]]); }
  else { await expect(access.authorize(actor, permission)).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(calls).toEqual([]); }
});
test.each(ownPermissions)('T011 titular propio/ajeno/ausente de %s', async permission => {
  let calls = 0;
  const actor = sessionActor(), access = new EnrollmentAccess({ revalidate: async () => { calls++; } });
  expect(await access.authorizeOwn(actor, permission, studentId)).toBe(actor);
  expect(await access.authorizeOwn(actor, permission, studentId.toUpperCase())).toBe(actor);
  expect(await access.authorizeOwn(actor, permission, otherStudentId)).toBeNull();
  expect(await access.authorizeOwn(actor, permission, null)).toBeNull();
  expect(await access.authorizeOwn(actor, permission, '')).toBeNull();
  expect(calls).toBe(5);
});
test.each(['ADMIN', 'TEACHER', 'SYSTEM', 'VISITOR', 'UNKNOWN'] as const)('T011 %s no accede a datos financieros propios por coincidencia de ID', async role => {
  const access = new EnrollmentAccess({ revalidate: async () => { throw new Error('No debe revalidar un rol denegado.'); } });
  for (const permission of ownPermissions) {
    await expect(access.authorizeOwn(sessionActor(role as Role), permission, studentId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
});
test.each(['AUTH_REQUIRED', 'FORBIDDEN', 'TEMPORARILY_UNAVAILABLE'] as const)('T011 propaga fallo actual %s antes de devolver pertenencia', async code => {
  const failure = code === 'TEMPORARILY_UNAVAILABLE' ? new SessionStoreUnavailable() : new AuthorizationFailure(code);
  const access = new EnrollmentAccess({ revalidate: async () => { throw failure; } });
  await expect(access.authorizeOwn(sessionActor(), 'enrollment:read-own', studentId)).rejects.toBe(failure);
  await expect(access.authorizeOwn(sessionActor(), 'enrollment:read-own', otherStudentId)).rejects.toBe(failure);
});
test('T011 no acepta permisos académicos/financieros desconocidos ni SYSTEM como rol de usuario', async () => {
  const access = new EnrollmentAccess({ revalidate: async () => { throw new Error('No debe revalidar un permiso inválido.'); } });
  for (const permission of ['academic:manage', 'profile:read', 'enrollment:unknown', 'enrollment:system', 'enrollment:confirm-manually']) {
    await expect(access.authorize(sessionActor('ADMIN'), permission as EnrollmentPermission)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
  for (const role of ['SYSTEM', 'VISITOR', 'UNKNOWN', '', null, undefined]) for (const permission of enrollmentPermissions) {
    expect(permits(role as Role, permission as Permission)).toBe(false);
  }
  await expect(access.authorizeOwn(sessionActor('ADMIN'), 'enrollment:read-all' as OwnEnrollmentPermission, studentId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
