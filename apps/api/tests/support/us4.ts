import { expect } from 'vitest';
import type { Us1Http } from './us1-http.js';
import type { Us2Dataset } from './us2.js';

export async function adminRequest(http:Us1Http,method:'GET'|'POST'|'PATCH'|'PUT',path:string,secret?:string,body?:unknown){
  try{return await fetch(`${http.url}/api/v1${path}`,{method,headers:http.headers(secret),
    ...(body===undefined?{}:{body:JSON.stringify(body)})});}
  catch{throw new Error('Solicitud del ensayo US4 no completada. Valores omitidos.');}
}
export function adminStatus(response:Response,status:number){
  expect(response.status,response.status===404&&status!==404?'US4_PENDING_HTTP: falta ruta administrativa':'Contrato HTTP administrativo').toBe(status);
}
export function projection(value:Record<string,unknown>){
  expect(Object.keys(value).sort()).toEqual(['id','name','email','role','status','emailVerified','mustSetPassword','createdAt'].sort());
  expect(typeof value.id==='string'&&/^[a-f0-9-]{36}$/.test(value.id)).toBe(true);
  expect(typeof value.name==='string'&&typeof value.email==='string').toBe(true);
  expect(['STUDENT','TEACHER','ADMIN'].includes(String(value.role))&&['ACTIVE','DISABLED'].includes(String(value.status))).toBe(true);
  expect(typeof value.emailVerified==='boolean'&&typeof value.mustSetPassword==='boolean'&&typeof value.createdAt==='string'&&Number.isFinite(Date.parse(value.createdAt))).toBe(true);
}
export async function adminData(response:Response,status=200,secrets:string[]=[]){
  adminStatus(response,status);const raw=await response.text();expect(secrets.every(secret=>!raw.includes(secret))).toBe(true);
  expect(!/passwordHash|provisionalPassword|tokenHash|authVersion|encryptedPayload|"sessions"/.test(raw)).toBe(true);
  expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('set-cookie')).toBeNull();
  const body=JSON.parse(raw);expect(Object.keys(body)).toEqual(['data']);return body.data;
}
export async function adminError(response:Response,status:number,code:string,secrets:string[]=[]){
  adminStatus(response,status);const raw=await response.text();const body=JSON.parse(raw);
  expect(Object.keys(body)).toEqual(['error']);expect(body.error.code===code).toBe(true);
  expect(Object.keys(body.error).every(key=>['code','message','requestId','fields'].includes(key))).toBe(true);
  expect(typeof body.error.message==='string'&&/^[a-f0-9-]{36}$/.test(body.error.requestId)).toBe(true);
  if(body.error.fields)expect(Array.isArray(body.error.fields)&&body.error.fields.every((field:Record<string,unknown>)=>
    Object.keys(field).sort().join(',')==='field,message'&&typeof field.message==='string'&&['name','email','role','status','provisionalPassword','id','q','page','pageSize'].includes(String(field.field)))).toBe(true);
  expect(secrets.every(secret=>!raw.includes(secret))&&!/passwordHash|tokenHash|SELECT |stack|authVersion/.test(raw)).toBe(true);
  expect(response.headers.get('cache-control')).toBe('no-store');return {code:body.error.code,message:body.error.message};
}
/** Snapshot privado: solo se comparan booleanos; nunca se imprime una fila con hashes. */
export async function adminSnapshot(data:Us2Dataset){
  const parts=[];
  for(const table of ['User','Session','ActionToken','MailDelivery','AuditEvent','SystemState'])parts.push((await data.context.database.pool.query(`SELECT * FROM "${table}" ORDER BY id`)).rows);
  return JSON.stringify(parts);
}
