import { afterAll,afterEach,beforeAll,beforeEach,expect,test } from 'vitest';
import { us2Dataset } from '../support/us2.js';
import type { Us2Dataset } from '../support/us2.js';
import { us1Http } from '../support/us1-http.js';
import type { Us1Http } from '../support/us1-http.js';
import { accessSecrets,createPasswordCredentials } from '../../src/modules/identity/infrastructure/credentials.js';

let data:Us2Dataset;let http:Us1Http;
beforeAll(async()=>{data=await us2Dataset('us6_initial');},120000);
beforeEach(async()=>{await data.reset();http=await us1Http(data);});
afterEach(async()=>{await http?.close();});afterAll(async()=>{await data?.cleanup();});
const account=()=>data.account('ADMIN','PROVISIONAL');
async function row(){return (await data.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[account().id])).rows[0];}
function body(overrides:Record<string,unknown>={}){return {email:account().email,provisionalPassword:account().password,newPassword:accessSecrets.issue().secret,...overrides};}
async function initial(input:Record<string,unknown>){return http.post('/auth/password/initial',input);}
async function error(response:Response,status:number,code:string,secrets:string[]=[]) {
  expect(response.status,'US6_PENDING_INITIAL: contrato de /auth/password/initial').toBe(status);
  const value=await response.json();expect(value.error.code).toBe(code);
  expect(secrets.every(secret=>!JSON.stringify(value).includes(secret))).toBe(true);
  expect(response.headers.get('set-cookie')).toBeNull();expect(response.headers.get('cache-control')).toBe('no-store');
  return value.error.message;
}
async function requireInitial(){await error(await initial(body({provisionalPassword:accessSecrets.issue().secret})),401,'INVALID_CREDENTIALS');}

