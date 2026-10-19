import { randomUUID } from 'node:crypto';
import { beforeAll,beforeEach,afterAll,afterEach,test,expect } from 'vitest';
import { us2Dataset } from '../support/us2.js';
import type { Us2Dataset } from '../support/us2.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { adminRequest,adminData,adminError,adminSnapshot,projection } from '../support/us4.js';
import { accessSecrets,createPasswordCredentials } from '../../src/modules/identity/infrastructure/credentials.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';

let data:Us2Dataset;let http:Us1Http;
beforeAll(async()=>{data=await us2Dataset('us4_contract');},120000);
beforeEach(async()=>{await data.reset();http=await us1Http(data);await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();});
afterEach(async()=>{await http?.close();});afterAll(async()=>{await data?.cleanup();});
const request=(method:'GET'|'POST'|'PATCH'|'PUT',path:string,body?:unknown,secret=data.account('ADMIN').sessions[0].secret)=>adminRequest(http,method,path,secret,body);
const valid=()=>({name:'Alta sintética',email:`alta-${randomUUID()}@example.test`,role:'TEACHER',provisionalPassword:accessSecrets.issue().secret});
test('control: BD aislada, ADMIN habilitado y consulta propia real',async()=>{
  expect(data.context.environment.databaseSchema.startsWith('t_')).toBe(true);
  expect((await fetch(`${http.url}/health/ready`)).status).toBe(200);
  const response=await http.get('/me',data.account('ADMIN').sessions[0].secret);expect(response.status).toBe(200);
  projection((await response.json()).data);expect(data.account('ADMIN').sessions.length).toBe(2);
});
test('listado: proyección cerrada, página 1/tamaño 20 y orden createdAt,id',async()=>{
  const body=await adminData(await request('GET','/admin/users'));
  expect(Object.keys(body).sort()).toEqual(['items','page','pageSize','total'].sort());
  expect(body.page===1&&body.pageSize===20&&body.total===data.manifest.accounts.length).toBe(true);
  for(const item of body.items)projection(item);
  const ids=(await data.context.database.pool.query('SELECT id FROM "User" ORDER BY "createdAt",id')).rows.map(row=>row.id);
  expect(JSON.stringify(body.items.map((row:{id:string})=>row.id))===JSON.stringify(ids.slice(0,20))).toBe(true);
});
test('paginación sin duplicados y página vacía conserva total',async()=>{
  const first=await adminData(await request('GET','/admin/users?page=1&pageSize=2'));
  const second=await adminData(await request('GET','/admin/users?page=2&pageSize=2'));
  expect(first.page===1&&second.page===2&&first.pageSize===2&&second.pageSize===2).toBe(true);
  expect(new Set([...first.items,...second.items].map(item=>item.id)).size).toBe(4);
  const empty=await adminData(await request('GET','/admin/users?page=100&pageSize=2'));expect(empty.items.length===0&&empty.total===first.total).toBe(true);
});
for(const role of ['STUDENT','TEACHER','ADMIN'])for(const status of ['ACTIVE','DISABLED'])test(`filtros ${role}/${status} y búsqueda canónica`,async()=>{
  const filtered=await adminData(await request('GET',`/admin/users?role=${role}&status=${status}&pageSize=50`));
  const expected=(await data.context.database.pool.query('SELECT count(*)::int AS n FROM "User" WHERE role=$1::"Role" AND status=$2::"AccountStatus"',[role,status])).rows[0].n;
  expect(filtered.total===expected&&filtered.items.length===expected&&filtered.items.every((item:{role:string;status:string})=>item.role===role&&item.status===status)).toBe(true);
  const account=data.account(role as 'STUDENT'|'TEACHER'|'ADMIN',status==='ACTIVE'?'ENABLED':'DISABLED');
  const body=await adminData(await request('GET',`/admin/users?role=${role}&status=${status}&q=${encodeURIComponent(account.email.toUpperCase())}`));
  expect(body.total===1&&body.items[0].id===account.id).toBe(true);projection(body.items[0]);
});
test('consulta q de 254 y tamaño 50 válidos, UUID inválido rechazado',async()=>{
  const body=await adminData(await request('GET',`/admin/users?q=${'q'.repeat(254)}&pageSize=50`));expect(body.pageSize===50&&body.total===0&&body.items.length===0).toBe(true);
  await adminError(await request('GET','/admin/users/no-es-uuid'),400,'VALIDATION_ERROR');
});
test('búsqueda por nombre sin case y comodines SQL literales',async()=>{
  const account=data.account();await data.context.database.pool.query('UPDATE "User" SET name=$2 WHERE id=$1',[account.id,'Nombre %_\\ literal']);
  for(const q of ['NOMBRE %_\\','%_\\']){const body=await adminData(await request('GET',`/admin/users?q=${encodeURIComponent(q)}`));expect(body.total===1&&body.items[0].id===account.id).toBe(true);}
});
for(const query of ['page=0','page=-1','page=1.5','pageSize=0','pageSize=51','pageSize=no','role=OWNER','status=PENDING',`q=${'a'.repeat(255)}`,'page=1&page=2'])
  test(`consulta inválida ${query.slice(0,28)}`,async()=>{const before=await adminSnapshot(data);await adminError(await request('GET',`/admin/users?${query}`),400,'VALIDATION_ERROR');expect(await adminSnapshot(data)===before).toBe(true);});
