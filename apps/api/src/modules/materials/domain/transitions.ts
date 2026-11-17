import { MaterialError } from './material-error.js';
import { normalizeMaterialTexts } from './material.js';
import type { MaterialTexts } from './material.js';

type State = 'PREPARED' | 'PUBLISHED' | 'WITHDRAWN';
export type MaterialTransitionOperation = 'EDIT' | 'PUBLISH' | 'WITHDRAW';
/** Internal snapshot: bigint microseconds, never transport timestamps or IO. */
export interface MaterialTransitionSnapshot extends MaterialTexts {
  readonly state: State;
  readonly revision: string;
  readonly updatedBy: string;
  readonly updatedAt: bigint;
  readonly publishedAt: bigint | null;
  readonly withdrawnAt: bigint | null;
}
export interface MaterialTransitionCommand {
  readonly operation: MaterialTransitionOperation;
  readonly expectedRevision: string;
  readonly title?: string;
  readonly description?: string | null;
}
export interface MaterialTransitionContext {
  readonly at: bigint;
  readonly actorId: string;
  readonly role: 'ADMIN' | 'TEACHER';
  readonly groupState: 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN' | 'CANCELLED';
}
export function materialRevision(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)
    throw new MaterialError('VALIDATION_ERROR', ['expectedRevision']);
  return value;
}
/** Copy only mutable texts/state/times. All opaque identity, group, author and
 * file facts supplied by the caller survive unchanged; the input stays untouched.
 * Current authority is established by the transaction before invoking this rule.
 */
export function transitionMaterial<T extends MaterialTransitionSnapshot>(current: T, command: MaterialTransitionCommand,
  context: MaterialTransitionContext): { readonly resource: T; readonly result: 'APPLIED' | 'NO_CHANGE' } {
  if (context.groupState === 'CANCELLED') {
    if (context.role !== 'ADMIN') throw new MaterialError('NOT_FOUND');
    if (command.operation !== 'WITHDRAW') throw new MaterialError('MATERIAL_STATE_CONFLICT');
  }
  if (materialRevision(command.expectedRevision) !== current.revision) throw new MaterialError('MATERIAL_VERSION_CONFLICT');
  if ([current.updatedAt, current.publishedAt, current.withdrawnAt].some(at => at !== null && at > context.at))
    throw new MaterialError('TEMPORARILY_UNAVAILABLE');
  let texts: MaterialTexts = { title: current.title, description: current.description }, state = current.state;
  if (command.operation === 'EDIT') texts = normalizeMaterialTexts({ title: command.title, description: command.description });
  else if (command.operation === 'PUBLISH') state = 'PUBLISHED';
  else if (command.operation === 'WITHDRAW') state = 'WITHDRAWN';
  else throw new MaterialError('VALIDATION_ERROR');
  if (state === current.state && texts.title === current.title && texts.description === current.description)
    return { resource: current, result: 'NO_CHANGE' };
  if (BigInt(current.revision) === 9223372036854775807n) throw new MaterialError('MATERIAL_STATE_CONFLICT');
  return { result: 'APPLIED', resource: { ...current, ...texts, state, revision: (BigInt(current.revision) + 1n).toString(),
    updatedBy: context.actorId, updatedAt: context.at,
    publishedAt: command.operation === 'PUBLISH' ? context.at : current.publishedAt,
    withdrawnAt: command.operation === 'WITHDRAW' ? context.at : current.withdrawnAt } };
}
