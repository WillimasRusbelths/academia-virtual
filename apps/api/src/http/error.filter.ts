import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthorizationFailure, SessionStoreUnavailable } from '../modules/authorization/public/session.js';
import { AccountValidationError } from '../modules/users/public/account.js';
import { CredentialOverload, CredentialUnavailable } from '../modules/identity/application/credentials.js';
import { RateStoreUnavailable } from '../infrastructure/limits/rate-store.js';

export class TransportFailure extends Error {
  constructor(readonly status: number, readonly code: string,
    readonly fields?: { field: string; message: string }[]) { super('Solicitud no aceptada.'); }
}

export interface HttpRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  requestId?: string;
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
};

/** Lista permitida de salida: jamás serializa causas, cuerpos o mensajes de adaptadores. */
@Catch()
export class SafeErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();
    let status = 503;
    let code = 'TEMPORARILY_UNAVAILABLE';
    let fields: { field: string; message: string }[] | undefined;
    if (error instanceof AuthorizationFailure) {
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
    const requestId = request.requestId ?? randomUUID();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.status(status).json({ error: { code, message: messages[status] ?? 'Solicitud no aceptada.',
      requestId, ...(fields ? { fields } : {}) } });
  }
}
