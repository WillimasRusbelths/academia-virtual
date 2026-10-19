import { expect, test } from 'vitest';
import { permits, type Permission } from './permissions.js';
import type { Role } from '../../users/public/account.js';

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
