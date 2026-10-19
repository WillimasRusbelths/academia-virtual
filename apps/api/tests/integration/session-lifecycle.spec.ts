import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { us1Dataset, us1Http, us1Process, sessionState, restrictRead } from '../support/us1-http.js';
import type { Us1Dataset, Us1Http } from '../support/us1-http.js';
import { safeError, userView } from '../support/us1-assertions.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';

describe('T032 · ciclo persistido de sesiones US1',()=>{
  let data:Us1Dataset;let http:Us1Http;
  beforeAll(async()=>{data=await us1Dataset('us1_lifecycle',true);},120000);
  beforeEach(async()=>{await data.reset();http=await us1Http(data);});
  afterEach(async()=>{await http?.close();});
  afterAll(async()=>{await data?.cleanup();});
  const store=()=>new PostgresSessionStore(data.context.database.pool);
  const rates=()=>new PostgresRateStore(data.context.database.pool,data.context.environment.rateHmacKey);
  async function restart(){await http.close();http=await us1Http(data);}

  test('control del reloj aislado: 29:59 válido y 30:00 inválido en el repositorio existente',async()=>{
    const session=data.account().sessions[0];const before=await sessionState(data,session.id);
    await data.clock!.advance(1799000);expect(await store().lookup(session.secret)!==null).toBe(true);
    await data.clock!.advance(1000);expect(await store().lookup(session.secret)).toBeNull();
    expect((await sessionState(data,session.id)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  });
  test('GET me a 29:59 renueva actividad y conserva caducidad absoluta',async()=>{
    const account=data.account();const session=account.sessions[0];const before=await sessionState(data,session.id);
    await data.clock!.advance(1799000);await userView(await http.get('/me',session.secret),account);
    const after=await sessionState(data,session.id);
    expect(after.lastAcceptedAt.getTime()).toBe((await data.clock!.now()).getTime());
    expect(after.absoluteExpiresAt.getTime()).toBe(before.absoluteExpiresAt.getTime());
    await data.clock!.advance(1000);await userView(await http.get('/me',session.secret),account);
  });
  for(const boundary of ['30 minutos','8 horas'] as const) {
    test(`rechazo en ${boundary} exactos, sin renovar`,async()=>{
      const session=data.account().sessions[0];const created=(await sessionState(data,session.id)).lastAcceptedAt;
      if(boundary==='8 horas')await data.context.database.pool.query('UPDATE "Session" SET "lastAcceptedAt"=$2 WHERE id=$1',
        [session.id,new Date(created.getTime()+7*3600000+59*60000)]);
      const before=await sessionState(data,session.id);
      await data.clock!.advance(boundary==='30 minutos'?1800000:8*3600000);
      expect(await store().lookup(session.secret)).toBeNull();
      await safeError(await http.get('/me',session.secret),401,'AUTH_REQUIRED',[session.secret]);
      expect((await sessionState(data,session.id)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
    });
  }
  test('400/403 del transporte y salud 200 no renuevan',async()=>{
    const session=data.account().sessions[0];const before=await sessionState(data,session.id);await data.clock!.advance(60000);
    const malformed=await fetch(`${http.url}/api/v1/auth/login`,{method:'POST',headers:http.headers(session.secret),body:'{'});
    expect(malformed.status).toBe(400);
    const headers=http.headers(session.secret);delete (headers as Record<string,string>)['x-csrf-protection'];
    expect((await fetch(`${http.url}/api/v1/auth/logout`,{method:'POST',headers,body:'{}'})).status).toBe(403);
    for(const path of ['/health/live','/health/ready'])expect((await fetch(`${http.url}${path}`,{headers:http.headers(session.secret)})).status).toBe(200);
    expect((await sessionState(data,session.id)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  });
  test('401 por sesión inválida y 404 no renuevan una sesión existente',async()=>{
    const session=data.account().sessions[0];const before=await sessionState(data,session.id);await data.clock!.advance(60000);
    const denied=await http.get('/me','invalid');const absent=await http.get('/ruta-inexistente',session.secret);
    expect(absent.status).toBe(404);await safeError(denied,401,'AUTH_REQUIRED');
    expect((await sessionState(data,session.id)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  });
  test('503 de readiness con pool cerrado no renueva; reiniciar restablece persistencia',async()=>{
    const session=data.account().sessions[0];const before=await sessionState(data,session.id);await data.clock!.advance(60000);
    await http.database.close();expect((await fetch(`${http.url}/health/ready`,{headers:http.headers(session.secret)})).status).toBe(503);
    expect((await sessionState(data,session.id)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
    await restart();expect(await new PostgresSessionStore(http.database.pool).lookup(session.secret)!==null).toBe(true);
  });
  test('503 protegido ante fallo SQL real no renueva',async()=>{
    const session=data.account().sessions[0];const before=await sessionState(data,session.id);await data.clock!.advance(60000);
    await restrictRead(data,'Session',false);
    try {await expect(store().lookup(session.secret)).rejects.toThrow('');
      await safeError(await http.get('/me',session.secret),503,'TEMPORARILY_UNAVAILABLE',[session.secret]);}
    finally {await restrictRead(data,'Session',true);}
    expect((await sessionState(data,session.id)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  });
  test('GET me concurrentes conservan máximo GREATEST y vencimiento absoluto',async()=>{
    const session=data.account().sessions[0];const before=await sessionState(data,session.id);await data.clock!.advance(60000);
    const instant=await data.clock!.now();const responses=await Promise.all(Array.from({length:12},()=>http.get('/me',session.secret)));
    expect(responses.map(response=>response.status)).toEqual(Array(12).fill(200));
    expect((await sessionState(data,session.id)).lastAcceptedAt.getTime()).toBe(instant.getTime());
    // Un instante anterior que todavía es válido no debe hacer retroceder la actividad.
    await data.clock!.advance(-1000);
    const delayed=await Promise.all(Array.from({length:4},()=>http.get('/me',session.secret)));
    expect(delayed.map(response=>response.status)).toEqual(Array(4).fill(200));
    const after=await sessionState(data,session.id);expect(after.lastAcceptedAt.getTime()).toBe(instant.getTime());
    expect(after.absoluteExpiresAt.getTime()).toBe(before.absoluteExpiresAt.getTime());
  });
  test('control PostgreSQL: aceptación concurrente GREATEST y reconexión sin caché',async()=>{
    const session=data.account().sessions[0];const actor=(await store().lookup(session.secret))!;await data.clock!.advance(60000);
    expect(await Promise.all(Array.from({length:12},()=>store().accept(actor)))).toEqual(Array(12).fill(true));
    const maximum=(await sessionState(data,session.id)).lastAcceptedAt;await data.clock!.advance(-1000);
    expect(await store().accept(actor)).toBe(true);await restart();
    expect((await sessionState(data,session.id)).lastAcceptedAt.getTime()).toBe(maximum.getTime());
    expect(await new PostgresSessionStore(http.database.pool).lookup(session.secret)!==null).toBe(true);
  });
  test('logout solo revoca una de dos sesiones; reinicio conserva revocación y segunda sesión',async()=>{
    const account=data.account();const [first,second]=account.sessions;
    await userView(await http.get('/me',first.secret),account);await userView(await http.get('/me',second.secret),account);
    expect((await http.post('/auth/logout',{},first.secret)).status).toBe(204);await restart();
    await safeError(await http.get('/me',first.secret),401,'AUTH_REQUIRED');await userView(await http.get('/me',second.secret),account);
    expect((await sessionState(data,first.id)).revokedAt!==null).toBe(true);expect((await sessionState(data,second.id)).revokedAt).toBeNull();
  });
  test('control: cinco fallos persistidos sobreviven nueva composición y bloqueo vence en 15 minutos',async()=>{
    const account=data.account();for(let i=0;i<5;i++){const admission=await rates().reserveLogin(account.email,'127.0.0.1');
      expect(admission.allowed).toBe(true);if(admission.allowed)expect(await rates().finishLogin(admission.reservation,false)).toBe(true);}
    await restart();const next=new PostgresRateStore(http.database.pool,data.context.environment.rateHmacKey);
    expect((await next.reserveLogin(account.email,'127.0.0.1')).allowed).toBe(false);
    await data.clock!.advance(899999);expect((await next.reserveLogin(account.email,'127.0.0.1')).allowed).toBe(false);
    await data.clock!.advance(1);expect((await next.reserveLogin(account.email,'127.0.0.1')).allowed).toBe(true);
    expect((await data.context.database.pool.query('SELECT status FROM "User" WHERE id=$1',[account.id])).rows[0].status).toBe('ACTIVE');
  });
  test('fallos HTTP persisten entre composiciones; sexto intento bloqueado aunque contraseña correcta',async()=>{
    const account=data.account();const responses=[];
    for(let i=0;i<5;i++)responses.push(await http.post('/auth/login',{email:account.email,password:'contraseña-incorrecta-sintética'}));
    await restart();const limited=await http.post('/auth/login',{email:account.email,password:account.password});
    for(const response of responses)await safeError(response,401,'INVALID_CREDENTIALS');
    await safeError(limited,429,'RATE_LIMITED',[account.password]);
    expect(Number((await data.context.database.pool.query(`SELECT count(*) FROM "RateEvent" WHERE status='FAILED'`)).rows[0].count)).toBe(5);
    await data.clock!.advance(900000);await userView(await http.post('/auth/login',{email:account.email,password:account.password}),account);
  });
  test('control: detener y arrancar procesos reales conserva sesiones, revocación y contadores',async()=>{
    const account=data.account();const [first,second]=account.sessions;
    const reservation=await rates().reserveLogin(account.email,'127.0.0.1');
    expect(reservation.allowed).toBe(true);if(reservation.allowed)await rates().finishLogin(reservation.reservation,false);
    await store().revoke(first.secret);
    const old=await us1Process(data);await old.close();const fresh=await us1Process(data);
    try {
      expect(fresh.pid!==old.pid).toBe(true);expect([200,404].includes((await fresh.get(second.secret)).status)).toBe(true); // diagnóstico, no aceptación
      expect(await store().lookup(first.secret)).toBeNull();expect((await store().lookup(second.secret))?.userId===account.id).toBe(true);
      expect(Number((await data.context.database.pool.query(`SELECT count(*) FROM "RateEvent" WHERE status='FAILED'`)).rows[0].count)).toBe(1);
    } finally {await fresh.close();}
  },30000);
  test('logout HTTP y reinicio real: primera sesión denegada y segunda vigente',async()=>{
    const account=data.account();const [first,second]=account.sessions;const initial=await us1Process(data);
    const response=await initial.logout(first.secret);await initial.close();const fresh=await us1Process(data);
    try {expect(response.status).toBe(204);await safeError(await fresh.get(first.secret),401,'AUTH_REQUIRED');await userView(await fresh.get(second.secret),account);}
    finally {await fresh.close();}
  },30000);
});
