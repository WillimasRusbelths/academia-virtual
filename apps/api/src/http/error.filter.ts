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
import { MailAdmissionLimited } from '../modules/identity/application/issue-action-link.js';
import { InvalidActionLink } from '../modules/identity/application/verify-email.js';
import { UserNotFound, UserQueryInvalid } from '../modules/users/application/list-users.js';
import { AccountConflict } from '../modules/identity/application/create-account.js';
import { AdminInvariant } from '../modules/identity/domain/account-administration.js';
import { AccessTargetMissing, AccessCommandInvalid } from '../modules/identity/application/change-access.js';
import { OfferingError, OFFERING_ERROR_MESSAGES } from '../modules/academic-offering/public/offer.js';
import { academicRouteTargets } from '../infrastructure/logging/security-events.js';
import type { Role } from '../modules/users/public/account.js';
import { EnrollmentError, ENROLLMENT_ERROR_MESSAGES } from '../modules/enrollment/public/errors.js';
import { enrollmentRoute, enrollmentFamily, enrollmentConflictCodes } from '../infrastructure/http/enrollment-contract.js';

export class TransportFailure extends Error {
  constructor(readonly status: number, readonly code: string,
    readonly fields?: { field: string; message: string }[]) { super('Solicitud no aceptada.'); }
}

export interface HttpRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  requestId?: string;
  actor?: { userId: string; role?: Role };
  params?: Record<string, unknown>;
  /** Solo metadatos de enrutamiento Express y contexto validado por el servidor. */
  route?: { path?: unknown };
  commandId?: string;
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
  403:['FORBIDDEN','REQUEST_NOT_ALLOWED'],404:['NOT_FOUND'],409:['ACCOUNT_CONFLICT','ADMIN_INVARIANT',
    'OFFERING_VERSION_CONFLICT','OFFERING_STATE_CONFLICT','TEACHER_NOT_ELIGIBLE','TEACHER_SCHEDULE_CONFLICT',
    'COURSE_PUBLICATION_BLOCKED','GROUP_COMMITMENTS_BLOCK_OPERATION','IDEMPOTENCY_CONFLICT'],
  413:['VALIDATION_ERROR'],415:['UNSUPPORTED_MEDIA_TYPE'],429:['RATE_LIMITED'],503:['TEMPORARILY_UNAVAILABLE'],
};
const fieldNames=['name','email','password','provisionalPassword','newPassword','role','status','token'];
const academicFields=['name','description','periodStart','periodEnd','timeZone','capacity','teacherUserId','schedule',
  'cancellationReason','expectedRevision','commandId','q','state','page','pageSize'];
