import { ApiFailure, RequestCancelled } from '../shared/api-client';
import type { ApiClient, ApiCode, ApiField, ApiRequest } from '../shared/api-client';

const codes:Readonly<Record<number,readonly ApiCode[]>> = {
  400:['VALIDATION_ERROR','INVALID_ACTION_LINK'],401:['INVALID_CREDENTIALS','AUTH_REQUIRED'],
  403:['REQUEST_NOT_ALLOWED','FORBIDDEN'],404:['NOT_FOUND'],409:['ACCOUNT_CONFLICT','ADMIN_INVARIANT'],
  413:['VALIDATION_ERROR'],415:['UNSUPPORTED_MEDIA_TYPE'],429:['RATE_LIMITED'],503:['TEMPORARILY_UNAVAILABLE'],
};
const messages:Readonly<Record<ApiCode,string>> = {
  VALIDATION_ERROR:'Revisa los campos indicados.',INVALID_ACTION_LINK:'El enlace no permite completar esta acción.',
  INVALID_CREDENTIALS:'No se pudo iniciar el acceso con esas credenciales.',AUTH_REQUIRED:'Debes volver a iniciar sesión.',
  REQUEST_NOT_ALLOWED:'Solicitud no permitida.',FORBIDDEN:'No tienes permiso para esta acción.',NOT_FOUND:'Recurso no encontrado.',
  ACCOUNT_CONFLICT:'No se pudo crear la cuenta con esos datos.',ADMIN_INVARIANT:'El cambio solicitado no está permitido.',
  UNSUPPORTED_MEDIA_TYPE:'No se pudo enviar la solicitud.',RATE_LIMITED:'Espera antes de volver a intentarlo.',
  TEMPORARILY_UNAVAILABLE:'Servicio temporalmente no disponible. Puedes reintentar manualmente.',
  OFFERING_VERSION_CONFLICT:'La oferta cambió. Recarga y compara antes de guardar.',
  OFFERING_STATE_CONFLICT:'El estado no permite esta operación. Revisa el retiro previo o la cancelación.',
  TEACHER_NOT_ELIGIBLE:'Selecciona un docente habilitado.',
  TEACHER_SCHEDULE_CONFLICT:'El horario coincide con otro grupo publicado del docente.',
  COURSE_PUBLICATION_BLOCKED:'Revisa los grupos publicados antes de publicar el curso.',
  IDEMPOTENCY_CONFLICT:'El identificador ya corresponde a otro comando. Revisa la intención.',
};
const fieldNames:readonly ApiField[] = ['name','email','password','provisionalPassword','newPassword','role','status','token'];
const academicFields:readonly ApiField[] = ['name','description','periodStart','periodEnd','timeZone','capacity','teacherUserId','schedule',
  'cancellationReason','expectedRevision','commandId','q','state','page','pageSize'];
