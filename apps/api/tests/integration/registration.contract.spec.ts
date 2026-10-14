import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { seedAction,tokenState,us2Dataset } from '../support/us2.js';
import { generic202,registrationError } from '../support/us2-assertions.js';
import type { Us2Dataset } from '../support/us2.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';
import { createPasswordCredentials,accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';

describe('T040 · contratos públicos US2, HTTP y persistencia reales',()=>{
  let data:Us2Dataset;let http:Us1Http;
  let credentials:Awaited<ReturnType<typeof createPasswordCredentials>>;
  beforeAll(async()=>{data=await us2Dataset('us2_contract');credentials=await createPasswordCredentials();},120000);
  beforeEach(async()=>{await data.reset();http=await us1Http(data);});
  afterEach(async()=>{await http?.close();});afterAll(async()=>{await data?.cleanup();});
  const email254='a'.repeat(64)+'@'+'b'.repeat(63)+'.'+'c'.repeat(63)+'.'+'d'.repeat(48)+'.example.test';
  const valid=()=>({name:'  Alumno sintético  ',email:`nuevo-${randomUUID()}@example.test`,password:data.account().password});
  const counts=async()=>{const row=(await data.context.database.pool.query(`SELECT
    (SELECT count(*) FROM "User") AS users,(SELECT count(*) FROM "ActionToken") AS tokens,
    (SELECT count(*) FROM "MailDelivery") AS deliveries,(SELECT count(*) FROM "Session") AS sessions`)).rows[0];return JSON.stringify(row);};
  test('control: readiness, /me habilitado, pendiente sin acceso y fixtures aislados',async()=>{
    expect((await fetch(`${http.url}/health/ready`)).status).toBe(200);
    expect((await http.get('/me',data.account().sessions[0].secret)).status).toBe(200);
    await registrationError(await http.post('/auth/login',{email:data.account('STUDENT','UNVERIFIED').email,
      password:data.account('STUDENT','UNVERIFIED').password}),401,'INVALID_CREDENTIALS');
    expect(data.context.environment.databaseSchema.startsWith('t_')).toBe(true);
  });
  for(const length of [1,100])test(`nombre Unicode ${length} y contraseña Unicode ${length===1?12:128}: límites válidos sin trim de contraseña`,async()=>{
    const body={...valid(),name:'  '+'😀'.repeat(length)+'  ',password:' '+'🔒'.repeat(length===1?10:126)+' '};
    await generic202(await http.post('/auth/register',body),[body.password,body.email]);
    const rows=(await data.context.database.pool.query('SELECT * FROM "User" WHERE "emailCanonical"=$1',[body.email])).rows;
    expect(rows.length).toBe(1);const user=rows[0];
    expect(user.name==='😀'.repeat(length) && user.role==='STUDENT' && user.status==='ACTIVE').toBe(true);
    expect(user.emailVerifiedAt===null && user.mustSetPassword===false && user.authVersion==='0').toBe(true);
    expect(user.passwordHash!==body.password && await credentials.verify(body.password,user.passwordHash)).toBe(true);
    expect(await credentials.verify(body.password.trim(),user.passwordHash)).toBe(false);
    expect((await http.post('/auth/login',{email:body.email,password:body.password})).status).toBe(401);
    expect(Number((await data.context.database.pool.query('SELECT count(*) FROM "Session" WHERE "userId"=$1',[user.id])).rows[0].count)).toBe(0);
  });
  test('correo de 254 caracteres es válido; trim exterior y canónico',async()=>{
    expect(email254.length).toBe(254);const body={...valid(),email:' '+email254.toUpperCase()+' '};
    await generic202(await http.post('/auth/register',body),[body.password]);
    expect((await data.context.database.pool.query('SELECT id FROM "User" WHERE "emailCanonical"=$1',[email254])).rowCount).toBe(1);
  });
  const invalid:[string,Record<string,unknown>][]=[
    ['nombre vacío',{name:' '}],['nombre 101 Unicode',{name:'😀'.repeat(101)}],['nombre array',{name:['Alumno']}],
    ['correo inválido',{email:'sin-arroba'}],['correo vacío',{email:''}],['correo 255',{email:'a'+email254}],['correo array',{email:['alumno@example.test']}],
    ['contraseña 11 Unicode',{password:'🔒'.repeat(11)}],['contraseña 129 Unicode',{password:'🔒'.repeat(129)}],
    ['contraseña vacía',{password:''}],['contraseña array',{password:['no-convertir']}],['contraseña número',{password:123456789012}],
  ];
  for(const [name,patch] of invalid)test(`registro rechaza ${name} sin cuenta ni efectos`,async()=>{
    const before=await counts();const body={...valid(),...patch};
    await registrationError(await http.post('/auth/register',body),400,'VALIDATION_ERROR',[data.account().password]);
    expect(await counts()===before).toBe(true);
  });
  for(const field of ['name','email','password'])test(`campo obligatorio ausente: ${field}`,async()=>{
    const body:Record<string,unknown>=valid();delete body[field];const before=await counts();
    await registrationError(await http.post('/auth/register',body),400,'VALIDATION_ERROR');expect(await counts()===before).toBe(true);
  });
  for(const extra of [{role:'ADMIN'},{roles:['ADMIN','STUDENT']},{permissions:['*']},{status:'ACTIVE'},
    {emailVerified:true},{mustSetPassword:false},{phone:'dato-ajeno'}])test(`registro rechaza campo adicional ${Object.keys(extra)[0]}`,async()=>{
    const before=await counts();await registrationError(await http.post('/auth/register',{...valid(),...extra}),400,'VALIDATION_ERROR');
    expect(await counts()===before).toBe(true);
  });
  test('array como cuerpo no se convierte a objeto de registro',async()=>{
    const before=await counts();await registrationError(await http.post('/auth/register',[valid()]),400,'VALIDATION_ERROR');
    expect(await counts()===before).toBe(true);
  });
  test('202 equivalente en alta nueva y duplicada; sin overwrite ni token nuevo desde registro',async()=>{
    const body=valid();const first=await generic202(await http.post('/auth/register',body),[body.password,body.email]);
    const before=await counts();const user=(await data.context.database.pool.query('SELECT * FROM "User" WHERE "emailCanonical"=$1',[body.email])).rows[0];
    // Comparar dos admisiones permitidas; sin cuota un duplicado debe producir el mismo 429.
    await data.clock!.advance(60000);
    const repeated=await generic202(await http.post('/auth/register',{...body,name:'Otro nombre',email:' '+body.email.toUpperCase()+' ',password:data.account('TEACHER').password}));
    expect(JSON.stringify(first)===JSON.stringify(repeated)).toBe(true);expect(await counts()===before).toBe(true);
    expect(JSON.stringify((await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[user.id])).rows[0])===JSON.stringify(user)).toBe(true);
  });
  for(const variant of ['ENABLED','DISABLED','UNVERIFIED','PROVISIONAL'] as const)test(`duplicado ${variant} no modifica cuenta ni emite enlace`,async()=>{
    const account=data.account('STUDENT',variant);const before=await counts();
    const previous=(await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[account.id])).rows[0];
    await generic202(await http.post('/auth/register',{name:'Cambio indebido',email:' '+account.email.toUpperCase()+' ',password:data.account('TEACHER').password}));
    expect(await counts()===before).toBe(true);
    expect(JSON.stringify((await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[account.id])).rows[0])===JSON.stringify(previous)).toBe(true);
  });
  test('reenvío 202 equivalente en inexistente, verificado, desactivado y pendiente; solo elegible emite',async()=>{
    const responses=[];
    for(const variant of ['ENABLED','DISABLED','UNVERIFIED'] as const){const account=data.account('STUDENT',variant);
      responses.push(await generic202(await http.post('/auth/verification/request',{email:account.email}),[account.email]));}
    responses.push(await generic202(await http.post('/auth/verification/request',{email:'inexistente@example.test'})));
    expect(responses.every(body=>JSON.stringify(body)===JSON.stringify(responses[0]))).toBe(true);
    const tokens=(await data.context.database.pool.query('SELECT "userId" FROM "ActionToken"')).rows;
    expect(tokens.length===1 && tokens[0].userId===data.account('STUDENT','UNVERIFIED').id).toBe(true);
  });
  for(const body of [{email:['inexistente@example.test']},{email:'inválido'},{email:'x@example.test',role:'ADMIN'},{}])test(`reenvío DTO estricto: ${Object.keys(body).join('/')||'vacío'} ${Array.isArray(body.email)?'array':'objeto'}`,async()=>{
    const before=await counts();await registrationError(await http.post('/auth/verification/request',body),400,'VALIDATION_ERROR');
    expect(await counts()===before).toBe(true);
  });
  for(const route of ['/auth/register','/auth/verification/request'])test(`cuota agotada: 429 indistinguible y sin enlace en ${route}`,async()=>{
    const rates=new PostgresRateStore(data.context.database.pool,data.context.environment.rateHmacKey);
    const fresh=valid();const existing=data.account('STUDENT','UNVERIFIED');
    for(const email of [fresh.email,existing.email])expect((await rates.admitMail(email,'VERIFY_EMAIL','127.0.0.1','ADMISSION')).allowed).toBe(true);
    const responses=[];
    for(const email of [fresh.email,existing.email]) {
      responses.push(await http.post(route,route.endsWith('/register')?{...fresh,email}:{email}));
    }
    const errors=[];const retries=[];
    for(const response of responses){errors.push(await registrationError(response,429,'RATE_LIMITED',[fresh.password,fresh.email,existing.email]));retries.push(response.headers.get('retry-after'));}
    expect(JSON.stringify(errors[0])===JSON.stringify(errors[1])).toBe(true);expect(retries[0]===retries[1] && retries[0]==='60').toBe(true);
    const created=(await data.context.database.pool.query('SELECT * FROM "User" WHERE "emailCanonical"=$1',[fresh.email])).rows;
    expect(created.length).toBe(route.endsWith('/register')?1:0);
    if(created.length)expect(created[0].role==='STUDENT' && created[0].emailVerifiedAt===null).toBe(true);
    expect(Number((await data.context.database.pool.query('SELECT count(*) FROM "ActionToken"')).rows[0].count)).toBe(0);
    expect(Number((await data.context.database.pool.query('SELECT count(*) FROM "MailDelivery"')).rows[0].count)).toBe(0);
  });
  test('enlace válido responde 204 y verifica correo sin contraseña, rol ni sesión',async()=>{
    const f=await seedAction(data);const before=(await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[f.account.id])).rows[0];
    const response=await http.post('/auth/verification/confirm',{token:f.secret});expect(response.status).toBe(204);
    expect(await response.text()).toBe('');expect(response.headers.get('set-cookie')).toBeNull();
    const after=(await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[f.account.id])).rows[0];
    expect(after.emailVerifiedAt!==null && after.email===before.email && after.role===before.role
      && after.passwordHash===before.passwordHash && after.mustSetPassword===before.mustSetPassword && after.authVersion===before.authVersion).toBe(true);
    expect((await data.context.database.pool.query('SELECT id FROM "Session" WHERE "userId"=$1',[f.account.id])).rowCount).toBe(0);
    expect((await tokenState(data,f.id)).consumedAt!==null).toBe(true);expect((await tokenState(data,f.id)).revokedAt).toBeNull();
  });
  test('400 uniforme para secretos mal formados, desconocidos, alterados, usados, vencidos y revocados',async()=>{
    const f=await seedAction(data);const responses=[];const path='/auth/verification/confirm';
    for(const token of ['invalid',accessSecrets.issue().secret,f.secret.slice(0,-1)+(f.secret.endsWith('A')?'B':'A')]) {
      responses.push(await http.post(path,{token}));
    }
    await data.clock!.set(f.expiresAt);responses.push(await http.post(path,{token:f.secret}));
    await data.clock!.advance(-86400000);
    await data.context.database.pool.query('UPDATE "ActionToken" SET "revokedAt"=clock_timestamp() WHERE id=$1',[f.id]);
    responses.push(await http.post(path,{token:f.secret}));
    await data.context.database.pool.query('UPDATE "ActionToken" SET "revokedAt"=NULL,"consumedAt"=clock_timestamp() WHERE id=$1',[f.id]);
    responses.push(await http.post(path,{token:f.secret}));
    const errors=[];for(const response of responses)errors.push(await registrationError(response,400,'INVALID_ACTION_LINK',[f.secret]));
    expect(errors.every(error=>JSON.stringify(error)===JSON.stringify(errors[0]))).toBe(true);
    expect((await data.context.database.pool.query('SELECT "emailVerifiedAt" FROM "User" WHERE id=$1',[f.account.id])).rows[0].emailVerifiedAt).toBeNull();
  });
  for(const body of [{token:['invalid']},{token:42},{}, {token:'invalid',email:'x@example.test'}])test(`confirmación rechaza DTO ${Object.keys(body).join('/')||'vacío'} ${Array.isArray(body.token)?'array':typeof body.token}`,async()=>{
    const before=await counts();await registrationError(await http.post('/auth/verification/confirm',body),400,'VALIDATION_ERROR');expect(await counts()===before).toBe(true);
  });
});
