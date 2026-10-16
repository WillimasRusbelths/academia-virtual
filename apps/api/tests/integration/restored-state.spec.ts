import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, beforeEach, afterAll, test, expect, vi } from 'vitest';
import { us2Dataset, seedAction } from '../support/us2.js';
import { us1Http } from '../support/us1-http.js';
import { PostgresRestoredState } from '../../src/infrastructure/database/restored-state.js';
import { SecurityEvents } from '../../src/infrastructure/logging/security-events.js';
import { runRestoredStateCli } from '../../src/cli/invalidate-restored-state.js';

let data:Awaited<ReturnType<typeof us2Dataset>>;
let state:PostgresRestoredState;
beforeAll(async()=>{data=await us2Dataset('restored_state');state=new PostgresRestoredState(data.context.database.pool);},120000);
beforeEach(async()=>{await data.reset();});
afterAll(async()=>{await data?.cleanup();});
const pool=()=>data.context.database.pool;
const args=()=>['--operator-ref','Williams','--schema',data.context.environment.databaseSchema,'--maintenance-confirmed'];
const input=()=>({...process.env,APP_ENV:'test',TEST_DATABASE_URL:data.context.environment.databaseUrl,
  TEST_MIGRATION_DATABASE_URL:data.context.environment.migrationUrl});

