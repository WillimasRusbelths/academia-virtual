import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import { isAccountId } from '../../users/public/account.js';
import type { EnrollmentAuthorization, EnrollmentPermission, OwnEnrollmentPermission } from './ports.js';

/** Capacidad pura del backend. La composición proporciona revalidación primaria de
 * cuenta/sesión/permiso ligada a la misma unidad de trabajo; no abre otra transacción.
 * La autorización se repite también para replay y antes de devolver pertenencia.
 * Ninguna facultad SYSTEM se acepta como rol/permiso de usuario.
 */
export class EnrollmentAccess {
  constructor(private readonly authorization: EnrollmentAuthorization) {}
  async authorize(actor: SessionActor | null, permission: EnrollmentPermission): Promise<SessionActor> {
    if (actor === null) throw new AuthorizationFailure('AUTH_REQUIRED');
    if (typeof permission !== 'string' || !permission.startsWith('enrollment:') || !permits(actor.role,permission)) {
      throw new AuthorizationFailure('FORBIDDEN');
    }
    await this.authorization.revalidate(actor,permission);
    return actor;
  }
  async authorizeOwn(actor: SessionActor | null, permission: OwnEnrollmentPermission, persistedStudentId: string | null): Promise<SessionActor | null> {
    if (!['enrollment:reserve-own','enrollment:pay-own','enrollment:read-own'].includes(permission)) {
      throw new AuthorizationFailure('FORBIDDEN');
    }
    const accepted = await this.authorize(actor,permission);
    // El dueño viene del agregado persistido, nunca de un studentId enviado por HTTP.
    // Ausente/ajeno se representan igual; el transporte futuro proyectará NOT_FOUND.
    // Listados/nueva selección derivan el filtro/titular exclusivamente del actor.
    return isAccountId(accepted.userId) && isAccountId(persistedStudentId)
      && accepted.userId.toLowerCase() === persistedStudentId.toLowerCase() ? accepted : null;
  }
}
