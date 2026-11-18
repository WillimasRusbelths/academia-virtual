import type { Role } from './account.js';

export interface ClassAuthor { readonly id: string; readonly name: string; readonly role: Role }
/** Issued by the coordinator only for author IDs of already authorized class
 * projections. Not a request parameter, global roster or user administration API.
 * Capabilities expire with the transaction, including empty lookups.
 */
export interface ClassAuthorsScope {
  assertReferences(authorIds: readonly string[]): void;
  use<T>(operation: () => Promise<T>): Promise<T>;
}
export interface ClassAuthors { byIds(authorIds: readonly string[]): Promise<readonly ClassAuthor[]> }
export class ClassAuthorsInvalid extends Error {
  readonly code = 'VALIDATION_ERROR';
  constructor() { super('Referencias de autores inválidas. Valores omitidos.'); }
}
export class ClassAuthorsUnavailable extends Error {
  readonly code = 'TEMPORARILY_UNAVAILABLE';
  constructor() { super('Autores temporalmente no disponibles.'); }
}
