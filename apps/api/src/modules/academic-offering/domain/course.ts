import { OfferingError } from './offering-error.js';
import type { CourseState } from '../public/offer.js';

/** Datos de dominio; UUID y metadatos de persistencia los aporta la aplicación. */
export interface Course {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly state: CourseState;
}
function attributes(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['name'] });
  }
  return input as Record<string, unknown>;
}
function name(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['name'] });
  }
  return value.trim();
}
function description(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['description'] });
  return value.trim() || null;
}
export function createCourse(id: string, input: unknown): Course {
  const values = attributes(input);
  return { id, name: name(values.name), description: Object.hasOwn(values, 'description') ? description(values.description) : null,
    state: 'DRAFT' };
}
/** Copia nueva: no admite cambiar referencia/estado ni escribe revisiones/relojes. */
export function editCourse<T extends Course>(current: T, input: unknown): T {
  if (current.state !== 'DRAFT' && current.state !== 'WITHDRAWN') {
    throw new OfferingError({ code: 'OFFERING_STATE_CONFLICT' });
  }
  const values = attributes(input);
  return { ...current,
    ...(Object.hasOwn(values, 'name') ? { name: name(values.name) } : {}),
    ...(Object.hasOwn(values, 'description') ? { description: description(values.description) } : {}),
  };
}
