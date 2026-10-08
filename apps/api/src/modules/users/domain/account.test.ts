import { expect, test } from 'vitest';
import { AccountValidationError, normalizeEmail, normalizeName, requireRole, requireStatus, validatePassword } from './account.js';

test('nombre Unicode: trim exterior y límites por caracteres, no bytes ni unidades UTF-16', () => {
  expect(normalizeName(' \u00a0 Ana 🎓 \u202f')).toBe('Ana 🎓');
  expect(normalizeName('🎓'.repeat(100)).length).toBe(200);
  for (const value of ['', '   ', '🎓'.repeat(101), null, ['Ana'], 'x\0y', '\ud800']) {
    expect(() => normalizeName(value)).toThrow(AccountValidationError);
  }
});

test('correo: trim y minúscula simple, sin transformar alias ni puntos', () => {
  expect(normalizeEmail(' ANA+Curso@Example.Test ')).toEqual({ email: 'ANA+Curso@Example.Test', emailCanonical: 'ana+curso@example.test' });
  expect(normalizeEmail('ΟСΣİ@EXAMPLE.TEST').emailCanonical).toBe('οсσi@example.test');
  expect(normalizeEmail('a.b@example.test').emailCanonical).not.toBe(normalizeEmail('ab@example.test').emailCanonical);
  expect(normalizeEmail(`${'a'.repeat(241)}@example.test`).email.length).toBe(254);
  for (const value of ['', 'sin-correo', 'a b@example.test', 'a@@example.test', `${'a'.repeat(242)}@example.test`, ['a@example.test'], null]) {
    expect(() => normalizeEmail(value)).toThrow(AccountValidationError);
  }
});

test('contraseñas preservan espacios, composición Unicode y contenido completo', () => {
  const value = '  🎓é e\u0301 secreto  ';
  expect(validatePassword(value)).toBe(value);
  expect(validatePassword('🎓'.repeat(12))).toBe('🎓'.repeat(12));
  expect(validatePassword('🎓'.repeat(128))).toBe('🎓'.repeat(128));
  expect(validatePassword(' '.repeat(12))).toBe(' '.repeat(12));
  for (const value of ['x'.repeat(11), '🎓'.repeat(129), null, 123456789012, ['abcdefghijkl'], 'x'.repeat(12) + '\ud800']) {
    try { validatePassword(value); throw new Error('Validación omitida'); }
    catch (error) { expect(error instanceof AccountValidationError && error.field === 'password').toBe(true); }
  }
});

test('rol único y estado admiten exclusivamente los enums', () => {
  for (const role of ['STUDENT', 'TEACHER', 'ADMIN']) expect(requireRole(role)).toBe(role);
  for (const state of ['ACTIVE', 'DISABLED']) expect(requireStatus(state)).toBe(state);
  for (const role of [['STUDENT'], ['STUDENT', 'ADMIN'], 'student', 'STUDENT,ADMIN', null]) expect(() => requireRole(role)).toThrow(AccountValidationError);
  for (const state of ['active', ['ACTIVE'], '', null]) expect(() => requireStatus(state)).toThrow(AccountValidationError);
});
