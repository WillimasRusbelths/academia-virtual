import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync, readdirSync, lstatSync, unlinkSync, openSync, fchmodSync, writeSync, closeSync, constants } from 'node:fs';
import path from 'node:path';
import { repositoryRoot } from '../config/environment.js';
import { enrollmentRouteContracts, enrollmentConflictCodes } from '../http/enrollment-contract.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = ['ACCESS_DENIED','AUTHENTICATION_FAILED','ADMIN_COMMAND_REJECTED','ENROLLMENT_COMMAND_REJECTED','BOOTSTRAP_ATTEMPT',
  'RESTORED_STATE_INVALIDATION','MAIL_DELIVERY_FAILED','RUNTIME_FAILURE'] as const;
const academicReasons = ['OFFERING_VERSION_CONFLICT','OFFERING_STATE_CONFLICT','TEACHER_NOT_ELIGIBLE',
  'TEACHER_SCHEDULE_CONFLICT','COURSE_PUBLICATION_BLOCKED','GROUP_COMMITMENTS_BLOCK_OPERATION','IDEMPOTENCY_CONFLICT'];
const reasons = ['AUTH_REQUIRED','INVALID_CREDENTIALS','FORBIDDEN','REQUEST_NOT_ALLOWED','VALIDATION_ERROR','NOT_FOUND',
  'ACCOUNT_CONFLICT','ADMIN_INVARIANT','RATE_LIMITED','ALREADY_INITIALIZED','TEMPORARILY_UNAVAILABLE','SMTP_FAILURE','NONE',
  ...academicReasons,...enrollmentConflictCodes];
const enrollmentTargets = Object.fromEntries(Object.entries(enrollmentRouteContracts).map(([key,value])=>[key.slice(key.indexOf(' ')+1),value]));
const financialKinds = ['ORDER','ENROLLMENT','INCIDENT','RESERVATION_REQUEST'];
/** Plantillas del servidor, nunca URL/params recibidos. Sin prefijo /api/v1, como identidad. */
export const academicRouteTargets: Readonly<Record<string, { readonly kind: 'COURSE' | 'GROUP' | 'NONE'; readonly param?: string }>> = {
  '/admin/academic/courses': { kind: 'NONE' },
  '/admin/academic/courses/:id': { kind: 'COURSE', param: 'id' },
  '/admin/academic/courses/:id/publish': { kind: 'COURSE', param: 'id' },
  '/admin/academic/courses/:id/withdraw': { kind: 'COURSE', param: 'id' },
  '/admin/academic/courses/:courseId/groups': { kind: 'COURSE', param: 'courseId' },
  '/admin/academic/groups/:id': { kind: 'GROUP', param: 'id' },
  '/admin/academic/groups/:id/schedule': { kind: 'GROUP', param: 'id' },
  '/admin/academic/groups/:id/publish': { kind: 'GROUP', param: 'id' },
  '/admin/academic/groups/:id/withdraw': { kind: 'GROUP', param: 'id' },
  '/admin/academic/groups/:id/cancel': { kind: 'GROUP', param: 'id' },
  '/admin/academic/teachers': { kind: 'NONE' },
  '/academic/courses': { kind: 'NONE' },
  '/academic/courses/:id': { kind: 'COURSE', param: 'id' },
  '/academic/courses/:courseId/groups': { kind: 'COURSE', param: 'courseId' },
  '/academic/courses/:courseId/groups/:id': { kind: 'GROUP', param: 'id' },
  '/teaching/groups': { kind: 'NONE' },
  '/teaching/groups/:id': { kind: 'GROUP', param: 'id' },
};
const routes = ['/auth/login','/auth/register','/auth/logout','/auth/password/initial','/auth/password/forgot','/auth/password/reset',
  '/auth/verification/request','/auth/verification/confirm','/me','/home','/admin/users','/admin/users/:id',
  '/admin/users/:id/name','/admin/users/:id/role','/admin/users/:id/status', ...Object.keys(academicRouteTargets),...Object.keys(enrollmentTargets)];
const fields = ['category','action','result','reasonCode','actorKind','actorUserId','operatorRef','targetKind',
  'requestedTargetId','routeTemplate','counts','commandId'];
