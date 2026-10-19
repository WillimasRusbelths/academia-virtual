import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { DeliverPending } from '../../src/modules/mail/application/deliver-pending.js';
import type { DeliveryClaim } from '../../src/modules/mail/application/deliver-pending.js';
import { MailTransportFailure } from '../../src/modules/mail/application/delivery-ports.js';
import type { Mailer, MailPayload } from '../../src/modules/mail/application/delivery-ports.js';
import { PostgresDeliveryStore } from '../../src/modules/mail/infrastructure/delivery-store.js';
import { DeliveryScheduler } from '../../src/modules/mail/infrastructure/delivery-scheduler.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';
import { createSmtpTransport } from '../../src/modules/mail/infrastructure/smtp-transport.js';
import { PostgresDeliveryEligibility } from '../../src/modules/identity/infrastructure/delivery-eligibility.js';
import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';
import { identityDatabase } from '../support/identity-database.js';
import { sessionFixture } from '../support/session-fixture.js';
import type { IdentityTestDatabase } from '../support/session-fixture.js';
import { mailpitOrigin } from '../support/mailpit.js';

let context: IdentityTestDatabase;
let rates: PostgresRateStore;
let store: PostgresDeliveryStore;
beforeAll(async () => {
  context = await identityDatabase('mail_delivery');
  rates = new PostgresRateStore(context.database.pool, context.environment.rateHmacKey);
  store = new PostgresDeliveryStore(context.database.pool, rates);
}, 120000);
afterEach(async () => {
  vi.useRealTimers(); vi.restoreAllMocks();
  // Pool restringido al esquema aislado de esta suite; nunca datos de desarrollo.
  await context.database.pool.query('DELETE FROM "MailDelivery"; DELETE FROM "RateEvent"; DELETE FROM "RateBucket"; DELETE FROM "ActionToken"; DELETE FROM "Session"; DELETE FROM "User"');
});
afterAll(async () => { await context?.cleanup(); });

