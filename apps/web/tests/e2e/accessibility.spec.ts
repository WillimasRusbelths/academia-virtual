import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test,expect,verificationLink,passwordResetLink } from '../support/us2-fixture';
import { activate,accessibleErrors,choose,controlsAccessible,keyboardTo,pageFits,typeField } from '../support/accessibility';
import { seedAction } from '../../../api/tests/support/us2.js';
import type { Us2Dataset } from '../../../api/tests/support/us2.js';
import { accessSecrets } from '../../../api/src/modules/identity/infrastructure/credentials.js';
import type { FixtureAccount } from '../../../api/tests/support/identity-fixtures.js';

const labels={STUDENT:'Alumno',TEACHER:'Docente',ADMIN:'Administrador'};
async function visit(page:Page,path:string){
  try{await page.goto(path);}catch{throw new Error('Navegación del ensayo no completada. Valores omitidos.');}
}
async function signIn(page:Page,account:Pick<FixtureAccount,'email'|'password'>){
  await visit(page,'/login');
  await typeField(page,page.getByLabel(/^correo$/i),account.email);
  await typeField(page,page.getByLabel(/^contraseña$/i),account.password);
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/login')&&value.request().method()==='POST');
  await activate(page,page.getByRole('button',{name:'Iniciar sesión',exact:true}));expect((await response).status()).toBe(200);
  await expect.poll(()=>page.evaluate(()=>location.pathname)).toBe('/inicio');
}
async function signOut(page:Page){
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/logout'));
  await activate(page,page.getByRole('button',{name:'Cerrar sesión',exact:true}));expect((await response).status()).toBe(204);
  await expect.poll(()=>page.evaluate(()=>location.pathname)).toBe('/login');
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);await pageFits(page);
}
async function currentLink(identity:Us2Dataset,id:string,email:string,purpose:'VERIFY_EMAIL'|'RESET_PASSWORD'){
  const row=(await identity.context.database.pool.query(`SELECT "tokenHash" FROM "ActionToken"
    WHERE "userId"=$1 AND purpose=$2::"TokenPurpose" AND "consumedAt" IS NULL AND "revokedAt" IS NULL`,[id,purpose])).rows[0];
  expect(!!row,'La acción real dejó un enlace persistido').toBe(true);
  const accept=(link:string)=>{const digest=accessSecrets.digest(link.split('#')[1]??'');return !!digest&&Buffer.from(digest).equals(row.tokenHash);};
  return purpose==='VERIFY_EMAIL'?verificationLink(email,identity.context.environment.appOrigin,accept)
    :passwordResetLink(email,identity.context.environment.appOrigin,accept);
}
async function confirm(page:Page,link:string){
  await visit(page,link);await expect.poll(()=>page.evaluate(()=>location.hash.length)).toBe(0);
  await controlsAccessible(page);
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/verification/confirm'));
  await activate(page,page.getByRole('button',{name:'Confirmar correo',exact:true}));expect((await response).status()).toBe(204);
  await expect(page.getByRole('status').filter({hasText:/correo verificado/i})).toBeVisible();await pageFits(page);
}
async function verifyAccount(page:Page,identity:Us2Dataset,account:FixtureAccount){
  await visit(page,'/verificar-correo');await typeField(page,page.getByLabel(/^correo$/i),account.email);
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/verification/request'));
  await activate(page,page.getByRole('button',{name:'Solicitar nuevo envío',exact:true}));expect((await response).status()).toBe(202);
  await pageFits(page);await confirm(page,await currentLink(identity,account.id,account.email,'VERIFY_EMAIL'));
}
async function adminList(page:Page,identity:Us2Dataset){
  await signIn(page,identity.account('ADMIN'));
  await activate(page,page.getByRole('link',{name:'Gestionar cuentas',exact:true}));
  await expect(page.getByLabel('Buscar por nombre o correo')).toBeEnabled();await pageFits(page);
}
async function detail(page:Page,id:string){
  await visit(page,'/admin/cuentas/'+id);await expect(page.getByLabel('Nombre',{exact:true})).toBeVisible();await pageFits(page);
}
test.afterEach(async({page})=>{
  await page.locator('input[type="password"]').evaluateAll(inputs=>{for(const input of inputs)(input as HTMLInputElement).value='';}).catch(()=>undefined);
});

test('control: API y web reales, tres roles y esquema aislado',async({page,identity})=>{
  expect(identity.context.environment.databaseSchema.startsWith('t_')).toBe(true);
  expect((await visitAndStatus(page))===200).toBe(true);
  for(const role of ['STUDENT','TEACHER','ADMIN'] as const)expect(identity.account(role).role===role).toBe(true);
  await controlsAccessible(page);
});
async function visitAndStatus(page:Page){return (await page.goto('/login'))?.status();}

