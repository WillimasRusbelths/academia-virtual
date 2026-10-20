import { expect, test } from 'vitest';
import { permits, type Permission } from './permissions.js';
import type { Role } from '../../users/public/account.js';
import { SessionLookup } from '../application/session-lookup.js';
import type { SessionActor, SessionRepository } from '../public/session.js';

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
