export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'DISABLED';

export class AccountValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  constructor(readonly field: 'name' | 'email' | 'password' | 'role' | 'status') {
    super(`Campo inválido: ${field}.`);
  }
}

function text(value: unknown, field: AccountValidationError['field']): string {
  if (typeof value !== 'string' || Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return character.length === 1 && code >= 0xd800 && code <= 0xdfff;
  })) throw new AccountValidationError(field);
  return value;
}

export function normalizeName(value: unknown): string {
  const name = text(value, 'name').trim();
  if (Array.from(name).length < 1 || Array.from(name).length > 100 || name.includes('\0')) {
    throw new AccountValidationError('name');
  }
  return name;
}

export function normalizeEmail(value: unknown): { email: string; emailCanonical: string } {
  const email = text(value, 'email').trim();
  if (Array.from(email).length > 254 || email.includes('\0') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AccountValidationError('email');
  }
  // Minúscula simple por carácter, coherente con lower() de PostgreSQL C.UTF-8.
  // Evita la sigma contextual y la expansión de U+0130 de String.toLowerCase().
  const emailCanonical = Array.from(email, character => character === '\u0130' ? 'i' : character.toLowerCase()).join('');
  return { email, emailCanonical };
}

/** No normalizar, retirar espacios ni truncar una contraseña. */
export function validatePassword(value: unknown): string {
  const password = text(value, 'password');
  const length = Array.from(password).length;
  if (length < 12 || length > 128) throw new AccountValidationError('password');
  return password;
}

export function requireRole(value: unknown): Role {
  if (value !== 'STUDENT' && value !== 'TEACHER' && value !== 'ADMIN') throw new AccountValidationError('role');
  return value;
}

export function requireStatus(value: unknown): AccountStatus {
  if (value !== 'ACTIVE' && value !== 'DISABLED') throw new AccountValidationError('status');
  return value;
}
