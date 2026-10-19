/** Catálogo seguro. No recibe texto de entrada, SQL ni mensajes del driver. */
export const OFFERING_ERROR_MESSAGES = {
  VALIDATION_ERROR: 'Revisa los campos indicados.',
  AUTH_REQUIRED: 'Debes iniciar sesión.',
  FORBIDDEN: 'Acceso no permitido.',
  REQUEST_NOT_ALLOWED: 'Solicitud no permitida.',
  NOT_FOUND: 'Recurso no encontrado.',
  OFFERING_VERSION_CONFLICT: 'La oferta cambió. Recarga y compara antes de guardar.',
  OFFERING_STATE_CONFLICT: 'El estado no permite esta operación. Revisa el retiro previo o la cancelación.',
  TEACHER_NOT_ELIGIBLE: 'Selecciona un docente habilitado.',
  TEACHER_SCHEDULE_CONFLICT: 'El horario coincide con otro grupo publicado del docente.',
  COURSE_PUBLICATION_BLOCKED: 'Revisa los grupos publicados antes de publicar el curso.',
  IDEMPOTENCY_CONFLICT: 'El identificador ya corresponde a otro comando. Revisa la intención.',
  TEMPORARILY_UNAVAILABLE: 'Servicio temporalmente no disponible. Comprueba el estado antes de reintentar.',
} as const;

export type OfferingErrorCode = keyof typeof OFFERING_ERROR_MESSAGES;
export type OfferingField = 'name' | 'description' | 'periodStart' | 'periodEnd' | 'timeZone' | 'capacity'
  | 'teacherUserId' | 'schedule' | 'cancellationReason' | 'expectedRevision' | 'commandId' | 'q' | 'state' | 'page' | 'pageSize';
export type AdministrativeConflictCode = 'TEACHER_SCHEDULE_CONFLICT' | 'COURSE_PUBLICATION_BLOCKED';
export type OfferingFailure =
  | { readonly code: 'VALIDATION_ERROR'; readonly fields?: readonly OfferingField[] }
  | { readonly code: 'TEACHER_NOT_ELIGIBLE'; readonly fields?: readonly ['teacherUserId'] }
  | { readonly code: AdministrativeConflictCode; readonly conflictingGroupIds?: readonly string[] }
  | { readonly code: Exclude<OfferingErrorCode, 'VALIDATION_ERROR' | 'TEACHER_NOT_ELIGIBLE' | AdministrativeConflictCode> };

export class OfferingError extends Error {
  readonly code: OfferingErrorCode;
  constructor(readonly failure: OfferingFailure) {
    super(OFFERING_ERROR_MESSAGES[failure.code]);
    this.code = failure.code;
  }
}
