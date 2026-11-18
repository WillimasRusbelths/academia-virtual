import { ApiFailure, RequestCancelled } from '../shared/api-client';
import type { ApiClient, ApiCode, ApiField, ApiRequest, BinaryUploadClient, BinaryDownloadClient, BinaryDownload } from '../shared/api-client';
import { createEnrollmentApi,createEnrollmentAdminApi } from '../features/enrollment/api';
import { createMaterialsApi } from '../features/materials/api';
import { createClassesApi } from '../features/classes/api';

export const enrollmentApi=(client:ApiClient)=>createEnrollmentApi(client);
export const enrollmentAdminApi=(client:ApiClient)=>createEnrollmentAdminApi(client);
export const materialsApi=(client:ApiClient)=>createMaterialsApi(client);
export const classesApi=(client:ApiClient)=>createClassesApi(client);

const codes:Readonly<Record<number,readonly ApiCode[]>> = {
  400:['VALIDATION_ERROR','INVALID_ACTION_LINK'],401:['INVALID_CREDENTIALS','AUTH_REQUIRED'],
  403:['REQUEST_NOT_ALLOWED','FORBIDDEN'],404:['NOT_FOUND'],409:['ACCOUNT_CONFLICT','ADMIN_INVARIANT'],
  413:['VALIDATION_ERROR'],415:['UNSUPPORTED_MEDIA_TYPE'],429:['RATE_LIMITED'],503:['TEMPORARILY_UNAVAILABLE'],
};
const messages:Readonly<Record<ApiCode,string>> = {
  CLASS_VERSION_CONFLICT:'La clase cambió. Consulta y compara antes de confirmar otra acción.',
  CLASS_STATE_CONFLICT:'El estado de la clase no permite esta acción.',
  CLASS_ALREADY_LIVE:'El grupo ya tiene una clase en curso. Consulta sus clases antes de iniciar otra.',
  MATERIAL_VERSION_CONFLICT:'El material cambió. Consulta su estado y compara antes de confirmar otra acción.',
  MATERIAL_STATE_CONFLICT:'El estado actual no permite esta acción.',
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
  GROUP_COMMITMENTS_BLOCK_OPERATION:'El grupo tiene compromisos vigentes o incidencias pendientes que impiden esta operación.',
  IDEMPOTENCY_CONFLICT:'El identificador ya corresponde a otro comando. Revisa la intención.',
  ENROLLMENT_VERSION_CONFLICT:'La revisión cambió. Recarga y compara antes de guardar.',
  ACTIVE_ORDER_EXISTS:'Ya tienes una orden con reservas vigentes.',COURSE_COMMITMENT_EXISTS:'Ya tienes un compromiso vigente de ese curso.',
  OFFERING_NOT_RESERVABLE:'La oferta no permite esta operación.',CAPACITY_UNAVAILABLE:'No hay disponibilidad para el conjunto solicitado.',
  STUDENT_SCHEDULE_CONFLICT:'Los horarios coinciden con otro compromiso de la selección o propio.',
  RESERVATION_EXPIRED:'La reserva venció. Consulta el estado actualizado de la orden.',PAYMENT_NOT_ALLOWED:'La orden no permite iniciar otro pago.',
};
const fieldNames:readonly ApiField[] = ['name','email','password','provisionalPassword','newPassword','role','status','token'];
const academicFields:readonly ApiField[] = ['name','description','periodStart','periodEnd','timeZone','capacity','teacherUserId','schedule',
  'cancellationReason','expectedRevision','commandId','q','state','page','pageSize'];