test('revoca todas las sesiones y tokens abiertos, incluso vencidos; preserva consumidos/revocados sin doble marca',async()=>{
  const consumed=await seedAction(data);
  await pool().query('UPDATE "ActionToken" SET "consumedAt"=clock_timestamp() WHERE id=$1',[consumed.id]);
  const revoked=await seedAction(data);
  await pool().query('UPDATE "ActionToken" SET "revokedAt"=clock_timestamp() WHERE id=$1',[revoked.id]);
  const open=await seedAction(data);const reset=await seedAction(data,'RESET_PASSWORD');
  await pool().query(`UPDATE "ActionToken" SET "createdAt"=clock_timestamp()-interval '25 hours',
    "expiresAt"=clock_timestamp()-interval '1 hour' WHERE id=$1`,[open.id]);
  const before=(await pool().query('SELECT * FROM "ActionToken" WHERE id=ANY($1::uuid[]) ORDER BY id',[[consumed.id,revoked.id]])).rows;
  const count=Number((await pool().query('SELECT count(*) FROM "Session" WHERE "revokedAt" IS NULL')).rows[0].count);
  const result=await state.invalidate();expect(result).toEqual({sessions:count,tokens:2,mail:0});
  expect((await pool().query('SELECT * FROM "ActionToken" WHERE id=ANY($1::uuid[]) ORDER BY id',[[consumed.id,revoked.id]])).rows).toEqual(before);
  expect((await pool().query('SELECT count(*) FROM "Session" WHERE "revokedAt" IS NULL')).rows[0].count).toBe('0');
  expect((await pool().query('SELECT count(*) FROM "ActionToken" WHERE id=ANY($1::uuid[]) AND "revokedAt" IS NOT NULL',[[open.id,reset.id]])).rows[0].count).toBe('2');
});
for(const status of ['PENDING','SENDING'] as const)test(`cancela ${status}, destruye payload/claim y conserva metadatos`,async()=>{
  const action=await seedAction(data,'VERIFY_EMAIL',true);
  if(status==='SENDING')await pool().query(`UPDATE "MailDelivery" SET status='SENDING',attempts=1,"claimId"=gen_random_uuid(),
    "leaseUntil"=clock_timestamp()+interval '60 seconds' WHERE id=$1`,[action.deliveryId]);
  expect((await state.invalidate()).mail).toBe(1);
  const row=(await pool().query('SELECT * FROM "MailDelivery" WHERE id=$1',[action.deliveryId])).rows[0];
  expect(row.status).toBe('CANCELLED');expect(row.finishedAt).toBeInstanceOf(Date);expect(row.tokenId).toBe(action.id);
  for(const field of ['encryptedPayload','nonce','authTag','keyId','leaseUntil','claimId','sentAt'])expect(row[field]).toBeNull();
});
test('repetición y dos invocaciones concurrentes son idempotentes; conserva singleton, cuentas y auditoría',async()=>{
  await seedAction(data,'VERIFY_EMAIL',true);
  const before=(await pool().query('SELECT * FROM "User" ORDER BY id')).rows;
  const marker=(await pool().query('SELECT * FROM "SystemState"')).rows;
  const audits=(await pool().query('SELECT * FROM "AuditEvent" ORDER BY id')).rows;
  const results=await Promise.all([state.invalidate(),state.invalidate()]);
  expect(results.reduce((n,r)=>n+r.tokens,0)).toBe(1);expect(results.reduce((n,r)=>n+r.mail,0)).toBe(1);
  const snapshot=(await pool().query('SELECT * FROM "Session" ORDER BY id')).rows;
  expect(await state.invalidate()).toEqual({sessions:0,tokens:0,mail:0});
  expect((await pool().query('SELECT * FROM "Session" ORDER BY id')).rows).toEqual(snapshot);
  expect((await pool().query('SELECT * FROM "User" ORDER BY id')).rows).toEqual(before);
  expect((await pool().query('SELECT * FROM "SystemState"')).rows).toEqual(marker);
  expect((await pool().query('SELECT * FROM "AuditEvent" ORDER BY id')).rows).toEqual(audits);
});
for(const status of ['SENT','FAILED','CANCELLED'] as const)test(`no vuelve a marcar mail terminal ${status}`,async()=>{
  const action=await seedAction(data,'VERIFY_EMAIL',true);
  await pool().query(`UPDATE "MailDelivery" SET status=$2::"DeliveryStatus","finishedAt"=clock_timestamp(),
    "sentAt"=CASE WHEN $2='SENT' THEN clock_timestamp() ELSE NULL END,
    "encryptedPayload"=NULL,nonce=NULL,"authTag"=NULL,"keyId"=NULL WHERE id=$1`,[action.deliveryId,status]);
  const before=(await pool().query('SELECT * FROM "MailDelivery"')).rows;
  expect((await state.invalidate()).mail).toBe(0);expect((await pool().query('SELECT * FROM "MailDelivery"')).rows).toEqual(before);
});
test('fallo SQL intermedio revierte sesiones y tokens; reintento completa',async()=>{
  await seedAction(data,'VERIFY_EMAIL',true);
  await data.context.isolated.ownerQuery(`CREATE FUNCTION reject_restore() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'private-canary'; END $$;
    CREATE TRIGGER reject_restore BEFORE UPDATE ON "MailDelivery" FOR EACH ROW EXECUTE FUNCTION reject_restore();`);
  try {await expect(state.invalidate()).rejects.toThrow('Detalles omitidos');
    expect((await pool().query('SELECT count(*) FROM "Session" WHERE "revokedAt" IS NOT NULL')).rows[0].count).toBe('0');
    expect((await pool().query('SELECT count(*) FROM "ActionToken" WHERE "revokedAt" IS NOT NULL')).rows[0].count).toBe('0');
  } finally {await data.context.isolated.ownerQuery('DROP TRIGGER reject_restore ON "MailDelivery"; DROP FUNCTION reject_restore();');}
  expect((await state.invalidate()).mail).toBe(1);
});
for(const operator of ['', 'correo@example.test', 'con espacios','x'.repeat(65)])test(`operatorRef inválido (${operator.length}) no ejecuta SQL`,async()=>{
  const argv=args();argv[1]=operator;await expect(runRestoredStateCli(argv,input())).rejects.toThrow();
  expect((await pool().query('SELECT count(*) FROM "Session" WHERE "revokedAt" IS NOT NULL')).rows[0].count).toBe('0');
});
test('exige confirmación de mantenimiento y destino coincidente; rechaza ensayo manual/desarrollo',async()=>{
  await expect(runRestoredStateCli(args().slice(0,4),input())).rejects.toThrow();
  const wrong=args();wrong[3]='t_another';await expect(runRestoredStateCli(wrong,input())).rejects.toThrow();
  const manual=input();for(const key of ['TEST_DATABASE_URL','TEST_MIGRATION_DATABASE_URL'] as const){const url=new URL(manual[key]);url.searchParams.set('schema','manual_us1_protected');manual[key]=url.toString();}
  const argv=args();argv[3]='manual_us1_protected';await expect(runRestoredStateCli(argv,manual)).rejects.toThrow('Destino');
  await expect(runRestoredStateCli(args(),{...input(),APP_ENV:'development'})).rejects.toThrow();
});
test('registro STARTED no disponible impide modificar BD',async()=>{
  await expect(runRestoredStateCli(args(),input(),{record:()=>false})).rejects.toThrow('Registro');
  expect((await pool().query('SELECT count(*) FROM "Session" WHERE "revokedAt" IS NOT NULL')).rows[0].count).toBe('0');
});
test('fallo de registro después del commit falla cerrado; repetir registra resultado sin doble marca',async()=>{
  await expect(runRestoredStateCli(args(),input(),{record:(event)=> (event as {result:string}).result!=='SUCCEEDED'})).rejects.toThrow('mantener mantenimiento');
  expect((await pool().query('SELECT count(*) FROM "Session" WHERE "revokedAt" IS NULL')).rows[0].count).toBe('0');
  const output=vi.spyOn(process.stdout,'write').mockReturnValue(true);
  try {expect((await runRestoredStateCli(args(),input(),{record:()=>true})).counts).toEqual({sessions:0,tokens:0,mail:0});}finally{output.mockRestore();}
});
test('CLI registra operación global atribuible/correlacionada sin email, enlaces, payload, cookies ni conexión',async()=>{
  const action=await seedAction(data,'VERIFY_EMAIL',true);const dir=mkdtempSync(path.join(tmpdir(),'restore-log-'));
  const output=vi.spyOn(process.stdout,'write').mockReturnValue(true);
  try {
    const receipt=await runRestoredStateCli(args(),input(),new SecurityEvents(dir));
    const raw=readdirSync(dir).map(file=>readFileSync(path.join(dir,file),'utf8')).join('');
    const events=raw.trim().split('\n').map(line=>JSON.parse(line));
    expect(events.map(e=>e.result)).toEqual(['STARTED','SUCCEEDED']);
    for(const event of events){expect(event).toMatchObject({category:'OPERATION',action:'RESTORED_STATE_INVALIDATION',
      actorKind:'LOCAL_OPERATOR',operatorRef:'Williams',targetKind:'IDENTITY_SCOPE',correlationId:receipt.correlationId});
      expect(event.actorUserId).toBeUndefined();expect(event.requestedTargetId).toBeUndefined();}
    for(const secret of [action.secret,action.link,action.account.email,data.context.environment.databaseUrl,
      data.account().sessions[0].secret,Buffer.from(data.context.environment.mailPayloadKey).toString('base64')])expect(raw.includes(secret)).toBe(false);
    expect((await pool().query('SELECT count(*) FROM "AuditEvent"')).rows[0].count).toBe('0');
  }finally{output.mockRestore();rmSync(dir,{recursive:true,force:true});}
});
test('solo después de invalidar: cookies y ambos enlaces previos fallan; nuevo login y roles funcionan',async()=>{
  const verify=await seedAction(data);const reset=await seedAction(data,'RESET_PASSWORD');
  await state.invalidate();const http=await us1Http(data);
  try {
    for(const role of ['STUDENT','TEACHER','ADMIN'] as const){const account=data.account(role);
      expect((await http.get('/me',account.sessions[0].secret)).status).toBe(401);
      const login=await http.post('/auth/login',{email:account.email,password:account.password});expect(login.status).toBe(200);
      const cookie=login.headers.get('set-cookie')!.split(';')[0].split('=')[1];
      expect((await http.get('/me',cookie)).status).toBe(200);
      expect((await http.get('/admin/users',cookie)).status).toBe(role==='ADMIN'?200:403);
    }
    expect((await http.post('/auth/verification/confirm',{token:verify.secret})).status).toBe(400);
    const rejected=await http.post('/auth/password/reset',{token:reset.secret,newPassword:'Restored-Test-Password-927!'});
    expect(rejected.status).toBe(400);expect(await rejected.json()).toMatchObject({error:{code:'INVALID_ACTION_LINK'}});
  }finally{await http.close();}
});
