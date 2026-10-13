import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Environment } from '../infrastructure/config/environment.js';
import { SafeErrorFilter, TransportFailure, type HttpRequest, type HttpResponse } from './error.filter.js';
import { securityEvents } from '../infrastructure/logging/security-events.js';
import type { SecurityEvents } from '../infrastructure/logging/security-events.js';

/** Valida forma y tipos, sin convertir valores ni contener reglas del negocio. */
export function strictDto(body: unknown, schema: Record<string, (value: unknown) => boolean>): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new TransportFailure(400, 'VALIDATION_ERROR');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !Object.hasOwn(schema, key))) throw new TransportFailure(400, 'VALIDATION_ERROR');
  const fields = Object.entries(schema).filter(([key, valid]) => !valid(input[key]))
    .map(([field]) => ({ field, message: 'Campo inválido.' }));
  if (fields.length) throw new TransportFailure(400, 'VALIDATION_ERROR', fields);
  return input;
}

/** Crear Nest con bodyParser:false; no habilita CORS ni registra solicitudes. */
export function configureTransport(app: NestExpressApplication,
  environment: Pick<Environment, 'appOrigin' | 'trustedProxy'>,
  logs: Pick<SecurityEvents,'record'> = securityEvents): void {
  app.useLogger(false);
  app.getHttpAdapter().getInstance().set('trust proxy', environment.trustedProxy);
  app.useGlobalFilters(new SafeErrorFilter(logs));
  app.use((request: HttpRequest, response: HttpResponse, next: (error?: unknown) => void) => {
    request.requestId = randomUUID();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (request.method === 'OPTIONS') return next(new TransportFailure(403, 'REQUEST_NOT_ALLOWED'));
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
      const type = request.headers['content-type'];
      if (typeof type !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type)) return next(new TransportFailure(415, 'UNSUPPORTED_MEDIA_TYPE'));
      if (request.headers.origin !== environment.appOrigin || request.headers['x-csrf-protection'] !== '1'
        || request.headers['sec-fetch-site'] === 'cross-site') return next(new TransportFailure(403, 'REQUEST_NOT_ALLOWED'));
    }
    next();
  });
  app.useBodyParser('json', { limit: 16 * 1024, strict: true });
  app.use((error: { type?: string }, _request: HttpRequest, _response: HttpResponse, next: (error?: unknown) => void) => {
    if (error.type === 'entity.too.large') next(new TransportFailure(413, 'VALIDATION_ERROR'));
    else if (error.type === 'entity.parse.failed') next(new TransportFailure(400, 'VALIDATION_ERROR'));
    else if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') next(new TransportFailure(415, 'UNSUPPORTED_MEDIA_TYPE'));
    else next(error);
  });
}
