import { randomUUID } from 'node:crypto';
import { beforeAll,beforeEach,afterAll,afterEach,expect,test } from 'vitest';
import { us2Dataset } from '../support/us2.js';
import type { Us2Dataset } from '../support/us2.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { adminRequest,adminData,adminError,adminSnapshot,projection } from '../support/us4.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';

let data:Us2Dataset;let http:Us1Http;let otherId:string;
const roles=['STUDENT','TEACHER','ADMIN'] as const;
beforeAll(async()=>{data=await us2Dataset('us5_permissions');},120000);
beforeEach(async()=>{
  await data.reset();http=await us1Http(data);
  await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();
  otherId=randomUUID();const email=`alumno-b-${randomUUID()}@example.test`;
  await data.context.database.pool.query(`INSERT INTO "User" (id,name,email,"emailCanonical",role,"passwordHash","emailVerifiedAt","createdAt","updatedAt")
    SELECT $1,'Alumno B privado',$2,$2,'STUDENT',"passwordHash",clock_timestamp(),clock_timestamp(),clock_timestamp()
    FROM "User" WHERE id=$3`,[otherId,email,data.account().id]);
});
afterEach(async()=>{await http?.close();});afterAll(async()=>{await data?.cleanup();});
function operations(id:string){
  return [
    {method:'GET',path:`/admin/users?q=${id}`},
    {method:'POST',path:'/admin/users',body:{name:'Alta de prueba',email:`${id}@example.test`,role:'TEACHER',provisionalPassword:accessSecrets.issue().secret}},
    {method:'GET',path:`/admin/users/${id}`},
    {method:'PATCH',path:`/admin/users/${id}/name`,body:{name:'Cambio no autorizado'}},
    {method:'PUT',path:`/admin/users/${id}/role`,body:{role:'TEACHER'}},
    {method:'PUT',path:`/admin/users/${id}/status`,body:{status:'DISABLED'}},
  ] as const;
}
async function denied(secret:string|undefined,status:401|403,headers?:Record<string,string>){
  const before=await adminSnapshot(data);const unknown=randomUUID();
  const known=operations(otherId);const absent=operations(unknown);
  for(let index=0;index<known.length;index++){
    const results=[];
    for(const command of [known[index],absent[index]]){
      const response=await fetch(`${http.url}/api/v1${command.path}`,{method:command.method,headers:headers??http.headers(secret),
        ...('body' in command?{body:JSON.stringify(command.body)}:{})});
      results.push(await adminError(response,status,status===401?'AUTH_REQUIRED':'FORBIDDEN'));
      expect(response.headers.has('set-cookie')).toBe(false);
    }
    expect(results[0]).toEqual(results[1]);
  }
  expect(await adminSnapshot(data)===before).toBe(true);
}
test('visitante: todos los endpoints administrativos y consulta propia requieren sesión, sin efectos',async()=>{
  await denied(undefined,401);await adminError(await http.get('/me'),401,'AUTH_REQUIRED');
});
for(const role of ['STUDENT','TEACHER'] as const)test(`${role}: matriz administrativa conocida/desconocida idéntica y sin datos de B`,async()=>{
  await denied(data.account(role).sessions[0].secret,403);
});
for(const role of roles)for(const state of ['revoked','idle','absolute','version','disabled','unverified','provisional'] as const)
test(`${role} con sesión ${state}: matriz completa 401, sin actividad ni cambios`,async()=>{
  const f=data.account(role);const db=data.context.database.pool;
  if(state==='revoked')await db.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[f.sessions[0].id]);
  else if(state==='idle')await data.clock!.advance(1800000);
  else if(state==='absolute'){
    await data.clock!.advance(28800000);
    await db.query(`UPDATE "Session" SET "lastAcceptedAt"=clock_timestamp()-interval '1 minute' WHERE id=$1`,[f.sessions[0].id]);
  }else if(state==='version')await db.query('UPDATE "User" SET "authVersion"="authVersion"+1 WHERE id=$1',[f.id]);
  else if(state==='disabled')await db.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`,[f.id]);
  else if(state==='unverified')await db.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1',[f.id]);
  else await db.query(`UPDATE "User" SET "passwordHash"=NULL,"mustSetPassword"=true,
    "provisionalPasswordHash"=(SELECT "provisionalPasswordHash" FROM "User" WHERE id=$2),
    "provisionalExpiresAt"="createdAt"+interval '24 hours' WHERE id=$1`,[f.id,data.account(role,'PROVISIONAL').id]);
  await denied(f.sessions[0].secret,401);
  const before=await adminSnapshot(data);await adminError(await http.get('/me',f.sessions[0].secret),401,'AUTH_REQUIRED');
  expect(await adminSnapshot(data)===before).toBe(true);
});
for(const variant of ['malformed','unknown','bearer','duplicate'] as const)test(`credencial de sesión ${variant}: no sustituye identidad en ningún endpoint`,async()=>{
  const secret=data.account('ADMIN').sessions[0].secret;const headers=http.headers();
  if(variant==='bearer')Object.assign(headers,{authorization:`Bearer ${secret}`});
  else Object.assign(headers,{cookie:variant==='duplicate'?`av_session_dev=${secret}; av_session_dev=${secret}`
    :`av_session_dev=${variant==='unknown'?accessSecrets.issue().secret:'invalida'}`});
  await denied(undefined,401,headers);await adminError(await http.get('/me',undefined,headers),401,'AUTH_REQUIRED');
});
for(const role of roles)test(`${role}: /me devuelve exclusivamente identidad propia, sin selector ni perfiles ajenos editables`,async()=>{
  const f=data.account(role);const secret=f.sessions[0].secret;
  const view=await adminData(await http.get('/me',secret));projection(view);expect(view.id===f.id&&view.role===role).toBe(true);
  const before=await adminSnapshot(data);
  for(const id of [otherId,randomUUID()]){
    await adminError(await http.get(`/me?userId=${id}`,secret),400,'VALIDATION_ERROR');
    for(const path of [`/me/${id}`,`/users/${id}`,`/profile/${id}`]){
      for(const method of ['GET','PATCH','PUT'] as const)await adminError(await adminRequest(http,method,path,secret,
        method==='GET'?undefined:{name:'Intrusión',role:'ADMIN'}),404,'NOT_FOUND');
    }
    for(const method of ['PATCH','PUT'] as const)await adminError(await adminRequest(http,method,`/admin/users/${id}`,secret,{email:'otro@example.test'}),404,'NOT_FOUND');
  }
  expect(await adminSnapshot(data)===before).toBe(true);
});
test('ADMIN: controles positivos de las seis operaciones y 404 únicamente después de autorizar',async()=>{
  const secret=data.account('ADMIN').sessions[0].secret;
  const listed=await adminData(await http.get('/admin/users',secret));expect(listed.items.some((user:{id:string})=>user.id===otherId)).toBe(true);
  const created=await adminData(await http.post('/admin/users',{name:'Creación permitida',email:`${randomUUID()}@example.test`,role:'STUDENT',
    provisionalPassword:accessSecrets.issue().secret},secret),201);projection(created);
  projection(await adminData(await http.get(`/admin/users/${otherId}`,secret)));
  projection(await adminData(await adminRequest(http,'PATCH',`/admin/users/${otherId}/name`,secret,{name:'Nombre permitido'})));
  expect((await adminData(await adminRequest(http,'PUT',`/admin/users/${otherId}/role`,secret,{role:'TEACHER'}))).role).toBe('TEACHER');
  expect((await adminData(await adminRequest(http,'PUT',`/admin/users/${otherId}/status`,secret,{status:'DISABLED'}))).status).toBe('DISABLED');
  for(const command of operations(randomUUID()).slice(2))await adminError(await adminRequest(http,command.method,command.path,secret,
    'body' in command?command.body:undefined),404,'NOT_FOUND');
});
test('inyección de identidad, permisos y campos ajenos a cada comando: 400 sin elevación ni efectos',async()=>{
  const secret=data.account('ADMIN').sessions[0].secret;const before=await adminSnapshot(data);const f=data.account();
  const requests=[
    {path:'/auth/register',method:'POST',body:{name:'Alumno',email:`${randomUUID()}@example.test`,password:f.password,role:'ADMIN'}},
    {path:'/auth/login',method:'POST',body:{email:f.email,password:f.password,userId:otherId}},
    {path:'/admin/users',method:'POST',body:{name:'Alta',email:`${randomUUID()}@example.test`,role:'ADMIN',provisionalPassword:f.password,status:'ACTIVE'}},
    {path:`/admin/users/${otherId}/name`,method:'PATCH',body:{name:'Intrusión',email:f.email,role:'ADMIN'}},
    {path:`/admin/users/${otherId}/role`,method:'PUT',body:{role:'ADMIN',permissions:['users:manage']}},
    {path:`/admin/users/${otherId}/role`,method:'PUT',body:{role:['ADMIN','TEACHER']}},
    {path:`/admin/users/${otherId}/status`,method:'PUT',body:{status:'ACTIVE',mustSetPassword:false}},
  ] as const;
  for(const request of requests)await adminError(await adminRequest(http,request.method,request.path,secret,request.body),400,'VALIDATION_ERROR');
  expect(await adminSnapshot(data)===before).toBe(true);
});
