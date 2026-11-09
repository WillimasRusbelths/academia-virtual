import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect,test } from 'vitest';
import { preEnrollmentDatabase,seedEnrollmentGraph,legacyFingerprint } from '../support/enrollment-migration.js';
import { repositoryRoot } from '../../src/infrastructure/config/environment.js';

test('PU01 upgrade 0006→0007 conserva pagos y recibos terminales y su inmutabilidad',async()=>{
  const context=await preEnrollmentDatabase();
  try{
    const sql=(name:string)=>readFileSync(path.join(repositoryRoot(),'apps/api/prisma/migrations',name,'migration.sql'),'utf8');
    await context.isolated.ownerQuery(sql('0006_enrollment'));
    await seedEnrollmentGraph(context);
    const tables=['VerifiedPayment','Enrollment','PaymentIncident','EnrollmentAuditEvent','ProviderReceipt'];
    const snapshot=async()=>Promise.all(tables.map(async table=>(await context.database.pool.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t)-'integrityConflict' ORDER BY id),'[]'::jsonb) AS data FROM "${table}" t`)).rows[0].data));
    const before=await snapshot(),legacy=await legacyFingerprint(context.database.pool);
    await context.isolated.ownerQuery(sql('0007_payment_reconciliation'));
    expect(await snapshot()).toEqual(before);expect(await legacyFingerprint(context.database.pool)).toBe(legacy);
    expect((await context.database.pool.query('SELECT "integrityConflict" FROM "ProviderReceipt"')).rows.every(row=>row.integrityConflict===false)).toBe(true);
    await expect(context.database.pool.query('UPDATE "ProviderReceipt" SET "integrityConflict"=true WHERE state=\'PROCESSED\'')).rejects.toMatchObject({code:'23514'});
    await expect(context.database.pool.query('UPDATE "VerifiedPayment" SET currency=\'USD\'')).rejects.toMatchObject({code:'23514'});
    expect(await snapshot()).toEqual(before);
  }finally{await context.cleanup();}
},120000);
