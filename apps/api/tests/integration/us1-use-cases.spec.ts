import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { us1Dataset, sessionState, restrictRead } from '../support/us1-http.js';
import type { Us1Dataset } from '../support/us1-http.js';
import { Login, InvalidCredentials, LoginLimited, LoginUnavailable } from '../../src/modules/identity/application/login.js';
import { PostgresLoginStore } from '../../src/modules/identity/infrastructure/login-store.js';
import { createPasswordCredentials, accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import type { PasswordCredentials } from '../../src/modules/identity/application/credentials.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { Logout } from '../../src/modules/identity/application/logout.js';
import { GetMe, UserReadUnavailable } from '../../src/modules/users/application/get-me.js';
import { PostgresUserQueries } from '../../src/modules/users/infrastructure/user-queries.js';
import { AuthorizationFailure } from '../../src/modules/authorization/public/session.js';

describe('T034–T036 · casos de uso con PostgreSQL y credenciales reales',()=>{
  let data:Us1Dataset;let credentials:PasswordCredentials;
  beforeAll(async()=>{data=await us1Dataset('us1_use_cases',true);credentials=await createPasswordCredentials();},120000);
  beforeEach(async()=>{await data.context.isolated.ownerQuery('DROP TRIGGER IF EXISTS login_fault ON "Session"; DROP FUNCTION IF EXISTS login_fault(); DROP SEQUENCE IF EXISTS "LoginAttempts"');await data.reset();});
  afterAll(async()=>{await data?.cleanup();});
  const pool=()=>data.context.database.pool;
  const rates=()=>new PostgresRateStore(pool(),data.context.environment.rateHmacKey);
  const sessions=()=>new PostgresSessionStore(pool());
  const login=(passwords=credentials)=>new Login(new PostgresLoginStore(pool()),passwords,accessSecrets,rates());
  const own=()=>new GetMe(new PostgresUserQueries(pool()));
  const input=(password=data.account().password)=>({email:data.account().email,password,origin:'127.0.0.1'});
  const count=async()=>Number((await pool().query('SELECT count(*) FROM "Session"')).rows[0].count);

  for(const role of ['STUDENT','TEACHER','ADMIN'] as const) {
    test(`T034 acceso ${role}: identidad permitida y sesión nueva visible después de commit`,async()=>{
      const account=data.account(role);const result=await login().execute({...input(account.password),email:account.email});
      expect(Object.keys(result.user).sort()).toEqual(['id','name','email','role','status','emailVerified','mustSetPassword','createdAt'].sort());
      expect(result.user.id===account.id&&result.user.role===role&&result.user.emailVerified&&!result.user.mustSetPassword).toBe(true);
      expect(account.sessions.every(session=>session.secret!==result.sessionSecret)).toBe(true);
      const actor=await sessions().lookup(result.sessionSecret);expect(actor?.userId===account.id).toBe(true);
      const visible=await data.context.isolated.runtimeQuery('SELECT count(*) FROM "Session"');expect(Number(visible.rows[0].count)).toBe(7);
      const row=await sessionState(data,actor!.sessionId);expect(row.absoluteExpiresAt.getTime()-row.lastAcceptedAt.getTime()).toBe(28800000);
      expect((await pool().query('SELECT count(*) FROM "AuditEvent"')).rows[0].count).toBe('0');
    });
  }
  test('T034 fallos genéricos de cada rol/estado y correo inexistente: sin nuevas sesiones',async()=>{
    const attempts=[{...input(),email:'inexistente@example.test'}];
    for(const role of ['STUDENT','TEACHER','ADMIN'] as const)for(const variant of ['ENABLED','DISABLED','UNVERIFIED','PROVISIONAL'] as const){
      const account=data.account(role,variant);attempts.push({email:account.email,password:variant==='ENABLED'?'contraseña-incorrecta-sintética':account.password,origin:'127.0.0.1'});}
    for(const attempt of attempts)await expect(login().execute(attempt)).rejects.toBeInstanceOf(InvalidCredentials);
    expect(await count()).toBe(6);
  });
  test('T034 correo normalizado; contraseña conserva sus espacios y no se trunca',async()=>{
    await expect(login().execute({...input(),password:` ${data.account().password} `})).rejects.toBeInstanceOf(InvalidCredentials);
    const result=await login().execute({...input(),email:`  ${data.account().email.toUpperCase()}  `});
    expect(result.user.id===data.account().id).toBe(true);
    await expect(login().execute({...input(),password:'corta'})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
    expect(Number((await pool().query(`SELECT count(*) FROM "RateEvent" WHERE status='FAILED'`)).rows[0].count)).toBe(0);
  });
  test('T034 cinco fallos bloquean; persiste al reconstruir casos de uso y vence a los 15 minutos',async()=>{
    for(let i=0;i<5;i++)await expect(login().execute(input('contraseña-incorrecta-sintética'))).rejects.toBeInstanceOf(InvalidCredentials);
    await expect(login().execute(input())).rejects.toMatchObject({code:'RATE_LIMITED',retryAfterSeconds:900});
    expect(await count()).toBe(6);expect((await pool().query('SELECT status FROM "User" WHERE id=$1',[data.account().id])).rows[0].status).toBe('ACTIVE');
    await data.clock!.advance(900000);expect((await login().execute(input())).user.id===data.account().id).toBe(true);
    expect((await rates().reserveLogin(data.account().email,'127.0.0.2')).allowed).toBe(true);
  });
  test('T034 veinte intentos concurrentes no eluden las cinco reservas persistidas',async()=>{
    const result=await Promise.all(Array.from({length:20},async()=>{try{await login().execute(input('contraseña-incorrecta-sintética'));return 'success';}
      catch(error){return error instanceof InvalidCredentials?'invalid':error instanceof LoginLimited?'limited':'unexpected';}}));
    expect(result.filter(value=>value==='invalid').length).toBe(5);expect(result.filter(value=>value==='limited').length).toBe(15);
    expect(await count()).toBe(6);
  });
  test('T034 Argon2 se verifica fuera del lock; devuelve la vista vigente al confirmar',async()=>{
    let entered!:()=>void;const hashing=new Promise<void>(resolve=>{entered=resolve;});let release!:()=>void;const continueHash=new Promise<void>(resolve=>{release=resolve;});
    const wrapped:PasswordCredentials={hash:credentials.hash,async verify(password,hash){const result=await credentials.verify(password,hash);entered();await continueHash;return result;}};
    const pending=login(wrapped).execute(input());await hashing;
    try {const client=await pool().connect();try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='150ms'");
      await client.query('UPDATE "User" SET name=$2 WHERE id=$1',[data.account().id,'Nombre vigente']);await client.query('COMMIT');}
      finally{await client.query('ROLLBACK').catch(()=>undefined);client.release();}}
    finally{release();}
    expect((await pending).user.name).toBe('Nombre vigente');
  });
  for(const change of ['hash','version','status','verification','mustSetPassword','role'] as const) {
    test(`T034 revalida ${change} cambiado mientras se calcula la credencial`,async()=>{
      let entered!:()=>void;const hashed=new Promise<void>(resolve=>{entered=resolve;});let release!:()=>void;const resumed=new Promise<void>(resolve=>{release=resolve;});
      const wrapped:PasswordCredentials={hash:credentials.hash,async verify(password,hash){const result=await credentials.verify(password,hash);entered();await resumed;return result;}};
      const pending=login(wrapped).execute(input());const rejected=expect(pending).rejects.toBeInstanceOf(InvalidCredentials);await hashed;
      try {
        const updates={hash:'"passwordHash"=(SELECT "passwordHash" FROM "User" WHERE id=$2)',version:'"authVersion"="authVersion"+1',
          status:'status=\'DISABLED\',"disabledAt"=clock_timestamp()',verification:'"emailVerifiedAt"=NULL',mustSetPassword:'"mustSetPassword"=true',
          role:'role=\'ADMIN\',"authVersion"="authVersion"+1'};
        await pool().query(`UPDATE "User" SET ${updates[change]} WHERE id=$1`,change==='hash'?[data.account().id,data.account('TEACHER').id]:[data.account().id]);
      }finally{release();}
      await rejected;expect(await count()).toBe(6);
    });
  }
  async function fault(code:string,failures:number,deferred=false) {
    await data.context.isolated.ownerQuery(`CREATE SEQUENCE "LoginAttempts";
      CREATE FUNCTION login_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF nextval('"LoginAttempts"')<=${failures} THEN RAISE EXCEPTION 'Fallo controlado' USING ERRCODE='${code}'; END IF; RETURN NEW; END $$;
      ${deferred?'CREATE CONSTRAINT TRIGGER login_fault AFTER INSERT ON "Session" DEFERRABLE INITIALLY DEFERRED':'CREATE TRIGGER login_fault BEFORE INSERT ON "Session"'}
      FOR EACH ROW EXECUTE FUNCTION login_fault();`);
  }
  for(const code of ['40001','40P01'])test(`T034 dos reintentos por ${code}, sin sesiones duplicadas`,async()=>{
    await fault(code,2);expect((await login().execute(input())).user.id===data.account().id).toBe(true);
    expect(Number((await pool().query('SELECT last_value FROM "LoginAttempts"')).rows[0].last_value)).toBe(3);expect(await count()).toBe(7);
  });
  test('T034 conflicto persistente: máximo tres intentos, rollback y error seguro',async()=>{
    await fault('40P01',100);await expect(login().execute(input())).rejects.toBeInstanceOf(LoginUnavailable);
    expect(Number((await pool().query('SELECT last_value FROM "LoginAttempts"')).rows[0].last_value)).toBe(3);expect(await count()).toBe(6);
  });
  test('T034 fallo real al COMMIT: nunca devuelve éxito ni deja sesión parcial',async()=>{
    await fault('23514',100,true);await expect(login().execute(input())).rejects.toBeInstanceOf(LoginUnavailable);
    expect(Number((await pool().query('SELECT last_value FROM "LoginAttempts"')).rows[0].last_value)).toBe(1);expect(await count()).toBe(6);
  });
  test('T034 fallo de lectura y de hash: error genérico sin sesión ni reservas en vuelo',async()=>{
    await restrictRead(data,'User',false);
    try{await expect(login().execute(input())).rejects.toBeInstanceOf(LoginUnavailable);}finally{await restrictRead(data,'User',true);}
    const failing:PasswordCredentials={hash:credentials.hash,async verify(){throw new Error('Fallo sintético privado');}};
    await expect(login(failing).execute(input())).rejects.toBeInstanceOf(LoginUnavailable);
    expect(await count()).toBe(6);expect(Number((await pool().query(`SELECT count(*) FROM "RateEvent" WHERE status='RESERVED'`)).rows[0].count)).toBe(0);
  });
  test('T034 reserva fallida no verifica hash ni crea sesión',async()=>{
    let verified=false;const unavailable=new Login(new PostgresLoginStore(pool()),
      {hash:credentials.hash,async verify(){verified=true;return false;}},accessSecrets,
      {async reserveLogin(){throw new Error('Fallo de cuota');},finishLogin:async()=>false});
    await expect(unavailable.execute(input())).rejects.toBeInstanceOf(LoginUnavailable);expect(verified).toBe(false);expect(await count()).toBe(6);
  });
  test('T034 reserva vencida después del commit no produce éxito ni expone credenciales',async()=>{
    const limits=rates();const delayed=new Login(new PostgresLoginStore(pool()),credentials,accessSecrets,
      {reserveLogin:(email,origin)=>limits.reserveLogin(email,origin),async finishLogin(reservation,succeeded){
        await data.clock!.advance(30000);return limits.finishLogin(reservation,succeeded);}});
    let error:unknown;try{await delayed.execute(input());}catch(value){error=value;}
    expect(error instanceof LoginUnavailable).toBe(true);
    expect(error!==null&&typeof error==='object'&&Object.keys(error).every(key=>key==='code')).toBe(true);
    // No se afirma rollback de un commit ya confirmado: la credencial nunca se devuelve.
    expect(await count()).toBe(7);
    expect(Number((await pool().query(`SELECT count(*) FROM "RateEvent" WHERE status='FAILED'`)).rows[0].count)).toBe(1);
  });
  test('T035/T036 dos sesiones, logout idempotente y vista propia sin renovar por una lectura interna',async()=>{
    const account=data.account();const [first,second]=account.sessions;const actor=(await sessions().lookup(first.secret))!;
    const before=await sessionState(data,first.id);await data.clock!.advance(60000);
    expect((await own().execute(actor)).id===account.id).toBe(true);
    expect((await sessionState(data,first.id)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
    const logout=new Logout(sessions());await logout.execute(null);await logout.execute(first.secret);await logout.execute(first.secret);await logout.execute(accessSecrets.issue().secret);
    await expect(own().execute(actor)).rejects.toBeInstanceOf(AuthorizationFailure);
    expect((await own().execute((await sessions().lookup(second.secret))!)).id===account.id).toBe(true);
  });
  test('T036 actor de otra sesión o versión antigua no puede consultar otra identidad',async()=>{
    const actor=(await sessions().lookup(data.account().sessions[0].secret))!;
    await expect(own().execute({...actor,userId:data.account('ADMIN').id})).rejects.toBeInstanceOf(AuthorizationFailure);
    await pool().query('UPDATE "User" SET "authVersion"="authVersion"+1 WHERE id=$1',[actor.userId]);
    await expect(own().execute(actor)).rejects.toBeInstanceOf(AuthorizationFailure);
  });
  test('T036 fallo de persistencia devuelve error seguro y no modifica actividad',async()=>{
    const session=data.account().sessions[0];const actor=(await sessions().lookup(session.secret))!;const before=await sessionState(data,session.id);
    await restrictRead(data,'User',false);try{await expect(own().execute(actor)).rejects.toBeInstanceOf(UserReadUnavailable);}
    finally{await restrictRead(data,'User',true);}
    expect((await sessionState(data,session.id)).lastAcceptedAt.getTime()).toBe(before.lastAcceptedAt.getTime());
  });
});
