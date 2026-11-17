import {randomBytes} from 'node:crypto';
import {writeFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {hash,argon2id} from 'argon2';
import {test,expect} from 'vitest';
import {materialsFixture} from '../support/materials.js';
import {materialFileCase} from '../support/materials-files.js';
import {us1Http} from '../support/us1-http.js';
import {repositoryRoot} from '../../src/infrastructure/config/environment.js';

// Interactive fixture only; readiness never counts as human acceptance.
test('T064 temporary human session, no acceptance inferred',async()=>{
  expect(process.env.HUMAN_SESSION_ISOLATED).toBe('1');
  const f=await materialsFixture();let http:Awaited<ReturnType<typeof us1Http>>|undefined;
  let vite:ReturnType<typeof spawn>|undefined;
  try{
    expect((await f.pool.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker).toBe('materials-human-isolated');
    // Keep the valid synthetic enrollment and its financial facts intact.
    await f.pool.query('UPDATE "AcademicGroup" SET name=$2 WHERE id=$1',[f.groupId,'T064 - Grupo con matrícula vigente']);
    const accounts=[];
    for(const [reference,actor] of [['G01',f.teacher],['A01',f.student]] as const){
      const password='Ensayo-'+randomBytes(18).toString('base64url')+'!';
      const encoded=await hash(password,{type:argon2id,memoryCost:19456,timeCost:2,parallelism:1});
      const account=(await f.pool.query('UPDATE "User" SET "passwordHash"=$2,"mustSetPassword"=false WHERE id=$1 RETURNING email',[actor.userId,encoded])).rows[0];
      accounts.push({reference,email:account.email as string,password});
    }
    const files=[];
    for(const id of ['pdf-valid','jpg-valid','png-valid']){const file=materialFileCase(id),name='t064-'+id+'.'+(id.startsWith('jpg')?'jpg':id.startsWith('pdf')?'pdf':'png');writeFileSync('/recovery-private/'+name,file.bytes,{mode:0o600});files.push(name);}
    writeFileSync('/recovery-private/t064-rechazar.txt','Archivo de texto ficticio: debe rechazarse.',{mode:0o600});
    http=await us1Http({context:f});await http.app.get<{beforeApplicationShutdown():Promise<void>}>('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();
    vite=spawn(process.execPath,[repositoryRoot()+'/node_modules/vite/bin/vite.js','--host','0.0.0.0','--port','5173','--strictPort'],
      {cwd:repositoryRoot()+'/apps/web',env:{...process.env,API_PROXY_TARGET:http.url},stdio:'ignore'});
    let ready=false;
    for(let n=0;n<100;n++){if(vite.exitCode!==null)break;try{ready=(await fetch('http://127.0.0.1:5173/',{signal:AbortSignal.timeout(1000)})).ok;}catch{/* bounded readiness */}if(ready)break;await delay(100);}
    expect(ready).toBe(true);
    for(const account of accounts){const response=await http.post('/auth/login',{email:account.email,password:account.password});expect(response.status).toBe(200);}
    const route='/materiales/grupos/'+f.groupId;
    writeFileSync('/recovery-private/acceso-privado.txt',[
      'T064 - Acceso ficticio temporal. No compartir ni incorporar a Git.',
      'URL: http://localhost:5173','Grupo: T064 - Grupo con matrícula vigente','Ruta directa: '+route,
      ...accounts.flatMap(a=>['',a.reference,a.reference==='G01'?'Rol: docente gestor':'Rol: alumno con matrícula vigente','Correo: '+a.email,'Contraseña: '+a.password]),
      '',...files.map(name=>'Archivo de ensayo: '+name),'Archivo rechazable: t064-rechazar.txt',
      'El grupo tiene materiales ficticios previos; identificar los nuevos por título T064.',
    ].join('\n'),{mode:0o600});
    writeFileSync('/recovery-private/ready.json',JSON.stringify({url:'http://localhost:5173',route,startedAt:new Date().toISOString(),maximumSessionMs:7200000,syntheticData:true,loginChecked:2,humanAcceptance:false,schema:f.isolated.schema}),{mode:0o600});
    const until=Date.now()+7200000;
    while(Date.now()<until&&!existsSync('/recovery-private/stop-requested')){expect(vite.exitCode).toBeNull();await delay(1000);}
  }finally{
    if(vite&&vite.exitCode===null){const exited=new Promise<void>(resolve=>vite!.once('exit',()=>resolve()));vite.kill('SIGTERM');await exited;}
    await http?.close();await f.database.close(); // preserve fixture, never drop on shutdown
  }
},7_260_000);