const academicStatuses = { VALIDATION_ERROR:400, AUTH_REQUIRED:401, FORBIDDEN:403, REQUEST_NOT_ALLOWED:403,
  NOT_FOUND:404, OFFERING_VERSION_CONFLICT:409, OFFERING_STATE_CONFLICT:409, TEACHER_NOT_ELIGIBLE:409,
  TEACHER_SCHEDULE_CONFLICT:409, COURSE_PUBLICATION_BLOCKED:409, GROUP_COMMITMENTS_BLOCK_OPERATION:409, IDEMPOTENCY_CONFLICT:409, TEMPORARILY_UNAVAILABLE:503 };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    let conflictingGroupIds: string[] | undefined;
    const template = typeof request.route?.path === 'string' ? request.route.path.replace(/^\/api\/v1(?=\/)/, '') : '';
    const route = Object.hasOwn(academicRouteTargets, template) ? academicRouteTargets[template] : undefined;
    const academic = route !== undefined || error instanceof OfferingError;
    const enrollment = enrollmentRoute(request.method,template);
    const financial = enrollment !== undefined || enrollmentFamily(template) || error instanceof EnrollmentError;
    const financialAudience = enrollment !== undefined && request.actor?.role === enrollment.role;
    if (error instanceof EnrollmentError) {
      code = error.code;
      status = code==='VALIDATION_ERROR'?400:code==='AUTH_REQUIRED'?401:code==='FORBIDDEN'||code==='REQUEST_NOT_ALLOWED'?403:
        code==='NOT_FOUND'?404:enrollmentConflictCodes.includes(error.code)?409:503;
      if(code==='VALIDATION_ERROR'&&Array.isArray(error.failure.fields))fields=error.failure.fields
        .filter(field=>typeof field==='string').map(field=>({field,message:'Campo inválido.'}));
    } else if (error instanceof OfferingError) {
      code = error.code; status = Object.hasOwn(academicStatuses, error.code) ? academicStatuses[error.code] : 503;
      const failure = error.failure;
      if ((failure.code === 'VALIDATION_ERROR' || failure.code === 'TEACHER_NOT_ELIGIBLE') && Array.isArray(failure.fields)) {
        const allowed = failure.code === 'TEACHER_NOT_ELIGIBLE' ? ['teacherUserId'] : academicFields;
        fields = [...new Set(failure.fields.filter(field => typeof field === 'string' && allowed.includes(field)))]
          .map(field => ({ field, message: 'Campo inválido.' }));
      }
      if (request.actor?.role === 'ADMIN' && route && template.startsWith('/admin/academic/')
        && (failure.code === 'TEACHER_SCHEDULE_CONFLICT' || failure.code === 'COURSE_PUBLICATION_BLOCKED')
        && Array.isArray(failure.conflictingGroupIds)) {
        conflictingGroupIds = [...new Set(failure.conflictingGroupIds.filter(id => typeof id === 'string' && uuid.test(id)))];
      }
    }else if(error instanceof InvalidCredentials) {
      status=401;code='INVALID_CREDENTIALS';
    }else if(error instanceof LoginLimited || error instanceof MailAdmissionLimited) {
      status=429;code='RATE_LIMITED';response.setHeader('Retry-After',String(error.retryAfterSeconds));
    }else if(error instanceof InvalidActionLink) {
      status=400;code='INVALID_ACTION_LINK';
    }else if(error instanceof AccountConflict||error instanceof AdminInvariant) {
      status=409;code=error.code;
    }else if(error instanceof UserNotFound||error instanceof AccessTargetMissing) {
      status=404;code='NOT_FOUND';
    }else if(error instanceof UserQueryInvalid||error instanceof AccessCommandInvalid) {
      status=400;code='VALIDATION_ERROR';
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
    const permitted:readonly string[]|undefined = financial ? status===409 && financialAudience ? enrollment.conflicts :
      ({400:['VALIDATION_ERROR'],401:['AUTH_REQUIRED'],403:['FORBIDDEN','REQUEST_NOT_ALLOWED'],404:['NOT_FOUND'],
        413:['VALIDATION_ERROR'],415:['UNSUPPORTED_MEDIA_TYPE'],429:['RATE_LIMITED'],503:['TEMPORARILY_UNAVAILABLE']} as Record<number,readonly string[]>)[status] : codes[status];
    if (!permitted?.includes(code)) { status=503;code='TEMPORARILY_UNAVAILABLE'; }
    if(financial){
      const allowed:readonly string[]=status===400&&code==='VALIDATION_ERROR'&&financialAudience?enrollment.fields:[];
      const names=Array.isArray(fields)?[...new Set(fields.flatMap(value=>value&&typeof value.field==='string'&&allowed.includes(value.field)?[value.field]:[]))]:[];
      fields=names.length?names.map(field=>({field,message:'Campo inválido.'})):undefined;
      conflictingGroupIds=undefined;
    } else if (fields) fields=(status === 400 && code === 'VALIDATION_ERROR' || status === 409 && code === 'TEACHER_NOT_ELIGIBLE') && Array.isArray(fields)
      ?fields.filter(field => field && typeof field.field==='string' && (code === 'TEACHER_NOT_ELIGIBLE'
        ?field.field === 'teacherUserId':(academic?academicFields:fieldNames).includes(field.field)))
        .map(field => ({field:field.field,message:'Campo inválido.'})):undefined;
    const requestId = typeof request.requestId==='string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.requestId)
      ?request.requestId:randomUUID();
    if ([401,403,429,503].includes(status) || status===409) {
      const authentication = status===401 && code==='INVALID_CREDENTIALS';
      try {
        this.logs.record({category:status===503?'OPERATION':'SECURITY',
          action:status===503?'RUNTIME_FAILURE':status===409?financial?'ENROLLMENT_COMMAND_REJECTED':'ADMIN_COMMAND_REJECTED':authentication?'AUTHENTICATION_FAILED':'ACCESS_DENIED',
          result:status===503?'FAILED':'DENIED',reasonCode:code,
          actorKind:request.actor && !authentication?'ACCOUNT':'ANONYMOUS',
          ...(request.actor && !authentication?{actorUserId:request.actor.userId}:{}),
          targetKind:financial?enrollment?.targetKind??'NONE':route?.kind ?? (!academic && request.params?.id!==undefined?'USER_REFERENCE':'NONE'),
          ...(financial?enrollment?.param&&request.params?.[enrollment.param]!==undefined?{requestedTargetId:request.params[enrollment.param]}:{}:
            route?.param && request.params?.[route.param]!==undefined?{requestedTargetId:request.params[route.param]}
              :!academic && request.params?.id!==undefined?{requestedTargetId:request.params.id}:{}),
          ...(financial?enrollment?{routeTemplate:template}:{}:route?{routeTemplate:template}:{}),
          ...((financial?enrollment?.command&&financialAudience:academic) && request.actor && typeof request.commandId==='string' && uuid.test(request.commandId)?{commandId:request.commandId}:{})},requestId);
      } catch { /* El canal privado nunca cambia la respuesta pública. */ }
    }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const message = financial && Object.hasOwn(ENROLLMENT_ERROR_MESSAGES,code)
      ? ENROLLMENT_ERROR_MESSAGES[code as keyof typeof ENROLLMENT_ERROR_MESSAGES] : academic && Object.hasOwn(OFFERING_ERROR_MESSAGES,code)
      ? OFFERING_ERROR_MESSAGES[code as keyof typeof OFFERING_ERROR_MESSAGES] : messages[status] ?? 'Solicitud no aceptada.';
    response.status(status).json({ error: { code, message, requestId, ...(fields ? { fields } : {}),
      ...(status === 409 && conflictingGroupIds ? { conflictingGroupIds } : {}) } });
  }
}
