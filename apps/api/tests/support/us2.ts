import { accessSecrets } from '../../src/modules/identity/infrastructure/credentials.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';
import { PostgresRateStore } from '../../src/infrastructure/limits/rate-store.js';
import { us1Dataset } from './us1-http.js';
import type { Us1Dataset } from './us1-http.js';
import type { TokenPurpose } from '../../src/modules/identity/domain/access.js';

/** Solo harness: fixtures existentes y un schema t_* nuevo por suite. */
export async function us2Dataset(suite:string) {
  const data=await us1Dataset(suite,true);
  const reset=data.reset.bind(data);
  return {...data,async reset() {
    const pool=data.context.database.pool;const ids=data.manifest.accounts.map(account=>account.id);
    await pool.query('DELETE FROM "MailDelivery"; DELETE FROM "ActionToken"; DELETE FROM "AuditEvent"');
    await pool.query('DELETE FROM "Session"');
    await pool.query('DELETE FROM "User" WHERE NOT (id=ANY($1::uuid[]))',[ids]);
    for(const account of data.manifest.accounts) await pool.query('UPDATE "User" SET name=$2,email=$3,"emailCanonical"=$3 WHERE id=$1',
      [account.id,account.name,account.email]);
    await reset();
  }};
}
export type Us2Dataset=Awaited<ReturnType<typeof us2Dataset>>;
/** Emisión sintética explícita: no implementa emisión/consumo de producto. */
export async function seedAction(data:Us1Dataset,purpose:TokenPurpose='VERIFY_EMAIL',delivery=false) {
  const account=data.account('STUDENT',purpose==='VERIFY_EMAIL'?'UNVERIFIED':'ENABLED');
  const issued=accessSecrets.issue();const pool=data.context.database.pool;
  const token=(await pool.query<{id:string;expiresAt:Date}>(`WITH instant AS (SELECT clock_timestamp() AS at)
    INSERT INTO "ActionToken" ("userId",purpose,"tokenHash","emailCanonicalSnapshot","createdAt","expiresAt")
    SELECT $1,$2::"TokenPurpose",$3,$4,at,at+CASE WHEN $2='VERIFY_EMAIL' THEN interval '24 hours' ELSE interval '30 minutes' END
    FROM instant RETURNING id,"expiresAt"`,[account.id,purpose,Buffer.from(issued.digest),account.email])).rows[0];
  const link=`${data.context.environment.appOrigin}/${purpose==='VERIFY_EMAIL'?'verificar-correo':'restablecer'}#${issued.secret}`;
  let deliveryId:string|undefined;
  if(delivery) {
    const payload=createPayloadCipher(data.context.environment).encrypt({recipient:account.email,link,template:purpose});
    const keys=new PostgresRateStore(pool,data.context.environment.rateHmacKey).mailKeys(account.email,purpose,'127.0.0.1');
    deliveryId=(await pool.query<{id:string}>(`INSERT INTO "MailDelivery"
      ("tokenId","recipientKey","originKey","encryptedPayload",nonce,"authTag","keyId","createdAt","nextAttemptAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp(),clock_timestamp()) RETURNING id`,
      [token.id,keys.recipientKey,keys.originKey,Buffer.from(payload.encryptedPayload),Buffer.from(payload.nonce),
        Buffer.from(payload.authTag),payload.keyId])).rows[0].id;
  }
  return {account,id:token.id,secret:issued.secret,expiresAt:token.expiresAt,link,deliveryId};
}
export async function tokenState(data:Us1Dataset,id:string) {
  return (await data.context.database.pool.query<{consumedAt:Date|null;revokedAt:Date|null;expiresAt:Date}>(
    'SELECT "consumedAt","revokedAt","expiresAt" FROM "ActionToken" WHERE id=$1',[id])).rows[0];
}
