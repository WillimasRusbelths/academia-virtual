import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { PoolClient } from 'pg';
import { test, expect } from '../support/materials-fixture';
import { materialFileCase } from '../../../api/tests/support/materials-files.js';

const href=(id:string)=>`/materiales/grupos/${id}`;
const content=(id:string)=>`/api/v1/materials/items/${id}/content`;
test.beforeEach(async({context,materials:f})=>{
  await context.addCookies([{name:f.cookieName,value:f.student.secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
  await context.addInitScript(()=>{
    const audit={created:0,revoked:0};Object.assign(window,{materialsUrlAudit:audit});
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=blob=>{audit.created++;return create(blob);};URL.revokeObjectURL=url=>{audit.revoked++;return revoke(url);};
  });
});
async function audit(page:Page) {return page.evaluate(()=>Reflect.get(window,'materialsUrlAudit') as {created:number;revoked:number});}
async function navigateInApp(page:Page,path:string) {
  await page.evaluate(path=>{history.pushState(null,'',path);window.dispatchEvent(new Event('av:navigation'));},path);
}
async function save(page:Page,fileId:string) {
  const file=materialFileCase(fileId),article=page.locator('article').filter({has:page.getByText(file.name,{exact:true})});
  await article.getByRole('button',{name:'Descargar Material ficticio',exact:true}).focus();await page.keyboard.press('Enter');
  const link=page.getByRole('link',{name:`Guardar archivo: ${file.name}`,exact:true});await expect(link).toBeVisible();
  const pending=page.waitForEvent('download');await link.focus();await page.keyboard.press('Enter');const downloaded=await pending;
  expect(downloaded.suggestedFilename()).toBe(file.name);const local=await downloaded.path();if(!local)throw new Error('No local test download');
  const bytes=await readFile(local);expect(bytes).toEqual(file.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
  await expect(link).toHaveCount(0);
}

test('MS01 matrícula propia enlaza listado/detalle y descarga íntegra con teclado; índice mínimo y URL directa',async({page,materials:f})=>{
  await page.goto('/mis-matriculas');const link=page.getByRole('link',{name:'Ver materiales del grupo',exact:true});
  await expect(link).toHaveAttribute('href',href(f.groupId));await link.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Grupo A ficticio',exact:true})).toBeVisible();await expect(page.locator('article')).toHaveCount(1);
  await expect(page.getByLabel('Título',{exact:true})).toHaveCount(0);await save(page,'png-valid');
  expect(await audit(page)).toEqual({created:1,revoked:1});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const enrollment=(await f.pool.query('SELECT id FROM "Enrollment" WHERE "studentId"=$1',[f.student.userId])).rows[0].id;
  await page.goto('/mis-matriculas/'+enrollment);await expect(page.getByRole('link',{name:'Ver materiales del grupo'})).toHaveAttribute('href',href(f.groupId));
  await page.goto('/materiales');await expect(page.getByRole('link',{name:'Grupo A ficticio',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Grupo B ficticio',exact:true})).toHaveCount(0);
  await page.goto(href(f.groupId));await expect(page.locator('article')).toHaveCount(1);
});

test('MS02 PDF/JPEG/PNG independientes de US1: bytes/hash completos, HEAD y Range reales',async({page,materials:f})=>{
  const pdf=await f.seedMaterial('PUBLISHED',f.groupId,f.teacher.userId,'pdf-valid'),jpeg=await f.seedMaterial('PUBLISHED',f.groupId,f.teacher.userId,'jpeg-valid');
  await page.goto(href(f.groupId));await expect(page.locator('article')).toHaveCount(3);
  for(const [id,fileId] of [[pdf.id,'pdf-valid'],[jpeg.id,'jpeg-valid'],[f.published.id,'png-valid']]) {
    await save(page,fileId);
    const head=await page.request.head(content(id));expect(head.status()).toBe(200);expect((await head.body()).length).toBe(0);
    const range=await page.request.get(content(id),{headers:{Range:'bytes=0-1','If-None-Match':'*'}});
    expect(range.status()).toBe(200);expect(await range.body()).toEqual(materialFileCase(fileId).bytes);
  }
  expect(await audit(page)).toEqual({created:3,revoked:3});
});

for(const actor of ['otherStudent','historicalStudent','reservationStudent'] as const)test(`MS03 ${actor}: referencia ajena/histórica/reserva denegada por API y pantalla`,async({page,context,materials:f})=>{
  await context.clearCookies();await context.addCookies([{name:f.cookieName,value:f[actor].secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
  for(const path of [`/api/v1/materials/groups/${f.groupId}/items`,content(f.published.id),content(f.prepared.id),content(f.withdrawn.id)]) {
    const response=await page.request.get(path);expect(response.status()).toBe(404);expect((await response.json()).error.code).toBe('NOT_FOUND');
  }
  await page.goto(href(f.groupId));await expect(page.getByRole('alert')).toContainText('No tienes acceso');
  await expect(page.locator('article')).toHaveCount(0);await expect(page.getByRole('link',{name:/Guardar archivo/})).toHaveCount(0);
  expect(await audit(page)).toEqual({created:0,revoked:0});
  await page.goto('/mis-matriculas');await expect(page.getByRole('heading',{name:'Mis matrículas',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Ver materiales del grupo'})).toHaveCount(actor==='otherStudent'?1:0);
});

test('MS04 oferta retirada y docente inhabilitado no revocan la matrícula vigente original',async({page,materials:f})=>{
  // Same guarded editorial sequence as the original ME05 backend test.
  await f.pool.query('UPDATE "AcademicCourse" SET state=\'PUBLISHED\',revision=revision+1 WHERE id=$1',[f.courseId]);
  await f.pool.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId",
    "publishedTeacherEligibilityVersion"=(SELECT "teacherEligibilityVersion" FROM "User" WHERE id=$2),revision=revision+1 WHERE id=$1`,[f.groupId,f.teacher.userId]);
  await f.pool.query('UPDATE "AcademicGroup" SET state=\'WITHDRAWN\',revision=revision+1 WHERE id=$1',[f.groupId]);
  await f.pool.query('UPDATE "AcademicCourse" SET state=\'WITHDRAWN\',revision=revision+1 WHERE id=$1',[f.courseId]);
  await f.pool.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1',[f.teacher.userId]);
  await page.goto(href(f.groupId));await expect(page.locator('article')).toHaveCount(1);await save(page,'png-valid');
});

test('MS05 revocación antes de descargar expira sesión y no crea enlace ni conserva materiales',async({page,materials:f})=>{
  await page.goto(href(f.groupId));await expect(page.locator('article')).toHaveCount(1);
  await f.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[f.student.sessionId]);
  await page.getByRole('button',{name:'Descargar Material ficticio',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Iniciar sesión',exact:true})).toBeVisible();await expect(page.locator('article')).toHaveCount(0);
  expect(await audit(page)).toEqual({created:0,revoked:0});expect((await page.request.get(content(f.published.id))).status()).toBe(401);
});

test('MS06 logout/cambio de cuenta descartan binario tardío y liberan URLs en la misma aplicación',async({page,materials:f})=>{
  await page.goto(href(f.groupId));await expect(page.locator('article')).toHaveCount(1);
  await page.getByRole('button',{name:'Descargar Material ficticio',exact:true}).click();await expect(page.getByRole('link',{name:/Guardar archivo/})).toBeVisible();
  let enter!:()=>void,release!:()=>void,finished!:()=>void;
  const entered=new Promise<void>(resolve=>{enter=resolve;}),held=new Promise<void>(resolve=>{release=resolve;}),done=new Promise<void>(resolve=>{finished=resolve;});
  await page.route('**'+content(f.published.id),async route=>{
    try {const response=await route.fetch();expect(response.status()).toBe(200);enter();await held;try{await route.fulfill({response});}catch{/* aborted after the real read */}}
    finally{finished();}
  });
  try {
    await page.getByRole('button',{name:'Descargar Material ficticio',exact:true}).click();await entered;
    await navigateInApp(page,'/inicio');await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Iniciar sesión',exact:true})).toBeVisible();
    expect((await f.pool.query('SELECT "revokedAt" IS NOT NULL AS revoked FROM "Session" WHERE id=$1',[f.student.sessionId])).rows[0].revoked).toBe(true);
    await page.getByLabel('Correo',{exact:true}).fill(f.otherLogin.email);await page.getByLabel('Contraseña',{exact:true}).fill(f.otherLogin.password);
    await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Inicio',exact:true})).toBeVisible();
    release();await done;expect(await audit(page)).toEqual({created:1,revoked:1});
    await navigateInApp(page,href(f.groupId));await expect(page.getByRole('alert')).toContainText('No tienes acceso');await expect(page.locator('article')).toHaveCount(0);
    await navigateInApp(page,href(f.otherGroupId));await expect(page.getByRole('heading',{name:'Grupo B ficticio'})).toBeVisible();await expect(page.locator('article')).toHaveCount(1);
    expect(await audit(page)).toEqual({created:1,revoked:1});
  } finally {release();await done;}
});

test('MS07 fallo real de lectura produce error seguro y reintento manual, sin enlace parcial',async({page,materials:f})=>{
  await page.goto(href(f.groupId));await expect(page.locator('article')).toHaveCount(1);let reads=0;
  const originals=new Map<PoolClient,PoolClient['query']>();
  const acquire=(client:PoolClient)=>{if(originals.has(client))return;const original=client.query;originals.set(client,original);
    client.query=function(this:PoolClient,...args:unknown[]){
      const sql=typeof args[0]==='string'?args[0]:'';
      if(/\bSELECT\b/i.test(sql)&&/"MaterialContent"/.test(sql)&&/\bbytes\b/i.test(sql)){reads++;return Promise.reject(Object.assign(new Error('PRIVATE_READ_FAILURE'),{code:'53100'}));}
      return Reflect.apply(original,this,args);
    } as PoolClient['query'];
  };
  f.httpPool.on('acquire',acquire);
  try {
    await page.getByRole('button',{name:'Descargar Material ficticio',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
    expect(await page.locator('body').innerText()).not.toContain('PRIVATE_READ_FAILURE');expect(reads).toBe(1);
    await expect(page.getByRole('link',{name:/Guardar archivo/})).toHaveCount(0);expect(await audit(page)).toEqual({created:0,revoked:0});
    await expect(page.getByRole('button',{name:'Reintentar consulta',exact:true})).toBeVisible();
  } finally {f.httpPool.off('acquire',acquire);for(const [client,original] of originals)client.query=original;}
  await save(page,'png-valid');expect(await audit(page)).toEqual({created:1,revoked:1});
});

test('MS08 vacío publicado autorizado se distingue de acceso denegado sin mostrar preparados/retirados',async({page,materials:f})=>{
  // Synthetic withdrawn fact only; the production withdraw command belongs to US3.
  await f.pool.query('UPDATE "Material" SET state=\'WITHDRAWN\',revision=revision+1,"withdrawnAt"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1',[f.published.id]);
  await page.goto(href(f.groupId));await expect(page.getByText('No hay materiales publicados en esta página.',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Grupo A ficticio',exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('article')).toHaveCount(0);expect((await page.request.get(content(f.published.id))).status()).toBe(404);
});
