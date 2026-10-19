import type { Role } from '../../users/public/account.js';

export type Permission = 'profile:read' | 'users:manage';

/** Matriz cerrada de identidad; una operación desconocida nunca concede acceso. */
export function permits(role: Role, permission: Permission): boolean {
  if (permission === 'profile:read') return ['STUDENT', 'TEACHER', 'ADMIN'].includes(role);
  if (permission === 'users:manage') return role === 'ADMIN';
  return false;
}
