import { createHash, randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { AcademicOfferingDataset } from '../../../api/tests/support/academic-offering.js';
import { maintenanceSeed } from '../../../api/tests/support/academic-maintenance-fixture.js';
import { activate, choose } from './accessibility';

export async function enterOffering(page: Page, data: AcademicOfferingDataset, role: 'ADMIN'|'STUDENT'|'TEACHER' = 'TEACHER') {
  await page.context().clearCookies();
  await page.context().addCookies([{name:'av_session_dev',value:data.account(role).sessions[0].secret,
    url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
  expect((await page.request.get('/api/v1/me')).status()).toBe(200);
  await page.goto('/inicio'); await expect(page.getByText(data.account(role).name,{exact:true})).toBeVisible();
}
/** Fixture compartido con PG, sin importar APIs del runner Vitest en Playwright. */
export async function reviewSeed(data: AcademicOfferingDataset, withdrawn=false) {
  const seed=await maintenanceSeed(data,{otherTeacherId:data.otherTeacher.userId});
  if(withdrawn)await data.context.database.pool.query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE id=$1`,[seed.groupId]);
  return seed;
}
export async function teachingSeed(data: AcademicOfferingDataset) {
  const seed=await reviewSeed(data),db=data.context.database.pool;
  await db.query(`UPDATE "AcademicGroup" SET name='US4 Propio borrador' WHERE id=$1`,[seed.competitorId]);
  const ids:{state:string;id:string;name:string}[]=[{state:'PUBLISHED',id:seed.groupId,name:'Turno A'},
    {state:'DRAFT',id:seed.competitorId,name:'US4 Propio borrador'}];
  for(const state of ['WITHDRAWN','CANCELLED']){
    const id=randomUUID(),name=`US4 Propio ${state}`;ids.push({id,name,state});
    await db.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,state,capacity,"periodStart","periodEnd","teacherUserId",
      "publishedTeacherUserId","publishedTeacherEligibilityVersion","cancellationReason","cancelledAt")
      SELECT $1,"courseId",$2,$3::"AcademicGroupState",capacity,"periodStart","periodEnd","teacherUserId",
        "publishedTeacherUserId","publishedTeacherEligibilityVersion",CASE WHEN $3::text='CANCELLED' THEN 'PRIVATE_US4_REASON' ELSE NULL END,
        CASE WHEN $3::text='CANCELLED' THEN clock_timestamp() ELSE NULL END FROM "AcademicGroup" WHERE id=$4`,[id,name,state,seed.groupId]);
    await db.query('INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,1,1080,1140)',[id]);
  }
  const incompleteId=randomUUID();
  await db.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,"teacherUserId") VALUES ($1,$2,'US4 Sin configurar',$3)`,[incompleteId,seed.courseId,seed.teacherId]);
  return {...seed,ids,incompleteId};
}
export async function teachingPage(page: Page, path='/mis-grupos') {
  await page.goto(path); await expect(page.getByRole('heading',{level:1})).toBeVisible();
  expect(await page.getByRole('heading',{name:'Página no disponible',exact:true}).count(),
    'T063/T064 pendientes: ruta web docente ausente tras sesión válida').toBe(0);
  if(path==='/mis-grupos')await expect(page.getByRole('heading',{name:'Mis grupos',exact:true})).toBeVisible();
}
export async function noPrivateTeaching(page: Page, data: AcademicOfferingDataset) {
  const text=await page.locator('main').innerText();
  expect(text).not.toMatch(/PRIVATE_US4_REASON|Docente no habilitado|Revisión docente requerida|teacherReviewRequired|eligibilityVersion|authVersion|cancellationReason/);
  for(const role of ['ADMIN','STUDENT','TEACHER'] as const){expect(text).not.toContain(data.account(role).email);expect(text).not.toContain(data.account(role).sessions[0].secret);}
  expect(await page.getByRole('button',{name:/Guardar|Publicar|Retirar|Cancelar grupo|Crear/}).count()).toBe(0);
  expect(await page.getByLabel('Docente asignado',{exact:true}).count()).toBe(0);
}
/** Operación de identidad por la UI real y teclado, con confirmación y respuesta real. */
export async function accessUi(page: Page, data: AcademicOfferingDataset, kind:'status'|'role', value:string) {
  await page.goto(`/admin/cuentas/${data.account('TEACHER').id}`);
  const selector=page.getByLabel(kind==='role'?'Rol':'Estado',{exact:true});await expect(selector).toBeVisible();
  const index=await selector.locator(`option[value="${value}"]`).evaluate(option=>(option as HTMLOptionElement).index);
  await choose(page,selector,index);await activate(page,page.getByRole('button',{name:kind==='role'?'Cambiar rol':'Cambiar estado',exact:true}));
  const response=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/admin/users/${data.account('TEACHER').id}/${kind}`&&r.request().method()==='PUT');
  await activate(page,page.getByRole('group',{name:'Confirmación de cambio de acceso'}).getByRole('button',{name:'Confirmar cambio',exact:true}));
  expect((await response).status()).toBe(200);await expect(selector).toHaveValue(value);
  expect((await data.observerPool.query(`SELECT ${kind} FROM "User" WHERE id=$1`,[data.account('TEACHER').id])).rows[0][kind]).toBe(value);
}
/** Nunca serializar cuentas completas en un informe o mensaje de aserción. */
export async function identityUsersFingerprint(data: AcademicOfferingDataset) {
  const rows=(await data.observerPool.query('SELECT to_jsonb(u) AS value FROM "User" u ORDER BY id')).rows;
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
