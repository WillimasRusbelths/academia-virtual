import { canAccessApplication } from './access.js';
import type { AccountAccess } from './access.js';

/** Revalidar la misma credencial y versión bajo bloqueo, sin repetir Argon2. */
export function acceptsVerifiedLogin(verified:AccountAccess,current:AccountAccess):boolean {
  return canAccessApplication(verified)&&canAccessApplication(current)
    &&verified.emailCanonical===current.emailCanonical&&verified.passwordHash===current.passwordHash
    &&verified.authVersion===current.authVersion;
}
