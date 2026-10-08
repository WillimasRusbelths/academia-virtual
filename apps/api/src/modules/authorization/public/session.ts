import type { Role } from '../../users/public/account.js';
export { permits, type Permission } from '../domain/permissions.js';

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
  constructor() { super('Servicio temporalmente no disponible.'); }
}
