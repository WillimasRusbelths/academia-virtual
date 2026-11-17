import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/materials-fixture';

const href=(id:string)=>'/materiales/grupos/'+id;
const item=(page:Page,id:string)=>page.locator('li[data-material-id="'+id+'"]');
async function manage(page:Page,id:string){await item(page,id).getByRole('button',{name:/^Gestionar/}).click();await expect(page.getByRole('region',{name:'Corregir o retirar material',exact:true})).toBeVisible();}
test.beforeEach(async({context,materials:f})=>{await context.addCookies([{name:f.cookieName,value:f.teacher.secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);});
test('MA01 corregir, retirar y republicar explícitos con teclado; alumno pierde nuevas descargas y archivo/autor permanecen',async({page,context,materials:f})=>{
  const before=(await f.pool.query('SELECT bytes,sha256 FROM "MaterialContent" WHERE "materialId"=$1',[f.published.id])).rows[0];
  await page.goto(href(f.groupId));await manage(page,f.published.id);
  await page.getByLabel('Título de corrección',{exact:true}).fill('Lectura corregida US3');
  await page.getByRole('button',{name:'Guardar corrección',exact:true}).focus();await page.keyboard.press('Enter');
  const panel=page.getByRole('region',{name:'Corregir o retirar material',exact:true});
  await expect(panel.getByText('Lectura corregida US3: Publicado. Revisión 3.',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Retirar material',exact:true}).click();await expect(panel.getByRole('button',{name:'Confirmar retiro',exact:true})).toBeFocused();
  await panel.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(panel.getByRole('button',{name:'Retirar material',exact:true})).toBeFocused();
  expect((await f.pool.query('SELECT state FROM "Material" WHERE id=$1',[f.published.id])).rows[0].state).toBe('PUBLISHED');
  await panel.getByRole('button',{name:'Retirar material',exact:true}).click();await page.keyboard.press('Enter');
  await expect(panel.getByText('Lectura corregida US3: Retirado. Revisión 4.',{exact:true})).toBeVisible();
  const studentHeaders={cookie:f.cookieName+'='+f.student.secret};
  expect((await fetch(f.backendUrl+'/api/v1/materials/items/'+f.published.id+'/content',{headers:studentHeaders})).status).toBe(404);
  await panel.getByRole('button',{name:'Republicar material',exact:true}).click();await expect(panel.getByRole('button',{name:'Confirmar republicación',exact:true})).toBeFocused();await page.keyboard.press('Enter');
  await expect(panel.getByText('Lectura corregida US3: Publicado. Revisión 5.',{exact:true})).toBeVisible();
  const download=await fetch(f.backendUrl+'/api/v1/materials/items/'+f.published.id+'/content',{headers:studentHeaders});expect(download.status).toBe(200);expect(Buffer.from(await download.arrayBuffer())).toEqual(before.bytes);
  expect((await f.pool.query('SELECT bytes,sha256 FROM "MaterialContent" WHERE "materialId"=$1',[f.published.id])).rows[0]).toEqual(before);
  expect((await f.pool.query('SELECT "createdBy","groupId" FROM "Material" WHERE id=$1',[f.published.id])).rows[0]).toEqual({createdBy:f.teacher.userId,groupId:f.groupId});
  await expect(panel.locator('input[type=file]')).toHaveCount(0);await panel.getByRole('button',{name:'Preparar nuevo material',exact:true}).click();await expect(page.getByLabel('Título',{exact:true})).toBeFocused();
  await context.clearCookies();await context.addCookies([{name:f.cookieName,value:f.student.secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);await page.reload();
  await expect(page.getByRole('button',{name:'Descargar Lectura corregida US3',exact:true})).toBeVisible();await expect(page.getByLabel('Título de corrección',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('MA02 reasignación deniega al anterior; el sucesor corrige con atribución propia y autoría original',async({page,context,materials:f})=>{
  await page.goto(href(f.groupId));await manage(page,f.prepared.id);await page.getByLabel('Título de corrección',{exact:true}).fill('Borrador privado anterior');
  await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2',[f.otherTeacher.userId,f.groupId]);
  await page.getByRole('button',{name:'Guardar corrección',exact:true}).click();await expect(page.getByRole('alert')).toContainText('ya no está disponible');
  await expect(page.getByLabel('Título de corrección',{exact:true})).toHaveCount(0);await expect(page.getByText('Borrador privado anterior',{exact:true})).toHaveCount(0);
  await context.clearCookies();await context.addCookies([{name:f.cookieName,value:f.otherTeacher.secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);await page.reload();
  await manage(page,f.prepared.id);await page.getByLabel('Título de corrección',{exact:true}).fill('Mantenimiento del sucesor');await page.getByRole('button',{name:'Guardar corrección',exact:true}).click();
  await expect(page.getByRole('region',{name:'Corregir o retirar material',exact:true}).getByText('Mantenimiento del sucesor: Preparado. Revisión 2.',{exact:true})).toBeVisible();
  expect((await f.pool.query('SELECT "createdBy","updatedBy",state FROM "Material" WHERE id=$1',[f.prepared.id])).rows[0]).toEqual({createdBy:f.teacher.userId,updatedBy:f.otherTeacher.userId,state:'PREPARED'});
  expect((await f.pool.query('SELECT "actorId" FROM "MaterialAuditEvent" WHERE "materialId"=$1 AND operation=\'EDIT\'',[f.prepared.id])).rows).toEqual([{actorId:f.otherTeacher.userId}]);
  expect((await fetch(f.backendUrl+'/api/v1/materials/items/'+f.prepared.id,{headers:{cookie:f.cookieName+'='+f.teacher.secret}})).status).toBe(404);
});
test('MA03 administrador retira en cancelado y conserva consulta/descarga histórica sin edición ni republicación',async({page,context,materials:f})=>{
  await context.clearCookies();await context.addCookies([{name:f.cookieName,value:f.admin.secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
  await page.goto(href(f.cancelledGroupId));await manage(page,f.cancelledPublished.id);
  const panel=page.getByRole('region',{name:'Corregir o retirar material',exact:true});await expect(panel.getByRole('form',{name:'Corregir material'})).toHaveCount(0);
  await expect(panel.getByRole('button',{name:'Republicar material',exact:true})).toHaveCount(0);await expect(panel.getByRole('button',{name:'Preparar nuevo material',exact:true})).toHaveCount(0);
  await panel.getByRole('button',{name:'Retirar material',exact:true}).click();await panel.getByRole('button',{name:'Confirmar retiro',exact:true}).click();
  await expect(panel.getByText('Material ficticio: Retirado. Revisión 3.',{exact:true})).toBeVisible();
  const response=await fetch(f.backendUrl+'/api/v1/materials/items/'+f.cancelledPublished.id+'/content',{headers:{cookie:f.cookieName+'='+f.admin.secret}});expect(response.status).toBe(200);expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  expect((await fetch(f.backendUrl+'/api/v1/materials/items/'+f.cancelledPublished.id,{headers:{cookie:f.cookieName+'='+f.teacher.secret}})).status).toBe(404);
});
test('MA04 conflicto compara valores reales, conserva borrador y solo usa revisión nueva por decisión explícita',async({page,materials:f})=>{
  await page.goto(href(f.groupId));await manage(page,f.published.id);await page.getByLabel('Título de corrección',{exact:true}).fill('Mi borrador');
  const sent:{commandId:string;expectedRevision:string}[]=[];page.on('request',req=>{if(req.method()==='PATCH'&&req.url().endsWith('/items/'+f.published.id))sent.push(req.postDataJSON());});
  const remote=await fetch(f.backendUrl+'/api/v1/materials/items/'+f.published.id,{method:'PATCH',headers:{cookie:f.cookieName+'='+f.teacher.secret,origin:'http://localhost:5173','x-csrf-protection':'1','content-type':'application/json'},body:JSON.stringify({commandId:randomUUID(),expectedRevision:'2',title:'Version remota',description:null})});expect(remote.status).toBe(200);
  await page.getByRole('button',{name:'Guardar corrección',exact:true}).click();await expect(page.getByRole('region',{name:'Comparar con la versión actual'})).toContainText('Version remota');
  await expect(page.getByLabel('Título de corrección',{exact:true})).toHaveValue('Mi borrador');expect(sent).toHaveLength(1);
  expect((await f.pool.query('SELECT title,revision::text FROM "Material" WHERE id=$1',[f.published.id])).rows[0]).toEqual({title:'Version remota',revision:'3'});
  await page.getByRole('button',{name:'Usar revisión actual y conservar mi borrador',exact:true}).click();await page.getByRole('button',{name:'Guardar corrección',exact:true}).click();
  await expect(page.getByRole('region',{name:'Corregir o retirar material',exact:true}).getByText('Mi borrador: Publicado. Revisión 4.',{exact:true})).toBeVisible();
  expect(sent.map(body=>body.expectedRevision)).toEqual(['2','3']);expect(sent[1].commandId).not.toBe(sent[0].commandId);
});
test('MA05 respuesta real perdida conserva intención; consulta no reenvía y reintento manual recupera un solo efecto',async({page,materials:f})=>{
  const bodies:unknown[]=[];await page.route('**/api/v1/materials/items/'+f.published.id,async route=>{
    if(route.request().method()!=='PATCH'){await route.continue();return;}
    bodies.push(route.request().postDataJSON());const response=await route.fetch();expect(response.status()).toBe(200);
    if(bodies.length===1)await route.abort('failed');else await route.fulfill({response});
  });
  await page.goto(href(f.groupId));await manage(page,f.published.id);await page.getByLabel('Título de corrección',{exact:true}).fill('Correccion incierta');await page.getByRole('button',{name:'Guardar corrección',exact:true}).click();
  const panel=page.getByRole('region',{name:'Corregir o retirar material',exact:true});await expect(panel.getByText('Resultado incierto. Consulta el estado antes de reintentar manualmente.',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Título de corrección',{exact:true})).toHaveValue('Correccion incierta');await expect(page.getByLabel('Título de corrección',{exact:true})).toBeDisabled();
  await panel.getByRole('button',{name:'Consultar estado del material',exact:true}).click();await expect(panel.getByRole('button',{name:'Reintentar misma intención',exact:true})).toBeVisible();expect(bodies).toHaveLength(1);
  await panel.getByRole('button',{name:'Reintentar misma intención',exact:true}).click();await expect(panel.getByText('Correccion incierta: Publicado. Revisión 3.',{exact:true})).toBeVisible();
  expect(bodies).toHaveLength(2);expect(bodies[1]).toEqual(bodies[0]);
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialCommand" WHERE "materialId"=$1 AND operation=\'EDIT\'',[f.published.id])).rows[0].n).toBe(1);
});
test('MA06 logout y cuenta nueva descartan respuesta tardía de corrección sin revivir la pantalla anterior',async({page,materials:f})=>{
  let observed=false,enter!:()=>void,release!:()=>void,finished!:()=>void;const entered=new Promise<void>(resolve=>{enter=resolve;}),held=new Promise<void>(resolve=>{release=resolve;}),done=new Promise<void>(resolve=>{finished=resolve;});
  await page.route('**/api/v1/materials/items/'+f.prepared.id,async route=>{
    if(route.request().method()!=='PATCH'){await route.continue();return;}
    observed=true;try{const response=await route.fetch();expect(response.status()).toBe(200);enter();await held;try{await route.fulfill({response});}catch{/* scope aborted after the real commit */}}finally{finished();}
  });
  try{
    await page.goto(href(f.groupId));await manage(page,f.prepared.id);await page.getByLabel('Título de corrección',{exact:true}).fill('Correccion privada tardia');await page.getByRole('button',{name:'Guardar corrección',exact:true}).click();await entered;
    await page.evaluate(()=>{history.pushState(null,'','/inicio');window.dispatchEvent(new Event('av:navigation'));});await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Iniciar sesión',exact:true})).toBeVisible();await page.getByLabel('Correo',{exact:true}).fill(f.otherLogin.email);await page.getByLabel('Contraseña',{exact:true}).fill(f.otherLogin.password);
    await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Inicio',exact:true})).toBeVisible();release();await done;
    await page.evaluate(path=>{history.pushState(null,'',path);window.dispatchEvent(new Event('av:navigation'));},href(f.otherGroupId));await expect(page.getByRole('heading',{name:'Grupo B ficticio'})).toBeVisible();
    await expect(page.getByText('Correccion privada tardia',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Título de corrección',{exact:true})).toHaveCount(0);
    expect((await f.pool.query('SELECT "revokedAt" IS NOT NULL AS revoked FROM "Session" WHERE id=$1',[f.teacher.sessionId])).rows[0].revoked).toBe(true);
  }finally{release();if(observed)await done;}
});
