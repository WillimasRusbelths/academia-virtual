export const CLASS_ERROR_MESSAGES = {
  VALIDATION_ERROR: 'Revisa los datos de la clase.',
  AUTH_REQUIRED: 'Debes iniciar sesión.',
  FORBIDDEN: 'Acceso no permitido.',
  REQUEST_NOT_ALLOWED: 'Solicitud no permitida.',
  NOT_FOUND: 'Recurso no encontrado.',
  CLASS_VERSION_CONFLICT: 'La clase cambió. Consulta su versión actual.',
  CLASS_STATE_CONFLICT: 'La acción no está disponible en el estado actual.',
  CLASS_ALREADY_LIVE: 'El grupo ya tiene una clase en curso.',
  IDEMPOTENCY_CONFLICT: 'La identidad de operación ya corresponde a otra intención.',
  CHAT_SYNC_REQUIRED: 'Actualiza el estado de la conversación.',
  CHAT_MUTED: 'No puedes enviar mensajes mientras estés silenciado en esta clase.',
  UNSUPPORTED_MEDIA_TYPE: 'Tipo de contenido no admitido.',
  RATE_LIMITED: 'Espera antes de volver a intentarlo.',
  TEMPORARILY_UNAVAILABLE: 'Servicio temporalmente no disponible. Consulta el resultado antes de repetirlo.',
} as const;
export type ClassErrorCode = keyof typeof CLASS_ERROR_MESSAGES;
export const CLASS_FIELDS = ['title', 'description', 'commandId', 'expectedRevision', 'text', 'videoId',
  'state', 'page', 'pageSize', 'beforeSeq', 'after', 'limit'] as const;
export type ClassField = typeof CLASS_FIELDS[number];
export class ClassError extends Error {
  constructor(readonly code: ClassErrorCode, readonly fields?: readonly ClassField[],
    readonly retryAfterSeconds?: number, readonly status?: 413) { super(CLASS_ERROR_MESSAGES[code]); }
}
