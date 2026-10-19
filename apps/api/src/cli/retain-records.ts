import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnvironment } from '../infrastructure/config/environment.js';
import { createDatabase } from '../infrastructure/database/database.js';
import { RetainRecords, retentionLimit } from '../modules/identity/application/retain-records.js';
import { PostgresIdentityRetention } from '../modules/identity/infrastructure/retention.js';
import { PostgresMailRetention } from '../modules/mail/infrastructure/retention.js';

export async function runRetentionCli(args: string[], input: NodeJS.ProcessEnv = process.env) {
  if (args.length!==6 || args[0]!=='--schema' || args[2]!=='--batch-size' || args[4]!=='--batches'
    || !/^[a-z][a-z0-9_]{0,62}$/.test(args[1]) || !/^\d+$/.test(args[3]) || !/^\d+$/.test(args[5])) {
    throw new Error('Argumentos de mantenimiento inválidos.');
  }
  const size=retentionLimit(Number(args[3]));const batches=retentionLimit(Number(args[5]));
  const environment=loadEnvironment(input);
  // El ensayo manual y desarrollo nunca son destinos de esta CLI. Test exige schema efímero.
  if (environment.databaseSchema!==args[1] || environment.appEnv==='development'
    || environment.databaseSchema.startsWith('manual_')
    || environment.appEnv==='test'&&!/^t_[a-z0-9_]+$/.test(environment.databaseSchema)) {
    throw new Error('Destino de mantenimiento no permitido.');
  }
  const database=createDatabase(environment);
  try {
    const result=await new RetainRecords(new PostgresIdentityRetention(database.pool),new PostgresMailRetention(database.pool)).execute(size,batches);
    process.stdout.write(JSON.stringify(result)+'\n');
    return result;
  } finally {await database.close();}
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  runRetentionCli(process.argv.slice(2)).catch(()=>{
    process.stderr.write('Mantenimiento no completado. Revisar destino y configuración. Valores omitidos.\n');
    process.exitCode=1;
  });
}
