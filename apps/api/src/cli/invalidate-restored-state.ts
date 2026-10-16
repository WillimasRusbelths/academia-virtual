import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnvironment } from '../infrastructure/config/environment.js';
import { createDatabase } from '../infrastructure/database/database.js';
import { PostgresRestoredState } from '../infrastructure/database/restored-state.js';
import { securityEvents, newCorrelationId } from '../infrastructure/logging/security-events.js';
import type { SecurityEvents } from '../infrastructure/logging/security-events.js';
import { InvalidateRestoredState } from '../modules/identity/application/invalidate-restored-state.js';
import { requireOperatorRef } from '../modules/identity/domain/operator.js';

/** Acceso local al proceso y credenciales de BD; operatorRef atribuye, no autentica. */
export async function runRestoredStateCli(args:readonly string[], input:NodeJS.ProcessEnv=process.env,
  logs:Pick<SecurityEvents,'record'>=securityEvents) {
  if(args.length!==5 || args[0]!=='--operator-ref' || args[2]!=='--schema' || args[4]!=='--maintenance-confirmed'
    || !/^[a-z][a-z0-9_]{0,62}$/.test(args[3])) throw new Error('Argumentos de recuperación inválidos.');
  const operatorRef=requireOperatorRef(args[1]);const environment=loadEnvironment(input);
  if(environment.databaseSchema!==args[3] || environment.appEnv==='development'
    || environment.databaseSchema.startsWith('manual_')
    || environment.appEnv==='test'&&!/^t_[a-z0-9_]+$/.test(environment.databaseSchema)) throw new Error('Destino no permitido.');
  const correlationId=newCorrelationId();
  const event={category:'OPERATION',action:'RESTORED_STATE_INVALIDATION',actorKind:'LOCAL_OPERATOR',targetKind:'IDENTITY_SCOPE',operatorRef};
  if(!logs.record({...event,result:'STARTED',reasonCode:'NONE'},correlationId)) throw new Error('Registro privado no disponible.');
  const database=createDatabase(environment);
  try {
    const counts=await new InvalidateRestoredState(new PostgresRestoredState(database.pool)).execute(operatorRef);
    if(!logs.record({...event,result:'SUCCEEDED',reasonCode:'NONE',counts},correlationId)) throw new Error('Registro privado no disponible.');
    const receipt={correlationId,counts};process.stdout.write(JSON.stringify(receipt)+'\n');return receipt;
  } catch {
    logs.record({...event,result:'FAILED',reasonCode:'TEMPORARILY_UNAVAILABLE'},correlationId);
    throw new Error('Recuperación no completada; mantener mantenimiento. Detalles omitidos.');
  } finally {await database.close();}
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  runRestoredStateCli(process.argv.slice(2)).catch(()=>{
    process.stderr.write('Recuperación no completada; mantener mantenimiento. Detalles omitidos.\n');process.exitCode=1;
  });
}
