import { expect, test } from 'vitest';
import * as contract from '../public/materials.js';
import type { MaterialState } from '../public/materials.js';

// T051 pure contract: internal instants retain microseconds; no IO or actor lookup.
const base = Object.freeze({ id: 'material', groupId: 'group', createdBy: 'original', updatedBy: 'original',
  title: 'Lectura' as string, description: null as string|null, downloadName: 'lectura.pdf', mediaType: 'application/pdf', byteSize: 12,
  sha256: 'a'.repeat(64), state: 'PREPARED' as MaterialState, revision: '1' as string,
  createdAt: 1000001n, updatedAt: 1000001n, publishedAt: null as bigint|null, withdrawnAt: null as bigint|null });
type Resource = typeof base;
type Command = { operation: 'EDIT'|'PUBLISH'|'WITHDRAW'; expectedRevision: string; title?: string; description?: string|null };
type Context = { at: bigint; actorId: string; role: 'ADMIN'|'TEACHER'; groupState: 'DRAFT'|'CANCELLED' };
function implementation() {
  const candidate: unknown = Reflect.get(contract, 'transitionMaterial');
  if (typeof candidate !== 'function') throw new Error('T051 pending: pure transitionMaterial is not implemented');
  return candidate as (resource: Resource, command: Command, context: Context) => { resource: Resource; result: 'APPLIED'|'NO_CHANGE' };
}
const context: Context = Object.freeze({ at: 2000007n, actorId: 'new-teacher', role: 'TEACHER', groupState: 'DRAFT' });
const command = (operation: Command['operation'], expectedRevision = '1'): Command => ({ operation, expectedRevision });

test.each<MaterialState>(['PREPARED','PUBLISHED','WITHDRAWN'])('editing %s changes texts without publishing or replacing immutable facts', state => {
  const transition = implementation(), current = Object.freeze({ ...base, state });
  const result = transition(current, Object.freeze({ ...command('EDIT'), title: 'Correccion', description: 'Texto' }), context);
  expect(result).toEqual({ result: 'APPLIED', resource: { ...current, title: 'Correccion', description: 'Texto',
    revision: '2', updatedAt: context.at, updatedBy: context.actorId } });
  expect(current).toEqual({ ...base, state });
});
test.each<MaterialState>(['PREPARED','PUBLISHED'])('explicit withdrawal of %s records exact instant and revision', state => {
  const transition = implementation(), current = Object.freeze({ ...base, state });
  expect(transition(current, command('WITHDRAW'), context)).toEqual({ result: 'APPLIED', resource: {
    ...current, state: 'WITHDRAWN', revision: '2', withdrawnAt: context.at, updatedAt: context.at, updatedBy: context.actorId } });
});
test('explicit republication retains author, binary metadata and historical withdrawal', () => {
  const transition = implementation(), current = Object.freeze({ ...base, state: 'WITHDRAWN' as const, withdrawnAt: 1500003n });
  expect(transition(current, command('PUBLISH'), context)).toEqual({ result: 'APPLIED', resource: {
    ...current, state: 'PUBLISHED', revision: '2', publishedAt: context.at, updatedAt: context.at, updatedBy: context.actorId } });
});
test.each(['EDIT','PUBLISH','WITHDRAW'] as const)('%s NO_CHANGE requires current revision and preserves every timestamp', operation => {
  const transition = implementation(), current = Object.freeze({ ...base, revision: '7',
    state: operation === 'WITHDRAW' ? 'WITHDRAWN' as const : 'PUBLISHED' as const });
  const input = { ...command(operation, '7'), ...(operation === 'EDIT' ? { title: base.title, description: base.description } : {}) };
  expect(transition(current, input, context)).toEqual({ result: 'NO_CHANGE', resource: current });
  expect(() => transition(current, { ...input, expectedRevision: '6' }, context))
    .toThrow(expect.objectContaining({ code: 'MATERIAL_VERSION_CONFLICT' }));
});
test.each(['EDIT','PUBLISH'] as const)('cancelled group forbids admin %s', operation => {
  const transition = implementation();
  expect(() => transition(base, { ...command(operation), title: 'Correccion', description: null },
    { ...context, role: 'ADMIN', groupState: 'CANCELLED' }))
    .toThrow(expect.objectContaining({ code: 'MATERIAL_STATE_CONFLICT' }));
});
test('cancelled group permits explicit administrative withdrawal preserving immutable facts', () => {
  const transition = implementation();
  expect(transition(base, command('WITHDRAW'), { ...context, role: 'ADMIN', groupState: 'CANCELLED' }))
    .toMatchObject({ result: 'APPLIED', resource: { state: 'WITHDRAWN', createdBy: base.createdBy, groupId: base.groupId } });
});
test('effective changes cannot overflow bigint revision; unchanged command can use maximum revision', () => {
  const transition = implementation(), current = Object.freeze({ ...base, revision: '9223372036854775807', state: 'PUBLISHED' as const });
  expect(() => transition(current, command('WITHDRAW', current.revision), context))
    .toThrow(expect.objectContaining({ code: 'MATERIAL_STATE_CONFLICT' }));
  expect(transition(current, command('PUBLISH', current.revision), context)).toEqual({ result: 'NO_CHANGE', resource: current });
});
