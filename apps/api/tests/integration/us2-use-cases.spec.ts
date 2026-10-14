import { afterAll,beforeAll,beforeEach,describe,expect,test } from 'vitest';
import { us2Dataset,seedAction,tokenState } from '../support/us2.js';
import type { Us2Dataset } from '../support/us2.js';
import { IssueActionLink,ActionLinkUnavailable,MailAdmissionLimited } from '../../src/modules/identity/application/issue-action-link.js';
import { RegisterStudent } from '../../src/modules/identity/application/register-student.js';
import { VerifyEmail,InvalidActionLink } from '../../src/modules/identity/application/verify-email.js';
import { PostgresActionTokenStore } from '../../src/modules/identity/infrastructure/action-token-store.js';
import { PostgresRegistrationStore } from '../../src/modules/identity/infrastructure/registration-store.js';
import { PostgresVerificationStore } from '../../src/modules/identity/infrastructure/verification-store.js';
import { createPasswordCredentials,accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';
import { us1Http } from '../support/us1-http.js';
import { PostgresDeliveryStore } from '../../src/modules/mail/infrastructure/delivery-store.js';

describe('T043–T045 · emisión, alta y confirmación atómicas',()=>{
  let data:Us2Dataset;let links:IssueActionLink;let register:RegisterStudent;let verify:VerifyEmail;
  let rates:PostgresRateStore;let credentials:Awaited<ReturnType<typeof createPasswordCredentials>>;
  beforeAll(async()=>{data=await us2Dataset('us2_atomic');credentials=await createPasswordCredentials();},120000);
  beforeEach(async()=>{await data.reset();rates=new PostgresRateStore(data.context.database.pool,data.context.environment.rateHmacKey);
    links=new IssueActionLink(new PostgresActionTokenStore(data.context.database.pool),rates,accessSecrets,
      createPayloadCipher(data.context.environment),data.context.environment.appOrigin);
    register=new RegisterStudent(new PostgresRegistrationStore(data.context.database.pool),credentials,links);
    verify=new VerifyEmail(new PostgresVerificationStore(data.context.database.pool),accessSecrets);
  });
  afterAll(async()=>{await data?.cleanup();});
  const fresh=()=>({name:'Alumno de ensayo',email:`nuevo-${data.manifest.runId}@example.test`,password:data.account().password,origin:'127.0.0.1'});
  const request=(email:string)=>({email,purpose:'VERIFY_EMAIL' as const,origin:'127.0.0.1'});
  async function fail(table:'MailDelivery'|'User',operation:'INSERT'|'UPDATE',enabled:boolean) {
    await data.context.isolated.ownerQuery(enabled?`CREATE FUNCTION reject_us2_write() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'Fallo de ensayo'; END $$; CREATE TRIGGER reject_us2_write BEFORE ${operation} ON "${table}"
      FOR EACH ROW EXECUTE FUNCTION reject_us2_write();`:`DROP TRIGGER reject_us2_write ON "${table}"; DROP FUNCTION reject_us2_write();`);
  }
  test('alta guarda alumno pendiente, hash propio, token y payload cifrado sin sesión',async()=>{
    const input=fresh();await register.execute(input);
    const account=(await data.context.database.pool.query('SELECT * FROM "User" WHERE "emailCanonical"=$1',[input.email])).rows[0];
    expect(account.role==='STUDENT' && account.status==='ACTIVE' && account.emailVerifiedAt===null && !account.mustSetPassword).toBe(true);
    expect(await credentials.verify(input.password,account.passwordHash)).toBe(true);
    const row=(await data.context.database.pool.query(`SELECT t."tokenHash",t."createdAt",t."expiresAt",m.* FROM "ActionToken" t
      JOIN "MailDelivery" m ON m."tokenId"=t.id WHERE t."userId"=$1`,[account.id])).rows[0];
    const payload=createPayloadCipher(data.context.environment).decrypt(row);const secret=new URL(payload.link).hash.slice(1);
    expect(payload.recipient===input.email && payload.template==='VERIFY_EMAIL' && new URL(payload.link).origin===data.context.environment.appOrigin).toBe(true);
    expect(Buffer.from(accessSecrets.digest(secret)!).equals(row.tokenHash)).toBe(true);
    expect(row.expiresAt.getTime()-row.createdAt.getTime()).toBe(86400000);
    expect(!Buffer.from(row.encryptedPayload).includes(Buffer.from(secret)) && row.status==='PENDING').toBe(true);
    expect((await data.context.database.pool.query('SELECT id FROM "Session" WHERE "userId"=$1',[account.id])).rowCount).toBe(0);
  });
  test('alta sin cuota conserva pendiente, pero no token ni entrega',async()=>{
    const input=fresh();expect((await rates.admitMail(input.email,'VERIFY_EMAIL',input.origin,'ADMISSION')).allowed).toBe(true);
    await expect(register.execute(input)).rejects.toBeInstanceOf(MailAdmissionLimited);
    expect((await data.context.database.pool.query('SELECT id FROM "User" WHERE "emailCanonical"=$1',[input.email])).rowCount).toBe(1);
    expect((await data.context.database.pool.query('SELECT id FROM "ActionToken"')).rowCount).toBe(0);
    expect((await data.context.database.pool.query('SELECT id FROM "MailDelivery"')).rowCount).toBe(0);
  });
  test('fallo de entrega persistida revierte cuenta y token nuevos; permite reintento manual',async()=>{
    const input=fresh();await fail('MailDelivery','INSERT',true);
    try{await expect(register.execute(input)).rejects.toBeInstanceOf(ActionLinkUnavailable);
      expect((await data.context.database.pool.query('SELECT id FROM "User" WHERE "emailCanonical"=$1',[input.email])).rowCount).toBe(0);
      expect((await data.context.database.pool.query('SELECT id FROM "ActionToken"')).rowCount).toBe(0);
    }finally{await fail('MailDelivery','INSERT',false);}
    await data.clock!.advance(60000);await register.execute(input);
    expect((await data.context.database.pool.query('SELECT id FROM "MailDelivery"')).rowCount).toBe(1);
  });
  for(const code of ['40P01','23514'])test(`fallo real al COMMIT ${code}: reintentos solo tras rollback y ninguna alta parcial`,async()=>{
    await data.context.isolated.ownerQuery(`CREATE SEQUENCE "Us2Attempts";
      CREATE FUNCTION us2_commit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF nextval('"Us2Attempts"')<=${code==='40P01'?2:100} THEN RAISE EXCEPTION 'Fallo de ensayo' USING ERRCODE='${code}'; END IF;
      RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER us2_commit_fault AFTER INSERT ON "MailDelivery" DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION us2_commit_fault();`);
    try{
      const input=fresh();if(code==='40P01')await register.execute(input);
      else await expect(register.execute(input)).rejects.toBeInstanceOf(ActionLinkUnavailable);
      expect(Number((await data.context.database.pool.query('SELECT last_value FROM "Us2Attempts"')).rows[0].last_value)).toBe(code==='40P01'?3:1);
      expect((await data.context.database.pool.query('SELECT id FROM "User" WHERE "emailCanonical"=$1',[input.email])).rowCount).toBe(code==='40P01'?1:0);
      expect((await data.context.database.pool.query('SELECT id FROM "ActionToken"')).rowCount).toBe(code==='40P01'?1:0);
      expect((await data.context.database.pool.query('SELECT id FROM "MailDelivery"')).rowCount).toBe(code==='40P01'?1:0);
    }finally{await data.context.isolated.ownerQuery('DROP TRIGGER us2_commit_fault ON "MailDelivery"; DROP FUNCTION us2_commit_fault(); DROP SEQUENCE "Us2Attempts";');}
  });
  for(const expired of [false,true])test(`reemisión directa reemplaza enlace ${expired?'vencido':'vigente'} y cancela entrega activa`,async()=>{
    const f=await seedAction(data,'VERIFY_EMAIL',true);if(expired)await data.clock!.set(f.expiresAt);
    const result=await links.execute(request(f.account.email));expect(result.admitted && result.queued).toBe(true);
    const old=await tokenState(data,f.id);expect(old.revokedAt!==null && old.consumedAt===null).toBe(true);
    const oldMail=(await data.context.database.pool.query('SELECT * FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0];
    expect(oldMail.status==='CANCELLED' && oldMail.encryptedPayload===null && oldMail.nonce===null && oldMail.authTag===null).toBe(true);
    const current=(await data.context.database.pool.query(`SELECT * FROM "ActionToken" WHERE "userId"=$1 AND "revokedAt" IS NULL`,[f.account.id])).rows;
    expect(current.length===1 && current[0].id!==f.id).toBe(true);
    expect(current[0].expiresAt.getTime()-current[0].createdAt.getTime()).toBe(86400000);
  });
  test('sin cuota no modifica enlace ni entrega, incluso con User bloqueado',async()=>{
    const f=await seedAction(data,'VERIFY_EMAIL',true);await rates.admitMail(f.account.email,'VERIFY_EMAIL','127.0.0.1','ADMISSION');
    const locked=await data.context.database.pool.connect();
    try{await locked.query('BEGIN');await locked.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',[f.account.id]);
      const result=await links.execute(request(f.account.email));expect(!result.admitted && !result.queued && result.retryAfterSeconds===60).toBe(true);
      expect((await tokenState(data,f.id)).revokedAt).toBeNull();
      expect((await data.context.database.pool.query('SELECT status FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0].status).toBe('PENDING');
    }finally{await locked.query('ROLLBACK');locked.release();}
  });
  test('fallo al insertar entrega nueva revierte revocación y cancelación previas',async()=>{
    const f=await seedAction(data,'VERIFY_EMAIL',true);await fail('MailDelivery','INSERT',true);
    try{await expect(links.execute(request(f.account.email))).rejects.toBeInstanceOf(ActionLinkUnavailable);
      expect((await tokenState(data,f.id)).revokedAt).toBeNull();
      const mail=(await data.context.database.pool.query('SELECT * FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0];
      expect(mail.status==='PENDING' && mail.encryptedPayload!==null).toBe(true);
      expect((await data.context.database.pool.query('SELECT id FROM "ActionToken"')).rowCount).toBe(1);
    }finally{await fail('MailDelivery','INSERT',false);}
  });
  test('emisiones concurrentes respetan cuota y dejan un enlace activo',async()=>{
    const f=await seedAction(data);const results=await Promise.all([links.execute(request(f.account.email)),links.execute(request(f.account.email))]);
    expect(results.filter(result=>result.admitted&&result.queued).length).toBe(1);
    expect(results.filter(result=>!result.admitted).length).toBe(1);
    expect((await data.context.database.pool.query('SELECT id FROM "ActionToken" WHERE "revokedAt" IS NULL')).rowCount).toBe(1);
  });
  test('reemisión conserva revocación previa y cancela su entrega pendiente',async()=>{
    const f=await seedAction(data,'VERIFY_EMAIL',true);
    await data.context.database.pool.query('UPDATE "ActionToken" SET "revokedAt"=clock_timestamp() WHERE id=$1',[f.id]);
    const before=await tokenState(data,f.id);await data.clock!.advance(60000);await links.execute(request(f.account.email));
    expect((await tokenState(data,f.id)).revokedAt?.getTime()).toBe(before.revokedAt?.getTime());
    expect((await data.context.database.pool.query('SELECT status FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0].status).toBe('CANCELLED');
  });
  test('cancelación invalida el claim anterior: un ejecutor viejo no confirma la entrega',async()=>{
    const f=await seedAction(data,'VERIFY_EMAIL',true);const deliveries=new PostgresDeliveryStore(data.context.database.pool,rates);
    const candidate=(await deliveries.candidates())[0];const claim=await deliveries.claim(candidate);
    expect(claim!==null).toBe(true);await links.execute(request(f.account.email));
    expect(await deliveries.finish(claim!,null)).toBe(false);
    const row=(await data.context.database.pool.query('SELECT * FROM "MailDelivery" WHERE id=$1',[f.deliveryId])).rows[0];
    expect(row.status==='CANCELLED' && row.claimId===null && row.encryptedPayload===null).toBe(true);
  });
  test('emisión conserva tokens consumidos y otro propósito',async()=>{
    const f=await seedAction(data);await data.context.database.pool.query('UPDATE "ActionToken" SET "consumedAt"=clock_timestamp() WHERE id=$1',[f.id]);
    const other=await seedAction(data,'RESET_PASSWORD');
    await data.context.database.pool.query('UPDATE "ActionToken" SET "userId"=$1,"emailCanonicalSnapshot"=$2 WHERE id=$3',
      [f.account.id,f.account.email,other.id]);
    await links.execute(request(f.account.email));expect((await tokenState(data,f.id)).revokedAt).toBeNull();
    expect((await tokenState(data,f.id)).consumedAt!==null).toBe(true);expect((await tokenState(data,other.id)).revokedAt).toBeNull();
  });
  test('emisión no elegible consume admisión pública, sin enlace; desconocido/verificado/desactivado equivalentes',async()=>{
    for(const email of ['inexistente@example.test',data.account().email,data.account('STUDENT','DISABLED').email]){
      const result=await links.execute(request(email));expect(result.admitted && !result.queued).toBe(true);
      expect((await links.execute(request(email))).admitted).toBe(false);
    }
    expect((await data.context.database.pool.query('SELECT id FROM "ActionToken"')).rowCount).toBe(0);
  });
  test('fallo en actualización de User revierte consumo de token y verificación',async()=>{
    const f=await seedAction(data);await fail('User','UPDATE',true);
    try{await expect(verify.execute({token:f.secret})).rejects.toBeInstanceOf(ActionLinkUnavailable);
      expect((await tokenState(data,f.id)).consumedAt).toBeNull();
      expect((await data.context.database.pool.query('SELECT "emailVerifiedAt" FROM "User" WHERE id=$1',[f.account.id])).rows[0].emailVerifiedAt).toBeNull();
    }finally{await fail('User','UPDATE',false);}
    await verify.execute({token:f.secret});await expect(verify.execute({token:f.secret})).rejects.toBeInstanceOf(InvalidActionLink);
  });
  test('registro → enlace cifrado → confirmación → login real, sin sesión implícita',async()=>{
    const input=fresh();await register.execute(input);
    const row=(await data.context.database.pool.query('SELECT * FROM "MailDelivery"')).rows[0];
    const secret=new URL(createPayloadCipher(data.context.environment).decrypt(row).link).hash.slice(1);
    const http=await us1Http(data);
    try{expect((await http.post('/auth/login',{email:input.email,password:input.password})).status).toBe(401);
      expect((await http.post('/auth/verification/confirm',{token:secret})).status).toBe(204);
      const account=(await data.context.database.pool.query('SELECT id FROM "User" WHERE "emailCanonical"=$1',[input.email])).rows[0];
      expect((await data.context.database.pool.query('SELECT id FROM "Session" WHERE "userId"=$1',[account.id])).rowCount).toBe(0);
      const response=await http.post('/auth/login',{email:input.email,password:input.password});expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')!==null).toBe(true);
    }finally{await http.close();}
  });
});