test('detalle existente cerrado y 404 solo para ADMIN autorizado',async()=>{
  const account=data.account();const view=await adminData(await request('GET',`/admin/users/${account.id}`));projection(view);expect(view.id===account.id).toBe(true);
  await adminError(await request('GET',`/admin/users/${randomUUID()}`),404,'NOT_FOUND');
});
for(const role of ['STUDENT','TEACHER','ADMIN'])test(`alta ${role}: pendiente, hash y entrega privados sin sesión`,async()=>{
  const input={...valid(),role};const view=await adminData(await request('POST','/admin/users',input),201,[input.provisionalPassword]);projection(view);
  expect(view.role===role&&view.status==='ACTIVE'&&view.emailVerified===false&&view.mustSetPassword===true).toBe(true);
  const row=(await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[view.id])).rows[0];
  expect(row.passwordHash===null&&row.authVersion==='0'&&row.provisionalExpiresAt.getTime()-row.createdAt.getTime()===86400000).toBe(true);
  expect(await (await createPasswordCredentials()).verify(input.provisionalPassword,row.provisionalPasswordHash)).toBe(true);
  expect((await data.context.database.pool.query('SELECT count(*)::int AS n FROM "Session" WHERE "userId"=$1',[view.id])).rows[0].n).toBe(0);
  expect((await data.context.database.pool.query('SELECT count(*)::int AS n FROM "ActionToken" t JOIN "MailDelivery" m ON m."tokenId"=t.id WHERE t."userId"=$1',[view.id])).rows[0].n).toBe(1);
  const audit=(await data.context.database.pool.query('SELECT * FROM "AuditEvent" WHERE "targetUserId"=$1',[view.id])).rows[0];
  expect(audit.action==='ACCOUNT_CREATED'&&audit.actorUserId===data.account('ADMIN').id).toBe(true);
});
for(const length of [1,100])test(`alta acepta nombre Unicode ${length} y contraseña Unicode ${length===1?12:128} sin trim`,async()=>{
  const password=' '+'🔒'.repeat(length===1?10:126)+' ';const input={...valid(),name:' '+'😀'.repeat(length)+' ',provisionalPassword:password};
  const view=await adminData(await request('POST','/admin/users',input),201,[password]);expect(view.name==='😀'.repeat(length)).toBe(true);
  const row=(await data.context.database.pool.query('SELECT "provisionalPasswordHash" FROM "User" WHERE id=$1',[view.id])).rows[0];const credentials=await createPasswordCredentials();
  expect(await credentials.verify(password,row.provisionalPasswordHash)).toBe(true);expect(await credentials.verify(password.trim(),row.provisionalPasswordHash)).toBe(false);
});
test('alta válida conserva cuenta aunque no haya cuota de correo',async()=>{
  const input=valid();await new PostgresRateStore(data.context.database.pool,data.context.environment.rateHmacKey).admitMail(input.email,'VERIFY_EMAIL','127.0.0.1','ADMISSION');
  const view=await adminData(await request('POST','/admin/users',input),201,[input.provisionalPassword]);
  expect(view.mustSetPassword&&!view.emailVerified).toBe(true);
  expect((await data.context.database.pool.query('SELECT count(*)::int AS n FROM "ActionToken" WHERE "userId"=$1',[view.id])).rows[0].n).toBe(0);
});
test('duplicado canónico 409, sin overwrite ni nueva provisional',async()=>{
  const input={...valid(),email:' '+data.account().email.toUpperCase()+' '};const before=await adminSnapshot(data);
  await adminError(await request('POST','/admin/users',input),409,'ACCOUNT_CONFLICT',[input.provisionalPassword]);expect(await adminSnapshot(data)===before).toBe(true);
});
const invalid:[string,Record<string,unknown>][]=[['nombre vacío',{name:' '}],['nombre largo',{name:'😀'.repeat(101)}],['correo inválido',{email:'invalido'}],
  ['rol inválido',{role:'OWNER'}],['roles array',{role:['ADMIN']}],['provisional corta',{provisionalPassword:'x'.repeat(11)}],['provisional larga',{provisionalPassword:'x'.repeat(129)}],
  ['provisional array',{provisionalPassword:[]}],['estado extra',{status:'ACTIVE'}],['verificación extra',{emailVerified:true}],['password extra',{password:'dato no admitido'}]];
