import { validatePassword } from '../../users/public/account.js';
import { canAccessApplication, canUseProvisionalPassword } from '../domain/access.js';
import type { AccountAccess } from '../domain/access.js';

export class CredentialOverload extends Error {
  readonly code = 'TEMPORARILY_UNAVAILABLE';
  constructor() { super('Servicio de credenciales temporalmente no disponible.'); }
}

export class CredentialUnavailable extends Error {
  readonly code = 'TEMPORARILY_UNAVAILABLE';
  constructor() { super('Servicio de credenciales temporalmente no disponible.'); }
}

export interface PasswordCredentials {
  hash(password: string): Promise<string>;
  /** null exige trabajo equivalente de verificación, sin admitir la credencial. */
  verify(password: string, encodedHash: string | null): Promise<boolean>;
}

export interface AccessSecrets {
  issue(): { secret: string; digest: Uint8Array };
  digest(secret: string): Uint8Array | null;
}

/** Preparación de una credencial; no crea cuentas ni sesiones. */
export async function hashNewPassword(value: unknown, credentials: PasswordCredentials): Promise<string> {
  return credentials.hash(validatePassword(value));
}

export async function verifyAccountCredential(account: AccountAccess | null, value: unknown, credentials: PasswordCredentials): Promise<boolean> {
  const password = validatePassword(value);
  const eligible = account !== null && canAccessApplication(account);
  const matches = await credentials.verify(password, eligible ? account!.passwordHash : null);
  return eligible && matches;
}

export async function verifyProvisionalCredential(account: AccountAccess | null, value: unknown, now: Date, credentials: PasswordCredentials): Promise<boolean> {
  const password = validatePassword(value);
  const eligible = account !== null && canUseProvisionalPassword(account, now);
  const matches = await credentials.verify(password, eligible ? account!.provisionalPasswordHash! : null);
  return eligible && matches;
}
