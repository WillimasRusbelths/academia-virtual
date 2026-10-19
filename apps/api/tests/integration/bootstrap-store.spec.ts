import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import { sessionFixture } from '../support/session-fixture.js';
import type { IdentityTestDatabase } from '../support/session-fixture.js';
import { PostgresBootstrapStore } from '../../src/modules/identity/infrastructure/bootstrap-store.js';
import type { BootstrapAuditWriter } from '../../src/modules/identity/infrastructure/bootstrap-store.js';
import { BootstrapUnavailable } from '../../src/modules/identity/application/identity-store.js';
import type { PreparedBootstrap } from '../../src/modules/identity/application/identity-store.js';
import { BootstrapAlreadyInitialized } from '../../src/modules/identity/domain/bootstrap.js';
import { canAccessApplication, canUseProvisionalPassword } from '../../src/modules/identity/domain/access.js';
import type { AccountAccess } from '../../src/modules/identity/domain/access.js';
import { hashNewPassword, verifyProvisionalCredential } from '../../src/modules/identity/application/credentials.js';
import type { PasswordCredentials } from '../../src/modules/identity/application/credentials.js';
import { accessSecrets, createPasswordCredentials } from '../../src/modules/identity/infrastructure/credentials.js';
import { PostgresAuditWriter } from '../../src/modules/audit/infrastructure/audit-writer.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';

let context: IdentityTestDatabase;
let rates: PostgresRateStore;
let credentials: PasswordCredentials;
const audit = new PostgresAuditWriter();
beforeAll(async () => {
  context = await identityDatabase('bootstrap');
  rates = new PostgresRateStore(context.database.pool,context.environment.rateHmacKey);
  credentials = await createPasswordCredentials();
},120000);
afterEach(async () => {
  vi.restoreAllMocks();
  // Exclusivamente el esquema aleatorio de esta suite en *_test. No restablecer marcas reales.
  await context.isolated.ownerQuery(`DROP FUNCTION IF EXISTS bootstrap_test_failure() CASCADE;
    TRUNCATE "SystemState","AuditEvent","MailDelivery","ActionToken","Session","User","RateEvent","RateBucket";
    INSERT INTO "SystemState" (id) VALUES (1);`);
});
afterAll(async () => { await context?.cleanup(); });

function store(writer: BootstrapAuditWriter = audit) {
  return new PostgresBootstrapStore(context.database.pool,rates,writer);
}
async function prepared(email = `${randomUUID()}@EXAMPLE.TEST`) {
  const password = randomUUID();
  const provisionalPasswordHash = await hashNewPassword(password,credentials);
  const issued = accessSecrets.issue();
  const input: PreparedBootstrap = { name:'  Responsable de ensayo  ',email:` ${email} `,
    provisionalPasswordHash,requestId:randomUUID(),origin:'127.0.0.1',verification:{
      tokenHash:issued.digest,payload:createPayloadCipher(context.environment).encrypt({
        recipient:email,template:'VERIFY_EMAIL',link:`${context.environment.appOrigin}/verificar-correo#${issued.secret}` }) } };
  return { input,password,issued };
}
async function counts() {
  return (await context.database.pool.query<{ users:number; admins:number; audit:number; tokens:number; mail:number; sessions:number; marked:boolean }>(`SELECT
    (SELECT count(*)::int FROM "User") AS users,
    (SELECT count(*)::int FROM "User" WHERE role='ADMIN') AS admins,
    (SELECT count(*)::int FROM "AuditEvent") AS audit,
    (SELECT count(*)::int FROM "ActionToken") AS tokens,
    (SELECT count(*)::int FROM "MailDelivery") AS mail,
    (SELECT count(*)::int FROM "Session") AS sessions,
    EXISTS (SELECT 1 FROM "SystemState" WHERE "bootstrapCompletedAt" IS NOT NULL) AS marked`)).rows[0];
}
const empty = {users:0,admins:0,audit:0,tokens:0,mail:0,sessions:0,marked:false};

