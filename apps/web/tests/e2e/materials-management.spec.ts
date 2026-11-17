import { createHash } from 'node:crypto';
import { test, expect } from '../support/materials-fixture';

test.beforeEach(async({context,materials:f})=>{
  await context.addCookies([{name:f.cookieName,value:f.teacher.secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
});
for(const role of ['teacher','admin'] as const)test(`MM01 ${role}: preparar/publicar reales con teclado y bytes durables`,async({page,context,materials:f})=>{
  await context.clearCookies();await context.addCookies([{name:f.cookieName,value:f[role].secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
  const groupId=role==='admin'?f.otherGroupId:f.groupId;
  await page.goto(`/materiales/grupos/${groupId}`);await page.getByLabel('Título',{exact:true}).fill('Lectura E2E ficticia');
  await page.getByLabel('Descripción (opcional)',{exact:true}).fill('Texto ficticio conservado');
  await page.getByLabel('Archivo',{exact:true}).setInputFiles({name:f.file.name,mimeType:f.file.mediaType,buffer:f.file.bytes});
  await page.getByRole('button',{name:'Preparar material',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByText('Lectura E2E ficticia: Preparado. Revisión 1.',{exact:true})).toBeVisible();
  const row=(await f.pool.query(`SELECT m.id,m.state,m.revision::text,m."createdBy",c.bytes FROM "Material" m JOIN "MaterialContent" c ON c."materialId"=m.id WHERE m.title=$1`,['Lectura E2E ficticia'])).rows[0];
  expect(row.state).toBe('PREPARED');expect(row.createdBy).toBe(f[role].userId);expect(row.bytes).toEqual(f.file.bytes);
  expect(createHash('sha256').update(row.bytes).digest('hex')).toBe(f.file.sha256);
  await page.getByRole('button',{name:'Publicar material preparado',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirmar publicación',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.getByRole('button',{name:'Publicar material preparado',exact:true})).toBeFocused();
  expect((await f.pool.query('SELECT state FROM "Material" WHERE id=$1',[row.id])).rows[0].state).toBe('PREPARED');
  await page.getByRole('button',{name:'Publicar «Lectura E2E ficticia»',exact:true}).click();await page.keyboard.press('Enter');
  await expect(page.getByText('Lectura E2E ficticia: Publicado. Revisión 2.',{exact:true})).toBeVisible();
  expect((await f.pool.query('SELECT state,revision::text,"publishedAt" IS NOT NULL AS published FROM "Material" WHERE id=$1',[row.id])).rows[0]).toEqual({state:'PUBLISHED',revision:'2',published:true});
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialCommand" WHERE "materialId"=$1',[row.id])).rows[0].n).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('MM02 referencia ajena se oculta por API real y navegación directa',async({page,materials:f})=>{
  expect((await page.request.get(`/api/v1/materials/groups/${f.groupId}`)).status()).toBe(200);
  const denied=await page.request.get(`/api/v1/materials/groups/${f.otherGroupId}/items`);expect(denied.status()).toBe(404);
  expect((await denied.json()).error.code).toBe('NOT_FOUND');await page.goto(`/materiales/grupos/${f.otherGroupId}`);
  await expect(page.getByText('Recurso no encontrado.',{exact:true})).toBeVisible();await expect(page.getByLabel('Título',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Grupo B ficticio',{exact:true})).toHaveCount(0);
});
test('MM03 rechazo de archivo conserva formulario; selección corregida crea nueva intención sin publicar',async({page,materials:f})=>{
  await page.goto(`/materiales/grupos/${f.groupId}`);await page.getByLabel('Título',{exact:true}).fill('Lectura corregible');
  await page.getByLabel('Descripción (opcional)',{exact:true}).fill('Conservar texto');
  await page.getByLabel('Archivo',{exact:true}).setInputFiles({name:f.file.name,mimeType:f.file.mediaType,buffer:Buffer.from('%PDF-1.7\ntruncado')});
  await page.getByRole('button',{name:'Preparar material',exact:true}).click();await expect(page.getByText('Revisa los campos indicados.',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Título',{exact:true})).toHaveValue('Lectura corregible');await expect(page.getByLabel('Descripción (opcional)',{exact:true})).toHaveValue('Conservar texto');
  await expect(page.getByText(new RegExp('Seleccionado: '+f.file.name.replace('.','\\.')))).toBeVisible();
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "Material" WHERE title=$1',['Lectura corregible'])).rows[0].n).toBe(0);
  await page.getByLabel('Archivo',{exact:true}).setInputFiles({name:f.file.name,mimeType:f.file.mediaType,buffer:f.file.bytes});await page.getByRole('button',{name:'Preparar material',exact:true}).click();
  await expect(page.getByText('Lectura corregible: Preparado. Revisión 1.',{exact:true})).toBeVisible();
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialUpload" WHERE title=$1',['Lectura corregible'])).rows[0].n).toBe(2);
});
test('MM04 respuesta PUT perdida: consultar intención recupera commit real sin reenvío automático',async({page,materials:f})=>{
  let puts=0;await page.route('**/api/v1/materials/uploads/*/content',async route=>{
    puts++;const actual=await route.fetch();expect(actual.status()).toBe(201);await route.abort('failed');
  });
  await page.goto(`/materiales/grupos/${f.groupId}`);await page.getByLabel('Título',{exact:true}).fill('Respuesta perdida ficticia');
  await page.getByLabel('Archivo',{exact:true}).setInputFiles({name:f.file.name,mimeType:f.file.mediaType,buffer:f.file.bytes});await page.getByRole('button',{name:'Preparar material',exact:true}).click();
  await expect(page.getByText('Resultado incierto. Consulta el estado antes de reintentar manualmente.',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Título',{exact:true})).toHaveValue('Respuesta perdida ficticia');
  expect((await f.pool.query('SELECT count(*)::int AS n FROM "Material" WHERE title=$1',['Respuesta perdida ficticia'])).rows[0].n).toBe(1);
  await page.getByRole('button',{name:'Consultar estado de la intención o material',exact:true}).click();
  await expect(page.getByText('Respuesta perdida ficticia: Preparado. Revisión 1.',{exact:true})).toBeVisible();expect(puts).toBe(1);
  await page.reload();await expect(page.getByLabel('Título',{exact:true})).toHaveValue('');expect(puts).toBe(1);
  expect((await f.pool.query('SELECT state FROM "Material" WHERE title=$1',['Respuesta perdida ficticia'])).rows[0].state).toBe('PREPARED');
});
