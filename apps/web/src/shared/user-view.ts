import { ApiFailure } from './api-client';

export interface UserView {
  readonly id:string;readonly name:string;readonly email:string;readonly role:'STUDENT'|'TEACHER'|'ADMIN';
  readonly status:'ACTIVE'|'DISABLED';readonly emailVerified:boolean;readonly mustSetPassword:boolean;readonly createdAt:string;
}
/** Contrato de lectura propio; no importa entidades ni código del backend. */
export function readUserView(value:unknown):UserView {
  if(value&&typeof value==='object'&&!Array.isArray(value)) {
    const view=value as Record<string,unknown>;
    const fields=['id','name','email','role','status','emailVerified','mustSetPassword','createdAt'];
    if(Object.keys(view).length===fields.length&&Object.keys(view).every(key=>fields.includes(key))
      &&typeof view.id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(view.id)
      &&typeof view.name==='string'&&typeof view.email==='string'&&typeof view.role==='string'
      &&['STUDENT','TEACHER','ADMIN'].includes(view.role)&&view.status==='ACTIVE'
      &&view.emailVerified===true&&view.mustSetPassword===false&&typeof view.createdAt==='string'
      &&/^\d{4}-\d\d-\d\dT.*Z$/.test(view.createdAt)&&Number.isFinite(Date.parse(view.createdAt)))return Object.freeze({...view}) as unknown as UserView;
  }
  throw new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','No se pudo confirmar la sesión. Puedes reintentar manualmente.');
}
