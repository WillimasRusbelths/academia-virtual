import type { Role } from '../../users/public/account.js';

export type Permission = 'profile:read' | 'users:manage'
  | 'academic:manage' | 'academic:read-published' | 'academic:read-own';

/** Matriz cerrada del backend; pertenencia/visibilidad se filtran además en oferta. */
export function permits(role: Role, permission: Permission): boolean {
  if (permission === 'profile:read') return ['STUDENT', 'TEACHER', 'ADMIN'].includes(role);
  if (permission === 'users:manage') return role === 'ADMIN';
  if (permission === 'academic:manage') return role === 'ADMIN';
  if (permission === 'academic:read-published') return role === 'ADMIN' || role === 'STUDENT';
  if (permission === 'academic:read-own') return role === 'TEACHER';
  return false;
}
