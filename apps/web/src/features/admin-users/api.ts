import { ApiFailure } from '../../shared/api-client';
import type { ApiClient } from '../../shared/api-client';
import { readAccountView } from '../../shared/user-view';
import type { UserView } from '../../shared/user-view';

export interface AccountFilters {q:string;role:string;status:string;page:number;pageSize:number}
export interface AccountList {items:UserView[];page:number;pageSize:number;total:number}
function unavailable():never {throw new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','No se pudo confirmar la consulta. Puedes reintentar manualmente.');}
function accountPath(id:string) {
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return unavailable();
  return `/admin/users/${id}`;
}
/** Solo proyecciones públicas; no importa entidades ni adaptadores del backend. */
export function administrativeApi(api:ApiClient) {
  return {
    async list(filter:AccountFilters,signal?:AbortSignal):Promise<AccountList> {
      const value=await api.request<Record<string,unknown>>('/admin/users',{signal,query:{q:filter.q||undefined,role:filter.role||undefined,
        status:filter.status||undefined,page:filter.page,pageSize:filter.pageSize}});
      if(!value||Object.keys(value).sort().join(',')!=='items,page,pageSize,total'||!Array.isArray(value.items)
        ||!Number.isSafeInteger(value.page)||Number(value.page)<1||!Number.isSafeInteger(value.pageSize)||Number(value.pageSize)<1||Number(value.pageSize)>50
        ||!Number.isSafeInteger(value.total)||Number(value.total)<0)return unavailable();
      return {items:value.items.map(readAccountView),page:Number(value.page),pageSize:Number(value.pageSize),total:Number(value.total)};
    },
    async get(id:string,signal?:AbortSignal){return readAccountView(await api.request(accountPath(id),{signal}));},
    async create(input:{name:string;email:string;role:string;provisionalPassword:string}){return readAccountView(await api.request('/admin/users',{method:'POST',body:input}));},
    async name(id:string,name:string){return readAccountView(await api.request(`${accountPath(id)}/name`,{method:'PATCH',body:{name}}));},
    async role(id:string,role:string){return readAccountView(await api.request(`${accountPath(id)}/role`,{method:'PUT',body:{role}}));},
    async status(id:string,status:string){return readAccountView(await api.request(`${accountPath(id)}/status`,{method:'PUT',body:{status}}));},
  };
}
