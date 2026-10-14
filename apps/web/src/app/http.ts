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
};
const fieldNames:readonly ApiField[] = ['name','email','password','provisionalPassword','newPassword','role','status','token'];
function unavailable() { return new ApiFailure(503,'TEMPORARILY_UNAVAILABLE',messages.TEMPORARILY_UNAVAILABLE); }
function object(value:unknown):Record<string,unknown>|null {
  return value!==null && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:null;
}
async function failure(response:Response):Promise<ApiFailure> {
  let raw:unknown;
  try { raw = await response.json(); } catch { return unavailable(); }
  const error = object(object(raw)?.error);
  const code = error?.code;
  if (typeof code!=='string' || !codes[response.status]?.includes(code as ApiCode)) return unavailable();
  const retry = response.status===429?response.headers.get('Retry-After'):null;
  const seconds = retry && /^\d+$/.test(retry) && Number.isSafeInteger(Number(retry))?Number(retry):undefined;
  const fields = Array.isArray(error?.fields)?error.fields.flatMap(value => {
    const field = object(value)?.field;
    return typeof field==='string' && fieldNames.includes(field as ApiField)?[field as ApiField]:[];
  }):[];
  return new ApiFailure(response.status,code as ApiCode,messages[code as ApiCode],seconds,[...new Set(fields)]);
}

/** Sin caché, almacenamiento de secretos ni replay. El navegador gestiona la cookie HttpOnly. */
export function createApiClient(onAuthRequired:()=>void, transport:typeof fetch = fetch):ApiClient {
  let generation = 0;
  const pending = new Set<AbortController>();
  return {
    async request<T>(path:string,options:ApiRequest = {}):Promise<T|undefined> {
      if (!/^\/[A-Za-z0-9/_-]+$/.test(path) || path.includes('//')) throw unavailable();
      const started = generation;const controller = new AbortController();pending.add(controller);
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort',abort,{once:true});
      if (options.signal?.aborted) abort();
      try {
        if (controller.signal.aborted) throw new RequestCancelled();
        const method = options.method??'GET';
        const response = await transport(`/api/v1${path}`,{method,credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',
          headers:method==='GET'?{Accept:'application/json'}:{Accept:'application/json','Content-Type':'application/json','X-CSRF-Protection':'1'},
          ...(method==='GET'?{}:{body:JSON.stringify(options.body??{})}),signal:controller.signal});
        if (controller.signal.aborted || generation!==started) throw new RequestCancelled();
        if (!response.ok) {
          const error = await failure(response);
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
