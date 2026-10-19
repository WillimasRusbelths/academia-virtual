import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootstrapFields,hiddenCredential,requireTerminal } from '../infrastructure/cli/terminal.js';
import { loadEnvironment } from '../infrastructure/config/environment.js';
import { createDatabase } from '../infrastructure/database/database.js';
import { securityEvents,newCorrelationId } from '../infrastructure/logging/security-events.js';
import { PostgresRateStore } from '../infrastructure/limits/rate-store.js';
import { PostgresBootstrapStore } from '../modules/identity/infrastructure/bootstrap-store.js';
import { PostgresActionTokenStore } from '../modules/identity/infrastructure/action-token-store.js';
import { PostgresAuditWriter } from '../modules/audit/infrastructure/audit-writer.js';
import { createPasswordCredentials,accessSecrets } from '../modules/identity/infrastructure/credentials.js';
import { createPayloadCipher } from '../modules/mail/infrastructure/payload-cipher.js';
import { BootstrapAdmin } from '../modules/identity/application/bootstrap-admin.js';
import { IssueActionLink } from '../modules/identity/application/issue-action-link.js';
import { BootstrapAlreadyInitialized } from '../modules/identity/domain/bootstrap.js';
import { requireOperatorRef } from '../modules/identity/domain/operator.js';

export async function runBootstrapCli(args:readonly string[],input:NodeJS.ProcessEnv=process.env):Promise<void> {
  if(args.length!==0)throw new Error('Argumentos no permitidos.');
  requireTerminal();const environment=loadEnvironment(input);
  const fields=await bootstrapFields();const operatorRef=requireOperatorRef(fields.operatorRef);const correlationId=newCorrelationId();
  const event={category:'OPERATION',action:'BOOTSTRAP_ATTEMPT',actorKind:'LOCAL_OPERATOR',targetKind:'IDENTITY_SCOPE',operatorRef};
  securityEvents.record({...event,result:'STARTED',reasonCode:'NONE'},correlationId);
  let database:ReturnType<typeof createDatabase>|undefined;
  try{
    const provisionalPassword=await hiddenCredential();database=createDatabase(environment);
    const rates=new PostgresRateStore(database.pool,environment.rateHmacKey);
    const links=new IssueActionLink(new PostgresActionTokenStore(database.pool),rates,accessSecrets,createPayloadCipher(environment),environment.appOrigin);
    const useCase=new BootstrapAdmin(new PostgresBootstrapStore(database.pool,rates,new PostgresAuditWriter()),await createPasswordCredentials(),links);
    const result=await useCase.execute({...fields,provisionalPassword,requestId:correlationId,origin:'127.0.0.1'});
    securityEvents.record({...event,result:'SUCCEEDED',reasonCode:'NONE'},correlationId);
    process.stdout.write(`ID: ${result.userId}\nCorreo: ${result.email}\n`);
  }catch(error){
    const already=error instanceof BootstrapAlreadyInitialized;
    securityEvents.record({...event,result:already?'DENIED':'FAILED',reasonCode:already?'ALREADY_INITIALIZED':'TEMPORARILY_UNAVAILABLE'},correlationId);
    throw error;
  }finally{await database?.close();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  runBootstrapCli(process.argv.slice(2)).catch(error=>{
    process.stderr.write(error instanceof BootstrapAlreadyInitialized?'Entorno ya inicializado.\n':'No se completó la inicialización. Detalles omitidos.\n');
    process.exitCode=1;
  });
}
