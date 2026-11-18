import { beforeEach, expect, test } from 'vitest';
import * as contract from '../public/classes.js';
import type { ClassState, ClassTexts } from '../public/classes.js';

// T018: executable contract before T020, following the materials domain tests.
// Missing functions fail explicitly; their absence is not a functional rejection.
type Session = ClassTexts & {
  readonly id: string; readonly groupId: string; readonly createdBy: string; readonly updatedBy: string;
  readonly state: ClassState; readonly revision: string; readonly createdAt: bigint; readonly updatedAt: bigint;
  readonly startedAt: bigint | null; readonly finishedAt: bigint | null; readonly cancelledAt: bigint | null;
};
type Context = { readonly actorId: string; readonly at: bigint };
type Command = { readonly operation: 'EDIT' | 'START' | 'FINISH' | 'CANCEL'; readonly expectedRevision: string;
  readonly title?: string; readonly description?: string | null };
function implementation<T>(name: string): T {
  const value: unknown = Reflect.get(contract, name);
  if (typeof value !== 'function') throw new Error(`T020 pending: ${name} is not implemented.`);
  return value as T;
}
beforeEach(() => {
  // Resolve outside toThrow assertions so a missing function is always reported
  // as a pending implementation, never as an opaque error-matcher mismatch.
  for (const name of ['normalizeClassTexts', 'prepareClassSession', 'transitionClassSession']) implementation(name);
});
const texts = (input: unknown) => implementation<(input: unknown) => ClassTexts>('normalizeClassTexts')(input);
const prepare = (input: ClassTexts, context: Context & { id: string; groupId: string }) =>
  implementation<(input: ClassTexts, context: Context & { id: string; groupId: string }) => Session>('prepareClassSession')(input, context);
const transition = (resource: Session, command: Command, context: Context) =>
  implementation<(resource: Session, command: Command, context: Context) => { resource: Session; result: 'APPLIED' | 'NO_CHANGE' }>(
    'transitionClassSession')(resource, command, context);
const base: Session = Object.freeze({ id: '10000000-0000-4000-8000-000000000001', groupId: '10000000-0000-4000-8000-000000000002',
  createdBy: '10000000-0000-4000-8000-000000000003', updatedBy: '10000000-0000-4000-8000-000000000003',
  title: 'Clase ficticia', description: null, state: 'PREPARED', revision: '1', createdAt: 9007199254741001n,
  updatedAt: 9007199254741001n, startedAt: null, finishedAt: null, cancelledAt: null });
const context: Context = Object.freeze({ actorId: '10000000-0000-4000-8000-000000000004', at: base.updatedAt + 7n });
function session(state: ClassState): Session {
  return Object.freeze({ ...base, state,
    startedAt: state === 'LIVE' || state === 'FINISHED' ? base.createdAt : null,
    finishedAt: state === 'FINISHED' ? base.createdAt : null,
    cancelledAt: state === 'CANCELLED' ? base.createdAt : null });
}
const command = (operation: Command['operation'], expectedRevision = '1'): Command => ({ operation, expectedRevision });
const states: readonly ClassState[] = ['PREPARED', 'LIVE', 'FINISHED', 'CANCELLED'];

