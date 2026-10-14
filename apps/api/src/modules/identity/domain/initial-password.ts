import { canUseProvisionalPassword } from './access.js';
import type { AccountAccess } from './access.js';

export function acceptsVerifiedProvisional(verified:AccountAccess,current:AccountAccess,now:Date):boolean {
  return canUseProvisionalPassword(verified,now)&&canUseProvisionalPassword(current,now)
    &&verified.emailCanonical===current.emailCanonical&&verified.provisionalPasswordHash===current.provisionalPasswordHash
    &&verified.authVersion===current.authVersion;
}