for(const role of ['STUDENT','TEACHER','ADMIN'] as const){
  test(`inicio ${role}: identidad única y enlaces autorizados, incluido perfil`,async({page,identity})=>{
    const account=identity.account(role);await signIn(page,account);
    const text=await page.locator('main').innerText();expect(text.includes(account.name)&&text.includes(labels[role])).toBe(true);
    expect(await page.getByRole('combobox').count()).toBe(0);
    expect(await page.getByRole('link',{name:'Gestionar cuentas',exact:true}).count()).toBe(role==='ADMIN'?1:0);
    expect(await page.getByRole('link',{name:/perfil/i}).count()>0,'US3_PENDING_HOME_PROFILE: inicio debe ofrecer acceso al perfil').toBe(true);
    await controlsAccessible(page);await activate(page,page.getByRole('link',{name:/perfil/i}));
    await expect.poll(()=>page.evaluate(()=>location.pathname)).toBe('/perfil');
  });
  test(`perfil ${role}: lectura propia, recarga y sin edición ni secretos`,async({page,identity})=>{
    const account=identity.account(role);await signIn(page,account);await visit(page,'/perfil');
    await expect(page.locator('main')).toBeVisible();
    expect(await page.getByRole('heading',{name:'Página no disponible',exact:true}).count(),
      'US3_PENDING_PROFILE_ROUTE: /perfil debe existir como pantalla protegida').toBe(0);
    await expect(page.getByRole('heading',{name:/perfil/i})).toBeVisible();
    for(let load=0;load<2;load++){
      await expect.poll(async()=>{
        const text=await page.locator('main').innerText();
        return text.includes(account.name)&&text.includes(account.email)&&text.includes(labels[role])&&/activ[oa]|ACTIVE/.test(text);
      }).toBe(true);
      const text=await page.locator('main').innerText();
      expect(text.includes(account.password)||text.includes(account.sessions[0].secret)).toBe(false);
      expect(await page.locator('main input:not([readonly]):not([disabled]),main select,main textarea,main [contenteditable="true"]').count()).toBe(0);
      await controlsAccessible(page);if(load===0)await page.reload();
    }
    expect((await page.request.get('/api/v1/me')).status()).toBe(200);
  });
  test(`acceso y cierre ${role} solo con teclado y foco visible`,async({page,identity})=>{
    await signIn(page,identity.account(role));await controlsAccessible(page);await signOut(page);
  });
}

test('perfil directo de visitante requiere acceso, sin contenido privado',async({page})=>{
  await visit(page,'/perfil');await expect(page.locator('main')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>location.pathname==='/login'),
    {message:'US3_PENDING_PROFILE_GUARD: visitante debe volver a login desde /perfil'}).toBe(true);
  await expect(page.getByLabel('Correo',{exact:true})).toBeVisible();await pageFits(page);
});

for(const path of ['/login','/registro','/verificar-correo','/recuperar','/establecer-contrasena']){
  test(`formulario ${path}: etiquetas, Tab, error textual asociado y anunciable`,async({page})=>{
    await visit(page,path);await controlsAccessible(page);let mutations=0;
    page.on('request',request=>{if(request.method()==='POST')mutations++;});
    await activate(page,page.locator('form button[type="submit"]'));await accessibleErrors(page);
    expect(mutations).toBe(0);
  });
}