test('uniform Unicode trim and blank descriptions; plain text remains literal', () => {
  expect(texts(Object.freeze({ title: '\u00a0\ufeff Clase \u3000', description: '\t\n\u2003' })))
    .toEqual({ title: 'Clase', description: null });
  expect(texts({ title: '<b>Clase</b>', description: ' https://example.invalid/ <script>demo()</script> ' }))
    .toEqual({ title: '<b>Clase</b>', description: 'https://example.invalid/ <script>demo()</script>' });
});
test.each([1, 160])('title accepts %i Unicode code points, including supplementary characters', length => {
  const input = Object.freeze({ title: '🎓'.repeat(length), description: '📖'.repeat(2000) });
  expect(texts(input)).toEqual(input);
});
test('does not normalize composed/decomposed text into a different intention', () => {
  expect(texts({ title: 'e\u0301', description: null }).title).toBe('e\u0301');
});
test.each(['', ' \t\n', 'x'.repeat(161), '🎓'.repeat(161), 'a\u0000b', '\ud800', '\udc00'])(
  'rejects invalid title %j', title => {
    expect(() => texts({ title, description: null })).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
test.each(['x'.repeat(2001), '📖'.repeat(2001), 'a\u0000b', '\ud800', '\udc00'])(
  'rejects invalid description %#', description => {
    expect(() => texts({ title: 'Clase', description })).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
test.each([null, [], { title: 1, description: null }, { title: 'Clase', description: false },
  { title: 'Clase', description: {} }])('does not coerce arbitrary text values %#', input => {
  expect(() => texts(input)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
});
test('preparation records only explicit identity and exact decision time, without opening a class', () => {
  expect(prepare({ title: base.title, description: null }, { ...context, id: base.id, groupId: base.groupId }))
    .toEqual({ ...base, createdBy: context.actorId, updatedBy: context.actorId, createdAt: context.at, updatedAt: context.at });
});
test.each(states)('editing %s preserves identity, state and all lifecycle timestamps', state => {
  const current = session(state);
  expect(transition(current, { ...command('EDIT'), title: 'Corrección', description: 'Texto ficticio' }, context))
    .toEqual({ result: 'APPLIED', resource: { ...current, title: 'Corrección', description: 'Texto ficticio',
      revision: '2', updatedBy: context.actorId, updatedAt: context.at } });
  expect(current).toEqual(session(state));
});
test('manual start then finish records microseconds and never claims external signal availability', () => {
  const started = transition(base, command('START'), context);
  expect(started).toEqual({ result: 'APPLIED', resource: { ...base, state: 'LIVE', revision: '2',
    startedAt: context.at, updatedAt: context.at, updatedBy: context.actorId } });
  const next = { ...context, at: context.at + 1n };
  expect(transition(Object.freeze(started.resource), command('FINISH', '2'), next))
    .toEqual({ result: 'APPLIED', resource: { ...started.resource, state: 'FINISHED', revision: '3',
      finishedAt: next.at, updatedAt: next.at } });
});
test('manual cancellation keeps never-started timestamps null', () => {
  expect(transition(base, command('CANCEL'), context)).toEqual({ result: 'APPLIED', resource: {
    ...base, state: 'CANCELLED', revision: '2', cancelledAt: context.at, updatedAt: context.at, updatedBy: context.actorId } });
});
test.each([
  ['PREPARED', 'FINISH'], ['LIVE', 'CANCEL'], ['FINISHED', 'START'], ['FINISHED', 'CANCEL'],
  ['CANCELLED', 'START'], ['CANCELLED', 'FINISH'],
] as const)('%s cannot perform %s or reopen', (state, operation) => {
  expect(() => transition(session(state), command(operation), context))
    .toThrow(expect.objectContaining({ code: 'CLASS_STATE_CONFLICT' }));
});
test.each([
  ['PREPARED', 'EDIT'], ['LIVE', 'START'], ['FINISHED', 'FINISH'], ['CANCELLED', 'CANCEL'],
] as const)('matching revision permits NO_CHANGE for %s/%s without new dates or attribution', (state, operation) => {
  const current = session(state), input = { ...command(operation), ...(operation === 'EDIT' ? { title: base.title, description: null } : {}) };
  expect(transition(current, input, context)).toEqual({ result: 'NO_CHANGE', resource: current });
  expect(() => transition(current, { ...input, expectedRevision: '2' }, context))
    .toThrow(expect.objectContaining({ code: 'CLASS_VERSION_CONFLICT' }));
});
test.each(['EDIT', 'START', 'FINISH', 'CANCEL'] as const)('%s never overwrites a newer revision', operation => {
  expect(() => transition(base, { ...command(operation, '2'), title: 'Otra clase', description: null }, context))
    .toThrow(expect.objectContaining({ code: 'CLASS_VERSION_CONFLICT' }));
});
test('revision uses exact int64 arithmetic beyond JS number precision', () => {
  expect(transition(Object.freeze({ ...base, revision: '9007199254740993' }), command('START', '9007199254740993'), context))
    .toMatchObject({ result: 'APPLIED', resource: { revision: '9007199254740994' } });
});
test('maximum revision permits NO_CHANGE but cannot overflow on an effective change', () => {
  const current = Object.freeze({ ...base, revision: '9223372036854775807' });
  expect(transition(current, { ...command('EDIT', current.revision), title: current.title, description: null }, context))
    .toEqual({ result: 'NO_CHANGE', resource: current });
  expect(() => transition(current, command('START', current.revision), context))
    .toThrow(expect.objectContaining({ code: 'CLASS_STATE_CONFLICT' }));
});
