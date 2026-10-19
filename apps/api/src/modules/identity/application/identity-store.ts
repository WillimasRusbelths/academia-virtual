import { normalizeEmail, normalizeName } from '../../users/public/account.js';
import type { EncryptedMailPayload } from '../../mail/public/delivery.js';

/** US6 prepara hash y enlace cifrado antes de entrar a la operación persistida. */
export interface PreparedBootstrap {
  readonly name: string;
  readonly email: string;
  readonly provisionalPasswordHash: string;
  readonly requestId: string;
  readonly origin: string;
  readonly verification: {
    readonly tokenHash: Uint8Array;
    readonly payload: EncryptedMailPayload;
  };
}

export interface BootstrapResult {
  readonly userId: string;
  readonly email: string;
  readonly verificationQueued: boolean;
}

export interface IdentityStore {
  bootstrap(input: PreparedBootstrap): Promise<BootstrapResult>;
}

export class BootstrapUnavailable extends Error {
  readonly code = 'TEMPORARILY_UNAVAILABLE';
  constructor() { super('La inicialización no pudo confirmarse. Detalles omitidos.'); }
}

/** Reutiliza las reglas de cuenta; no admite rol, estado ni contraseña en texto claro. */
export function bootstrapAccount(input: PreparedBootstrap) {
  if (typeof input.provisionalPasswordHash !== 'string' || input.provisionalPasswordHash.length === 0) {
    throw new BootstrapUnavailable();
  }
  return { name: normalizeName(input.name), ...normalizeEmail(input.email) };
}