test('control: fixture provisional real y rechazo de login sin sesión',async()=>{
  const current=await row();expect(current.mustSetPassword&&current.passwordHash===null&&current.emailVerifiedAt===null).toBe(true);
  expect(await (await createPasswordCredentials()).verify(account().password,current.provisionalPasswordHash)).toBe(true);
  await error(await http.post('/auth/login',{email:account().email,password:account().password}),401,'INVALID_CREDENTIALS');
  expect((await http.get('/me')).status).toBe(401);
});
for(const verified of [false,true])test(`sustitución válida ${verified?'con correo verificado':'sin verificar'}: consume solo provisional, sin sesión ni verificación implícita`,async()=>{
  if(verified)await data.context.database.pool.query('UPDATE "User" SET "emailVerifiedAt"=clock_timestamp() WHERE id=$1',[account().id]);
  const before=await row();const input=body();const response=await initial(input);
  expect(response.status,'US6_PENDING_INITIAL').toBe(204);expect((await response.text()).length).toBe(0);expect(response.headers.get('set-cookie')).toBeNull();
  const after=await row();expect(after.mustSetPassword).toBe(false);expect(after.provisionalPasswordHash===null&&after.provisionalExpiresAt===null).toBe(true);
  expect(await (await createPasswordCredentials()).verify(input.newPassword as string,after.passwordHash)).toBe(true);
  expect(String(after.authVersion)===String(BigInt(before.authVersion)+1n)).toBe(true);
  expect(after.role===before.role&&after.status===before.status&&String(after.emailVerifiedAt)===String(before.emailVerifiedAt)).toBe(true);
  expect((await data.context.database.pool.query('SELECT id FROM "Session" WHERE "userId"=$1',[account().id])).rowCount).toBe(0);
  expect((await http.get('/me')).status).toBe(401);
});
for(const delta of [-1,0])test(`frontera provisional 24 horas ${delta===0?'exactas rechaza':'menos 1 ms acepta'}`,async()=>{
  const before=await row();await data.clock!.set(new Date(before.provisionalExpiresAt.getTime()+delta));
  const response=await initial(body());
  if(delta===0){await error(response,401,'INVALID_CREDENTIALS');expect(JSON.stringify(await row())===JSON.stringify(before)).toBe(true);}
  else expect(response.status,'US6_PENDING_INITIAL').toBe(204);
});
for(const invalid of ['', 'x'.repeat(11), 'x'.repeat(129), ['array'], null])test(`nueva inválida ${invalid===null?'null':Array.isArray(invalid)?'array':String(invalid).length+' caracteres'} no consume`,async()=>{
  const before=JSON.stringify(await row());await error(await initial(body({newPassword:invalid})),400,'VALIDATION_ERROR');
  expect(JSON.stringify(await row())===before).toBe(true);
  expect((await initial(body())).status,'US6_PENDING_INITIAL').toBe(204);
});
test('extras y arrays en credenciales se rechazan sin cambios',async()=>{
  const before=JSON.stringify(await row());
  for(const extra of [{role:'ADMIN'},{status:'ACTIVE'},{email:[account().email]},{provisionalPassword:[account().password]}]){
    await error(await initial(body(extra)),400,'VALIDATION_ERROR');expect(JSON.stringify(await row())===before).toBe(true);
  }
});
test('credencial propia no sustituye a provisional y no se admite segundo consumo',async()=>{
  const input=body();expect((await initial(input)).status,'US6_PENDING_INITIAL').toBe(204);const before=JSON.stringify(await row());
  await error(await initial(body()),401,'INVALID_CREDENTIALS',[account().password]);
  await error(await initial(body({provisionalPassword:input.newPassword})),401,'INVALID_CREDENTIALS',[input.newPassword as string]);
  expect(JSON.stringify(await row())===before).toBe(true);
});
test('doble consumo concurrente: un 204 y un 401, versión incrementada una vez y hash ganador',async()=>{
  const before=await row();const a=body();const b=body();
  const responses=await Promise.all([initial(a),initial(b)]);expect(responses.map(value=>value.status).sort()).toEqual([204,401]);
  const after=await row();expect(BigInt(after.authVersion)-BigInt(before.authVersion)).toBe(1n);
  const winner=responses[0].status===204?a:b;
  expect(await (await createPasswordCredentials()).verify(winner.newPassword as string,after.passwordHash)).toBe(true);
  expect(after.emailVerifiedAt).toBeNull();expect(after.provisionalPasswordHash).toBeNull();
});
for(const invalid of ['inexistente','desactivada','incorrecta'])test(`401 genérico para ${invalid}, sin cambios`,async()=>{
  if(invalid==='desactivada')await data.context.database.pool.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`,[account().id]);
  const before=JSON.stringify(await row());const input=body(invalid==='inexistente'?{email:'ausente@example.test'}:invalid==='incorrecta'?{provisionalPassword:accessSecrets.issue().secret}:{});
  const reference=await error(await http.post('/auth/login',{email:account().email,password:accessSecrets.issue().secret}),401,'INVALID_CREDENTIALS');
  const message=await error(await initial(input),401,'INVALID_CREDENTIALS',[input.provisionalPassword as string]);
  expect(message).toBe(reference);
  expect(JSON.stringify(await row())===before).toBe(true);
});
test('login e inicial comparten cinco fallos, bloqueo persistido y frontera 15 min',async()=>{
  const wrong=accessSecrets.issue().secret;
  for(let i=0;i<3;i++)await error(await http.post('/auth/login',{email:account().email,password:wrong}),401,'INVALID_CREDENTIALS');
  for(let i=0;i<2;i++)await error(await initial(body({provisionalPassword:wrong})),401,'INVALID_CREDENTIALS');
  const limited=await initial(body());await error(limited,429,'RATE_LIMITED');expect(limited.headers.get('retry-after')).toBe('900');
  await http.close();http=await us1Http(data);await error(await initial(body()),429,'RATE_LIMITED');
  await data.clock!.advance(900000);expect((await initial(body())).status,'US6_PENDING_INITIAL').toBe(204);
});
for(const change of ['hash','version','estado'])test(`revalidación bajo lock tras cambio concurrente de ${change}`,async()=>{
  await requireInitial();const input=body();const pool=data.context.database.pool;const client=await pool.connect();
  const replacement=await (await createPasswordCredentials()).hash(accessSecrets.issue().secret);
  let response:Promise<Response>|undefined;
  try{
    await client.query('BEGIN');await client.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',[account().id]);
    const holder=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    response=initial(input);
    const deadline=Date.now()+2500;let waiting=false;
    while(!waiting&&Date.now()<deadline){
      waiting=(await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
        AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))) AS waiting`,[holder])).rows[0].waiting;
      if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
    }
    expect(waiting,'La operación debe revalidar el usuario antes de confirmar').toBe(true);
    if(change==='estado')await client.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`,[account().id]);
    else await client.query('UPDATE "User" SET "provisionalPasswordHash"=$2,"authVersion"="authVersion"+1 WHERE id=$1',[account().id,change==='hash'?replacement:(await row()).provisionalPasswordHash]);
    await client.query('COMMIT');const before=JSON.stringify(await row());
    await error(await response,401,'INVALID_CREDENTIALS');expect(JSON.stringify(await row())===before).toBe(true);
  }finally{await client.query('ROLLBACK');client.release();await response;}
});
test('fallo real de escritura revierte sustitución inicial y conserva provisional utilizable',async()=>{
  await requireInitial();const before=JSON.stringify(await row());
  await data.context.isolated.ownerQuery(`CREATE FUNCTION us6_fail_initial() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF OLD."mustSetPassword" AND NOT NEW."mustSetPassword" THEN RAISE EXCEPTION 'Fallo de ensayo' USING ERRCODE='23514'; END IF;
    RETURN NEW; END $$; CREATE TRIGGER us6_fail_initial BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION us6_fail_initial();`);
  try{
    await error(await initial(body()),503,'TEMPORARILY_UNAVAILABLE',[account().password]);
    expect(JSON.stringify(await row())===before).toBe(true);
  }finally{await data.context.isolated.ownerQuery('DROP FUNCTION us6_fail_initial() CASCADE');}
  expect((await initial(body())).status).toBe(204);
});
