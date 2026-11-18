import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import { isAccountId } from '../../users/public/account.js';
import { classRevision, normalizeClassTexts } from '../domain/class-session.js';
import { ClassError } from '../public/errors.js';
import type { ClassesManagementStore } from './ports.js';

export const CLASSES_MANAGEMENT = Symbol('ClassesManagement');
function record(input: unknown, allowed: readonly string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !allowed.includes(key))) throw new ClassError('VALIDATION_ERROR');
  return input as Record<string, unknown>;
}
function identity(input: Record<string, unknown>) {
  if (!isAccountId(input.commandId)) throw new ClassError('VALIDATION_ERROR', ['commandId']);
  return { commandId: input.commandId.toLowerCase() };
}
function target(actor: SessionActor, id: string, manage = true) {
  if (manage && !permits(actor.role, 'classes:manage-all') && !permits(actor.role, 'classes:manage-own')) throw new AuthorizationFailure('FORBIDDEN');
  if (!isAccountId(id)) throw new ClassError('NOT_FOUND');
  return id.toLowerCase();
}
export function createClassesCommands(store: ClassesManagementStore) {
  const lifecycle = (operation: 'start' | 'finish' | 'cancel') => async (actor: SessionActor, id: string, input: unknown) => {
    const resource = target(actor, id), data = record(input, ['commandId', 'expectedRevision']);
    return store[operation](actor, resource, Object.freeze({ ...identity(data), expectedRevision: classRevision(data.expectedRevision) }));
  };
  return Object.freeze({
    async create(actor: SessionActor, groupId: string, input: unknown) {
      const id = target(actor, groupId), data = record(input, ['commandId', 'title', 'description']);
      return store.create(actor, id, Object.freeze({ ...identity(data), ...normalizeClassTexts({ title: data.title, description: data.description }) }));
    },
    async edit(actor: SessionActor, classId: string, input: unknown) {
      const id = target(actor, classId), data = record(input, ['commandId', 'expectedRevision', 'title', 'description']);
      return store.edit(actor, id, Object.freeze({ ...identity(data), expectedRevision: classRevision(data.expectedRevision),
        ...normalizeClassTexts({ title: data.title, description: data.description }) }));
    },
    start: lifecycle('start'), finish: lifecycle('finish'), cancel: lifecycle('cancel'),
    async command(actor: SessionActor, id: string) { return store.command(actor, target(actor, id, false)); },
  });
}
export type ClassesManagement = ReturnType<typeof createClassesCommands>;
