import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { us1Dataset, sessionState, restrictRead } from '../support/us1-http.js';
import type { Us1Dataset } from '../support/us1-http.js';
import { implementedHttp } from '../support/us1-implemented-http.js';
import { safeError, userView, cookieAttributes } from '../support/us1-assertions.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';

describe('T035/T036 · controladores reales antes del montaje T037',()=>{
  let data:Us1Dataset;let http:Awaited<ReturnType<typeof implementedHttp>>;
  beforeAll(async()=>{data=await us1Dataset('us1_read_logout',true);},120000);
  beforeEach(async()=>{await data.reset();http=await implementedHttp(data);});
  afterEach(async()=>{await http?.close();});afterAll(async()=>{await data?.cleanup();});
  for(const role of ['STUDENT','TEACHER','ADMIN'] as const)test(`/me ${role}: UserView permitido y renovación solo tras éxito`,async()=>{
    const account=data.account(role);const session=account.sessions[0];const before=await sessionState(data,session.id);
    await data.clock!.advance(1799000);await userView(await http.get(session.secret),account);
    const after=await sessionState(data,session.id);expect(after.lastAcceptedAt.getTime()).toBe((await data.clock!.now()).getTime());
    expect(after.absoluteExpiresAt.getTime()).toBe(before.absoluteExpiresAt.getTime());
  });
  for(const invalid of ['ausente','formato','desconocida','revocada','version','desactivada','no-verificada','provisional','Bearer'] as const)test(`/me deniega ${invalid}`,async()=>{
    const account=data.account();const session=account.sessions[0];let secret:string|undefined=session.secret;
    if(invalid==='ausente'||invalid==='Bearer')secret=undefined;
    if(invalid==='formato')secret='invalid';if(invalid==='desconocida')secret=accessSecrets.issue().secret;
    if(invalid==='revocada')await new PostgresSessionStore(data.context.database.pool).revoke(session.secret);
    if(invalid==='version')await data.context.database.pool.query('UPDATE "User" SET "authVersion"="authVersion"+1 WHERE id=$1',[account.id]);
    if(invalid==='desactivada')await data.context.database.pool.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`,[account.id]);
    if(invalid==='no-verificada')await data.context.database.pool.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1',[account.id]);
    if(invalid==='provisional')await data.context.database.pool.query('UPDATE "User" SET "mustSetPassword"=true WHERE id=$1',[account.id]);
    await safeError(await http.get(secret,'',invalid==='Bearer'?{authorization:`Bearer ${session.secret}`} :{}),401,'AUTH_REQUIRED',[session.secret]);
  });
  for(const boundary of ['inactividad','absoluta'])test(`/me deniega ${boundary} exacta sin renovar`,async()=>{
    const session=data.account().sessions[0];const before=await sessionState(data,session.id);
    if(boundary==='absoluta')await data.context.database.pool.query('UPDATE "Session" SET "lastAcceptedAt"=$2 WHERE id=$1',[session.id,new Date(before.lastAcceptedAt.getTime()+28740000)]);
    const prior=await sessionState(data,session.id);await data.clock!.advance(boundary==='inactividad'?1800000:28800000);
    await safeError(await http.get(session.secret),401,'AUTH_REQUIRED');
    expect((await sessionState(data,session.id)).lastAcceptedAt.getTime()).toBe(prior.lastAcceptedAt.getTime());
  });
  test('GET me rechaza filtros ajenos y no renueva actividad',async()=>{
    const session=data.account().sessions[0];const before=await sessionState(data,session.id);await data.clock!.advance(60000);
    for(const query of ['?userId='+data.account('ADMIN').id,'?role=ADMIN'])expect((await http.get(session.secret,query)).status).toBe(400);
    expect((await sessionState(data,session.id)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  });
  test('/me simultáneos usan GREATEST y conservan la expiración absoluta',async()=>{
    const session=data.account().sessions[0];const before=await sessionState(data,session.id);await data.clock!.advance(60000);const maximum=await data.clock!.now();
    expect((await Promise.all(Array.from({length:12},()=>http.get(session.secret)))).map(response=>response.status)).toEqual(Array(12).fill(200));
    await data.clock!.advance(-1000);expect((await http.get(session.secret)).status).toBe(200);
    const after=await sessionState(data,session.id);expect(after.lastAcceptedAt.getTime()).toBe(maximum.getTime());expect(after.absoluteExpiresAt.getTime()).toBe(before.absoluteExpiresAt.getTime());
  });
  test('logout idempotente y una sesión revocada; segunda persiste tras recomponer HTTP',async()=>{
    const account=data.account();const [first,second]=account.sessions;
    for(const secret of [undefined,first.secret,first.secret,accessSecrets.issue().secret]){
      const response=await http.logout(secret);expect(response.status).toBe(204);expect(await response.text()).toBe('');
      cookieAttributes(response.headers.get('set-cookie'),http,true);
    }
    await http.close();http=await implementedHttp(data);await safeError(await http.get(first.secret),401,'AUTH_REQUIRED');await userView(await http.get(second.secret),account);
    expect((await sessionState(data,first.id)).revokedAt!==null).toBe(true);expect((await sessionState(data,second.id)).revokedAt).toBeNull();
  });
  test('logout HTTPS borra __Host- con los atributos contractuales',async()=>{
    await http.close();http=await implementedHttp(data,'https://academia.example.test');
    const response=await http.logout(data.account().sessions[0].secret);expect(response.status).toBe(204);cookieAttributes(response.headers.get('set-cookie'),http,true);
  });
  test('logout rechaza cuerpo ajeno y Origin/CSRF incorrectos sin revocar ni renovar',async()=>{
    const session=data.account().sessions[0];const before=await sessionState(data,session.id);await data.clock!.advance(60000);
    for(const body of [{userId:data.account('ADMIN').id},[],null])expect((await http.logout(session.secret,body)).status).toBe(400);
    expect((await http.logout(session.secret,{}, {origin:'http://127.0.0.1:5173'})).status).toBe(403);
    expect((await http.logout(session.secret,{}, {'x-csrf-protection':'invalid'})).status).toBe(403);
    const after=await sessionState(data,session.id);expect(after.revokedAt).toBeNull();expect(after.lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  });
  test('fallos SQL reales en /me/logout producen 503 sin secretos, falsa limpieza ni actividad',async()=>{
    const session=data.account().sessions[0];const before=await sessionState(data,session.id);await data.clock!.advance(60000);await restrictRead(data,'Session',false);
    try {
      await safeError(await http.get(session.secret),503,'TEMPORARILY_UNAVAILABLE',[session.secret]);
      await safeError(await http.logout(session.secret),503,'TEMPORARILY_UNAVAILABLE',[session.secret]);
    }finally{await restrictRead(data,'Session',true);}
    const after=await sessionState(data,session.id);expect(after.revokedAt).toBeNull();expect(after.lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  });
});
