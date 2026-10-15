import { test,expect } from '../support/us2-fixture';
import { seedAction,tokenState } from '../../../api/tests/support/us2.js';
import { accessSecrets } from '../../../api/src/modules/identity/infrastructure/credentials.js';

const reset='/api/v1/auth/password/reset';
test.afterEach(async({page})=>{await page.locator('input[type="password"]').evaluateAll(inputs=>{
  for(const input of inputs)(input as HTMLInputElement).value='';}).catch(()=>undefined);});
test('reset 503 real: rollback, campos limpios y reintento exclusivamente manual con el mismo enlace',async({page,identity})=>{
  const f=await seedAction(identity,'RESET_PASSWORD');const password=accessSecrets.issue().secret;let posts=0;
  try{await page.goto(f.link);}catch{throw new Error('Navegación de ensayo fallida. Valores omitidos.');}
  const first=page.getByLabel('Nueva contraseña',{exact:true});const confirmation=page.getByLabel('Confirmar nueva contraseña',{exact:true});
  await expect(first).toBeVisible();
  page.on('request',request=>{if(request.url().endsWith(reset)&&request.method()==='POST')posts++;});
  const before=JSON.stringify((await identity.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[f.account.id])).rows[0]);
  await identity.context.isolated.ownerQuery(`CREATE FUNCTION fail_reset_ui() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Fallo privado de prueba' USING ERRCODE='23514'; END $$;
    CREATE TRIGGER fail_reset_ui BEFORE UPDATE ON "Session" FOR EACH ROW EXECUTE FUNCTION fail_reset_ui();`);
  try{
    try{await first.fill(password);await confirmation.fill(password);}catch{throw new Error('Campos de ensayo no disponibles. Valores omitidos.');}
    const response=page.waitForResponse(value=>value.url().endsWith(reset)&&value.request().method()==='POST');
    await page.getByRole('button',{name:'Restablecer contraseña',exact:true}).click();expect((await response).status()).toBe(503);
    await expect(page.getByRole('alert')).toContainText(/temporalmente|reintentar/i);
    expect((await first.inputValue()).length+(await confirmation.inputValue()).length).toBe(0);
    expect(posts).toBe(1);expect((await tokenState(identity,f.id)).consumedAt).toBeNull();
    expect(JSON.stringify((await identity.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[f.account.id])).rows[0])===before).toBe(true);
  }finally{await identity.context.isolated.ownerQuery('DROP TRIGGER fail_reset_ui ON "Session"; DROP FUNCTION fail_reset_ui()');}
  // Esperar un turno de interfaz no reenvía una operación fallida ni confirma éxito.
  await expect(first).toBeEnabled();expect(posts).toBe(1);
  try{await first.fill(password);await confirmation.fill(password);}catch{throw new Error('Campos de reintento no disponibles. Valores omitidos.');}
  const retry=page.waitForResponse(value=>value.url().endsWith(reset)&&value.request().method()==='POST');
  await page.getByRole('button',{name:'Restablecer contraseña',exact:true}).click();expect((await retry).status()).toBe(204);
  expect(posts).toBe(2);expect((await tokenState(identity,f.id)).consumedAt!==null).toBe(true);
  await expect(page.getByRole('link',{name:'Iniciar sesión',exact:true})).toBeVisible();
});
test('sin fragmento o con fragmento mal formado: URL limpia, sin formulario ni mutación',async({page})=>{
  let posts=0;page.on('request',request=>{if(request.url().endsWith(reset)&&request.method()==='POST')posts++;});
  for(const path of ['/restablecer','/restablecer?token=valor-no-utilizable#invalido']){
    await page.goto(path);await expect(page.getByRole('heading',{name:'Restablecer contraseña',exact:true})).toBeVisible();
    expect(await page.locator('input[type="password"]').count()).toBe(0);
    expect(await page.evaluate(()=>location.hash.length+location.search.length)).toBe(0);
    await expect(page.getByRole('link',{name:'Solicitar nuevo enlace de recuperación',exact:true})).toBeVisible();
    expect(posts).toBe(0);expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
  }
});
test('contraseña fuera de 12–128 caracteres: aviso local sin consumo ni POST; el enlace conserva vigencia',async({page,identity})=>{
  const f=await seedAction(identity,'RESET_PASSWORD');let posts=0;
  try{await page.goto(f.link);}catch{throw new Error('Navegación de ensayo fallida. Valores omitidos.');}
  const first=page.getByLabel('Nueva contraseña',{exact:true});await expect(first).toBeVisible();
  page.on('request',request=>{if(request.url().endsWith(reset)&&request.method()==='POST')posts++;});
  for(const password of [accessSecrets.issue().secret.slice(0,11),accessSecrets.issue().secret.repeat(4)]){
    try{await first.fill(password);await page.getByLabel('Confirmar nueva contraseña',{exact:true}).fill(password);}
    catch{throw new Error('Campos de validación no disponibles. Valores omitidos.');}
    await page.getByRole('button',{name:'Restablecer contraseña',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
    expect(posts).toBe(0);expect((await tokenState(identity,f.id)).consumedAt).toBeNull();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
