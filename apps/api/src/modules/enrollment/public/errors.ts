/** Contrato puro de fallos; no registra rutas ni implementa decisiones de negocio. */
export type EnrollmentErrorCode = 'VALIDATION_ERROR' | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'REQUEST_NOT_ALLOWED'
  | 'NOT_FOUND' | 'IDEMPOTENCY_CONFLICT' | 'ENROLLMENT_VERSION_CONFLICT' | 'ACTIVE_ORDER_EXISTS'
  | 'COURSE_COMMITMENT_EXISTS' | 'OFFERING_NOT_RESERVABLE' | 'CAPACITY_UNAVAILABLE'
  | 'STUDENT_SCHEDULE_CONFLICT' | 'RESERVATION_EXPIRED' | 'PAYMENT_NOT_ALLOWED' | 'TEMPORARILY_UNAVAILABLE';
export type EnrollmentField = 'commandId' | 'expectedRevision' | 'amountMinor' | 'currency' | 'intentionId'
  | 'groupIds' | 'initiationId' | 'content' | 'page' | 'pageSize' | 'q' | 'studentId';
export interface EnrollmentFailure { readonly code: EnrollmentErrorCode; readonly fields?: readonly EnrollmentField[] }
/** Mensajes cerrados: no interpolar entradas, referencias o motivos privados. */
export const ENROLLMENT_ERROR_MESSAGES: Readonly<Record<EnrollmentErrorCode,string>> = {
  VALIDATION_ERROR:'Revisa los campos indicados.', AUTH_REQUIRED:'Debes iniciar sesión.', FORBIDDEN:'Acceso no permitido.',
  REQUEST_NOT_ALLOWED:'Solicitud no permitida.', NOT_FOUND:'Recurso no encontrado.',
  IDEMPOTENCY_CONFLICT:'El identificador ya corresponde a otra intención. Revisa el resultado antes de continuar.',
  ENROLLMENT_VERSION_CONFLICT:'La revisión cambió. Recarga y compara antes de guardar.',
  ACTIVE_ORDER_EXISTS:'Ya tienes una orden con reservas vigentes.', COURSE_COMMITMENT_EXISTS:'Ya tienes un compromiso vigente de ese curso.',
  OFFERING_NOT_RESERVABLE:'La oferta no permite esta operación.', CAPACITY_UNAVAILABLE:'No hay disponibilidad para el conjunto solicitado.',
  STUDENT_SCHEDULE_CONFLICT:'Los horarios coinciden con otro compromiso de la selección o propio.',
  RESERVATION_EXPIRED:'La reserva venció. Consulta el estado actualizado de la orden.', PAYMENT_NOT_ALLOWED:'La orden no permite iniciar otro pago.',
  TEMPORARILY_UNAVAILABLE:'No se pudo confirmar el resultado. Consúltalo antes de reintentar manualmente.',
};
export class EnrollmentError extends Error {
  readonly code: EnrollmentErrorCode;
  constructor(readonly failure: EnrollmentFailure) { super(ENROLLMENT_ERROR_MESSAGES[failure.code]); this.code = failure.code; }
}
export class EnrollmentCommandConflict extends EnrollmentError {
  constructor(code:'IDEMPOTENCY_CONFLICT'|'ENROLLMENT_VERSION_CONFLICT') { super({code}); }
}
