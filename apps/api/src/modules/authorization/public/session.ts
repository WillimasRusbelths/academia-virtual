import type { Role } from '../../users/public/account.js';
import type { Permission } from '../domain/permissions.js';
export { permits, type Permission } from '../domain/permissions.js';
export const ACCESS_POLICY='academia.access-policy';
/** Closed alternative for shared manager routes; resource authority is checked again in the transaction. */
export const MATERIALS_MANAGEMENT_POLICY = Object.freeze(['materials:manage-all', 'materials:manage-own'] as const);
export const MATERIALS_READ_POLICY = Object.freeze([...MATERIALS_MANAGEMENT_POLICY, 'materials:read-enrolled'] as const);
export type SessionPermission = Permission | typeof MATERIALS_MANAGEMENT_POLICY | typeof MATERIALS_READ_POLICY;

/** Datos internos de autorización, nunca una vista pública ni una credencial del cliente. */
export interface SessionActor {
  readonly sessionId: string;
  readonly userId: string;
  readonly authVersion: bigint;
  readonly role: Role;
}

export interface SessionRepository {
  lookup(secret: string): Promise<SessionActor | null>;
  accept(actor: SessionActor): Promise<boolean>;
  revoke(secret: string): Promise<void>;
}

export class AuthorizationFailure extends Error {
  constructor(readonly code: 'AUTH_REQUIRED' | 'FORBIDDEN') {
    super(code === 'AUTH_REQUIRED' ? 'Debes iniciar sesión.' : 'Acceso no permitido.');
  }
}

export class SessionStoreUnavailable extends Error {
  readonly code = 'TEMPORARILY_UNAVAILABLE';
  constructor(readonly transactionAborted=false) { super('Servicio temporalmente no disponible.'); }
}
