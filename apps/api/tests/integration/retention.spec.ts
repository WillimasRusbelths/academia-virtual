import { randomBytes,randomUUID } from 'node:crypto';
import { mkdtempSync,writeFileSync,readFileSync,readdirSync,statSync,existsSync,mkdirSync,symlinkSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll,beforeEach,afterAll,afterEach,test,expect,vi } from 'vitest';
import { us1Dataset } from '../support/us1-http.js';
import { RetainRecords } from '../../src/modules/identity/application/retain-records.js';
import { PostgresIdentityRetention } from '../../src/modules/identity/infrastructure/retention.js';
import { PostgresMailRetention } from '../../src/modules/mail/infrastructure/retention.js';
import { PostgresDeliveryStore } from '../../src/modules/mail/infrastructure/delivery-store.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';
import { SecurityEvents } from '../../src/infrastructure/logging/security-events.js';
import { runRetentionCli } from '../../src/cli/retain-records.js';

let data:Awaited<ReturnType<typeof us1Dataset>>;
let initial:Date;let tokenIndex=0;
let identity:PostgresIdentityRetention;let mail:PostgresMailRetention;let retention:RetainRecords;
beforeAll(async()=>{
  data=await us1Dataset('retention',true);initial=await data.clock!.now();
  identity=new PostgresIdentityRetention(data.context.database.pool);mail=new PostgresMailRetention(data.context.database.pool);
  retention=new RetainRecords(identity,mail);
},120000);
beforeEach(async()=>{
  await data.clock!.set(initial);tokenIndex=0;
  await data.context.database.pool.query('DELETE FROM "MailDelivery"; DELETE FROM "ActionToken"; DELETE FROM "Session"; DELETE FROM "AuditEvent"; DELETE FROM "RateEvent"; DELETE FROM "RateBucket"');
});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
afterAll(async()=>{await data?.cleanup();});
const db=()=>data.context.database.pool;
async function present(table:'Session'|'ActionToken'|'MailDelivery'|'AuditEvent',id:string) {
  return (await db().query(`SELECT 1 FROM "${table}" WHERE id=$1`,[id])).rowCount===1;
}
async function session(kind:'revoked'|'idle'|'absolute',offset=0) {
  const result=await db().query<{id:string}>(`WITH t AS (SELECT clock_timestamp()-interval '24 hours'+$2*interval '1 microsecond' AS at)
    INSERT INTO "Session" ("userId","tokenHash","authVersion","createdAt","lastAcceptedAt","absoluteExpiresAt","revokedAt")
    SELECT $1,$3,0,at-CASE WHEN $4='absolute' THEN interval '8 hours' ELSE interval '1 hour' END,
      at-CASE WHEN $4='idle' THEN interval '30 minutes' WHEN $4='absolute' THEN interval '1 microsecond' ELSE interval '0' END,
      at+CASE WHEN $4='absolute' THEN interval '0' ELSE interval '7 hours' END,
      CASE WHEN $4='revoked' THEN at ELSE NULL END FROM t RETURNING id`,[data.account().id,offset,randomBytes(32),kind]);
  return result.rows[0].id;
}
async function token(kind:'consumed'|'revoked'|'expired'|'valid',offset=0,purpose='VERIFY_EMAIL') {
  const account=data.manifest.accounts[tokenIndex++];
  const result=await db().query<{id:string}>(`WITH t AS (SELECT clock_timestamp()-interval '24 hours'+$2*interval '1 microsecond' AS at),
    start AS (SELECT at,CASE WHEN $3='valid' THEN clock_timestamp() WHEN $3='expired'
      THEN at-CASE WHEN $4='VERIFY_EMAIL' THEN interval '24 hours' ELSE interval '30 minutes' END
      ELSE at-interval '1 minute' END AS created FROM t)
    INSERT INTO "ActionToken" ("userId",purpose,"tokenHash","emailCanonicalSnapshot","createdAt","expiresAt","consumedAt","revokedAt")
    SELECT $1,$4::"TokenPurpose",$5,$6,created,created+CASE WHEN $4='VERIFY_EMAIL' THEN interval '24 hours' ELSE interval '30 minutes' END,
      CASE WHEN $3='consumed' THEN at ELSE NULL END,CASE WHEN $3='revoked' THEN at ELSE NULL END FROM start RETURNING id`,
    [account.id,offset,kind,purpose,randomBytes(32),account.email]);
  return result.rows[0].id;
}
async function delivery(tokenId:string,status:'PENDING'|'SENDING'|'SENT'|'FAILED'|'CANCELLED',finishedOffset=0) {
  const active=status==='PENDING'||status==='SENDING';
  const claimId=status==='SENDING'?randomUUID():null;
  const row=(await db().query<{id:string}>(`INSERT INTO "MailDelivery" ("tokenId",status,"recipientKey","originKey",
    "encryptedPayload",nonce,"authTag","keyId",attempts,"leaseUntil","claimId","createdAt","finishedAt","sentAt")
    VALUES ($1,$2::"DeliveryStatus",$3,$4,$5,$6,$7,$8,$9,
      CASE WHEN $2='SENDING' THEN clock_timestamp()+interval '60 seconds' ELSE NULL END,$10,
      clock_timestamp()-interval '10 days',
      CASE WHEN $11 THEN NULL ELSE clock_timestamp()-interval '7 days'+$12*interval '1 microsecond' END,
      CASE WHEN $2='SENT' THEN clock_timestamp()-interval '7 days'+$12*interval '1 microsecond' ELSE NULL END) RETURNING id`,
    [tokenId,status,randomBytes(32).toString('hex'),randomBytes(32).toString('hex'),active?Buffer.from('payload'):null,
      active?Buffer.alloc(12):null,active?Buffer.alloc(16):null,active?'test-v1':null,status==='SENDING'?1:0,claimId,active,finishedOffset])).rows[0];
  return {id:row.id,claimId};
}