function executor(mailer: Mailer, storage = store) {
  return new DeliverPending(storage, new PostgresDeliveryEligibility(context.database.pool),
    createPayloadCipher(context.environment), mailer);
}
function fakeMailer(kind?: 'TEMPORARY' | 'TIMEOUT' | 'PERMANENT') {
  const send = vi.fn(async () => { if (kind) throw new MailTransportFailure(kind); });
  return { send };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function seed(template: MailPayload['template'] = 'VERIFY_EMAIL', origin = '127.0.0.1') {
  const account = await sessionFixture(context);
  if (template === 'VERIFY_EMAIL') await context.database.pool.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1', [account.userId]);
  const email = (await context.database.pool.query<{ email: string }>('SELECT email FROM "User" WHERE id=$1',[account.userId])).rows[0].email;
  const issued = accessSecrets.issue();
  const token = (await context.database.pool.query<{ id: string; expiresAt: Date }>(`INSERT INTO "ActionToken"
    ("userId",purpose,"tokenHash","emailCanonicalSnapshot","createdAt","expiresAt") VALUES ($1,$2::"TokenPurpose",$3,$4,statement_timestamp(),
      statement_timestamp()+CASE WHEN $2::"TokenPurpose"='VERIFY_EMAIL' THEN interval '24 hours' ELSE interval '30 minutes' END)
    RETURNING id,"expiresAt"`,[account.userId,template,Buffer.from(issued.digest),email])).rows[0];
  const payload: MailPayload = { recipient: email, template,
    link: `${context.environment.appOrigin}/${template==='VERIFY_EMAIL'?'verificar-correo':'restablecer'}#${issued.secret}` };
  const encrypted = createPayloadCipher(context.environment).encrypt(payload);
  const keys = rates.mailKeys(email,template,origin);
  const delivery = (await context.database.pool.query<{ id: string }>(`INSERT INTO "MailDelivery"
    ("tokenId","recipientKey","originKey","encryptedPayload",nonce,"authTag","keyId")
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[token.id,keys.recipientKey,keys.originKey,
      Buffer.from(encrypted.encryptedPayload),Buffer.from(encrypted.nonce),Buffer.from(encrypted.authTag),encrypted.keyId])).rows[0];
  return { id: delivery.id, tokenId: token.id, userId: account.userId, email, origin, template, payload,
    expiresAt: token.expiresAt };
}
interface State {
  status: string; attempts: number; claimId: string | null; leaseUntil: Date | null;
  nextAttemptAt: Date; sentAt: Date | null; lastErrorClass: string | null; payloadCleared: boolean;
}
async function state(id: string): Promise<State> {
  return (await context.database.pool.query<State>(`SELECT status,attempts,"claimId","leaseUntil","nextAttemptAt","sentAt","lastErrorClass",
    ("encryptedPayload" IS NULL AND nonce IS NULL AND "authTag" IS NULL AND "keyId" IS NULL) AS "payloadCleared"
    FROM "MailDelivery" WHERE id=$1`,[id])).rows[0];
}
async function ageQuota() {
  await context.database.pool.query(`UPDATE "RateEvent" SET "occurredAt"="occurredAt"-interval '61 seconds'`);
}
async function due(id: string) {
  await context.database.pool.query('UPDATE "MailDelivery" SET "nextAttemptAt"=clock_timestamp() WHERE id=$1',[id]);
}
async function eventually(predicate: () => Promise<boolean>) {
  const end = Date.now()+5000;
  while (!await predicate()) {
    if (Date.now()>end) throw new Error('Estado de prueba no alcanzado. Valores omitidos.');
    await new Promise(resolve => setTimeout(resolve,20));
  }
}

test('ejecutor real: Mailpit acepta y el commit limpia payload sin prolongar token', async () => {
  const f = await seed(); await executor(createSmtpTransport(context.environment)).tick();
  const row = await state(f.id);
  expect(row.status).toBe('SENT'); expect(row.attempts).toBe(1); expect(row.sentAt!==null).toBe(true);
  expect(row.payloadCleared).toBe(true); expect(row.claimId).toBeNull(); expect(row.leaseUntil).toBeNull();
  const token = (await context.database.pool.query<{ expiresAt: Date }>('SELECT "expiresAt" FROM "ActionToken" WHERE id=$1',[f.tokenId])).rows[0];
  expect(token.expiresAt.getTime()).toBe(f.expiresAt.getTime());
  const captured = await fetch(`${mailpitOrigin}/api/v1/search?query=${encodeURIComponent(`to:${f.email}`)}`).then(r => r.json()) as { messages: unknown[] };
  expect(captured.messages.length).toBe(1);
});

test('caída real de Mailpit: el intento queda recuperable y ready no depende de SMTP', async () => {
  const f = await seed(); const unavailable = process.env.TEST_MAILPIT_DOWN==='true';
  await executor(createSmtpTransport(context.environment)).tick();
  const row = await state(f.id);
  expect(row.status).toBe(unavailable?'PENDING':'SENT'); expect(row.attempts).toBe(1);
  if (unavailable) { expect(row.lastErrorClass).toBe('TIMEOUT'); expect(row.payloadCleared).toBe(false); }
  const readiness = await fetch('http://127.0.0.1:3000/health/ready'); expect(readiness.status).toBe(200);
}, 35000);

test('Nest ensambla y ejecuta el scheduler interno, sin proceso separado', async () => {
  const f = await seed();
  const module = await Test.createTestingModule({ imports: [AppModule.forRoot(context.environment,context.database)] }).compile();
  const app = module.createNestApplication({ logger: false });
  // La propiedad del pool de la suite se conserva; solo este provider de cierre se reemplaza.
  const lifecycle = module.get<{ onApplicationShutdown(): Promise<void> }>('DATABASE_LIFECYCLE');
  vi.spyOn(lifecycle,'onApplicationShutdown').mockResolvedValue();
  try { await app.init(); await eventually(async () => (await state(f.id)).status==='SENT'); }
  finally { await app.close(); }
  expect((await state(f.id)).payloadCleared).toBe(true);
});

test('scheduler consulta cada 5 s y espera el ciclo al cerrar', async () => {
  vi.useFakeTimers(); const gate = deferred();
  const worker = { tick: vi.fn(() => gate.promise) } as unknown as DeliverPending;
  const scheduler = new DeliveryScheduler(worker); scheduler.onApplicationBootstrap();
  expect(worker.tick).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(4999); expect(worker.tick).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(worker.tick).toHaveBeenCalledTimes(2);
  let stopped=false; const stop=scheduler.beforeApplicationShutdown().then(() => { stopped=true; });
  expect(stopped).toBe(false); gate.resolve(); await stop;
  await vi.advanceTimersByTimeAsync(5000); expect(worker.tick).toHaveBeenCalledTimes(2);
});

test('dos ejecutores nunca reclaman más de dos leases y un ciclo no se superpone', async () => {
  for (let i=0;i<4;i++) await seed();
  const gate=deferred(); let active=0; let maximum=0;
  const send=vi.fn(async () => { active++; maximum=Math.max(maximum,active); await gate.promise; active--; });
  const first=executor({ send }); const second=executor({ send },new PostgresDeliveryStore(context.database.pool,rates));
  const a=first.tick(); expect(first.tick()).toBe(a); const b=second.tick();
  await eventually(async () => send.mock.calls.length===2);
  await executor(fakeMailer()).tick();
  const count=(await context.database.pool.query<{ count: string }>('SELECT count(*) FROM "MailDelivery" WHERE status=\'SENDING\'')).rows[0];
  expect(Number(count.count)).toBe(2); expect(maximum).toBe(2);
  gate.resolve(); await Promise.all([a,b]);
  const remaining=fakeMailer(); await executor(remaining).tick(); expect(remaining.send).toHaveBeenCalledTimes(2);
});

test('SKIP LOCKED omite una fila retenida y SMTP no sostiene su transacción', async () => {
  const held=await seed(); const other=await seed();
  const client=await context.database.pool.connect();
  try {
    await client.query('BEGIN'); await client.query('SELECT id FROM "MailDelivery" WHERE id=$1 FOR UPDATE',[held.id]);
    const mailer=fakeMailer(); await executor(mailer).tick(); expect(mailer.send).toHaveBeenCalledTimes(1);
    expect((await state(other.id)).status).toBe('SENT'); expect((await state(held.id)).attempts).toBe(0);
  } finally { await client.query('ROLLBACK');client.release(); }
  const started=deferred(); const release=deferred();
  const job=executor({ async send() { started.resolve(); await release.promise; } }).tick(); await started.promise;
  const probe=await context.database.pool.connect();
  try {
    await probe.query('BEGIN'); await probe.query("SET LOCAL lock_timeout='300ms'");
    await probe.query('SELECT id FROM "MailDelivery" WHERE id=$1 FOR UPDATE',[held.id]);
    await probe.query('SELECT key FROM "RateBucket" FOR UPDATE');
  } finally { await probe.query('ROLLBACK');probe.release();release.resolve();await job; }
});

test('interrupción de proceso tras claim: otro ejecutor recupera el lease y las cuotas', async () => {
  const f=await seed();
  const source=`const {createDatabase}=await import('./apps/api/dist/src/infrastructure/database/database.js');
    const {PostgresRateStore}=await import('./apps/api/dist/src/infrastructure/limits/rate-store.js');
    const {PostgresDeliveryStore}=await import('./apps/api/dist/src/modules/mail/infrastructure/delivery-store.js');
    const {loadEnvironment}=await import('./apps/api/dist/src/infrastructure/config/environment.js');
    const env=loadEnvironment();const db=createDatabase(env);const store=new PostgresDeliveryStore(db.pool,new PostgresRateStore(db.pool,env.rateHmacKey));
    const candidates=await store.candidates();await store.claim(candidates[0]);process.stdout.write('claimed');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',source],{ cwd:'/workspace',
    env:{ ...process.env,APP_ENV:'test',TEST_DATABASE_URL:context.environment.databaseUrl,TEST_MIGRATION_DATABASE_URL:context.environment.migrationUrl },
    stdio:['ignore','pipe','ignore'] });
  try {
    await new Promise<void>((resolve,reject) => {
      child.stdout.on('data',() => resolve());child.once('error',() => reject(new Error('Proceso de ensayo no iniciado.')));
      child.once('exit',() => reject(new Error('Proceso terminó antes del claim.')));
    });
    expect((await state(f.id)).status).toBe('SENDING');
  } finally { const closed=new Promise<void>(resolve => child.once('close',() => resolve()));child.kill('SIGKILL');await closed; }
  await context.database.pool.query('UPDATE "MailDelivery" SET "leaseUntil"=clock_timestamp()-interval \'120 seconds\' WHERE id=$1',[f.id]);
  await ageQuota();
  await executor(createSmtpTransport(context.environment),new PostgresDeliveryStore(context.database.pool,rates)).tick();
  expect((await state(f.id)).status).toBe('SENT');expect((await state(f.id)).attempts).toBe(2);
});