test('inicialización: ADMIN pendiente, provisional y token 24 h, entrega cifrada, auditoría y marca',async () => {
  const f = await prepared();
  const result = await store().bootstrap(f.input);
  expect(Object.keys(result).sort()).toEqual(['email','userId','verificationQueued']);
  expect(result.verificationQueued).toBe(true);
  expect(result.email === f.input.email.trim()).toBe(true);
  expect(await counts()).toEqual({users:1,admins:1,audit:1,tokens:1,mail:1,sessions:0,marked:true});
  const account = (await context.database.pool.query<AccountAccess & { name:string; email:string; role:string }>('SELECT * FROM "User" WHERE id=$1',[result.userId])).rows[0];
  expect(account.name).toBe('Responsable de ensayo');expect(account.role).toBe('ADMIN');
  expect(account.status).toBe('ACTIVE');expect(account.mustSetPassword).toBe(true);
  expect(account.emailVerifiedAt).toBeNull();expect(account.passwordHash).toBeNull();expect(account.authVersion).toBe('0');
  expect(account.provisionalPasswordHash === f.input.provisionalPasswordHash).toBe(true);
  expect(account.provisionalExpiresAt!.getTime()-account.createdAt.getTime()).toBe(24*60*60_000);
  expect(canAccessApplication(account)).toBe(false);
  expect(await verifyProvisionalCredential(account,f.password,account.createdAt,credentials)).toBe(true);
  expect(await verifyProvisionalCredential(account,randomUUID(),account.createdAt,credentials)).toBe(false);
  expect(canUseProvisionalPassword(account,account.provisionalExpiresAt!)).toBe(false);
  const token = (await context.database.pool.query<{ tokenHash:Buffer; emailCanonicalSnapshot:string; purpose:string; createdAt:Date; expiresAt:Date; consumedAt:null; revokedAt:null }>('SELECT * FROM "ActionToken"')).rows[0];
  expect(token.purpose).toBe('VERIFY_EMAIL');expect(token.tokenHash.equals(Buffer.from(f.issued.digest))).toBe(true);
  expect(token.emailCanonicalSnapshot === account.emailCanonical).toBe(true);
  expect(token.expiresAt.getTime()-token.createdAt.getTime()).toBe(24*60*60_000);
  expect(token.consumedAt).toBeNull();expect(token.revokedAt).toBeNull();
  const delivery = (await context.database.pool.query<{ encryptedPayload:Buffer; nonce:Buffer; authTag:Buffer; keyId:string; status:string; attempts:number; createdAt:Date; nextAttemptAt:Date; recipientKey:string; originKey:string }>('SELECT * FROM "MailDelivery"')).rows[0];
  expect(delivery.status).toBe('PENDING');expect(delivery.attempts).toBe(0);
  expect(delivery.nextAttemptAt.getTime()).toBe(delivery.createdAt.getTime());
  expect(delivery.recipientKey === rates.mailKeys(account.email,'VERIFY_EMAIL',f.input.origin).recipientKey).toBe(true);
  expect(delivery.originKey === rates.mailKeys(account.email,'VERIFY_EMAIL',f.input.origin).originKey).toBe(true);
  const payload = createPayloadCipher(context.environment).decrypt(delivery);
  expect(Object.keys(payload).sort()).toEqual(['link','recipient','template']);
  expect(payload.recipient === account.email).toBe(true);
  expect(payload.link.endsWith(`#${f.issued.secret}`)).toBe(true);
  expect(delivery.encryptedPayload.includes(Buffer.from(f.issued.secret))).toBe(false);
  expect(delivery.encryptedPayload.includes(Buffer.from(f.password))).toBe(false);
  const event = (await context.database.pool.query<{ actorKind:string; actorUserId:null; targetUserId:string; action:string; result:string; requestId:string }>('SELECT * FROM "AuditEvent"')).rows[0];
  expect(event.actorKind).toBe('SYSTEM_BOOTSTRAP');expect(event.actorUserId).toBeNull();
  expect(event.targetUserId === result.userId).toBe(true);expect(event.requestId === f.input.requestId).toBe(true);
  expect(event.action).toBe('BOOTSTRAP_ADMIN_CREATED');expect(event.result).toBe('APPLIED');
  const state = (await context.database.pool.query<{ firstAdminUserId:string; bootstrapCompletedAt:Date }>('SELECT * FROM "SystemState"')).rows[0];
  expect(state.firstAdminUserId === result.userId).toBe(true);expect(state.bootstrapCompletedAt instanceof Date).toBe(true);
});