for(const [name,patch] of invalid)test(`alta inválida: ${name}`,async()=>{const input={...valid(),...patch};const before=await adminSnapshot(data);
  await adminError(await request('POST','/admin/users',input),400,'VALIDATION_ERROR',[typeof input.provisionalPassword==='string'?input.provisionalPassword:'señuelo']);expect(await adminSnapshot(data)===before).toBe(true);});
for(const field of ['name','email','role','provisionalPassword'])test(`alta sin campo obligatorio ${field}: no inventa valores predeterminados`,async()=>{
  const input:Record<string,unknown>=valid();delete input[field];const before=await adminSnapshot(data);
  await adminError(await request('POST','/admin/users',input),400,'VALIDATION_ERROR');expect(await adminSnapshot(data)===before).toBe(true);
});
for(const body of [null,[]])test(`alta rechaza cuerpo ${body===null?'null':'array'}`,async()=>{
  const before=await adminSnapshot(data);await adminError(await request('POST','/admin/users',body),400,'VALIDATION_ERROR');expect(await adminSnapshot(data)===before).toBe(true);
});
test('nombre Unicode se corrige exclusivamente y comparte auditoría',async()=>{
  const target=data.account();const before=(await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[target.id])).rows[0];
  const view=await adminData(await request('PATCH',`/admin/users/${target.id}/name`,{name:'  Nuevo 😀  '}));projection(view);expect(view.name==='Nuevo 😀').toBe(true);
  const after=(await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[target.id])).rows[0];
  expect(after.email===before.email&&after.role===before.role&&after.status===before.status&&after.passwordHash===before.passwordHash&&after.authVersion===before.authVersion).toBe(true);
  expect((await data.context.database.pool.query('SELECT action FROM "AuditEvent" WHERE "targetUserId"=$1',[target.id])).rows[0].action).toBe('NAME_CHANGED');
});
for(const body of [{name:''},{name:['nombre']},{name:'x'.repeat(101)},{name:'Válido',email:'extra@example.test'},{name:'Válido',role:'ADMIN'},{name:'Válido',status:'DISABLED'}])
  test(`nombre rechaza campos/formato ${Object.keys(body).join('/')}`,async()=>{const before=await adminSnapshot(data);await adminError(await request('PATCH',`/admin/users/${data.account().id}/name`,body),400,'VALIDATION_ERROR');expect(await adminSnapshot(data)===before).toBe(true);});
for(const field of ['role','status'] as const)for(const body of [{[field]:'INVALID'}, {[field]:[]},{[field]:field==='role'?'TEACHER':'DISABLED',name:'extra'}])
  test(`${field}: DTO acotado ${Object.keys(body).join('/')}`,async()=>{const before=await adminSnapshot(data);await adminError(await request('PUT',`/admin/users/${data.account().id}/${field}`,body),400,'VALIDATION_ERROR');expect(await adminSnapshot(data)===before).toBe(true);});
for(const role of ['STUDENT','TEACHER'] as const)test(`${role}: seis rutas denegadas y mismo 403 antes de existencia`,async()=>{
  const secret=data.account(role).sessions[0].secret;const before=await adminSnapshot(data);const responses=[];
  for(const id of [data.account().id,randomUUID()])for(const [method,path,body] of [
    ['GET','/admin/users',undefined],['POST','/admin/users',valid()],['GET',`/admin/users/${id}`,undefined],
    ['PATCH',`/admin/users/${id}/name`,{name:'Nombre'}],['PUT',`/admin/users/${id}/role`,{role:'ADMIN'}],['PUT',`/admin/users/${id}/status`,{status:'DISABLED'}]] as const)
    responses.push(await adminError(await request(method,path,body,secret),403,'FORBIDDEN'));
  expect(responses.every(value=>value.message===responses[0].message)).toBe(true);expect(await adminSnapshot(data)===before).toBe(true);
});
test('sin sesión las seis rutas requieren acceso, sin cambios',async()=>{
  const before=await adminSnapshot(data);const id=data.account().id;
  for(const [method,path,body] of [['GET','/admin/users',undefined],['POST','/admin/users',valid()],['GET',`/admin/users/${id}`,undefined],
    ['PATCH',`/admin/users/${id}/name`,{name:'Nombre'}],['PUT',`/admin/users/${id}/role`,{role:'ADMIN'}],['PUT',`/admin/users/${id}/status`,{status:'DISABLED'}]] as const)
    await adminError(await adminRequest(http,method,path,undefined,body),401,'AUTH_REQUIRED');
  expect(await adminSnapshot(data)===before).toBe(true);
});
