export type ApiCode = 'VALIDATION_ERROR' | 'INVALID_ACTION_LINK' | 'INVALID_CREDENTIALS' | 'AUTH_REQUIRED'
  | 'REQUEST_NOT_ALLOWED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ACCOUNT_CONFLICT' | 'ADMIN_INVARIANT'
  | 'UNSUPPORTED_MEDIA_TYPE' | 'RATE_LIMITED' | 'TEMPORARILY_UNAVAILABLE';
export type ApiField = 'name' | 'email' | 'password' | 'provisionalPassword' | 'newPassword' | 'role' | 'status' | 'token';
export class ApiFailure extends Error {
  constructor(readonly status:number,readonly code:ApiCode,message:string,
    readonly retryAfterSeconds?:number,readonly fields:readonly ApiField[] = []) { super(message); }
}
export class RequestCancelled extends Error {
  constructor() { super('Solicitud cancelada. No se reenvió ninguna acción.'); }
}
export interface ApiRequest {
  readonly method?:'GET' | 'POST' | 'PATCH' | 'PUT';
  readonly body?:Readonly<Record<string,unknown>>;
  readonly signal?:AbortSignal;
}
/** Las features reciben esta capacidad desde app, sin importar su implementación. */
export interface ApiClient {
  request<T>(path:string,options?:ApiRequest):Promise<T|undefined>;
}