const academicConflicts:readonly ApiCode[] = ['OFFERING_VERSION_CONFLICT','OFFERING_STATE_CONFLICT','TEACHER_NOT_ELIGIBLE',
  'TEACHER_SCHEDULE_CONFLICT','COURSE_PUBLICATION_BLOCKED','GROUP_COMMITMENTS_BLOCK_OPERATION','IDEMPOTENCY_CONFLICT'];
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidPattern=new RegExp('^'+uuid+'$','i');
const academicPath=new RegExp('^/admin/academic/(?:courses(?:/'+uuid+'(?:/groups|/publish|/withdraw)?)?|groups/'+uuid+'(?:/schedule|/publish|/withdraw|/cancel)?|teachers)$','i');
const catalogPath=new RegExp('^/academic/courses(?:/'+uuid+'(?:/groups(?:/'+uuid+')?)?)?$','i');
const teachingPath=new RegExp('^/teaching/groups(?:/'+uuid+')?$','i');
interface EnrollmentContract {readonly fields:readonly ApiField[];readonly conflicts:readonly ApiCode[]}
const selectionConflicts:readonly ApiCode[]=['ACTIVE_ORDER_EXISTS','COURSE_COMMITMENT_EXISTS','OFFERING_NOT_RESERVABLE','CAPACITY_UNAVAILABLE','STUDENT_SCHEDULE_CONFLICT'];
/** Contratos de transporte; no implementan las pantallas o DTO de negocio futuros. */
function enrollmentContract(path:string,method:string):EnrollmentContract|undefined {
  const detail=(pattern:string)=>new RegExp('^'+pattern.replace(':id',uuid)+'$','i').test(path);
  const entry=(fields:readonly ApiField[]=[],conflicts:readonly ApiCode[]=[]):EnrollmentContract=>({fields,conflicts});
  if(detail('/admin/enrollment/courses/:id/price'))return method==='GET'?entry():method==='PUT'?entry(['commandId','expectedRevision','amountMinor','currency'],['IDEMPOTENCY_CONFLICT','ENROLLMENT_VERSION_CONFLICT']):undefined;
  if(method==='GET'){
    if(path==='/enrollment/offerings')return entry(['q','page','pageSize']);
    if(path==='/admin/enrollment/orders')return entry(['page','pageSize','studentId']);
    if(['/enrollment/reservation-requests','/enrollment/orders','/enrollment/enrollments','/admin/enrollment/incidents'].includes(path))return entry(['page','pageSize']);
    if(path==='/enrollment/orders/current'||['/enrollment/reservation-requests/:id','/enrollment/orders/:id','/enrollment/enrollments/:id','/admin/enrollment/orders/:id','/admin/enrollment/incidents/:id'].some(detail))return entry();
  }
  if(method==='POST'){
    if(path==='/enrollment/selection-preview')return entry(['groupIds'],selectionConflicts);
    if(path==='/enrollment/reservation-requests')return entry(['intentionId','groupIds'],[...selectionConflicts,'IDEMPOTENCY_CONFLICT']);
    if(detail('/enrollment/orders/:id/payment-attempts'))return entry(['initiationId'],['IDEMPOTENCY_CONFLICT','RESERVATION_EXPIRED','PAYMENT_NOT_ALLOWED']);
    if(detail('/admin/enrollment/incidents/:id/follow-ups'))return entry(['commandId','content'],['IDEMPOTENCY_CONFLICT']);
  }
  return undefined;
}
const enrollmentFamily=(path:string)=>/^\/(?:admin\/)?enrollment(?:\/|$)/.test(path);
const materialsFamily=(path:string)=>/^\/materials(?:\/|$)/.test(path);
function materialsContract(path:string,method:string):EnrollmentContract|undefined {
  const matches=(suffix:string)=>new RegExp('^/materials/'+suffix+'$','i').test(path);
  const entry=(fields:readonly ApiField[]=[],conflicts:readonly ApiCode[]=[]):EnrollmentContract=>({fields,conflicts});
  if(method==='GET') {
    if(path==='/materials/groups')return entry(['page','pageSize']);
    if(matches('groups/'+uuid+'/items'))return entry(['page','pageSize','state']);
    if(matches('(?:groups|uploads|items)/'+uuid))return entry();
    if(matches('items/'+uuid+'/content'))return entry();
  }
  if(method==='POST'&&matches('groups/'+uuid+'/uploads'))return entry(['intentionId','title','description','downloadName','mediaType','byteSize','sha256'],['IDEMPOTENCY_CONFLICT','MATERIAL_STATE_CONFLICT']);
  if(method==='PUT'&&matches('uploads/'+uuid+'/content'))return entry([],['IDEMPOTENCY_CONFLICT','MATERIAL_STATE_CONFLICT']);
  if(method==='POST'&&matches('items/'+uuid+'/(?:publish|withdraw)'))return entry(['commandId','expectedRevision'],['IDEMPOTENCY_CONFLICT','MATERIAL_STATE_CONFLICT','MATERIAL_VERSION_CONFLICT']);
  if(method==='PATCH'&&matches('items/'+uuid))return entry(['commandId','expectedRevision','title','description'],['IDEMPOTENCY_CONFLICT','MATERIAL_STATE_CONFLICT','MATERIAL_VERSION_CONFLICT']);
  return undefined;
}
const classesFamily=(path:string)=>/^\/classes(?:\/|$)/i.test(path);
function classesContract(path:string,method:string):EnrollmentContract|undefined {
  const matches=(suffix:string)=>new RegExp('^/classes/'+suffix+'$','i').test(path);
  const entry=(fields:readonly ApiField[]=[],conflicts:readonly ApiCode[]=[]):EnrollmentContract=>({fields,conflicts});
  if(method==='GET') {
    if(path==='/classes/groups')return entry(['page','pageSize']);
    if(matches('groups/'+uuid+'/sessions'))return entry(['page','pageSize','state']);
    if(matches('(?:groups|sessions|commands)/'+uuid))return entry();
  }
  if(method==='POST'&&matches('groups/'+uuid+'/sessions'))return entry(['commandId','title','description'],['CLASS_STATE_CONFLICT','IDEMPOTENCY_CONFLICT']);
  if(method==='PATCH'&&matches('sessions/'+uuid))return entry(['commandId','expectedRevision','title','description'],['CLASS_VERSION_CONFLICT','CLASS_STATE_CONFLICT','IDEMPOTENCY_CONFLICT']);
  if(method==='POST'&&matches('sessions/'+uuid+'/(?:start|finish|cancel)'))return entry(['commandId','expectedRevision'],
    ['CLASS_VERSION_CONFLICT','CLASS_STATE_CONFLICT','IDEMPOTENCY_CONFLICT',...(path.endsWith('/start')?['CLASS_ALREADY_LIVE' as const]:[])]);
  return undefined;
}
function queryFields(path:string):readonly string[] {
  const classes=classesContract(path,'GET');if(classes)return classes.fields;
  const materials=materialsContract(path,'GET');if(materials)return materials.fields;
  const financial=enrollmentContract(path,'GET');if(financial)return financial.fields;
  if(path==='/admin/users')return ['q','role','status','page','pageSize'];
  if(path==='/admin/academic/courses'||new RegExp('^/admin/academic/courses/'+uuid+'/groups$','i').test(path))return ['q','state','page','pageSize'];
  if(path==='/admin/academic/teachers')return ['q','page','pageSize'];
  if(path==='/academic/courses')return ['q','page','pageSize'];
  if(path==='/teaching/groups')return ['page','pageSize'];
  if(new RegExp('^/academic/courses/'+uuid+'/groups$','i').test(path))return ['page','pageSize'];
  return [];
}
const unconfirmed='No se pudo confirmar el resultado. Consúltalo antes de reintentar manualmente.';
function unavailable(path?:string) { return new ApiFailure(503,'TEMPORARILY_UNAVAILABLE',path&&(enrollmentFamily(path)||materialsFamily(path)||classesFamily(path))?unconfirmed:messages.TEMPORARILY_UNAVAILABLE); }
function object(value:unknown):Record<string,unknown>|null {
  return value!==null && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:null;
}
async function failure(response:Response,path:string,method:string):Promise<ApiFailure> {
  let raw:unknown;
  try { raw = await response.json(); } catch { return unavailable(path); }
  const error = object(object(raw)?.error);
  const code = error?.code;
  const adminAcademic=academicPath.test(path);const academic=adminAcademic||catalogPath.test(path)||teachingPath.test(path);
  const financial=enrollmentFamily(path),contract=enrollmentContract(path,method);
  const materials=materialsFamily(path),materialContract=materialsContract(path,method);
  const classes=classesFamily(path),classContract=classesContract(path,method);
  const allowedCodes:readonly string[]|undefined=classes?response.status===409?classContract?.conflicts:
    ({400:['VALIDATION_ERROR'],401:['AUTH_REQUIRED'],403:['FORBIDDEN','REQUEST_NOT_ALLOWED'],404:['NOT_FOUND'],413:['VALIDATION_ERROR'],415:['UNSUPPORTED_MEDIA_TYPE'],429:['RATE_LIMITED'],503:['TEMPORARILY_UNAVAILABLE']} as Record<number,readonly string[]>)[response.status]:materials?response.status===409?materialContract?.conflicts:
    ({400:['VALIDATION_ERROR'],401:['AUTH_REQUIRED'],403:['FORBIDDEN','REQUEST_NOT_ALLOWED'],404:['NOT_FOUND'],413:['VALIDATION_ERROR'],415:['UNSUPPORTED_MEDIA_TYPE'],429:['RATE_LIMITED'],503:['TEMPORARILY_UNAVAILABLE']} as Record<number,readonly string[]>)[response.status]:financial?response.status===409?contract?.conflicts:
    ({400:['VALIDATION_ERROR'],401:['AUTH_REQUIRED'],403:['FORBIDDEN','REQUEST_NOT_ALLOWED'],404:['NOT_FOUND'],413:['VALIDATION_ERROR'],415:['UNSUPPORTED_MEDIA_TYPE'],429:['RATE_LIMITED'],503:['TEMPORARILY_UNAVAILABLE']} as Record<number,readonly string[]>)[response.status]:adminAcademic&&response.status===409?academicConflicts:
    academic&&response.status===400?['VALIDATION_ERROR']:
      academic&&response.status===401?['AUTH_REQUIRED']:codes[response.status];
  if (typeof code!=='string' || !allowedCodes?.includes(code as ApiCode)) return unavailable(path);
  const retry = response.status===429?response.headers.get('Retry-After'):null;
  const seconds = retry && /^\d+$/.test(retry) && Number.isSafeInteger(Number(retry))?Number(retry):undefined;
  const allowedFields:readonly string[]=classes?(response.status===400&&code==='VALIDATION_ERROR'?classContract?.fields??[]:[]):materials?(response.status===400&&code==='VALIDATION_ERROR'?materialContract?.fields??[]:[]):financial?(response.status===400&&code==='VALIDATION_ERROR'?contract?.fields??[]:[]):academic?(code==='VALIDATION_ERROR'?(adminAcademic?academicFields:queryFields(path)):adminAcademic&&code==='TEACHER_NOT_ELIGIBLE'?['teacherUserId']:[]):fieldNames;
  const fields = Array.isArray(error?.fields)?error.fields.flatMap(value => {
    const field = object(value)?.field;
    return typeof field==='string' && allowedFields.includes(field as ApiField)?[field as ApiField]:[];
  }):[];
  const conflicts=adminAcademic&&response.status===409&&['TEACHER_SCHEDULE_CONFLICT','COURSE_PUBLICATION_BLOCKED'].includes(code)
    &&Array.isArray(error?.conflictingGroupIds)?error.conflictingGroupIds.filter((id):id is string=>typeof id==='string'&&uuidPattern.test(id)).map(id=>id.toLowerCase()):[];
  return new ApiFailure(response.status,code as ApiCode,(financial||materials||classes)&&code==='TEMPORARILY_UNAVAILABLE'?unconfirmed:messages[code as ApiCode],seconds,[...new Set(fields)],Object.freeze([...new Set(conflicts)]));
}

