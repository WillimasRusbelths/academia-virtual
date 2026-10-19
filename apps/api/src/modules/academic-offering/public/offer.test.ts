import { expect, expectTypeOf, test } from 'vitest';
import { OfferingError, OFFERING_ERROR_MESSAGES } from './offer.js';
import type { AdminCourse, AdminGroup, CatalogCourse, CatalogGroup, TeachingGroup, Revision,
  OfferingFailure, OfferingErrorView, TeacherCandidate, CommandResult } from './offer.js';
import type { OfferingCommand, OfferingStore } from '../application/offering-store.js';

test('C01 DTO cerrados por audiencia, sin generación, credenciales ni datos de cuenta', () => {
  expectTypeOf<keyof AdminCourse>().toEqualTypeOf<'id' | 'name' | 'description' | 'state' | 'revision' | 'studentVisible' | 'createdAt' | 'updatedAt'>();
  expectTypeOf<keyof AdminGroup>().toEqualTypeOf<'id' | 'courseId' | 'name' | 'state' | 'revision' | 'periodStart' | 'periodEnd' | 'timeZone'
    | 'capacity' | 'occupancy' | 'availability' | 'capacityStatus' | 'schedule' | 'teacher' | 'teacherReviewRequired' | 'studentVisible'
    | 'cancellationReason' | 'cancelledAt' | 'lastPublishedTeacherId' | 'createdAt' | 'updatedAt'>();
  expectTypeOf<keyof CatalogCourse>().toEqualTypeOf<'id' | 'name' | 'description'>();
  expectTypeOf<keyof CatalogGroup>().toEqualTypeOf<'id' | 'courseId' | 'name' | 'periodStart' | 'periodEnd' | 'timeZone'
    | 'capacity' | 'occupancy' | 'availability' | 'capacityStatus' | 'schedule' | 'teacher'>();
  expectTypeOf<keyof TeachingGroup>().toEqualTypeOf<'id' | 'course' | 'name' | 'state' | 'periodStart' | 'periodEnd' | 'timeZone'
    | 'capacity' | 'occupancy' | 'availability' | 'capacityStatus' | 'schedule' | 'teacher'>();
  expectTypeOf<CatalogGroup['teacher']>().toEqualTypeOf<{ readonly name: string }>();
  expectTypeOf<TeachingGroup['teacher']>().toEqualTypeOf<{ readonly name: string }>();
  expectTypeOf<keyof NonNullable<AdminGroup['teacher']>>().toEqualTypeOf<'id' | 'name' | 'eligible'>();
  expectTypeOf<keyof TeacherCandidate>().toEqualTypeOf<'id' | 'name'>();
});

test('C02 revisiones JSON decimales, sin capacidad de inscripción ficticia', () => {
  expectTypeOf<Revision>().toEqualTypeOf<string>();
  expectTypeOf<CommandResult['command']['appliedRevision']>().toEqualTypeOf<Revision>();
  expectTypeOf<CatalogGroup['occupancy'] | CatalogGroup['availability']>().toEqualTypeOf<null>();
  expectTypeOf<AdminGroup['capacityStatus']>().toEqualTypeOf<'NOT_CALCULATED'>();
  expectTypeOf<CatalogGroup['capacity']>().toEqualTypeOf<number>();
  expectTypeOf<TeachingGroup['capacity']>().toEqualTypeOf<number | null>();
});

test('C03 comandos explícitos, revisión en recursos existentes y sin actualización de snapshot desde cliente', () => {
  expectTypeOf<OfferingCommand['operation']>().toEqualTypeOf<'COURSE_CREATE' | 'COURSE_EDIT' | 'COURSE_PUBLISH' | 'COURSE_WITHDRAW'
    | 'GROUP_CREATE' | 'GROUP_EDIT' | 'GROUP_SCHEDULE' | 'GROUP_PUBLISH' | 'GROUP_WITHDRAW' | 'GROUP_CANCEL'>();
  type Edit = Extract<OfferingCommand, { operation: 'GROUP_EDIT' }>;
  expectTypeOf<Edit['expectedRevision']>().toEqualTypeOf<string>();
  expectTypeOf<keyof Edit['changes']>().toEqualTypeOf<'name' | 'periodStart' | 'periodEnd' | 'timeZone' | 'capacity' | 'teacherUserId'>();
  expectTypeOf<Extract<OfferingCommand, { operation: 'GROUP_CREATE' }>['attributes']['capacity']>().toEqualTypeOf<number | undefined>();
  expectTypeOf<Parameters<OfferingStore['teachingGroups']>[1]>().toEqualTypeOf<{ readonly page: number; readonly pageSize: number }>();
});

test('C04 errores de negocio seguros; referencias solo en conflictos administrativos', () => {
  type References = Extract<OfferingErrorView, { code: 'TEACHER_SCHEDULE_CONFLICT' | 'COURSE_PUBLICATION_BLOCKED' }>;
  expectTypeOf<References['conflictingGroupIds']>().toEqualTypeOf<readonly string[] | undefined>();
  const failure: OfferingFailure = { code: 'TEMPORARILY_UNAVAILABLE' };
  const error = new OfferingError(failure);
  expect(error.code).toBe(failure.code); expect(error.message).toBe(OFFERING_ERROR_MESSAGES.TEMPORARILY_UNAVAILABLE);
  expect(error.message).not.toMatch(/no se aplicó/i);
  expect(Object.keys(OFFERING_ERROR_MESSAGES)).toHaveLength(12);
  // Estas asignaciones deben fallar también al comprobar tipos, no solo en Vitest.
  // @ts-expect-error un error de autorización no lleva referencias administrativas
  const denied: OfferingFailure = { code: 'FORBIDDEN', conflictingGroupIds: ['privado'] };
  // @ts-expect-error editar exige al menos un atributo modificable
  const empty: OfferingCommand = { operation: 'GROUP_EDIT', commandId: 'id', groupId: 'id', expectedRevision: '1', changes: {} };
  // @ts-expect-error null no configura capacidad; omitirla es distinto
  const invalidCapacity: OfferingCommand = { operation: 'GROUP_CREATE', commandId: 'id', courseId: 'id', attributes: { name: 'Grupo', capacity: null } };
  // @ts-expect-error una transición existente requiere revisión
  const unversioned: OfferingCommand = { operation: 'GROUP_PUBLISH', commandId: 'id', groupId: 'id' };
  expect(denied.code).toBe('FORBIDDEN'); expect(empty.operation).toBe('GROUP_EDIT');
  expect(invalidCapacity.operation).toBe('GROUP_CREATE'); expect(unversioned.operation).toBe('GROUP_PUBLISH');
});
