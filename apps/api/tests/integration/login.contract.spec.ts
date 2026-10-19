import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { us1Dataset, us1Http, restrictRead, sessionState } from '../support/us1-http.js';
import type { Us1Dataset, Us1Http } from '../support/us1-http.js';
import { cookieAttributes, safeError, userView } from '../support/us1-assertions.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';

describe('T031 · contratos US1 con composición y PostgreSQL reales',()=>{
  let data:Us1Dataset;let http:Us1Http;
  beforeAll(async()=>{data=await us1Dataset('us1_contract');},120000);
  beforeEach(async()=>{await data.reset();http=await us1Http(data);});
  afterEach(async()=>{await http?.close();});
  afterAll(async()=>{await data?.cleanup();});

  test('control: readiness, tres roles y sesiones de fixtures válidas',async()=>{
    expect((await fetch(`${http.url}/health/ready`)).status).toBe(200);
    const store=new PostgresSessionStore(data.context.database.pool);
    for(const role of ['STUDENT','TEACHER','ADMIN'] as const) {
      const account=data.account(role);const actor=await store.lookup(account.sessions[0].secret);
      expect(actor?.userId===account.id && actor.role===role).toBe(true);
    }
  });
  for(const role of ['STUDENT','TEACHER','ADMIN'] as const) {
    test(`login ${role}: UserView cerrado y cookie nueva; ningún Bearer`,async()=>{
      const account=data.account(role);const prior=account.sessions[0].secret;
      const response=await http.post('/auth/login',{email:account.email,password:account.password},prior);
      await userView(response,account);
      const secret=cookieAttributes(response.headers.get('set-cookie'),http);
      expect(secret!==prior).toBe(true);
      expect(response.headers.get('authorization')).toBeNull();
      const actor=await new PostgresSessionStore(data.context.database.pool).lookup(secret);
      expect(actor?.userId===account.id).toBe(true);
      const rows=await data.context.database.pool.query('SELECT id FROM "Session" WHERE "tokenHash"=$1',[Buffer.from(accessSecrets.digest(secret)!)]);
      expect(rows.rowCount).toBe(1);
    });
    test(`GET me ${role}: identidad propia sin secretos`,async()=>{
      const account=data.account(role);await userView(await http.get('/me',account.sessions[0].secret),account);
    });
  }
  test('401 uniforme: inexistente, contraseña errónea y estados inválidos con contraseña correcta/incorrecta',async()=>{
    const cases=[{email:'inexistente@example.test',password:data.account().password}];
    for(const role of ['STUDENT','TEACHER','ADMIN'] as const)cases.push({email:data.account(role).email,password:'contraseña-incorrecta-sintética'});
    for(const role of ['STUDENT','TEACHER','ADMIN'] as const) for(const variant of ['DISABLED','UNVERIFIED','PROVISIONAL'] as const) {
      const account=data.account(role,variant);
      cases.push({email:account.email,password:account.password},{email:account.email,password:'contraseña-incorrecta-sintética'});
    }
    // Provisional vencida y verificada pero pendiente de fijar contraseña siguen sin poder acceder.
    await data.context.database.pool.query(`UPDATE "User" SET "createdAt"="createdAt"-interval '25 hours',
      "provisionalExpiresAt"="createdAt"-interval '1 hour' WHERE id=$1`,[data.account('TEACHER','PROVISIONAL').id]);
    await data.context.database.pool.query(`UPDATE "User" SET "emailVerifiedAt"=clock_timestamp() WHERE id=$1`,[data.account('ADMIN','PROVISIONAL').id]);
    const count=Number((await data.context.database.pool.query('SELECT count(*) FROM "Session"')).rows[0].count);
    const responses=[];for(const body of cases)responses.push(await http.post('/auth/login',body));
    const errors=[];
    for(const response of responses) errors.push(await safeError(response,401,'INVALID_CREDENTIALS',cases.flatMap(item=>[item.password,item.email])));
    expect(errors.every(error=>error.code===errors[0].code && error.message===errors[0].message)).toBe(true);
    expect(Number((await data.context.database.pool.query('SELECT count(*) FROM "Session"')).rows[0].count)).toBe(count);
  });
  for(const invalid of ['absente','formato','desconocida','revocada','version','Bearer'] as const) {
    test(`GET me rechaza credencial ${invalid}`,async()=>{
      const session=data.account().sessions[0];let secret:string|undefined=session.secret;
      if(invalid==='absente'||invalid==='Bearer')secret=undefined;
      if(invalid==='formato')secret='invalid';
      if(invalid==='desconocida')secret=accessSecrets.issue().secret;
      if(invalid==='revocada')await new PostgresSessionStore(data.context.database.pool).revoke(session.secret);
      if(invalid==='version')await data.context.database.pool.query('UPDATE "User" SET "authVersion"="authVersion"+1 WHERE id=$1',[data.account().id]);
      await safeError(await http.get('/me',secret,invalid==='Bearer'?{authorization:`Bearer ${session.secret}`} :undefined),401,'AUTH_REQUIRED',[session.secret]);
    });
  }
  test('429 seguro después de cinco fallos persistidos, con Retry-After y sin sesión nueva',async()=>{
    const account=data.account();const rates=new PostgresRateStore(data.context.database.pool,data.context.environment.rateHmacKey);
    for(let i=0;i<5;i++) {const admission=await rates.reserveLogin(account.email,'127.0.0.1');
      expect(admission.allowed).toBe(true);if(admission.allowed)expect(await rates.finishLogin(admission.reservation,false)).toBe(true);}
    expect((await rates.reserveLogin(account.email,'127.0.0.1')).allowed).toBe(false);
    const response=await http.post('/auth/login',{email:account.email,password:account.password});
    await safeError(response,429,'RATE_LIMITED',[account.password]);
    const retry=Number(response.headers.get('retry-after'));expect(retry>=1&&retry<=900).toBe(true);
    expect(Number((await data.context.database.pool.query('SELECT count(*) FROM "Session"')).rows[0].count)).toBe(6);
  });
  test('503 seguro ante fallo real de acceso a persistencia; readiness sigue disponible',async()=>{
    const account=data.account();await restrictRead(data,'User',false);
    try {
      let denied=false;try{await data.context.database.pool.query('SELECT id FROM "User"');}catch(error){denied=!!error&&typeof error==='object'&&'code'in error&&error.code==='42501';}
      expect(denied).toBe(true);expect((await fetch(`${http.url}/health/ready`)).status).toBe(200);
      await safeError(await http.post('/auth/login',{email:account.email,password:account.password}),503,'TEMPORARILY_UNAVAILABLE',[account.password]);
    } finally {await restrictRead(data,'User',true);}
  });
  test('logout idempotente: sin sesión, actual, repetida y desconocida; solo revoca la actual',async()=>{
    const [first,second]=data.account().sessions;
    const responses=[await http.post('/auth/logout',{}),await http.post('/auth/logout',{},first.secret),
      await http.post('/auth/logout',{},first.secret),await http.post('/auth/logout',{},accessSecrets.issue().secret)];
    for(const response of responses) {expect(response.status).toBe(204);expect(await response.text()).toBe('');cookieAttributes(response.headers.get('set-cookie'),http,true);}
    expect((await sessionState(data,first.id)).revokedAt!==null).toBe(true);
    expect((await sessionState(data,second.id)).revokedAt).toBeNull();
  });
  test('adaptador existente: atributos locales y HTTPS de emisión y borrado',async()=>{
    cookieAttributes(http.cookie.issue(accessSecrets.issue().secret),http);cookieAttributes(http.cookie.clear(),http,true);
    const secure=await us1Http(data,'https://academia.example.test');
    try {cookieAttributes(secure.cookie.issue(accessSecrets.issue().secret),secure);cookieAttributes(secure.cookie.clear(),secure,true);}
    finally {await secure.close();}
  });
  test('rutas bajo configuración HTTPS: cookie __Host- Secure y borrado con mismos atributos',async()=>{
    const secure=await us1Http(data,'https://academia.example.test');const account=data.account();
    try {
      const response=await secure.post('/auth/login',{email:account.email,password:account.password});
      await userView(response,account);const secret=cookieAttributes(response.headers.get('set-cookie'),secure);
      const logout=await secure.post('/auth/logout',{},secret);expect(logout.status).toBe(204);cookieAttributes(logout.headers.get('set-cookie'),secure,true);
    } finally {await secure.close();}
  });
});