test('ejecutor antiguo no confirma después de perder el lease frente a un claim nuevo', async () => {
  const f=await seed();const started=deferred();const release=deferred();
  const first=executor({ async send() { started.resolve();await release.promise; } }).tick();await started.promise;
  const old=await state(f.id); const oldClaim: DeliveryClaim={ id:f.id,claimId:old.claimId! };
  await context.database.pool.query('UPDATE "MailDelivery" SET "leaseUntil"=clock_timestamp()-interval \'120 seconds\' WHERE id=$1',[f.id]);
  await ageQuota();await executor(fakeMailer(),new PostgresDeliveryStore(context.database.pool,rates)).tick();
  expect(await store.finish(oldClaim,'PERMANENT')).toBe(false);
  release.resolve();await first;expect((await state(f.id)).status).toBe('SENT');expect((await state(f.id)).attempts).toBe(2);
});

test('SMTP aceptado sin commit de confirmación puede duplicar el mismo enlace tras recuperar', async () => {
  const f=await seed();const sent: string[]=[];const smtp=createSmtpTransport(context.environment);
  const mailer: Mailer={ async send(payload,signal) { sent.push(payload.link);await smtp.send(payload,signal); } };
  const fail=vi.spyOn(store,'finish').mockRejectedValueOnce(new Error('Fallo de persistencia simulado.'));
  await expect(executor(mailer).tick()).rejects.toThrow('Ciclo de correo no completado');
  expect((await state(f.id)).status).toBe('SENDING');fail.mockRestore();
  await context.database.pool.query('UPDATE "MailDelivery" SET "leaseUntil"=clock_timestamp()-interval \'120 seconds\' WHERE id=$1',[f.id]);
  await ageQuota();await executor(mailer,new PostgresDeliveryStore(context.database.pool,rates)).tick();
  expect(sent.length).toBe(2);expect(sent[0]===sent[1]).toBe(true);
  const captured=await fetch(`${mailpitOrigin}/api/v1/search?query=${encodeURIComponent(`to:${f.email}`)}`).then(r => r.json()) as { messages: unknown[] };
  expect(captured.messages.length).toBe(2);expect((await state(f.id)).status).toBe('SENT');
});