test.each(['recipient','origin'] as const)('sin cuota %s crea cuenta/auditoría/marca, sin token ni entrega',async scope => {
  const f = await prepared();
  if (scope === 'recipient') await rates.admitMail(f.input.email,'VERIFY_EMAIL',f.input.origin,'ADMISSION');
  else {
    for (let n=0;n<20;n++) await rates.admitMail(`${randomUUID()}@example.test`,'VERIFY_EMAIL',f.input.origin,'ADMISSION');
  }
  expect((await store().bootstrap(f.input)).verificationQueued).toBe(false);
  expect(await counts()).toEqual({users:1,admins:1,audit:1,tokens:0,mail:0,sessions:0,marked:true});
  await expect(store().bootstrap(f.input)).rejects.toThrow(BootstrapAlreadyInitialized);
});

test.each(['unchanged','disabled','role-changed'] as const)('repetición %s no modifica cuenta ni credencial y no crea más efectos',async change => {
  const f = await prepared();const first = await store().bootstrap(f.input);
  if (change === 'disabled') await context.database.pool.query('UPDATE "User" SET status=\'DISABLED\',"disabledAt"=clock_timestamp() WHERE id=$1',[first.userId]);
  if (change === 'role-changed') await context.database.pool.query('UPDATE "User" SET role=\'TEACHER\' WHERE id=$1',[first.userId]);
  const before = await counts();
  await expect(store().bootstrap((await prepared()).input)).rejects.toThrow(BootstrapAlreadyInitialized);
  expect(await counts()).toEqual(before);
  const row = (await context.database.pool.query<{ provisionalPasswordHash:string }>('SELECT "provisionalPasswordHash" FROM "User" WHERE id=$1',[first.userId])).rows[0];
  expect(row.provisionalPasswordHash === f.input.provisionalPasswordHash).toBe(true);
});

test.each(['ACTIVE','DISABLED'] as const)('cualquier ADMIN previo %s impide inicializar aun sin marca',async status => {
  const existing = await sessionFixture(context,'ADMIN');
  if (status === 'DISABLED') await context.database.pool.query('UPDATE "User" SET status=\'DISABLED\',"disabledAt"=clock_timestamp() WHERE id=$1',[existing.userId]);
  const before = await counts();
  await expect(store().bootstrap((await prepared()).input)).rejects.toThrow(BootstrapAlreadyInitialized);
  expect(await counts()).toEqual(before);
});

test.each([true,false])('dos inicializaciones simultáneas; misma solicitud: %s',async same => {
  const first = await prepared();const second = same ? first : await prepared();
  const results = await Promise.allSettled([store().bootstrap(first.input),store().bootstrap(second.input)]);
  expect(results.filter(result => result.status==='fulfilled').length).toBe(1);
  const rejected = results.find(result => result.status==='rejected');
  expect(rejected?.status==='rejected' && rejected.reason instanceof BootstrapAlreadyInitialized).toBe(true);
  const count = await counts();expect(count.admins).toBe(1);expect(count.audit).toBe(1);
  expect(count.tokens).toBeLessThanOrEqual(1);expect(count.mail).toBe(count.tokens);expect(count.marked).toBe(true);
});

test('cuota confirmada antes del lock, hash fuera y ausencia de efectos visibles antes de commit',async () => {
  const f = await prepared();const hashSpy = vi.spyOn(credentials,'hash');
  let resume!: () => void;let arrived!: () => void;
  const waiting = new Promise<void>(resolve => { arrived=resolve; });
  const continueCommit = new Promise<void>(resolve => { resume=resolve; });
  const pending = store({async write(client,event) {
    await audit.write(client,event);
    const locks = (await client.query<{ count:number }>(`SELECT count(*)::int FROM pg_locks
      WHERE pid=pg_backend_pid() AND relation IN ('"RateBucket"'::regclass,'"RateEvent"'::regclass)`)).rows[0].count;
    expect(locks).toBe(0);arrived();await continueCommit;
  }}).bootstrap(f.input);
  try {
    await waiting;
    expect(await counts()).toEqual(empty);
    expect(Number((await context.database.pool.query<{ count:string }>('SELECT count(*) FROM "RateEvent"')).rows[0].count)).toBe(2);
    expect(hashSpy).not.toHaveBeenCalled();
  } finally { resume();await pending; }
});