const warning = () => { try { console.warn('Registro privado no disponible. Detalles omitidos.'); } catch { /* no altera la operación */ } };
export const newCorrelationId = (): string => randomUUID();

/** Listas cerradas; no recibe Request, excepciones, payloads ni conexiones de BD. */
export class SecurityEvents {
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private readonly directory = path.join(repositoryRoot(),'apps/api/logs/security')) {}

  record(input: unknown, correlationId: string): boolean {
    try {
      const value = this.sanitize(input,correlationId);
      const now = new Date();
      this.rotate(now);
      const filename = path.join(this.directory,`${now.toISOString().slice(0,10)}.jsonl`);
      const fd = openSync(filename,constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,0o600);
      try {
        fchmodSync(fd,0o600);
        writeSync(fd,JSON.stringify({ eventId:randomUUID(),correlationId,occurredAt:now.toISOString(),...value })+'\n');
      } finally { closeSync(fd); }
      return true;
    } catch { warning(); return false; }
  }

  private sanitize(input: unknown, correlationId: string): Record<string, unknown> {
    if (typeof correlationId !== 'string' || !uuid.test(correlationId) || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
    const value = input as Record<string, unknown>;
    if (Object.keys(value).some(key => !fields.includes(key)) || typeof value.action !== 'string'
      || !actions.includes(value.action as typeof actions[number]) || typeof value.reasonCode !== 'string'
      || !reasons.includes(value.reasonCode) || typeof value.result !== 'string'
      || !['STARTED','SUCCEEDED','DENIED','FAILED'].includes(value.result)
      || typeof value.actorKind !== 'string' || typeof value.targetKind !== 'string') throw new Error();
    const security = ['ACCESS_DENIED','AUTHENTICATION_FAILED','ADMIN_COMMAND_REJECTED','ENROLLMENT_COMMAND_REJECTED'].includes(value.action);
    if (value.category !== (security?'SECURITY':'OPERATION')) throw new Error();
    if (value.actorKind === 'ACCOUNT') {
      if (typeof value.actorUserId !== 'string' || !uuid.test(value.actorUserId) || value.operatorRef !== undefined) throw new Error();
    } else if (value.actorKind === 'LOCAL_OPERATOR') {
      if (typeof value.operatorRef !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.operatorRef) || value.actorUserId !== undefined) throw new Error();
    } else if (!['ANONYMOUS','SYSTEM'].includes(value.actorKind) || value.actorUserId !== undefined || value.operatorRef !== undefined) throw new Error();
    const reference = ['USER_REFERENCE','COURSE','GROUP',...financialKinds].includes(value.targetKind);
    if (!['USER_REFERENCE','IDENTITY_SCOPE','COURSE','GROUP','NONE',...financialKinds].includes(value.targetKind)) throw new Error();
    const financialRoute=typeof value.routeTemplate==='string'&&Object.hasOwn(enrollmentTargets,value.routeTemplate)?enrollmentTargets[value.routeTemplate]:undefined;
    if(value.action==='ENROLLMENT_COMMAND_REJECTED'&&(!financialRoute||value.actorKind!=='ACCOUNT'))throw new Error();
    if (financialKinds.includes(value.targetKind) && !financialRoute) throw new Error();
    if (academicReasons.includes(value.reasonCode) && value.reasonCode!=='IDEMPOTENCY_CONFLICT' && !['COURSE','GROUP','NONE'].includes(value.targetKind)) throw new Error();
    if (value.reasonCode==='IDEMPOTENCY_CONFLICT' && !['COURSE','GROUP','NONE',...financialKinds].includes(value.targetKind)) throw new Error();
    if(enrollmentConflictCodes.some(code=>code===value.reasonCode)&&value.reasonCode!=='IDEMPOTENCY_CONFLICT'&&(!financialRoute||
      !Object.entries(enrollmentRouteContracts).some(([key,route])=>key.endsWith(' '+value.routeTemplate)&&route.conflicts.some(code=>code===value.reasonCode))))throw new Error();
    if (!reference && value.requestedTargetId !== undefined) throw new Error();
    if (value.commandId !== undefined && (typeof value.commandId !== 'string' || !uuid.test(value.commandId)
      || value.actorKind !== 'ACCOUNT' || !['COURSE','GROUP','NONE',...financialKinds].includes(value.targetKind)
      || financialRoute&&!financialRoute.command)) throw new Error();
    if (['BOOTSTRAP_ATTEMPT','RESTORED_STATE_INVALIDATION'].includes(value.action)
      && (value.actorKind !== 'LOCAL_OPERATOR' || value.targetKind !== 'IDENTITY_SCOPE')) throw new Error();
    if (value.reasonCode === 'NOT_FOUND' && (value.actorKind !== 'ACCOUNT' || value.action !== 'ADMIN_COMMAND_REJECTED')) throw new Error();
    if (value.action === 'AUTHENTICATION_FAILED' && (value.actorKind !== 'ANONYMOUS' || value.reasonCode !== 'INVALID_CREDENTIALS')) throw new Error();
    if (value.routeTemplate !== undefined && (typeof value.routeTemplate !== 'string' || !routes.includes(value.routeTemplate))) throw new Error();
    if (typeof value.routeTemplate === 'string' && Object.hasOwn(academicRouteTargets, value.routeTemplate)
      && value.targetKind !== academicRouteTargets[value.routeTemplate].kind) throw new Error();
    if(financialRoute&&value.targetKind!==financialRoute.targetKind)throw new Error();
    let counts: Record<string, unknown> | undefined;
    if (value.counts !== undefined) {
      if (value.action !== 'RESTORED_STATE_INVALIDATION' || value.result !== 'SUCCEEDED'
        || !value.counts || typeof value.counts !== 'object' || Array.isArray(value.counts)) throw new Error();
      const data=value.counts as Record<string, unknown>;
      if (Object.keys(data).sort().join(',') !== 'mail,sessions,tokens'
        || Object.values(data).some(count => typeof count !== 'number' || !Number.isSafeInteger(count) || count<0)) throw new Error();
      counts={sessions:data.sessions,tokens:data.tokens,mail:data.mail};
    }
    // Copia explícita: ni spread del input ni serialización de errores externos.
    return { category:value.category,action:value.action,result:value.result,reasonCode:value.reasonCode,
      actorKind:value.actorKind,targetKind:value.targetKind,
      ...(value.actorKind==='ACCOUNT'?{actorUserId:value.actorUserId}:{}),
      ...(value.actorKind==='LOCAL_OPERATOR'?{operatorRef:value.operatorRef}:{}),
      ...(reference && typeof value.requestedTargetId==='string' && uuid.test(value.requestedTargetId)
        ?{requestedTargetId:value.requestedTargetId}:{}),
      ...(value.commandId !== undefined?{commandId:value.commandId}:{}),
      ...(value.routeTemplate?{routeTemplate:value.routeTemplate}:{}),...(counts?{counts}:{}) };
  }

  private rotate(now: Date): void {
    mkdirSync(this.directory,{recursive:true,mode:0o700});
    if (lstatSync(this.directory).isSymbolicLink()) throw new Error();
    chmodSync(this.directory,0o700);
    // Conserva hoy y los 29 días UTC anteriores: nunca conserva un día completo de 30 días de edad.
    const day=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
    const cutoff=day-29*24*60*60_000;
    for (const filename of readdirSync(this.directory)) {
      if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(filename)) continue;
      const file=path.join(this.directory,filename);
      if (lstatSync(file).isFile() && Date.parse(filename.slice(0,10)+'T00:00:00Z')<cutoff) unlinkSync(file);
    }
  }

  onApplicationBootstrap(): void {
    if (this.timer) return;
    try { this.rotate(new Date()); } catch { warning(); }
    this.scheduleRotation();
  }
  private scheduleRotation(): void {
    const now=new Date();const next=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1);
    this.timer=setTimeout(() => {
      try { this.rotate(new Date()); } catch { warning(); }
      this.scheduleRotation();
    },next-now.getTime());
    this.timer.unref();
  }
  onApplicationShutdown(): void { clearTimeout(this.timer);this.timer=undefined; }
}

export const securityEvents = new SecurityEvents();