test('tres intentos máximos: reintentos +60/+300 s, cuota en cada contacto y payload terminal limpio', async () => {
  const f=await seed();const mailer=fakeMailer('TEMPORARY'); const worker=executor(mailer);
  for (let attempt=1;attempt<=3;attempt++) {
    const before=Date.now();await worker.tick();const row=await state(f.id);
    expect(row.attempts).toBe(attempt);
    if (attempt<3) {
      expect(row.status).toBe('PENDING');expect(row.payloadCleared).toBe(false);
      expect(row.nextAttemptAt.getTime()>=before+(attempt===1?60_000:300_000)).toBe(true);
      await ageQuota();await due(f.id);
    } else { expect(row.status).toBe('FAILED');expect(row.payloadCleared).toBe(true); }
  }
  await worker.tick();expect(mailer.send).toHaveBeenCalledTimes(3);
  const events=(await context.database.pool.query<{ count: string }>('SELECT count(*) FROM "RateEvent" WHERE status=\'ACCEPTED\'')).rows[0];
  expect(Number(events.count)).toBe(6);
  expect((await context.database.pool.query<{ expiresAt: Date }>('SELECT "expiresAt" FROM "ActionToken" WHERE id=$1',[f.tokenId])).rows[0].expiresAt.getTime()).toBe(f.expiresAt.getTime());
});