/** Sin caché, almacenamiento de secretos ni replay. El navegador gestiona la cookie HttpOnly. */
export function createApiClient(onAuthRequired:()=>void, transport:typeof fetch = fetch):ApiClient & BinaryUploadClient & BinaryDownloadClient & { cancelPending():void } {
  let generation = 0;
  const pending = new Set<AbortController>();
  const cancelPending = () => { generation++; for (const operation of pending) operation.abort(); };
  async function request<T>(path:string,options:ApiRequest = {},file?:File,download=false):Promise<T|undefined> {
      if (!/^\/[A-Za-z0-9/_-]+$/.test(path) || path.includes('//')) throw unavailable(path);
      const method=options.method??'GET',material=materialsFamily(path),contract=materialsContract(path,method);
      if(material&&!contract)throw unavailable(path);
      const classes=classesFamily(path);if(classes&&!classesContract(path,method))throw unavailable(path);
      const binaryPath=new RegExp('^/materials/uploads/'+uuid+'/content$','i').test(path);
      const downloadPath=new RegExp('^/materials/items/'+uuid+'/content$','i').test(path);
      if(download!==downloadPath||download&&method!=='GET')throw unavailable(path);
      if(file!==undefined&&(!binaryPath||method!=='PUT'||!(file instanceof File))||binaryPath&&file===undefined)throw unavailable(path);
      const query=new URLSearchParams();
      if(options.query) {
        const allowed=queryFields(path);
        if(!allowed.length||(options.method??'GET')!=='GET')throw unavailable(path);
        for(const [key,value] of Object.entries(options.query)) {
          if(!allowed.includes(key))throw unavailable(path);
          if(value===undefined)continue;
          if(typeof value!=='string'&&(typeof value!=='number'||!Number.isFinite(value)))throw unavailable(path);
          query.set(key,String(value));
        }
      }
      const started = generation;const controller = new AbortController();pending.add(controller);
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort',abort,{once:true});
      if (options.signal?.aborted) abort();
      try {
        if (controller.signal.aborted) throw new RequestCancelled();
        const response = await transport(`/api/v1${path}${query.size?'?'+query.toString():''}`,{method,credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',
          headers:method==='GET'?{Accept:download?'application/pdf, image/jpeg, image/png':'application/json'}:{Accept:'application/json','Content-Type':file?'application/octet-stream':'application/json','X-CSRF-Protection':'1'},
          ...(method==='GET'?{}:{body:file??JSON.stringify(options.body??{})}),signal:controller.signal});
        if (controller.signal.aborted || generation!==started) throw new RequestCancelled();
        if (!response.ok) {
          const error = await failure(response,path,method);
          if (controller.signal.aborted || generation!==started) throw new RequestCancelled();
          if (error.code==='AUTH_REQUIRED') {
            cancelPending();
            onAuthRequired();
          }
          throw error;
        }
        if(download) {
          const metadata=downloadMetadata(response,path);
          const blob=await response.blob();
          if(controller.signal.aborted||generation!==started)throw new RequestCancelled();
          if(blob.size!==metadata.byteSize||blob.type!==metadata.mediaType)throw unavailable(path);
          return {blob,downloadName:metadata.downloadName} as T;
        }
        if (response.status===204 || response.status===202) {
          if(enrollmentFamily(path)||material||classes)throw unavailable(path);
          return undefined;
        }
        const body = object(await response.json());
        if (controller.signal.aborted || generation!==started) throw new RequestCancelled();
        if (!body || !Object.hasOwn(body,'data') || (enrollmentFamily(path)||material||classes)&&Object.keys(body).length!==1) throw unavailable(path);
        if(classes) {
          const creation=method==='POST'&&/\/groups\//.test(path);
          if(!creation&&response.status!==200||creation&&![200,201].includes(response.status))throw unavailable(path);
          if(creation) {
            const replayed=object(object(body.data)?.command)?.replayed;
            if(typeof replayed!=='boolean'||response.status!==(replayed?200:201))throw unavailable(path);
          }
        }
        if(material) {
          const creation=binaryPath||method==='POST'&&path.endsWith('/uploads');
          if(!creation&&response.status!==200||creation&&![200,201].includes(response.status))throw unavailable(path);
          if(creation) {
            const data=object(body.data),replayed=binaryPath?data?.replayed:object(data?.command)?.replayed;
            if(typeof replayed!=='boolean'||response.status!==(replayed?200:201))throw unavailable(path);
          }
        }
        return body.data as T;
      } catch (error) {
        if (error instanceof ApiFailure || error instanceof RequestCancelled) throw error;
        if (controller.signal.aborted || generation!==started) throw new RequestCancelled();
        throw unavailable(path);
      } finally { pending.delete(controller);options.signal?.removeEventListener('abort',abort); }
  }
  return {cancelPending,request,
    async download(path:string,signal?:AbortSignal):Promise<BinaryDownload> {
      const data=await request<BinaryDownload>(path,{signal},undefined,true);
      if(data===undefined)throw unavailable(path);return data;
    },
    async upload<T>(path:string,file:File,signal?:AbortSignal):Promise<T> {
      const data=await request<T>(path,{method:'PUT',signal},file);
      if(data===undefined)throw unavailable(path);return data;
    },
  };
}

