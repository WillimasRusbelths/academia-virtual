export const MATERIAL_ERROR_MESSAGES = {
  VALIDATION_ERROR: 'Revisa los datos o el archivo del material.',
  AUTH_REQUIRED: 'Debes iniciar sesión.',
  FORBIDDEN: 'Acceso no permitido.',
  REQUEST_NOT_ALLOWED: 'Solicitud no permitida.',
  NOT_FOUND: 'Recurso no encontrado.',
  MATERIAL_VERSION_CONFLICT: 'El material cambió. Consulta su versión actual.',
  MATERIAL_STATE_CONFLICT: 'La acción no está disponible en el estado actual.',
  IDEMPOTENCY_CONFLICT: 'La identidad de operación ya corresponde a otra intención.',
  UNSUPPORTED_MEDIA_TYPE: 'Tipo de contenido no admitido.',
  RATE_LIMITED: 'Espera antes de volver a intentarlo.',
  TEMPORARILY_UNAVAILABLE: 'Servicio temporalmente no disponible. Consulta el resultado antes de repetirlo.',
} as const;
export type MaterialErrorCode = keyof typeof MATERIAL_ERROR_MESSAGES;
export const MATERIAL_FIELDS = ['title', 'description', 'downloadName', 'mediaType', 'byteSize', 'sha256',
  'intentionId', 'commandId', 'expectedRevision', 'state', 'page', 'pageSize'] as const;
export type MaterialField = typeof MATERIAL_FIELDS[number];
export class MaterialError extends Error {
  constructor(readonly code: MaterialErrorCode,
    readonly fields?: readonly MaterialField[], readonly retryAfterSeconds?: number,
    readonly status?: 413) { super(MATERIAL_ERROR_MESSAGES[code]); }
}