test('el tercer lease abandonado finaliza sin un cuarto contacto SMTP', async () => {
  const f=await seed(); const candidate=(await store.candidates())[0];await store.claim(candidate);
  await context.database.pool.query('UPDATE "MailDelivery" SET attempts=3,"leaseUntil"=clock_timestamp()-interval \'1 second\' WHERE id=$1',[f.id]);
  const mailer=fakeMailer();await executor(mailer).tick();expect(mailer.send).not.toHaveBeenCalled();
  expect((await state(f.id)).status).toBe('FAILED');expect((await state(f.id)).payloadCleared).toBe(true);
});

test('quota SMTP pospone sin intento y ADMISSION no cuenta dos veces el primer envío', async () => {
  const f=await seed();await rates.admitMail(f.email,f.template,f.origin,'ADMISSION');
  const mailer=fakeMailer('TIMEOUT');const worker=executor(mailer);await worker.tick();
  expect((await state(f.id)).attempts).toBe(1);await due(f.id);await worker.tick();
  const row=await state(f.id);expect(row.attempts).toBe(1);expect(row.status).toBe('PENDING');
  expect(row.nextAttemptAt.getTime()>Date.now()).toBe(true);expect(mailer.send).toHaveBeenCalledTimes(1);
});

test('cinco envíos/hora por destinatario y propósito limitan también los reintentos', async () => {
  const f=await seed();
  for (let i=0;i<5;i++) { expect((await rates.admitMail(f.email,f.template,f.origin,'SMTP')).allowed).toBe(true);await ageQuota(); }
  const mailer=fakeMailer();await executor(mailer).tick();expect(mailer.send).not.toHaveBeenCalled();
  expect((await state(f.id)).attempts).toBe(0);expect((await state(f.id)).nextAttemptAt.getTime()>Date.now()+50*60_000).toBe(true);
});

test('veinte/hora por origen sumando propósitos se conservan tras recrear el ejecutor', async () => {
  const f=await seed();
  for (let i=0;i<20;i++) await rates.admitMail(`fixture-${i}@example.test`,i%2?'RESET_PASSWORD':'VERIFY_EMAIL',f.origin,'SMTP');
  const mailer=fakeMailer();await executor(mailer,new PostgresDeliveryStore(context.database.pool,rates)).tick();
  expect(mailer.send).not.toHaveBeenCalled();expect((await state(f.id)).attempts).toBe(0);
  expect((await state(f.id)).status).toBe('PENDING');
});

test('no prolonga token si la cuota o el backoff no caben antes de caducar', async () => {
  const f=await seed('RESET_PASSWORD');
  await context.database.pool.query(`UPDATE "ActionToken" SET "createdAt"=statement_timestamp()-interval '29 minutes 30 seconds',
    "expiresAt"=statement_timestamp()+interval '30 seconds' WHERE id=$1`,[f.tokenId]);
  await rates.admitMail(f.email,f.template,f.origin,'SMTP');
  const mailer=fakeMailer();await executor(mailer).tick();expect(mailer.send).not.toHaveBeenCalled();
  expect((await state(f.id)).status).toBe('CANCELLED');expect((await state(f.id)).payloadCleared).toBe(true);
  const other=await seed('RESET_PASSWORD','127.0.0.2');
  await context.database.pool.query(`UPDATE "ActionToken" SET "createdAt"=statement_timestamp()-interval '29 minutes 30 seconds',
    "expiresAt"=statement_timestamp()+interval '30 seconds' WHERE id=$1`,[other.tokenId]);
  await executor(fakeMailer('TEMPORARY')).tick();expect((await state(other.id)).status).toBe('CANCELLED');
  expect((await state(other.id)).lastErrorClass).toBe('EXPIRED');
});