test('registro → correo → confirmación → acceso → cierre con teclado',async({page,identity})=>{
  const account={name:'Persona de teclado',email:randomUUID()+'@example.test',password:accessSecrets.issue().secret};
  await visit(page,'/registro');await controlsAccessible(page);
  await typeField(page,page.getByLabel('Nombre',{exact:true}),account.name);
  await typeField(page,page.getByLabel('Correo',{exact:true}),account.email);
  await typeField(page,page.getByLabel('Contraseña',{exact:true}),account.password);
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/register'));
  await activate(page,page.getByRole('button',{name:'Crear cuenta',exact:true}));expect((await response).status()).toBe(202);
  await expect(page.getByRole('status').filter({hasText:/Si la cuenta cumple/})).toBeVisible();await pageFits(page);
  await confirm(page,await verificationLink(account.email,identity.context.environment.appOrigin));
  await activate(page,page.getByRole('link',{name:'Iniciar sesión',exact:true}));await signIn(page,account);await signOut(page);
});
test('reenvío y confirmación explícita por teclado, sin acciones solo hover',async({page,identity})=>{
  await verifyAccount(page,identity,identity.account('STUDENT','UNVERIFIED'));
  await controlsAccessible(page);expect((await page.request.get('/api/v1/me')).status()).toBe(401);
});
test('activación inicial: verificación, sustitución y acceso por teclado',async({page,identity})=>{
  const account=identity.account('ADMIN','PROVISIONAL');const password=accessSecrets.issue().secret;
  await verifyAccount(page,identity,account);
  await activate(page,page.getByRole('link',{name:'Establecer contraseña propia',exact:true}));await controlsAccessible(page);
  await typeField(page,page.getByLabel('Correo',{exact:true}),account.email);
  await typeField(page,page.getByLabel('Credencial provisional',{exact:true}),account.password);
  await typeField(page,page.getByLabel('Nueva contraseña',{exact:true}),password);
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/password/initial'));
  await activate(page,page.getByRole('button',{name:'Establecer contraseña',exact:true}));expect((await response).status()).toBe(204);
  await expect(page.getByRole('status').filter({hasText:/Contraseña establecida/})).toBeVisible();await pageFits(page);
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);await signIn(page,{email:account.email,password});await signOut(page);
});
test('recuperación → correo → restablecimiento → acceso por teclado',async({page,identity})=>{
  const account=identity.account();const password=accessSecrets.issue().secret;
  await visit(page,'/recuperar');await controlsAccessible(page);await typeField(page,page.getByLabel('Correo',{exact:true}),account.email);
  const requested=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/password/forgot'));
  await activate(page,page.getByRole('button',{name:'Solicitar instrucciones',exact:true}));expect((await requested).status()).toBe(202);
  await pageFits(page);await visit(page,await currentLink(identity,account.id,account.email,'RESET_PASSWORD'));
  await expect.poll(()=>page.evaluate(()=>location.hash.length)).toBe(0);await controlsAccessible(page);
  await typeField(page,page.getByLabel('Nueva contraseña',{exact:true}),password);
  await typeField(page,page.getByLabel('Confirmar nueva contraseña',{exact:true}),password);
  const reset=page.waitForResponse(value=>value.url().endsWith('/api/v1/auth/password/reset'));
  await activate(page,page.getByRole('button',{name:'Restablecer contraseña',exact:true}));expect((await reset).status()).toBe(204);
  await expect(page.getByRole('status').filter({hasText:/Contraseña restablecida/})).toBeVisible();await pageFits(page);
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);await signIn(page,{email:account.email,password});await signOut(page);
});
test('restablecimiento inválido: error textual anunciado y enlace no consumido',async({page,identity})=>{
  const token=await seedAction(identity,'RESET_PASSWORD');await visit(page,token.link);await controlsAccessible(page);
  await typeField(page,page.getByLabel('Nueva contraseña',{exact:true}),accessSecrets.issue().secret);
  await activate(page,page.getByRole('button',{name:'Restablecer contraseña',exact:true}));await accessibleErrors(page);
  expect((await identity.context.database.pool.query('SELECT "consumedAt" FROM "ActionToken" WHERE id=$1',[token.id])).rows[0].consumedAt===null).toBe(true);
});

