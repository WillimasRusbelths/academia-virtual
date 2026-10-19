import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeAll,beforeEach,expect,test } from 'vitest';
import { us1Dataset,us1Http,sessionState } from '../support/us1-http.js';
import type { Us1Dataset,Us1Http } from '../support/us1-http.js';
import { safeError,userView } from '../support/us1-assertions.js';

let data:Us1Dataset;let http:Us1Http;
beforeAll(async()=>{data=await us1Dataset('us3_profile',true);},120000);
beforeEach(async()=>{await data.reset();http=await us1Http(data);});
afterEach(async()=>{await http?.close();});
afterAll(async()=>{await data?.cleanup();});

for(const role of ['STUDENT','TEACHER','ADMIN'] as const)test(`T089 /me ${role}: UserView completo, propio, escalar y UTC`,async()=>{
  const account=data.account(role);const session=account.sessions[0];
  const row=(await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[account.id])).rows[0];
  const response=await http.get('/me',session.secret);const body=await response.clone().json();
  await userView(response,account);
  expect(typeof body.data.role==='string'&&!Array.isArray(body.data.role)&&body.data.role===role).toBe(true);
  expect(body.data.status==='ACTIVE'&&typeof body.data.emailVerified==='boolean'&&typeof body.data.mustSetPassword==='boolean').toBe(true);
  expect(body.data.createdAt===row.createdAt.toISOString()).toBe(true);
  expect(new Date(body.data.createdAt).toISOString()===body.data.createdAt).toBe(true);
  expect(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.data.id)).toBe(true);
  const serialized=JSON.stringify(body);
  const privateValues=[row.passwordHash,session.secret,account.password].filter((value):value is string=>typeof value==='string');
  expect(privateValues.every(value=>!serialized.includes(value))).toBe(true);
  expect(!/passwordHash|provisionalPassword|authVersion|tokenHash|sessions|roles/.test(serialized)).toBe(true);
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
});

const filters=['userId','id','email','role','roles','status','filter','include','fields','page'];
for(const field of filters)test(`T089 /me rechaza filtro ${field} sin renovar ni seleccionar otra cuenta`,async()=>{
  const own=data.account();const target=data.account('ADMIN');const session=own.sessions[0];
  const before=await sessionState(data,session.id);await data.clock!.advance(60000);
  const known=field==='email'?target.email:field==='role'||field==='roles'?'ADMIN':target.id;
  for(const value of [known,randomUUID()]){
    await safeError(await http.get('/me?'+new URLSearchParams({[field]:value}),session.secret),400,'VALIDATION_ERROR',[target.email,session.secret]);
  }
  expect((await sessionState(data,session.id)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  await userView(await http.get('/me',session.secret),own);
});

test('T089 /me no acepta arrays, filtros anidados ni selección mediante cabeceras',async()=>{
  const own=data.account();const session=own.sessions[0];const other=data.account('ADMIN');
  for(const query of ['?userId%5B%5D='+other.id,'?filter%5BuserId%5D='+other.id,'?role=STUDENT&role=ADMIN']){
    await safeError(await http.get('/me'+query,session.secret),400,'VALIDATION_ERROR',[session.secret]);
  }
  await userView(await http.get('/me',session.secret,{'x-user-id':other.id,'x-role':'ADMIN'}),own);
});

test('T089 /me representa la cuenta de cada cookie, sin contexto multirol del cliente',async()=>{
  for(const role of ['ADMIN','STUDENT','TEACHER','STUDENT'] as const){
    const account=data.account(role);await userView(await http.get('/me',account.sessions[0].secret),account);
  }
});

for(const invalid of ['ausente','desactivada','revocada'] as const)test(`T089 /me sin perfil visible con sesión ${invalid}`,async()=>{
  const own=data.account();const session=own.sessions[0];
  if(invalid==='desactivada')await data.context.database.pool.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`,[own.id]);
  if(invalid==='revocada')await data.context.database.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[session.id]);
  await safeError(await http.get('/me',invalid==='ausente'?undefined:session.secret),401,'AUTH_REQUIRED',[own.email,session.secret,own.password]);
});