function downloadMetadata(response:Response,path:string) {
  const size=response.headers.get('Content-Length'),mediaType=response.headers.get('Content-Type')??'';
  const disposition=response.headers.get('Content-Disposition')??'';
  const name=/^attachment;\s*filename="[\x20-\x21\x23-\x5b\x5d-\x7e]+";\s*filename\*=UTF-8''([^;\s]+)$/i.exec(disposition);
  const suffix={'application/pdf':/\.pdf$/i,'image/jpeg':/\.jpe?g$/i,'image/png':/\.png$/i}[mediaType];
  if(response.status!==200||response.redirected||!size||!/^[1-9]\d*$/.test(size)
    ||!Number.isSafeInteger(Number(size))||Number(size)>20_000_000||!suffix||!name
    ||response.headers.get('Cache-Control')!=='no-store'||response.headers.get('X-Content-Type-Options')!=='nosniff'
    ||response.headers.get('Referrer-Policy')!=='no-referrer'
    ||['Content-Range','Location','ETag'].some(header=>response.headers.has(header))
    ||!['identity',null].includes(response.headers.get('Content-Encoding')))throw unavailable(path);
  let downloadName:string;
  try { downloadName=decodeURIComponent(name[1]); } catch { throw unavailable(path); }
  if(!downloadName||downloadName.trim()!==downloadName||[...downloadName].length>180
    ||/[\p{Cc}\p{Surrogate}/\\<>:"|?*]/u.test(downloadName)||!suffix.test(downloadName))throw unavailable(path);
  return {byteSize:Number(size),mediaType,downloadName};
}
