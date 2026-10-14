import { spawn } from 'node:child_process';
import { existsSync,readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryRoot } from '../../src/infrastructure/config/environment.js';
import { assertFixtureEnvironment } from '../../src/infrastructure/testing/identity-fixtures.js';
import type { Environment } from '../../src/infrastructure/config/environment.js';

export function bootstrapCliAvailable():boolean {
  const root=repositoryRoot();const pkg=JSON.parse(readFileSync(path.join(root,'apps/api/package.json'),'utf8'));
  return typeof pkg.scripts?.['admin:bootstrap']==='string'&&existsSync(path.join(root,'apps/api/dist/src/cli/bootstrap-admin.js'));
}
export interface BootstrapDialogue {name:string;email:string;provisional:string;operatorRef:string}
/** PTY con echo habilitado: es responsabilidad de la CLI ocultar la credencial. */
export async function runBootstrapDialogue(environment:Environment,input:BootstrapDialogue,probe?:'hidden'|'visible') {
  assertFixtureEnvironment(environment);
  if(!/^t_[a-z0-9_]+$/.test(environment.databaseSchema))throw new Error('CLI de ensayo fuera de esquema aislado.');
  const file=fileURLToPath(new URL('./us6-tty-probe.mjs',import.meta.url));
  if(!/^\/[A-Za-z0-9_./-]+$/.test(file))throw new Error('Ruta de control PTY no compatible.');
  const command=probe?`${process.execPath} ${file} ${probe}`:'npm run admin:bootstrap --workspace @academia/api';
  const args=['--quiet','--return','--echo','always','--command',command,'/dev/null'];
  const child=spawn('script',args,{cwd:repositoryRoot(),stdio:['pipe','pipe','pipe'],env:{...process.env,
    APP_ENV:'test',TEST_DATABASE_URL:environment.databaseUrl,TEST_MIGRATION_DATABASE_URL:environment.migrationUrl,TERM:'dumb'}});
  const answers=[{pattern:/operatorRef|operador|alias/i,value:input.operatorRef},
    {pattern:/nombre/i,value:input.name},{pattern:/correo|email/i,value:input.email},
    {pattern:/provisional|credencial|contrase(?:ñ|n)a/i,value:input.provisional}];
  let output='';let error=false;let timedOut=false;
  const pending=new Set<ReturnType<typeof setTimeout>>();
  child.on('error',()=>{error=true;});
  child.stdout.on('data',chunk=>{
    const text=String(chunk);output+=text;
    for(const answer of answers)if(answer.pattern.test(text)){
      // Enviar después de recibir el prompt, nunca por argumentos ni antes del modo oculto.
      const timer=setTimeout(()=>{pending.delete(timer);child.stdin.write(answer.value+'\n');},10);
      pending.add(timer);answer.pattern=/(?!)/;
    }
  });
  child.stderr.on('data',chunk=>{output+=String(chunk);});
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},12000);
  const code=await new Promise<number|null>(resolve=>child.once('close',resolve));
  clearTimeout(timer);for(const entry of pending)clearTimeout(entry);
  if(error||timedOut)throw new Error('Diálogo CLI no finalizado. Valores omitidos.');
  return {code,output,args}; // Solo memoria de tests; las aserciones comparan booleanos, sin imprimir output.
}
