import type { Page } from '@playwright/test';
import { test,expect } from '../support/us2-fixture';
import { accessSecrets } from '../../../api/src/modules/identity/infrastructure/credentials.js';

async function fill(page:Page,email:string,provisional:string,password:string){
  try{await page.getByLabel('Correo',{exact:true}).fill(email);await page.getByLabel('Credencial provisional').fill(provisional);await page.getByLabel('Nueva contraseña').fill(password);}
  catch{throw new Error('Formulario inicial no disponible. Valores omitidos.');}
}
async function submit(page:Page){
  const result=page.waitForResponse(response=>response.url().endsWith('/auth/password/initial'));
  await page.getByRole('button',{name:'Establecer contraseña',exact:true}).click();return result;
}
test('429 inicial: espera del servidor, campos privados vacíos y reintento solo manual',async({page,identity})=>{
  const f=identity.account('ADMIN','PROVISIONAL');const password=accessSecrets.issue().secret;
  for(let i=0;i<5;i++)expect((await page.request.post('/api/v1/auth/password/initial',{
    headers:{Origin:'http://localhost:5173','X-CSRF-Protection':'1'},data:{email:f.email,provisionalPassword:password,newPassword:password}})).status()).toBe(401);
  await page.goto('/establecer-contrasena');await fill(page,f.email,f.password,password);
  let requests=0;page.on('request',request=>{if(request.url().endsWith('/auth/password/initial'))requests++;});
  expect((await submit(page)).status()).toBe(429);await expect(page.getByRole('alert')).toContainText('900');
  await expect(page.getByRole('button',{name:'Establecer contraseña',exact:true})).toBeDisabled();
  expect((await page.getByLabel('Credencial provisional').inputValue()).length).toBe(0);expect((await page.getByLabel('Nueva contraseña').inputValue()).length).toBe(0);
  expect(requests).toBe(1);expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
  await identity.clock!.advance(900000);await page.reload();await fill(page,f.email,f.password,password);
  expect((await submit(page)).status()).toBe(204);expect(requests).toBe(2);
});
test('fallo SQL inicial: 503 seguro sin consumo ni replay y reintento manual tras recuperar',async({page,identity})=>{
  const f=identity.account('ADMIN','PROVISIONAL');const password=accessSecrets.issue().secret;
  const database=identity.context.database.pool;const before=JSON.stringify((await database.query('SELECT * FROM "User" WHERE id=$1',[f.id])).rows[0]);
  await identity.context.isolated.ownerQuery(`CREATE FUNCTION fail_initial_ui() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF OLD."mustSetPassword" AND NOT NEW."mustSetPassword" THEN RAISE EXCEPTION 'Fallo de ensayo' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_initial_ui BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION fail_initial_ui();`);
  try{
    await page.goto('/establecer-contrasena');await fill(page,f.email,f.password,password);
    let requests=0;page.on('request',request=>{if(request.url().endsWith('/auth/password/initial'))requests++;});
    expect((await submit(page)).status()).toBe(503);await expect(page.getByRole('alert')).toContainText('reintentar manualmente');
    expect(JSON.stringify((await database.query('SELECT * FROM "User" WHERE id=$1',[f.id])).rows[0])===before).toBe(true);
    expect((await page.getByLabel('Credencial provisional').inputValue()).length).toBe(0);expect((await page.getByLabel('Nueva contraseña').inputValue()).length).toBe(0);
    expect(requests).toBe(1);
    await identity.context.isolated.ownerQuery('DROP TRIGGER fail_initial_ui ON "User"');
    await fill(page,f.email,f.password,password);expect((await submit(page)).status()).toBe(204);expect(requests).toBe(2);
  }finally{await identity.context.isolated.ownerQuery('DROP TRIGGER IF EXISTS fail_initial_ui ON "User"; DROP FUNCTION fail_initial_ui()');}
});
test('pantalla inicial ignora URL y retira parámetros sin iniciar ninguna mutación',async({page})=>{
  await page.setViewportSize({width:360,height:800});let requests=0;
  page.on('request',request=>{if(request.url().endsWith('/auth/password/initial'))requests++;});
  await page.goto('/establecer-contrasena?email=ignorado#ignorado');
  await expect.poll(()=>page.evaluate(()=>location.hash.length+location.search.length)).toBe(0);
  expect(await page.evaluate(()=>history.state)).toBeNull();expect(await page.getByLabel('Correo',{exact:true}).inputValue()).toBe('');
  expect((await page.getByLabel('Credencial provisional').inputValue()).length).toBe(0);expect(requests).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