test('administración: filtros, paginación y detalle por teclado',async({page,identity})=>{
  await adminList(page,identity);await controlsAccessible(page);
  await choose(page,page.getByLabel('Resultados por página'),0);await activate(page,page.getByRole('button',{name:'Buscar',exact:true}));
  await expect(page.locator('.account-list li')).toHaveCount(10);
  await activate(page,page.getByRole('button',{name:'Siguiente',exact:true}));await expect(page.locator('.account-list li')).toHaveCount(2);
  await activate(page,page.getByRole('button',{name:'Anterior',exact:true}));await expect(page.locator('.account-list li')).toHaveCount(10);
  await choose(page,page.getByLabel('Filtrar por rol'),1);await choose(page,page.getByLabel('Filtrar por estado'),1);
  const account=identity.account();await typeField(page,page.getByLabel('Buscar por nombre o correo'),account.email);
  await activate(page,page.getByRole('button',{name:'Buscar',exact:true}));await expect(page.locator('.account-list li')).toHaveCount(1);
  await pageFits(page);await activate(page,page.locator(`a[href="/admin/cuentas/${account.id}"]`));
  await expect(page.getByLabel('Nombre',{exact:true})).toBeVisible();await controlsAccessible(page);
});
test('alta administrativa con etiquetas y teclado; provisional se retira',async({page,identity})=>{
  await adminList(page,identity);await activate(page,page.getByRole('button',{name:'Nueva cuenta',exact:true}));await controlsAccessible(page);
  const email=randomUUID()+'@example.test';await typeField(page,page.getByLabel('Nombre',{exact:true}),'Cuenta de teclado');
  await typeField(page,page.getByLabel('Correo',{exact:true}),email);await choose(page,page.getByLabel('Rol',{exact:true}),1);
  await typeField(page,page.getByLabel('Credencial provisional',{exact:true}),accessSecrets.issue().secret);
  const response=page.waitForResponse(value=>value.url().endsWith('/api/v1/admin/users')&&value.request().method()==='POST');
  await activate(page,page.getByRole('button',{name:'Crear cuenta',exact:true}));expect((await response).status()).toBe(201);
  await expect(page.getByRole('status').filter({hasText:/Cuenta creada/})).toBeVisible();
  expect((await page.getByLabel('Credencial provisional',{exact:true}).inputValue()).length).toBe(0);await pageFits(page);
  const row=(await identity.context.database.pool.query('SELECT role,"mustSetPassword" FROM "User" WHERE email=$1',[email])).rows[0];
  expect(row.role==='TEACHER'&&row.mustSetPassword===true).toBe(true);
});
test('detalle: nombre, cancelación, rol y estado confirmados por teclado',async({page,identity})=>{
  const account=identity.account();await signIn(page,identity.account('ADMIN'));await detail(page,account.id);await controlsAccessible(page);
  await typeField(page,page.getByLabel('Nombre',{exact:true}),'Nombre corregido');
  await activate(page,page.getByRole('button',{name:'Guardar nombre',exact:true}));
  await expect(page.getByRole('status')).toContainText('Cambio confirmado');
  await choose(page,page.getByLabel('Rol',{exact:true}),1);await activate(page,page.getByRole('button',{name:'Cambiar rol',exact:true}));
  await controlsAccessible(page);await activate(page,page.getByRole('button',{name:'Cancelar',exact:true}));
  expect((await identity.context.database.pool.query('SELECT role FROM "User" WHERE id=$1',[account.id])).rows[0].role==='STUDENT').toBe(true);
  await activate(page,page.getByRole('button',{name:'Cambiar rol',exact:true}));await activate(page,page.getByRole('button',{name:'Confirmar cambio',exact:true}));
  await expect(page.getByRole('status')).toContainText('Cambio confirmado');
  for(const index of [1,0]){
    await choose(page,page.getByLabel('Estado',{exact:true}),index);await activate(page,page.getByRole('button',{name:'Cambiar estado',exact:true}));
    await controlsAccessible(page);await activate(page,page.getByRole('button',{name:'Confirmar cambio',exact:true}));
    await expect(page.getByRole('status')).toContainText('Cambio confirmado');await pageFits(page);
  }
  const row=(await identity.context.database.pool.query('SELECT name,role,status FROM "User" WHERE id=$1',[account.id])).rows[0];
  expect(row.name==='Nombre corregido'&&row.role==='TEACHER'&&row.status==='ACTIVE').toBe(true);
});
for(const form of ['busqueda','alta','nombre'])test(`administración ${form}: error textual asociado y anunciable`,async({page,identity})=>{
  await adminList(page,identity);
  if(form==='busqueda'){
    await typeField(page,page.getByLabel('Buscar por nombre o correo'),'x'.repeat(255));
    await activate(page,page.getByRole('button',{name:'Buscar',exact:true}));
  }else if(form==='alta'){
    await activate(page,page.getByRole('button',{name:'Nueva cuenta',exact:true}));await controlsAccessible(page);
    await activate(page,page.getByRole('button',{name:'Crear cuenta',exact:true}));
  }else{
    await detail(page,identity.account().id);await typeField(page,page.getByLabel('Nombre',{exact:true}),'');
    await activate(page,page.getByRole('button',{name:'Guardar nombre',exact:true}));
  }
  await accessibleErrors(page);
});
test('rechazo administrativo propio: mensaje anunciado, sin modificación',async({page,identity})=>{
  const actor=identity.account('ADMIN');await signIn(page,actor);await detail(page,actor.id);
  await choose(page,page.getByLabel('Rol',{exact:true}),0);await activate(page,page.getByRole('button',{name:'Cambiar rol',exact:true}));
  await controlsAccessible(page);await activate(page,page.getByRole('button',{name:'Confirmar cambio',exact:true}));
  await expect(page.getByRole('alert')).toContainText(/propia|propio|administrador/i);await pageFits(page);
  expect((await identity.context.database.pool.query('SELECT role FROM "User" WHERE id=$1',[actor.id])).rows[0].role==='ADMIN').toBe(true);
  await keyboardTo(page,page.getByRole('link',{name:'Inicio',exact:true}));
});
