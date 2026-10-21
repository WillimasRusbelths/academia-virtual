export type ApiCode = 'VALIDATION_ERROR' | 'INVALID_ACTION_LINK' | 'INVALID_CREDENTIALS' | 'AUTH_REQUIRED'
  | 'REQUEST_NOT_ALLOWED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ACCOUNT_CONFLICT' | 'ADMIN_INVARIANT'
  | 'UNSUPPORTED_MEDIA_TYPE' | 'RATE_LIMITED' | 'TEMPORARILY_UNAVAILABLE'
  | 'OFFERING_VERSION_CONFLICT' | 'OFFERING_STATE_CONFLICT' | 'TEACHER_NOT_ELIGIBLE'
  | 'TEACHER_SCHEDULE_CONFLICT' | 'COURSE_PUBLICATION_BLOCKED' | 'IDEMPOTENCY_CONFLICT';
export type ApiField = 'name' | 'email' | 'password' | 'provisionalPassword' | 'newPassword' | 'role' | 'status' | 'token'
  | 'description' | 'periodStart' | 'periodEnd' | 'timeZone' | 'capacity' | 'teacherUserId' | 'schedule'
  | 'cancellationReason' | 'expectedRevision' | 'commandId' | 'q' | 'state' | 'page' | 'pageSize';
export class ApiFailure extends Error {
  constructor(readonly status:number,readonly code:ApiCode,message:string,
    readonly retryAfterSeconds?:number,readonly fields:readonly ApiField[] = [],
    readonly conflictingGroupIds:readonly string[] = []) { super(message); }
}
export class RequestCancelled extends Error {
  constructor() { super('Solicitud cancelada. No se reenvió ninguna acción.'); }
}
export interface ApiRequest {
  readonly method?:'GET' | 'POST' | 'PATCH' | 'PUT';
  readonly body?:Readonly<Record<string,unknown>>;
  readonly signal?:AbortSignal;
  readonly query?:Readonly<Record<string,string|number|undefined>>;
}
/** Las features reciben esta capacidad desde app, sin importar su implementación. */
export interface ApiClient {
  request<T>(path:string,options?:ApiRequest):Promise<T|undefined>;
}
