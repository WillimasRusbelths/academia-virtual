import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test,expect,verificationLink } from '../support/us2-fixture';
import { accessSecrets } from '../../../api/src/modules/identity/infrastructure/credentials.js';

const headers={Origin:'http://localhost:5173','X-CSRF-Protection':'1'};
async function login(page:Page,email:string,password:string){
  await page.goto('/login');
  try{await page.getByLabel(/^correo$/i).fill(email);await page.getByLabel(/^contraseña$/i).fill(password);}
  catch{throw new Error('Login de ensayo no disponible. Valores omitidos.');}
  const result=page.waitForResponse(response=>response.url().endsWith('/auth/login'));
  await page.getByRole('button',{name:/iniciar sesión/i}).click();expect((await result).status()).toBe(200);await expect(page).toHaveURL(/\/inicio$/);
}
async function adminList(page:Page){
  await page.goto('/admin/cuentas');
  const search=page.getByLabel(/buscar|búsqueda/i);const absent=page.getByRole('heading',{name:'Página no disponible',exact:true});
  await expect(search.or(absent).first()).toBeVisible();
  if(await absent.isVisible())throw new Error('US4_PENDING_UI: falta lista administrativa, AppRouter muestra página no disponible');
  await expect(search).toBeVisible();
}
async function adminDetail(page:Page,id:string){
  await page.goto(`/admin/cuentas/${id}`);
  const name=page.getByLabel(/^nombre$/i);const absent=page.getByRole('heading',{name:'Página no disponible',exact:true});
  await expect(name.or(absent).first()).toBeVisible();
  if(await absent.isVisible())throw new Error('US4_PENDING_UI: falta detalle administrativo, AppRouter muestra página no disponible');
  await expect(name).toBeVisible();
}
async function privateState(page:Page){
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length+location.hash.length+location.search.length)).toBe(0);
  expect(await page.evaluate(()=>history.state)).toBeNull();
}
test('control: ADMIN real inicia sesión, consulta propia y navegador sin almacenamiento privado',async({page,identity})=>{
  const actor=identity.account('ADMIN');await login(page,actor.email,actor.password);
  const me=await page.request.get('/api/v1/me');expect(me.status()).toBe(200);expect((await me.json()).data.id===actor.id).toBe(true);
  await privateState(page);expect(identity.context.environment.databaseSchema.startsWith('t_')).toBe(true);
});
test('control: fixture, emisión existente y captura funcional Mailpit',async({page,identity})=>{
  const f=identity.account('STUDENT','UNVERIFIED');expect((await page.request.post('/api/v1/auth/verification/request',{headers,data:{email:f.email}})).status()).toBe(202);
  expect((await verificationLink(f.email,identity.context.environment.appOrigin)).length>0).toBe(true);
});
for(const size of [{width:360,height:800},{width:1366,height:768}])test(`alta privada → verificación/cambio inicial → búsqueda/nombre en ${size.width}`,async({page,context,identity})=>{
  test.setTimeout(45000);await page.setViewportSize(size);const actor=identity.account('ADMIN');await login(page,actor.email,actor.password);await adminList(page);
  const f={name:'Docente de ensayo',email:`${randomUUID()}@example.test`,provisional:accessSecrets.issue().secret,password:accessSecrets.issue().secret};
  await page.getByRole('button',{name:/nueva cuenta|crear cuenta/i}).click();
  const form=page.locator('form').filter({has:page.getByLabel(/credencial provisional|contraseña provisional/i)});
  try{await form.getByLabel(/^nombre$/i).fill(f.name);await form.getByLabel(/^correo$/i).fill(f.email);
    await form.getByLabel(/^rol$/i).selectOption('TEACHER');await form.getByLabel(/credencial provisional|contraseña provisional/i).fill(f.provisional);}
  catch{throw new Error('Alta privada de ensayo no disponible. Valores omitidos.');}
  const created=page.waitForResponse(response=>response.url().endsWith('/admin/users')&&response.request().method()==='POST');
  await form.getByRole('button',{name:/crear|guardar/i}).click();const result=await created;expect(result.status()).toBe(201);
  expect((await result.text()).includes(f.provisional)).toBe(false);await privateState(page);
  expect(await page.locator('input[type="password"]').evaluateAll(inputs=>inputs.every(input=>(input as HTMLInputElement).value.length===0))).toBe(true);
  const account=(await identity.context.database.pool.query('SELECT id FROM "User" WHERE "emailCanonical"=$1',[f.email])).rows[0];
  const link=await verificationLink(f.email,identity.context.environment.appOrigin);
  await context.clearCookies();try{await page.goto(link);}catch{throw new Error('Enlace de ensayo no abierto. Valores omitidos.');}
  await expect.poll(()=>page.evaluate(()=>location.hash.length)).toBe(0);
  const verified=page.waitForResponse(response=>response.url().endsWith('/verification/confirm'));await page.getByRole('button',{name:/confirmar correo/i}).click();expect((await verified).status()).toBe(204);
  await page.goto('/establecer-contrasena');try{await page.getByLabel(/^correo$/i).fill(f.email);await page.getByLabel(/credencial provisional/i).fill(f.provisional);await page.getByLabel(/nueva contraseña/i).fill(f.password);}
  catch{throw new Error('Activación inicial de ensayo no disponible. Valores omitidos.');}
  const changed=page.waitForResponse(response=>response.url().endsWith('/password/initial'));await page.getByRole('button',{name:/establecer contraseña/i}).click();expect((await changed).status()).toBe(204);
  await login(page,f.email,f.password);await expect(page.getByText('Docente',{exact:true})).toBeVisible();
  await login(page,actor.email,actor.password);await adminList(page);await page.getByLabel(/buscar|búsqueda/i).fill(f.email);
  await page.getByRole('button',{name:/buscar|aplicar filtros/i}).click();await expect(page.getByText(f.email,{exact:true})).toBeVisible();
  await adminDetail(page,account.id);await page.getByLabel(/^nombre$/i).fill('Nombre corregido');
  const corrected=page.waitForResponse(response=>response.url().endsWith(`/${account.id}/name`));await page.getByRole('button',{name:/guardar nombre|corregir nombre/i}).click();expect((await corrected).status()).toBe(200);
  expect((await identity.context.database.pool.query('SELECT name,email,role FROM "User" WHERE id=$1',[account.id])).rows[0].name==='Nombre corregido').toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await privateState(page);
});
for(const field of ['role','status'] as const)test(`confirmación explícita de ${field} antes de enviar`,async({page,identity})=>{
  const actor=identity.account('ADMIN');const target=identity.account();await login(page,actor.email,actor.password);await adminList(page);await adminDetail(page,target.id);
  let requests=0;page.on('request',request=>{if(request.url().endsWith(`/${target.id}/${field}`)&&request.method()==='PUT')requests++;});
  await page.getByLabel(field==='role'?/^rol$/i:/^estado$/i).selectOption(field==='role'?'TEACHER':'DISABLED');
  await page.getByRole('button',{name:field==='role'?/cambiar rol|guardar rol/i:/cambiar estado|guardar estado/i}).click();expect(requests).toBe(0);
  const result=page.waitForResponse(response=>response.url().endsWith(`/${target.id}/${field}`));
  await page.getByRole('button',{name:/confirmar|sí.*cambiar|aceptar/i}).click();expect((await result).status()).toBe(200);expect(requests).toBe(1);
});
for(const field of ['name','role','status'] as const)for(const expiry of ['inactividad','absoluta'] as const)test(`V04-B ${field}/${expiry}: 401 sin mutación ni replay tras nuevo login`,async({page,context,identity})=>{
  const actor=identity.account('ADMIN');const target=identity.account();await login(page,actor.email,actor.password);await adminList(page);await adminDetail(page,target.id);
  const db=identity.context.database.pool;const before=JSON.stringify((await db.query('SELECT * FROM "User" WHERE id=$1',[target.id])).rows[0]);
  const auditBefore=(await db.query('SELECT count(*)::int AS n FROM "AuditEvent"')).rows[0].n;
  if(field==='name')await page.getByLabel(/^nombre$/i).fill('Acción que debe rechazarse');
  else{await page.getByLabel(field==='role'?/^rol$/i:/^estado$/i).selectOption(field==='role'?'TEACHER':'DISABLED');
    await page.getByRole('button',{name:field==='role'?/cambiar rol|guardar rol/i:/cambiar estado|guardar estado/i}).click();}
  const cookie=(await context.cookies()).find(value=>value.name==='av_session_dev');expect(cookie!==undefined).toBe(true);
  const digest=accessSecrets.digest(cookie!.value);const session=(await db.query('SELECT id,"lastAcceptedAt","absoluteExpiresAt" FROM "Session" WHERE "tokenHash"=$1',[Buffer.from(digest!)])).rows[0];
  if(expiry==='inactividad')await identity.clock!.set(new Date(session.lastAcceptedAt.getTime()+1800000));
  else{await db.query('UPDATE "Session" SET "lastAcceptedAt"=$2 WHERE id=$1',[session.id,new Date(session.absoluteExpiresAt.getTime()-60000)]);await identity.clock!.set(session.absoluteExpiresAt);}
  let requests=0;page.on('request',request=>{if(request.url().endsWith(`/${target.id}/${field}`)&&request.method()!=='GET')requests++;});
  const result=page.waitForResponse(response=>response.url().endsWith(`/${target.id}/${field}`));
  await page.getByRole('button',{name:field==='name'?/guardar nombre|corregir nombre/i:/confirmar|sí.*cambiar|aceptar/i}).click();expect((await result).status()).toBe(401);
  await expect(page).toHaveURL(/\/login$/);expect(await page.getByLabel(/^contraseña$/i).inputValue().then(value=>value.length)).toBe(0);
  expect(JSON.stringify((await db.query('SELECT * FROM "User" WHERE id=$1',[target.id])).rows[0])===before).toBe(true);
  expect((await db.query('SELECT count(*)::int AS n FROM "AuditEvent"')).rows[0].n).toBe(auditBefore);await privateState(page);
  await login(page,actor.email,actor.password);expect(requests).toBe(1);expect(JSON.stringify((await db.query('SELECT * FROM "User" WHERE id=$1',[target.id])).rows[0])===before).toBe(true);
  expect((await db.query('SELECT count(*)::int AS n FROM "AuditEvent"')).rows[0].n).toBe(auditBefore);
});
