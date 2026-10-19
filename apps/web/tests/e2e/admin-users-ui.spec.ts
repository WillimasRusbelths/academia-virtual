import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test,expect } from '../support/us2-fixture';
import { accessSecrets } from '../../../api/src/modules/identity/infrastructure/credentials.js';

async function login(page:Page,email:string,password:string){
  await page.goto('/login');try{await page.getByLabel(/^correo$/i).fill(email);await page.getByLabel(/^contraseña$/i).fill(password);}
  catch{throw new Error('Formulario de ensayo no disponible. Valores omitidos.');}
  await page.getByRole('button',{name:/iniciar sesión/i}).click();await expect(page).toHaveURL(/\/inicio$/);
}
const isList=(url:string)=>new URL(url).pathname==='/api/v1/admin/users';
for(const size of [{width:360,height:800},{width:1366,height:768}])test(`lista, filtros, paginación, vacío y validación a ${size.width}`,async({page,identity})=>{
  await page.setViewportSize(size);const actor=identity.account('ADMIN');await login(page,actor.email,actor.password);
  await page.getByRole('link',{name:'Gestionar cuentas'}).click();await expect(page.getByLabel(/buscar por/i)).toBeEnabled();
  await page.getByLabel('Resultados por página').selectOption('10');await page.getByRole('button',{name:'Buscar',exact:true}).click();
  await expect(page.locator('.account-list li')).toHaveCount(10);await page.getByRole('button',{name:'Siguiente',exact:true}).click();
  await expect(page.locator('.account-list li')).toHaveCount(2);await expect(page.getByRole('button',{name:'Siguiente',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Anterior',exact:true}).click();await expect(page.locator('.account-list li')).toHaveCount(10);
  await page.getByLabel('Filtrar por rol').selectOption('TEACHER');await page.getByLabel('Filtrar por estado').selectOption('DISABLED');
  await page.getByRole('button',{name:'Buscar',exact:true}).click();await expect(page.locator('.account-list li')).toHaveCount(1);
  await expect(page.getByText(identity.account('TEACHER','DISABLED').email,{exact:true})).toBeVisible();
  if(process.env.US4_VISUAL==='1')await page.screenshot({path:`/workspace/.cache/us4/ui/accounts-${size.width}.png`,fullPage:true});
  await page.getByLabel(/buscar por/i).fill('sin-coincidencias-'+randomUUID());await page.getByRole('button',{name:'Buscar',exact:true}).click();
  await expect(page.getByText('No hay cuentas que coincidan.')).toBeVisible();
  let requests=0;page.on('request',request=>{if(isList(request.url()))requests++;});
  await page.getByLabel(/buscar por/i).fill('a'.repeat(255));await page.getByRole('button',{name:'Buscar',exact:true}).click();
  await expect(page.getByText('La búsqueda admite hasta 254 caracteres.')).toBeVisible();expect(requests).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&localStorage.length+sessionStorage.length+location.search.length===0)).toBe(true);
  await page.goto(`/admin/cuentas/${identity.account('TEACHER','DISABLED').id}`);await expect(page.getByLabel('Nombre',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(process.env.US4_VISUAL==='1')await page.screenshot({path:`/workspace/.cache/us4/ui/detail-${size.width}.png`,fullPage:true});
});
test('503 de consulta: error seguro y reintento manual, sin datos remotos',async({page,identity})=>{
  const actor=identity.account('ADMIN');await login(page,actor.email,actor.password);let count=0;
  await page.route('**/api/v1/admin/users?*',async route=>{count++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'TEMPORARILY_UNAVAILABLE',message:'detalle-remoto-omitido'}})});});
  await page.goto('/admin/cuentas');await expect(page.getByRole('alert')).toContainText('Servicio temporalmente no disponible');
  expect(count).toBe(1);await expect(page.getByText('detalle-remoto-omitido')).toHaveCount(0);
  await page.unroute('**/api/v1/admin/users?*');await page.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(page.locator('.account-list li')).toHaveCount(12);
});
for(const role of ['STUDENT','TEACHER'] as const)test(`${role}: URL directa refleja 403 del servidor sin mostrar datos`,async({page,identity})=>{
  const f=identity.account(role);await login(page,f.email,f.password);await page.goto('/admin/cuentas');
  await expect(page.getByRole('alert')).toContainText('No tienes permiso');await expect(page.locator('.account-list li')).toHaveCount(0);
  await page.goto(`/admin/cuentas/${identity.account().id}`);await expect(page.getByRole('alert')).toContainText('No tienes permiso');await expect(page.getByLabel('Nombre',{exact:true})).toHaveCount(0);
});
test('confirmación cancelada no envía; cambio propio 409 no cambia permisos',async({page,identity})=>{
  const actor=identity.account('ADMIN');await login(page,actor.email,actor.password);await page.goto(`/admin/cuentas/${actor.id}`);
  await page.getByLabel('Rol',{exact:true}).selectOption('STUDENT');await page.getByRole('button',{name:'Cambiar rol',exact:true}).click();
  let requests=0;page.on('request',request=>{if(request.method()==='PUT')requests++;});
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();expect(requests).toBe(0);
  await page.getByRole('button',{name:'Cambiar rol',exact:true}).click();await page.getByRole('button',{name:'Confirmar cambio',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('último administrador');expect(requests).toBe(1);await expect(page.getByLabel('Rol',{exact:true})).toHaveValue('ADMIN');
  expect((await identity.context.database.pool.query('SELECT role FROM "User" WHERE id=$1',[actor.id])).rows[0].role==='ADMIN').toBe(true);
});
test('pérdida de permisos al enviar limpia el detalle y no conserva una acción para reintentar',async({page,identity})=>{
  const actor=identity.account('ADMIN');const target=identity.account();await login(page,actor.email,actor.password);await page.goto(`/admin/cuentas/${target.id}`);
  await expect(page.getByLabel('Nombre',{exact:true})).toBeVisible();await identity.context.database.pool.query(`UPDATE "User" SET role='TEACHER' WHERE id=$1`,[actor.id]);
  const before=JSON.stringify((await identity.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[target.id])).rows[0]);
  await page.getByLabel('Nombre',{exact:true}).fill('No permitido');await page.getByRole('button',{name:'Guardar nombre',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('No tienes permiso');await expect(page.getByLabel('Nombre',{exact:true})).toHaveCount(0);
  expect(JSON.stringify((await identity.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[target.id])).rows[0])===before).toBe(true);
});
test('respuesta de alta perdida: consulta por correo encuentra cuenta sin repetir ni sobrescribir',async({page,identity})=>{
  const actor=identity.account('ADMIN');await login(page,actor.email,actor.password);await page.goto('/admin/cuentas');
  await page.getByRole('button',{name:'Nueva cuenta',exact:true}).click();const email=`${randomUUID()}@example.test`;const password=accessSecrets.issue().secret;
  try{await page.getByLabel('Nombre',{exact:true}).fill('Cuenta de ensayo');await page.getByLabel('Correo',{exact:true}).fill(email);await page.getByLabel('Credencial provisional',{exact:true}).fill(password);}
  catch{throw new Error('Formulario de alta de ensayo no disponible. Valores omitidos.');}
  let creations=0;await page.route('**/api/v1/admin/users',async route=>{
    if(route.request().method()!=='POST'){await route.continue();return;}creations++;
    try{await route.fetch();}catch{throw new Error('Transporte de alta de ensayo no completado. Valores omitidos.');}await route.abort('failed');
  });
  await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();await expect(page.getByRole('button',{name:'Consultar cuenta por correo'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Crear cuenta',exact:true})).toBeDisabled();
  expect(await page.getByLabel('Credencial provisional',{exact:true}).inputValue().then(value=>value.length)).toBe(0);
  const row=(await identity.context.database.pool.query('SELECT * FROM "User" WHERE "emailCanonical"=$1',[email])).rows[0];const before=JSON.stringify(row);
  await page.getByRole('button',{name:'Consultar cuenta por correo'}).click();await expect(page.getByText(email,{exact:true})).toBeVisible();
  expect(creations).toBe(1);expect(JSON.stringify((await identity.context.database.pool.query('SELECT * FROM "User" WHERE id=$1',[row.id])).rows[0])===before).toBe(true);
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length+location.search.length+location.hash.length)).toBe(0);
});