test.each(['AuditEvent','ActionToken','MailDelivery','SystemState'] as const)('fallo SQL intermedio en %s revierte todos los efectos de bootstrap',async table => {
  await context.isolated.ownerQuery(`CREATE FUNCTION bootstrap_test_failure() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'Fallo controlado de prueba'; END $$;
    CREATE TRIGGER bootstrap_test_failure BEFORE ${table==='SystemState'?'UPDATE':'INSERT'} ON "${table}"
    FOR EACH ROW EXECUTE FUNCTION bootstrap_test_failure();`);
  await expect(store().bootstrap((await prepared()).input)).rejects.toThrow(BootstrapUnavailable);
  expect(await counts()).toEqual(empty);
  // La admisión conservadora es independiente: no devuelve cuota al fallar la operación.
  expect(Number((await context.database.pool.query<{ count:string }>('SELECT count(*) FROM "RateEvent"')).rows[0].count)).toBe(2);
  await context.isolated.ownerQuery('DROP FUNCTION bootstrap_test_failure() CASCADE');
  expect((await store().bootstrap((await prepared()).input)).verificationQueued).toBe(true);
});

test('auditoría inválida tras insertar User revierte, sin filtrar la correlación recibida',async () => {
  const f = await prepared();const secret = randomUUID();
  let failure:unknown;
  try { await store().bootstrap({...f.input,requestId:`invalid-${secret}`}); } catch (error) { failure=error; }
  expect(failure instanceof BootstrapUnavailable).toBe(true);
  expect(String(failure).includes(secret)).toBe(false);expect(await counts()).toEqual(empty);
});

test('conexión interrumpida tras auditoría y antes de commit no deja estado parcial',async () => {
  const f = await prepared();
  const interrupted = store({async write(client,event) {
    await audit.write(client,event);
    await client.query('SELECT pg_terminate_backend(pg_backend_pid())');
  }});
  await expect(interrupted.bootstrap(f.input)).rejects.toThrow(BootstrapUnavailable);
  expect(await counts()).toEqual(empty);
  expect((await store().bootstrap((await prepared()).input)).verificationQueued).toBe(true);
});

test('índice de correo único no sobrescribe una cuenta previa y revierte bootstrap',async () => {
  const existing = await sessionFixture(context,'TEACHER');
  const email = (await context.database.pool.query<{ email:string }>('SELECT email FROM "User" WHERE id=$1',[existing.userId])).rows[0].email;
  const before = await counts();
  await expect(store().bootstrap((await prepared(email.toUpperCase())).input)).rejects.toThrow(BootstrapUnavailable);
  expect(await counts()).toEqual(before);
});

test.each(['name','email','hash','missing-hash'] as const)('rechaza entrada inválida %s sin cuenta parcial ni datos en errores',async field => {
  const f = await prepared();const marker = randomUUID();
  const input = {...f.input,...(field==='name'?{name:''}:field==='email'?{email:marker}
    :{provisionalPasswordHash:field==='hash'?marker:null})} as PreparedBootstrap;
  let failure:unknown;
  try { await store().bootstrap(input); } catch (error) { failure=error; }
  expect(failure instanceof Error).toBe(true);expect(String(failure).includes(marker)).toBe(false);
  expect(await counts()).toEqual(empty);
});

test('fallo de cuotas o singleton ausente falla cerrado sin recrear el estado',async () => {
  const f = await prepared();const spy = vi.spyOn(rates,'admitMail').mockRejectedValueOnce(new Error(randomUUID()));
  await expect(store().bootstrap(f.input)).rejects.toThrow(BootstrapUnavailable);
  expect(await counts()).toEqual(empty);spy.mockRestore();
  await context.isolated.ownerQuery('TRUNCATE "SystemState"');
  await expect(store().bootstrap(f.input)).rejects.toThrow(BootstrapUnavailable);
  expect(await counts()).toEqual(empty);
  expect(Number((await context.database.pool.query<{ count:string }>('SELECT count(*) FROM "SystemState"')).rows[0].count)).toBe(0);
});

test('marca irreversible: ni borrar ni restablecer permite un segundo bootstrap',async () => {
  const f = await prepared();await store().bootstrap(f.input);
  await expect(context.database.pool.query('UPDATE "SystemState" SET "bootstrapCompletedAt"=NULL,"firstAdminUserId"=NULL')).rejects.toMatchObject({code:'23514'});
  await expect(context.database.pool.query('DELETE FROM "SystemState"')).rejects.toMatchObject({code:'23514'});
  await expect(store().bootstrap((await prepared()).input)).rejects.toThrow(BootstrapAlreadyInitialized);
  expect((await counts()).admins).toBe(1);
});
