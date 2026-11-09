import type { Role } from '../../users/public/account.js';

export type Permission = 'profile:read' | 'users:manage'
  | 'academic:manage' | 'academic:read-published' | 'academic:read-own'
  | 'enrollment:price-manage' | 'enrollment:reserve-own' | 'enrollment:pay-own'
  | 'enrollment:read-own' | 'enrollment:read-all' | 'enrollment:incident-follow-up';

/** Matriz cerrada del backend; pertenencia/visibilidad se filtran además en oferta. */
export function permits(role: Role, permission: Permission): boolean {
  if (permission === 'profile:read') return ['STUDENT', 'TEACHER', 'ADMIN'].includes(role);
  if (permission === 'users:manage') return role === 'ADMIN';
  if (permission === 'academic:manage') return role === 'ADMIN';
  if (permission === 'academic:read-published') return role === 'ADMIN' || role === 'STUDENT';
  if (permission === 'academic:read-own') return role === 'TEACHER';
  if (permission === 'enrollment:price-manage' || permission === 'enrollment:read-all'
    || permission === 'enrollment:incident-follow-up') return role === 'ADMIN';
  if (permission === 'enrollment:reserve-own' || permission === 'enrollment:pay-own'
    || permission === 'enrollment:read-own') return role === 'STUDENT';
  return false;
}