for(const kind of ['revoked','idle','absolute'] as const)test(`sesión ${kind}: frontera de 24 h con precisión de microsegundos`,async()=>{
  const older=await session(kind,-1),exact=await session(kind),fresh=await session(kind,1);
  expect((await identity.runBatch(20)).sessions).toBe(2);
  expect(await present('Session',older)||await present('Session',exact)).toBe(false);
  expect(await present('Session',fresh)).toBe(true);
});
for(const kind of ['consumed','revoked','expired'] as const)test(`token ${kind}: 24 h desde fin de validez, no desde alta`,async()=>{
  const older=await token(kind,-1),exact=await token(kind),fresh=await token(kind,1);
  expect((await identity.runBatch(20)).tokens).toBe(2);
  expect(await present('ActionToken',older)||await present('ActionToken',exact)).toBe(false);
  expect(await present('ActionToken',fresh)).toBe(true);
});
test('token RESET_PASSWORD vencido usa caducidad de 30 min más 24 h de retención',async()=>{
  const exact=await token('expired',0,'RESET_PASSWORD');
  const fresh=await token('expired',1,'RESET_PASSWORD');
  expect((await identity.runBatch(20)).tokens).toBe(1);expect(await present('ActionToken',exact)).toBe(false);
  expect(await present('ActionToken',fresh)).toBe(true);
});
test('sesión actual, token vigente y todas las cuentas/singleton se conservan idénticos',async()=>{
  const id=await session('idle');await db().query(`UPDATE "Session" SET "createdAt"=clock_timestamp(),"lastAcceptedAt"=clock_timestamp(),
    "absoluteExpiresAt"=clock_timestamp()+interval '8 hours' WHERE id=$1`,[id]);
  const t=await token('valid');
  const before=JSON.stringify((await db().query('SELECT * FROM "User" ORDER BY id')).rows);
  const marker=JSON.stringify((await db().query('SELECT * FROM "SystemState"')).rows);
  await retention.execute();
  expect(await present('Session',id)&&await present('ActionToken',t)).toBe(true);
  expect(JSON.stringify((await db().query('SELECT * FROM "User" ORDER BY id')).rows)===before).toBe(true);
  expect(JSON.stringify((await db().query('SELECT * FROM "SystemState"')).rows)===marker).toBe(true);
});
for(const status of ['SENT','FAILED','CANCELLED'] as const)test(`metadata ${status}: 7 días desde finishedAt, no createdAt`,async()=>{
  const old=await delivery(await token('revoked'),status,-1);
  const exact=await delivery(await token('revoked'),status);
  const fresh=await delivery(await token('revoked'),status,1);
  expect((await mail.runBatch(20)).purgedDeliveries).toBe(2);
  expect(await present('MailDelivery',old.id)||await present('MailDelivery',exact.id)).toBe(false);
  expect(await present('MailDelivery',fresh.id)).toBe(true);
});
for(const status of ['PENDING','SENDING'] as const)test(`entrega ${status} obsoleta: cancelar/limpiar antes de purgar token; conservar metadata 7 días`,async()=>{
  const t=await token('expired');const d=await delivery(t,status);
  expect((await identity.runBatch(20)).tokens).toBe(0);
  const result=await retention.execute();expect(result.counts.cancelledDeliveries).toBe(1);expect(result.counts.tokens).toBe(1);
  const row=(await db().query('SELECT * FROM "MailDelivery" WHERE id=$1',[d.id])).rows[0];
  expect(row.status==='CANCELLED'&&row.tokenId===null&&row.encryptedPayload===null&&row.nonce===null&&row.authTag===null&&row.keyId===null&&row.claimId===null&&row.leaseUntil===null).toBe(true);
  await data.clock!.advance(7*86400000-1);expect((await mail.runBatch(20)).purgedDeliveries).toBe(0);
  await data.clock!.advance(1);expect((await mail.runBatch(20)).purgedDeliveries).toBe(1);
});
test('entrega vigente aunque createdAt tenga 10 días conserva token, payload y lease',async()=>{
  const t=await token('valid');const d=await delivery(t,'SENDING');
  const before=JSON.stringify((await db().query('SELECT * FROM "MailDelivery" WHERE id=$1',[d.id])).rows);
  await retention.execute();
  expect(JSON.stringify((await db().query('SELECT * FROM "MailDelivery" WHERE id=$1',[d.id])).rows)===before).toBe(true);
  expect(await present('ActionToken',t)).toBe(true);
});
async function audit(offset=0) {
  return (await db().query<{id:string}>(`INSERT INTO "AuditEvent" ("actorKind","actorUserId","targetUserId",action,result,"requestId","occurredAt")
    VALUES ('ACCOUNT',$1,$1,'NAME_CHANGED','APPLIED',$2,clock_timestamp()-interval '30 days'+$3*interval '1 microsecond') RETURNING id`,
    [data.account('ADMIN').id,randomUUID(),offset])).rows[0].id;
}
test('auditoría: frontera de 30 días desde occurredAt',async()=>{
  const old=await audit(-1),exact=await audit(),fresh=await audit(1);
  expect((await identity.runBatch(20)).auditEvents).toBe(2);
  expect(await present('AuditEvent',old)||await present('AuditEvent',exact)).toBe(false);expect(await present('AuditEvent',fresh)).toBe(true);
});
async function bucket(offset=0,blocked=false,expiredBlock=false) {
  const key=randomBytes(32).toString('hex');
  await db().query(`INSERT INTO "RateBucket" (key,scope,phase,"updatedAt","blockedUntil") VALUES ($1,'LOGIN_PAIR','ADMISSION',
    clock_timestamp()-interval '24 hours'+$2*interval '1 microsecond',CASE WHEN $3 THEN clock_timestamp()+interval '15 minutes'
      WHEN $4 THEN clock_timestamp() ELSE NULL END)`,[key,offset,blocked,expiredBlock]);
  return key;
}
async function rate(key:string,offset=0,reserved=false) {
  return (await db().query<{id:string}>(`WITH t AS (SELECT clock_timestamp()-interval '24 hours'+$2*interval '1 microsecond' AS at)
    INSERT INTO "RateEvent" ("bucketKey","occurredAt",status,"reservationExpiresAt") SELECT $1,at,
      CASE WHEN $3 THEN 'RESERVED' ELSE 'ACCEPTED' END::"RateResult",CASE WHEN $3 THEN at+interval '30 seconds' ELSE NULL END FROM t RETURNING id`,[key,offset,reserved])).rows[0].id;
}
test('RateEvent: máximo 24 h; buckets recientes, bloqueados o con eventos/reservas vigentes permanecen',async()=>{
  const key=await bucket();await rate(key,-1);await rate(key);await rate(key,1);
  const empty=await bucket(),fresh=await bucket(1),blocked=await bucket(0,true),reserved=await bucket(),expiredBlock=await bucket(0,false,true);
  await rate(reserved,24*3600*1000000,true);
  const result=await identity.runBatch(20);expect(result.rateEvents).toBe(2);expect(result.rateBuckets).toBe(2);
  const keys=(await db().query<{key:string}>('SELECT key FROM "RateBucket"')).rows.map(row=>row.key);
  expect(!keys.includes(empty)&&!keys.includes(expiredBlock)&&[key,fresh,blocked,reserved].every(k=>keys.includes(k))).toBe(true);
});
test('reserva vencida antigua se elimina, cuota SMTP reciente se conserva',async()=>{
  const key=await bucket();await rate(key,-1,true);
  const rates=new PostgresRateStore(db(),data.context.environment.rateHmacKey);
  await rates.admitMail(data.account().email,'VERIFY_EMAIL','127.0.0.1','SMTP');
  expect((await identity.runBatch(20)).rateEvents).toBe(1);
  expect(Number((await db().query('SELECT count(*) FROM "RateEvent"')).rows[0].count)).toBe(2);
  expect((await rates.admitMail(data.account().email,'VERIFY_EMAIL','127.0.0.1','SMTP')).allowed).toBe(false);
});
test('lotes pequeños, reinicio con otra instancia e idempotencia sin cursor persistido',async()=>{
  for(let i=0;i<7;i++)await session('revoked');
  const key=await bucket();
  for(let i=0;i<3;i++){await audit();await delivery(await token('revoked'),'FAILED');await rate(key,-1);}
  const first=await retention.execute(2,1);expect(first.counts.sessions).toBe(2);expect(first.noChanges).toBe(false);
  for(const count of [first.counts.tokens,first.counts.auditEvents,first.counts.purgedDeliveries,first.counts.rateEvents])expect(count).toBe(2);
  expect(first.counts.rateBuckets).toBe(0);
  const next=await new RetainRecords(new PostgresIdentityRetention(db()),new PostgresMailRetention(db())).execute(2,10);
  expect(next.counts.sessions).toBe(5);expect(next.noChanges).toBe(true);
  for(const count of [next.counts.tokens,next.counts.auditEvents,next.counts.purgedDeliveries,next.counts.rateEvents,next.counts.rateBuckets])expect(count).toBe(1);
  expect(Object.values((await retention.execute(2,10)).counts).every(value=>value===0)).toBe(true);
});
test('dos ejecutores concurrentes no duplican borrados ni dejan trabajo sin posibilidad de reanudación',async()=>{
  for(let i=0;i<17;i++)await session('idle');
  for(let i=0;i<5;i++)await delivery(await token('expired'),'PENDING');
  const results=await Promise.all([retention.execute(2,20),new RetainRecords(identity,mail).execute(2,20)]);
  const final=await retention.execute(2,20);
  expect(results.reduce((sum,r)=>sum+r.counts.sessions,final.counts.sessions)).toBe(17);
  expect(results.reduce((sum,r)=>sum+r.counts.tokens,final.counts.tokens)).toBe(5);
  expect(results.reduce((sum,r)=>sum+r.counts.cancelledDeliveries,final.counts.cancelledDeliveries)).toBe(5);
  expect(Number((await db().query('SELECT count(*) FROM "Session"')).rows[0].count)).toBe(0);
  expect(Number((await db().query('SELECT count(*) FROM "MailDelivery" WHERE "tokenId" IS NULL AND status=\'CANCELLED\'')).rows[0].count)).toBe(5);
});
test('entrega bloqueada se omite sin purgar su token; al liberar se reanuda con FK íntegra',async()=>{
  const t=await token('expired');const d=await delivery(t,'PENDING');const lock=await db().connect();
  try {
    await lock.query('BEGIN');await lock.query('SELECT id FROM "MailDelivery" WHERE id=$1 FOR UPDATE',[d.id]);
    const result=await retention.execute(1,1);expect(result.counts.tokens+result.counts.cancelledDeliveries).toBe(0);
    expect(await present('ActionToken',t)).toBe(true);
  }finally{await lock.query('ROLLBACK');lock.release();}
  expect((await retention.execute()).counts.tokens).toBe(1);
  expect((await db().query('SELECT "tokenId" FROM "MailDelivery" WHERE id=$1',[d.id])).rows[0].tokenId===null).toBe(true);
});
test('un claim anterior no puede revivir entrega cancelada/purgada durante mantenimiento',async()=>{
  const t=await token('expired');const d=await delivery(t,'SENDING');await retention.execute();
  const store=new PostgresDeliveryStore(db(),new PostgresRateStore(db(),data.context.environment.rateHmacKey));
  expect(await store.finish({id:d.id,claimId:d.claimId!},null)).toBe(false);
});
test('fallo SQL revierte lote de identidad; cancelación mail confirmada sobrevive y permite reanudar',async()=>{
  const s=await session('revoked');const t=await token('expired');const d=await delivery(t,'PENDING');const a=await audit();
  await data.context.isolated.ownerQuery(`CREATE FUNCTION retention_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ensayo'; END $$;
    CREATE TRIGGER retention_failure BEFORE DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION retention_failure();`);
  try {
    await expect(retention.execute()).rejects.toThrow('Limpieza de identidad no completada. Valores omitidos.');
    expect(await present('Session',s)&&await present('ActionToken',t)&&await present('AuditEvent',a)).toBe(true);
    expect((await db().query('SELECT status FROM "MailDelivery" WHERE id=$1',[d.id])).rows[0].status).toBe('CANCELLED');
  }finally{await data.context.isolated.ownerQuery('DROP TRIGGER retention_failure ON "AuditEvent"; DROP FUNCTION retention_failure();');}
  expect((await retention.execute()).counts.tokens).toBe(1);
});
test('desconexión antes de commit revierte borrado y siguiente ejecución lo completa',async()=>{
  const id=await session('revoked');const client=await db().connect();
  const pid=(await client.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  await client.query('BEGIN');await client.query('DELETE FROM "Session" WHERE id=$1',[id]);client.release(true);
  await expect.poll(async()=>Number((await db().query('SELECT count(*) FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0].count)).toBe(0);
  await expect.poll(()=>present('Session',id)).toBe(true);
  expect((await retention.execute()).counts.sessions).toBe(1);
});
test('CLI rechaza manual, desarrollo, schema distinto y argumentos inválidos antes de borrar',async()=>{
  const env=data.context.environment;
  const input={...process.env,APP_ENV:'test',TEST_DATABASE_URL:env.databaseUrl,TEST_MIGRATION_DATABASE_URL:env.migrationUrl};
  const args=['--schema',env.databaseSchema,'--batch-size','2','--batches','1'];
  for(const invalid of [[],['--schema','public','--batch-size','2','--batches','1'],[...args.slice(0,3),'0','--batches','1']]) {
    await expect(runRetentionCli(invalid,input)).rejects.toThrow();
  }
  for(const schema of ['public','manual_us1_05832d35725f']){
    const runtime=new URL(env.databaseUrl);runtime.searchParams.set('schema',schema);
    const owner=new URL(env.migrationUrl);owner.searchParams.set('schema',schema);
    await expect(runRetentionCli(['--schema',schema,...args.slice(2)],{...input,TEST_DATABASE_URL:runtime.toString(),TEST_MIGRATION_DATABASE_URL:owner.toString()})).rejects.toThrow('Destino de mantenimiento no permitido.');
  }
  await expect(runRetentionCli(args,{...process.env,APP_ENV:'development'})).rejects.toThrow();
});
test('límites inválidos no ejecutan lotes ni modifican datos',async()=>{
  const id=await session('revoked');
  for(const value of [0,-1,1.1,1001,NaN])await expect(retention.execute(value,1)).rejects.toThrow();
  await expect(retention.execute(1,0)).rejects.toThrow();expect(await present('Session',id)).toBe(true);
});
test('CLI ejecuta el lote en schema aislado, emite solo cantidades y cierra su pool',async()=>{
  const id=await session('absolute',-10000000);
  const env=data.context.environment;const output:string[]=[];
  const write=vi.spyOn(process.stdout,'write').mockImplementation(value=>{output.push(String(value));return true;});
  try {
    const result=await runRetentionCli(['--schema',env.databaseSchema,'--batch-size','2','--batches','1'],
      {...process.env,APP_ENV:'test',TEST_DATABASE_URL:env.databaseUrl,TEST_MIGRATION_DATABASE_URL:env.migrationUrl});
    expect(result.counts.sessions).toBe(1);expect(await present('Session',id)).toBe(false);
    expect(output.length===1&&JSON.parse(output[0]).counts.sessions===1).toBe(true);
    expect(/password|tokenHash|example\.test|postgresql|cookie/.test(output[0])).toBe(false);
  }finally{write.mockRestore();}
});
test('limpieza respeta un bucket en admisión concurrente y conserva su reserva posterior',async()=>{
  const rates=new PostgresRateStore(db(),data.context.environment.rateHmacKey);
  const first=await rates.reserveLogin(data.account().email,'127.0.0.1');
  if(!first.allowed)throw new Error('Preparación de cuota no admitida');
  await rates.finishLogin(first.reservation,false);await data.clock!.advance(86400000+1000);
  const lock=await db().connect();let pending:ReturnType<PostgresRateStore['reserveLogin']>|undefined;
  try {
    await lock.query('BEGIN');await lock.query('SELECT key FROM "RateBucket" WHERE key=$1 FOR UPDATE',[first.reservation.bucketKey]);
    pending=rates.reserveLogin(data.account().email,'127.0.0.1');
    expect((await identity.runBatch(20)).rateBuckets).toBe(0);
  }finally{await lock.query('COMMIT');lock.release();}
  const next=await pending!;expect(next.allowed).toBe(true);
  await retention.execute();
  expect(Number((await db().query('SELECT count(*) FROM "RateEvent" WHERE status=\'RESERVED\'')).rows[0].count)).toBe(1);
  expect(Number((await db().query('SELECT count(*) FROM "RateBucket"')).rows[0].count)).toBe(1);
});

test('logs SECURITY/OPERATION privados: máximo 30 días, rotación sin tráfico y reinicio',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'retention-logs-'));const directory=path.join(root,'private');
  const logger=new SecurityEvents(directory);
  vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout']});vi.setSystemTime(new Date('2026-10-15T23:59:59.999Z'));
  try {
    mkdirSync(directory,{mode:0o700});
    for(const name of ['2026-09-15.jsonl','2026-09-16.jsonl','2026-09-17.jsonl'])writeFileSync(path.join(directory,name),'{}\n',{mode:0o600});
    const event={category:'SECURITY',action:'ACCESS_DENIED',result:'DENIED',reasonCode:'FORBIDDEN',actorKind:'ANONYMOUS',targetKind:'NONE'};
    expect(logger.record(event,randomUUID())).toBe(true);
    expect(logger.record({...event,category:'OPERATION',action:'RUNTIME_FAILURE',result:'FAILED',reasonCode:'TEMPORARILY_UNAVAILABLE',actorKind:'SYSTEM'},randomUUID())).toBe(true);
    expect(statSync(directory).mode&0o777).toBe(0o700);expect(statSync(path.join(directory,'2026-10-15.jsonl')).mode&0o777).toBe(0o600);
    const rows=readFileSync(path.join(directory,'2026-10-15.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
    expect(rows.map(row=>row.category)).toEqual(['SECURITY','OPERATION']);
    expect(existsSync(path.join(directory,'2026-09-15.jsonl'))).toBe(false);
    expect(existsSync(path.join(directory,'2026-09-16.jsonl'))).toBe(true);
    logger.onApplicationBootstrap();await vi.advanceTimersByTimeAsync(1);
    expect(existsSync(path.join(directory,'2026-09-16.jsonl'))).toBe(false);expect(existsSync(path.join(directory,'2026-09-17.jsonl'))).toBe(true);
    logger.onApplicationShutdown();vi.setSystemTime(new Date('2026-11-30T00:00:00Z'));
    logger.onApplicationBootstrap();expect(readdirSync(directory)).toEqual([]);
    logger.onApplicationShutdown();logger.onApplicationBootstrap();expect(readdirSync(directory)).toEqual([]);
  } finally {logger.onApplicationShutdown();vi.useRealTimers();rmSync(root,{recursive:true,force:true});}
});
test('rotación no sigue enlaces ni borra archivos ajenos; fallo de almacenamiento no altera operación',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'retention-paths-'));const directory=path.join(root,'private');const outside=path.join(root,'preserve');
  const logger=new SecurityEvents(directory);const warning=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
  try {
    mkdirSync(directory);writeFileSync(outside,'conservar');symlinkSync(outside,path.join(directory,'2000-01-01.jsonl'));
    writeFileSync(path.join(directory,'notes.txt'),'conservar');mkdirSync(path.join(directory,'2000-01-02.jsonl'));
    logger.onApplicationBootstrap();expect(readFileSync(outside,'utf8')).toBe('conservar');expect(existsSync(path.join(directory,'notes.txt'))).toBe(true);
    logger.onApplicationShutdown();
    const failed=new SecurityEvents(outside);expect(failed.record({},randomUUID())).toBe(false);expect(warning).toHaveBeenCalled();
  } finally {logger.onApplicationShutdown();rmSync(root,{recursive:true,force:true});}
});
