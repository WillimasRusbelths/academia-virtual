import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthorizationFailure, SessionStoreUnavailable } from '../modules/authorization/public/session.js';
import { AccountValidationError } from '../modules/users/public/account.js';
import { CredentialOverload, CredentialUnavailable } from '../modules/identity/application/credentials.js';
import { RateStoreUnavailable } from '../infrastructure/limits/rate-store.js';
import { securityEvents } from '../infrastructure/logging/security-events.js';
import type { SecurityEvents } from '../infrastructure/logging/security-events.js';
import { InvalidCredentials, LoginLimited } from '../modules/identity/application/login.js';

export class TransportFailure extends Error {
  constructor(readonly status: number, readonly code: string,
    readonly fields?: { field: string; message: string }[]) { super('Solicitud no aceptada.'); }
}

export interface HttpRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  requestId?: string;
  actor?: { userId: string };
  params?: Record<string, unknown>;
}
export interface HttpResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  status(code: number): HttpResponse;
  json(body: unknown): void;
}

const messages: Record<number, string> = {
  400: 'Solicitud inválida.', 401: 'Debes iniciar sesión.', 403: 'Acceso no permitido.',
  404: 'Recurso no encontrado.', 413: 'El cuerpo supera el tamaño permitido.',
  415: 'Se requiere contenido JSON.', 503: 'Servicio temporalmente no disponible.',
  429: 'Espera antes de volver a intentarlo.',
};
const codes: Record<number, readonly string[]> = {
  400:['VALIDATION_ERROR','INVALID_ACTION_LINK'],401:['AUTH_REQUIRED','INVALID_CREDENTIALS'],
  403:['FORBIDDEN','REQUEST_NOT_ALLOWED'],404:['NOT_FOUND'],409:['ACCOUNT_CONFLICT','ADMIN_INVARIANT'],
  413:['VALIDATION_ERROR'],415:['UNSUPPORTED_MEDIA_TYPE'],429:['RATE_LIMITED'],503:['TEMPORARILY_UNAVAILABLE'],
};
const fieldNames=['name','email','password','provisionalPassword','newPassword','role','status','token'];

/** Lista permitida de salida: jamás serializa causas, cuerpos o mensajes de adaptadores. */
@Catch()
export class SafeErrorFilter implements ExceptionFilter {
  constructor(private readonly logs: Pick<SecurityEvents,'record'> = securityEvents) {}
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();
    let status = 503;
    let code = 'TEMPORARILY_UNAVAILABLE';
    let fields: { field: string; message: string }[] | undefined;
    if(error instanceof InvalidCredentials) {
      status=401;code='INVALID_CREDENTIALS';
    }else if(error instanceof LoginLimited) {
      status=429;code='RATE_LIMITED';response.setHeader('Retry-After',String(error.retryAfterSeconds));
    }else if (error instanceof AuthorizationFailure) {
      status = error.code === 'AUTH_REQUIRED' ? 401 : 403; code = error.code;
    } else if (error instanceof TransportFailure) {
      status = error.status; code = error.code; fields = error.fields;
    } else if (error instanceof AccountValidationError) {
      status = 400; code = 'VALIDATION_ERROR'; fields = [{ field: error.field, message: 'Campo inválido.' }];
    } else if (error instanceof SessionStoreUnavailable || error instanceof RateStoreUnavailable
      || error instanceof CredentialOverload || error instanceof CredentialUnavailable) {
      // Nunca se usa error.message o cause.
    } else if (error instanceof HttpException && error.getStatus() === 404) {
      status = 404; code = 'NOT_FOUND';
    }
    if (!codes[status]?.includes(code)) { status=503;code='TEMPORARILY_UNAVAILABLE'; }
    if (fields) fields=Array.isArray(fields)?fields.filter(field => field && typeof field.field==='string' && fieldNames.includes(field.field))
      .map(field => ({field:field.field,message:'Campo inválido.'})):undefined;
    const requestId = typeof request.requestId==='string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.requestId)
      ?request.requestId:randomUUID();
    if ([401,403,429,503].includes(status)) {
      const authentication = status===401 && code==='INVALID_CREDENTIALS';
      try {
        this.logs.record({category:status===503?'OPERATION':'SECURITY',
          action:status===503?'RUNTIME_FAILURE':authentication?'AUTHENTICATION_FAILED':'ACCESS_DENIED',
          result:status===503?'FAILED':'DENIED',reasonCode:code,
          actorKind:request.actor && !authentication?'ACCOUNT':'ANONYMOUS',
          ...(request.actor && !authentication?{actorUserId:request.actor.userId}:{}),
          targetKind:request.params?.id!==undefined?'USER_REFERENCE':'NONE',
          ...(request.params?.id!==undefined?{requestedTargetId:request.params.id}:{})},requestId);
      } catch { /* El canal privado nunca cambia la respuesta pública. */ }
    }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.status(status).json({ error: { code, message: messages[status] ?? 'Solicitud no aceptada.',
      requestId, ...(fields ? { fields } : {}) } });
  }
}
