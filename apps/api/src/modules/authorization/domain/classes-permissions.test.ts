import { expect, test } from 'vitest';
import { permits, type Permission } from './permissions.js';
import { SessionLookup } from '../application/session-lookup.js';
import * as session from '../public/session.js';
import type { Role } from '../../users/public/account.js';
import type { SessionActor, SessionPermission, SessionRepository } from '../public/session.js';

const permissions = ['classes:manage-all', 'classes:manage-own', 'classes:participate-enrolled'] as const;
const matrix = (['ADMIN', 'TEACHER', 'STUDENT'] as const).flatMap((role, index) =>
  permissions.map((permission, permissionIndex) => ({ role, permission, allowed: index === permissionIndex })));
function setup(role: Role) {
  let accepted = 0;
  const actor: SessionActor = { userId: 'synthetic-account', sessionId: 'synthetic-session', authVersion: 0n, role };
  const store: SessionRepository = { lookup: async () => actor, accept: async () => { accepted++; return true; }, revoke: async () => {} };
  return { actor, store, lookup: new SessionLookup(store), accepted: () => accepted };
}
function policy(name: 'CLASSES_MANAGEMENT_POLICY' | 'CLASSES_PARTICIPATION_POLICY') {
  const value: unknown = Reflect.get(session, name);
  expect(value).toEqual(name === 'CLASSES_MANAGEMENT_POLICY' ? permissions.slice(0, 2) : permissions);
  expect(Object.isFrozen(value)).toBe(true);
  return value as SessionPermission;
}
test.each(matrix)('classes closed matrix $role / $permission = $allowed', ({ role, permission, allowed }) => {
  expect(permits(role, permission as Permission)).toBe(allowed);
});
test.each(matrix)('classes session permission $role / $permission = $allowed', async ({ role, permission, allowed }) => {
  const f = setup(role), result = f.lookup.authorize('synthetic-secret', permission as Permission);
  if (allowed) expect(await result).toBe(f.actor); else await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.accepted()).toBe(0);
});
test.each(['ADMIN', 'TEACHER', 'STUDENT'] as const)('classes closed policies for %s', async role => {
  const f = setup(role), manage = policy('CLASSES_MANAGEMENT_POLICY'), participate = policy('CLASSES_PARTICIPATION_POLICY');
  if (role === 'STUDENT') await expect(f.lookup.authorize('synthetic-secret', manage)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  else expect(await f.lookup.authorize('synthetic-secret', manage)).toBe(f.actor);
  expect(await f.lookup.authorize('synthetic-secret', participate)).toBe(f.actor);
  expect(f.accepted()).toBe(0);
});
test.each(['ADMIN', 'TEACHER', 'STUDENT'] as const)('classes rejects unknown and mixed tuples for %s', async role => {
  const f = setup(role);
  for (const value of [[], ['classes:manage-all'], [...permissions].reverse(), [...permissions, 'profile:read'],
    ['classes:manage-all', 'classes:participate-enrolled'], ['classes:manage-all', 'materials:manage-own'],
    ['classes:manage-all', 'classes:manage-own', 'unknown'], new Array(3), ['profile:read', 'users:manage']]) {
    await expect(f.lookup.authorize('synthetic-secret', value as unknown as SessionPermission)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
  expect(permits(role, 'classes:unknown' as Permission)).toBe(false);
});
test.each(['SYSTEM', 'UNKNOWN', 'VISITOR', '', null, undefined])('unknown role %s cannot access classes', role => {
  for (const permission of permissions) expect(permits(role as Role, permission as Permission)).toBe(false);
});
test('classes visitor does not consult identity and unavailable identity fails closed', async () => {
  let called = false;
  const repository: SessionRepository = { lookup: async () => { called = true; throw new session.SessionStoreUnavailable(); },
    accept: async () => false, revoke: async () => {} };
  const lookup = new SessionLookup(repository);
  await expect(lookup.authorize(null, 'classes:participate-enrolled' as Permission)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(called).toBe(false);
  await expect(lookup.authorize('synthetic-secret', 'classes:participate-enrolled' as Permission)).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' });
});
