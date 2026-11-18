import { ClassError } from '../public/errors.js';
export type ClassState = 'PREPARED' | 'LIVE' | 'FINISHED' | 'CANCELLED';
export interface ClassTexts { readonly title: string; readonly description: string | null }

export interface ClassSessionSnapshot extends ClassTexts {
  readonly id: string; readonly groupId: string; readonly createdBy: string; readonly updatedBy: string;
  readonly state: ClassState; readonly revision: string;
  readonly createdAt: bigint; readonly updatedAt: bigint;
  readonly startedAt: bigint | null; readonly finishedAt: bigint | null; readonly cancelledAt: bigint | null;
}
export interface ClassSessionCommand {
  readonly operation: 'EDIT' | 'START' | 'FINISH' | 'CANCEL'; readonly expectedRevision: string;
  readonly title?: string; readonly description?: string | null;
}
export interface ClassSessionContext { readonly actorId: string; readonly at: bigint }
export function classRevision(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)
    throw new ClassError('VALIDATION_ERROR', ['expectedRevision']);
  return value;
}
function text(value: unknown, field: 'title' | 'description'): string {
  if (typeof value !== 'string' || /\p{Surrogate}/u.test(value) || value.includes('\u0000')) throw new ClassError('VALIDATION_ERROR', [field]);
  return value.trim();
}
export function normalizeClassTexts(input: unknown): ClassTexts {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['title', 'description'].includes(key))) throw new ClassError('VALIDATION_ERROR');
  const data = input as Record<string, unknown>, title = text(data.title, 'title');
  if (!title || Array.from(title).length > 160) throw new ClassError('VALIDATION_ERROR', ['title']);
  const description = data.description === null || data.description === undefined ? null : text(data.description, 'description');
  if (description !== null && Array.from(description).length > 2000) throw new ClassError('VALIDATION_ERROR', ['description']);
  return Object.freeze({ title, description: description || null });
}
export function prepareClassSession(input: ClassTexts, context: ClassSessionContext & { readonly id: string; readonly groupId: string }): ClassSessionSnapshot {
  return Object.freeze({ ...normalizeClassTexts(input), id: context.id, groupId: context.groupId,
    createdBy: context.actorId, updatedBy: context.actorId, state: 'PREPARED', revision: '1',
    createdAt: context.at, updatedAt: context.at, startedAt: null, finishedAt: null, cancelledAt: null });
}
/** Authority and the group's LIVE exclusion belong to the transaction, never
 * to a player, schedule or socket. Preserve every immutable fact and timestamp. */
export function transitionClassSession<T extends ClassSessionSnapshot>(current: T, command: ClassSessionCommand,
  context: ClassSessionContext): { readonly resource: T; readonly result: 'APPLIED' | 'NO_CHANGE' } {
  if (classRevision(command.expectedRevision) !== current.revision) throw new ClassError('CLASS_VERSION_CONFLICT');
  if ([current.createdAt, current.updatedAt, current.startedAt, current.finishedAt, current.cancelledAt]
    .some(at => at !== null && at > context.at)) throw new ClassError('TEMPORARILY_UNAVAILABLE');
  let state = current.state, texts: ClassTexts = { title: current.title, description: current.description };
  if (command.operation === 'EDIT') texts = normalizeClassTexts({ title: command.title, description: command.description });
  else if (command.operation === 'START' && (state === 'PREPARED' || state === 'LIVE')) state = 'LIVE';
  else if (command.operation === 'FINISH' && (state === 'LIVE' || state === 'FINISHED')) state = 'FINISHED';
  else if (command.operation === 'CANCEL' && (state === 'PREPARED' || state === 'CANCELLED')) state = 'CANCELLED';
  else throw new ClassError('CLASS_STATE_CONFLICT');
  if (state === current.state && texts.title === current.title && texts.description === current.description)
    return Object.freeze({ result: 'NO_CHANGE', resource: current });
  if (BigInt(current.revision) === 9223372036854775807n) throw new ClassError('CLASS_STATE_CONFLICT');
  return Object.freeze({ result: 'APPLIED', resource: Object.freeze({ ...current, ...texts, state,
    revision: (BigInt(current.revision) + 1n).toString(), updatedBy: context.actorId, updatedAt: context.at,
    startedAt: command.operation === 'START' ? context.at : current.startedAt,
    finishedAt: command.operation === 'FINISH' ? context.at : current.finishedAt,
    cancelledAt: command.operation === 'CANCEL' ? context.at : current.cancelledAt }) });
}