const academicConflicts:readonly ApiCode[] = ['OFFERING_VERSION_CONFLICT','OFFERING_STATE_CONFLICT','TEACHER_NOT_ELIGIBLE',
  'TEACHER_SCHEDULE_CONFLICT','COURSE_PUBLICATION_BLOCKED','IDEMPOTENCY_CONFLICT'];
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidPattern=new RegExp('^'+uuid+'$','i');
const academicPath=new RegExp('^/admin/academic/(?:courses(?:/'+uuid+'(?:/groups|/publish)?)?|groups/'+uuid+'(?:/schedule|/publish)?|teachers)$','i');
const catalogPath=new RegExp('^/academic/courses(?:/'+uuid+'(?:/groups(?:/'+uuid+')?)?)?$','i');
function queryFields(path:string):readonly string[] {
  if(path==='/admin/users')return ['q','role','status','page','pageSize'];
  if(path==='/admin/academic/courses'||new RegExp('^/admin/academic/courses/'+uuid+'/groups$','i').test(path))return ['q','state','page','pageSize'];
  if(path==='/admin/academic/teachers')return ['q','page','pageSize'];
  if(path==='/academic/courses')return ['q','page','pageSize'];
  if(new RegExp('^/academic/courses/'+uuid+'/groups$','i').test(path))return ['page','pageSize'];
  return [];
}
function unavailable() { return new ApiFailure(503,'TEMPORARILY_UNAVAILABLE',messages.TEMPORARILY_UNAVAILABLE); }
function object(value:unknown):Record<string,unknown>|null {
  return value!==null && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:null;
}
async function failure(response:Response,path:string):Promise<ApiFailure> {
  let raw:unknown;
  try { raw = await response.json(); } catch { return unavailable(); }
  const error = object(object(raw)?.error);
  const code = error?.code;
  const adminAcademic=academicPath.test(path);const academic=adminAcademic||catalogPath.test(path);
  const allowedCodes=adminAcademic&&response.status===409?academicConflicts:
    academic&&response.status===400?['VALIDATION_ERROR']:
      academic&&response.status===401?['AUTH_REQUIRED']:codes[response.status];
  if (typeof code!=='string' || !allowedCodes?.includes(code as ApiCode)) return unavailable();
  const retry = response.status===429?response.headers.get('Retry-After'):null;
  const seconds = retry && /^\d+$/.test(retry) && Number.isSafeInteger(Number(retry))?Number(retry):undefined;
  const allowedFields=academic?(code==='VALIDATION_ERROR'?(adminAcademic?academicFields:queryFields(path)):adminAcademic&&code==='TEACHER_NOT_ELIGIBLE'?['teacherUserId']:[]):fieldNames;
  const fields = Array.isArray(error?.fields)?error.fields.flatMap(value => {
    const field = object(value)?.field;
    return typeof field==='string' && allowedFields.includes(field as ApiField)?[field as ApiField]:[];
  }):[];
  const conflicts=adminAcademic&&response.status===409&&['TEACHER_SCHEDULE_CONFLICT','COURSE_PUBLICATION_BLOCKED'].includes(code)
    &&Array.isArray(error?.conflictingGroupIds)?error.conflictingGroupIds.filter((id):id is string=>typeof id==='string'&&uuidPattern.test(id)).map(id=>id.toLowerCase()):[];
  return new ApiFailure(response.status,code as ApiCode,messages[code as ApiCode],seconds,[...new Set(fields)],Object.freeze([...new Set(conflicts)]));
}

/** Sin caché, almacenamiento de secretos ni replay. El navegador gestiona la cookie HttpOnly. */
export function createApiClient(onAuthRequired:()=>void, transport:typeof fetch = fetch):ApiClient {
  let generation = 0;
  const pending = new Set<AbortController>();
  return {
    async request<T>(path:string,options:ApiRequest = {}):Promise<T|undefined> {
      if (!/^\/[A-Za-z0-9/_-]+$/.test(path) || path.includes('//')) throw unavailable();
      const query=new URLSearchParams();
      if(options.query) {
        const allowed=queryFields(path);
        if(!allowed.length||(options.method??'GET')!=='GET')throw unavailable();
        for(const [key,value] of Object.entries(options.query)) {
          if(!allowed.includes(key))throw unavailable();
          if(value===undefined)continue;
          if(typeof value!=='string'&&(typeof value!=='number'||!Number.isFinite(value)))throw unavailable();
          query.set(key,String(value));
        }
      }
      const started = generation;const controller = new AbortController();pending.add(controller);
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort',abort,{once:true});
      if (options.signal?.aborted) abort();
      try {
        if (controller.signal.aborted) throw new RequestCancelled();
        const method = options.method??'GET';
        const response = await transport(`/api/v1${path}${query.size?'?'+query.toString():''}`,{method,credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',
          headers:method==='GET'?{Accept:'application/json'}:{Accept:'application/json','Content-Type':'application/json','X-CSRF-Protection':'1'},
          ...(method==='GET'?{}:{body:JSON.stringify(options.body??{})}),signal:controller.signal});
        if (controller.signal.aborted || generation!==started) throw new RequestCancelled();
        if (!response.ok) {
          const error = await failure(response,path);
          if (controller.signal.aborted || generation!==started) throw new RequestCancelled();
          if (error.code==='AUTH_REQUIRED') {
            generation++;
            for (const operation of pending) operation.abort();
            onAuthRequired();
          }
          throw error;
        }
        if (response.status===204 || response.status===202) return undefined;
        const body = object(await response.json());
        if (controller.signal.aborted || generation!==started) throw new RequestCancelled();
        if (!body || !Object.hasOwn(body,'data')) throw unavailable();
        return body.data as T;
      } catch (error) {
        if (error instanceof ApiFailure || error instanceof RequestCancelled) throw error;
        if (controller.signal.aborted || generation!==started) throw new RequestCancelled();
        throw unavailable();
      } finally { pending.delete(controller);options.signal?.removeEventListener('abort',abort); }
    },
  };
}
