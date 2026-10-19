import { requireRole, requireStatus } from '../../users/public/account.js';
import type { Role, AccountStatus } from '../../users/public/account.js';

export type AuditAction = 'ACCOUNT_CREATED' | 'BOOTSTRAP_ADMIN_CREATED' | 'NAME_CHANGED' | 'ROLE_CHANGED' | 'STATUS_CHANGED';
export interface AuditEvent {
  readonly actorKind: 'ACCOUNT' | 'SYSTEM_BOOTSTRAP';
  readonly actorUserId: string | null;
  readonly targetUserId: string;
  readonly action: AuditAction;
  readonly result: 'APPLIED' | 'NO_CHANGE';
  readonly requestId: string;
  readonly oldRole: Role | null;
  readonly newRole: Role | null;
  readonly oldStatus: AccountStatus | null;
  readonly newStatus: AccountStatus | null;
}

export class AuditEventInvalid extends Error {
  constructor() { super('Evento de auditoría inválido. Valores omitidos.'); }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = ['actorKind','actorUserId','targetUserId','action','result','requestId','oldRole','newRole','oldStatus','newStatus'];

/** Hechos aceptados, nunca intentos HTTP. Identidad/autorización se revalidan en el caso de uso. */
export function auditEvent(input: unknown): AuditEvent {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AuditEventInvalid();
    const value = input as Record<string, unknown>;
    if (Object.keys(value).some(key => !fields.includes(key))
      || typeof value.targetUserId !== 'string' || !uuid.test(value.targetUserId)
      || typeof value.requestId !== 'string' || !uuid.test(value.requestId)
      || typeof value.action !== 'string'
      || !['ACCOUNT_CREATED','BOOTSTRAP_ADMIN_CREATED','NAME_CHANGED','ROLE_CHANGED','STATUS_CHANGED'].includes(value.action)
      || typeof value.result !== 'string' || !['APPLIED','NO_CHANGE'].includes(value.result)) throw new AuditEventInvalid();
    if (value.actorKind === 'ACCOUNT') {
      if (typeof value.actorUserId !== 'string' || !uuid.test(value.actorUserId) || value.action === 'BOOTSTRAP_ADMIN_CREATED') throw new AuditEventInvalid();
    } else if (value.actorKind !== 'SYSTEM_BOOTSTRAP' || value.actorUserId !== null
      || value.action !== 'BOOTSTRAP_ADMIN_CREATED' || value.result !== 'APPLIED') throw new AuditEventInvalid();
    const oldRole = value.oldRole == null ? null : requireRole(value.oldRole);
    const newRole = value.newRole == null ? null : requireRole(value.newRole);
    const oldStatus = value.oldStatus == null ? null : requireStatus(value.oldStatus);
    const newStatus = value.newStatus == null ? null : requireStatus(value.newStatus);
    const roleChange = value.action === 'ROLE_CHANGED' && value.result === 'APPLIED';
    const statusChange = value.action === 'STATUS_CHANGED' && value.result === 'APPLIED';
    if (roleChange ? !oldRole || !newRole || oldRole === newRole || oldStatus !== null || newStatus !== null
      : statusChange ? !oldStatus || !newStatus || oldStatus === newStatus || oldRole !== null || newRole !== null
        : [oldRole,newRole,oldStatus,newStatus].some(field => field !== null)) throw new AuditEventInvalid();
    return Object.freeze({ actorKind: value.actorKind, actorUserId: value.actorUserId as string | null,
      targetUserId: value.targetUserId, action: value.action as AuditAction, result: value.result as AuditEvent['result'],
      requestId: value.requestId, oldRole, newRole, oldStatus, newStatus });
  } catch { throw new AuditEventInvalid(); }
}