test.each(['disabled','revoked','consumed','verified','changed-email','expired','reset-unverified'] as const)('cancelación %s limpia sin SMTP disponible ni gastar intento', async reason => {
  const f=await seed(reason==='reset-unverified'?'RESET_PASSWORD':'VERIFY_EMAIL');
  const userChanges: Record<string,string>={disabled:"status='DISABLED',\"disabledAt\"=statement_timestamp()",verified:'"emailVerifiedAt"=statement_timestamp()',
    'changed-email':"email='changed@example.test',\"emailCanonical\"='changed@example.test'",'reset-unverified':'"emailVerifiedAt"=NULL'};
  if (userChanges[reason]) await context.database.pool.query(`UPDATE "User" SET ${userChanges[reason]} WHERE id=$1`,[f.userId]);
  if (reason==='revoked'||reason==='consumed') await context.database.pool.query(`UPDATE "ActionToken" SET "${reason==='revoked'?'revokedAt':'consumedAt'}"=statement_timestamp() WHERE id=$1`,[f.tokenId]);
  if (reason==='expired') await context.database.pool.query(`UPDATE "ActionToken" SET "createdAt"=statement_timestamp()-interval '24 hours',"expiresAt"=statement_timestamp() WHERE id=$1`,[f.tokenId]);
  const mailer=fakeMailer('TIMEOUT');await executor(mailer).tick();expect(mailer.send).not.toHaveBeenCalled();
  const row=await state(f.id);expect(row.status).toBe('CANCELLED');expect(row.attempts).toBe(0);expect(row.payloadCleared).toBe(true);
});

test('cifrado dañado y error permanente se terminan y limpian sin reintento', async () => {
  const f=await seed();await context.database.pool.query('UPDATE "MailDelivery" SET "authTag"=$2 WHERE id=$1',[f.id,randomBytes(16)]);
  const mailer=fakeMailer();await executor(mailer).tick();expect(mailer.send).not.toHaveBeenCalled();
  expect((await state(f.id)).status).toBe('FAILED');expect((await state(f.id)).attempts).toBe(0);expect((await state(f.id)).payloadCleared).toBe(true);
  const other=await seed();const permanent=fakeMailer('PERMANENT');await executor(permanent).tick();await executor(permanent).tick();
  expect(permanent.send).toHaveBeenCalledTimes(1);expect((await state(other.id)).status).toBe('FAILED');expect((await state(other.id)).payloadCleared).toBe(true);
});

test('cancelación de un lease activo impide una confirmación tardía aunque SMTP hubiera aceptado', async () => {
  const f=await seed();const started=deferred();const release=deferred();
  const first=executor({ async send() { started.resolve();await release.promise; } }).tick();await started.promise;
  await context.database.pool.query('UPDATE "ActionToken" SET "revokedAt"=statement_timestamp() WHERE id=$1',[f.tokenId]);
  await store.sweep();expect((await state(f.id)).payloadCleared).toBe(true);
  release.resolve();await first;expect((await state(f.id)).status).toBe('CANCELLED');expect((await state(f.id)).sentAt).toBeNull();
});

test('timeout total a 20 s aborta el transporte sin esperar su promesa indefinida', async () => {
  const f=await seed();const started=deferred();let signal: AbortSignal | undefined;
  vi.useFakeTimers({ toFake:['setTimeout','clearTimeout'] });
  const tick=executor({ send:(_payload,abort) => { signal=abort;started.resolve();return new Promise(() => undefined); } }).tick();
  try {
    await started.promise;await vi.advanceTimersByTimeAsync(19999);expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);await tick;expect(signal?.aborted).toBe(true);
    expect((await state(f.id)).status).toBe('PENDING');expect((await state(f.id)).lastErrorClass).toBe('TIMEOUT');
  } finally { vi.useRealTimers(); }
});
