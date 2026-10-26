import type { Page } from '@playwright/test';
import { test, expect } from '../support/academic-offering-fixture';
import { activate, choose, controlsAccessible, pageFits, typeField } from '../support/accessibility';
import { accessUi, enterOffering, identityUsersFingerprint, reviewSeed } from '../support/academic-us4-browser';
import { sessionFixture } from '../../../api/tests/support/session-fixture.js';
import { academicFingerprint } from '../../../api/tests/support/academic-preparation.js';
import type { AcademicOfferingDataset } from '../../../api/tests/support/academic-offering.js';

async function group(page:Page,id:string){await page.goto(`/admin/oferta/grupos/${id}`);await expect(page.getByLabel('Nombre',{exact:true})).toHaveValue('Turno A');}
async function transition(page:Page,id:string,kind:'withdraw'|'publish'){
  await activate(page,page.getByRole('button',{name:kind==='withdraw'?'Retirar grupo':'Publicar grupo',exact:true}));
  const result=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(`/groups/${id}/${kind}`));
  await activate(page,page.getByRole('dialog').getByRole('button',{name:kind==='withdraw'?'Confirmar retiro':'Confirmar publicación',exact:true}));
  expect((await result).status()).toBe(200);await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function snapshot(data:AcademicOfferingDataset,id:string){return(await data.observerPool.query('SELECT state,revision::text,"teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion"::text FROM "AcademicGroup" WHERE id=$1',[id])).rows[0];}
async function publicHidden(page:Page,courseId:string,id:string){
  await page.goto(`/oferta/cursos/${courseId}/grupos/${id}`);await expect(page.locator('main')).toContainText(/oferta no disponible/i);
  const text=await page.locator('main').innerText();expect(text).not.toMatch(/Docente no habilitado|Revisión docente requerida|PRIVATE_US4_REASON|eligibilityVersion|authVersion/);
  expect(await page.getByText('Turno A',{exact:true}).count()).toBe(0);
}

test('R01 selector homónimos: solo habilitados, referencia UUID distinta, asignar no crea ni cambia cuentas',async({page,offering})=>{
  const seed=await reviewSeed(offering,true),db=offering.context.database.pool;
  const disabled=await sessionFixture(offering.context,'TEACHER'),unverified=await sessionFixture(offering.context,'TEACHER');
  const student=await sessionFixture(offering.context,'STUDENT'),admin=await sessionFixture(offering.context,'ADMIN');
  await db.query(`UPDATE "User" SET name='Homónimo US4' WHERE id=ANY($1::uuid[])`,[[seed.teacherId,offering.otherTeacher.userId,disabled.userId,unverified.userId,student.userId,admin.userId]]);
  await db.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`,[disabled.userId]);
  await db.query('UPDATE "User" SET "emailVerifiedAt"=NULL WHERE id=$1',[unverified.userId]);
  await enterOffering(page,offering,'ADMIN');await group(page,seed.groupId);
  await typeField(page,page.getByLabel('Buscar docente por nombre',{exact:true}),'Homónimo US4');
  const response=page.waitForResponse(r=>r.url().includes('/admin/academic/teachers?')&&r.url().includes('q='));
  await activate(page,page.getByRole('button',{name:'Buscar docente',exact:true}));expect((await response).status()).toBe(200);
  const select=page.getByLabel('Docente asignado',{exact:true});await expect(select).toBeEnabled();
  const options=await select.locator('option').evaluateAll(nodes=>nodes.map(n=>({value:(n as HTMLOptionElement).value,text:n.textContent})));
  expect(options.filter(o=>o.value).map(o=>o.value).sort()).toEqual([seed.teacherId,offering.otherTeacher.userId].sort());
  expect(new Set(options.filter(o=>o.value).map(o=>o.text)).size).toBe(2);expect(JSON.stringify(options)).not.toContain(offering.account('TEACHER').email);
  const before=await identityUsersFingerprint(offering),writes:string[]=[];
  page.on('request',r=>{if(r.url().includes('/admin/users')&&r.method()!=='GET')writes.push(r.method());});
  await choose(page,select,options.findIndex(o=>o.value===offering.otherTeacher.userId));
  const saved=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith(`/groups/${seed.groupId}`));
  await activate(page,page.getByRole('button',{name:'Guardar grupo',exact:true}));expect((await saved).status()).toBe(200);
  expect((await snapshot(offering,seed.groupId)).teacherUserId).toBe(offering.otherTeacher.userId);
  expect(await identityUsersFingerprint(offering)).toBe(before);expect(writes).toHaveLength(0);await controlsAccessible(page);
});

for(const kind of ['status','role'] as const)test(`R02 ${kind}: pérdida y recuperación vía identidad exige retirar/revisar/republicar explícitamente`,async({page,offering})=>{
  const seed=await reviewSeed(offering),old=await snapshot(offering,seed.groupId);await enterOffering(page,offering,'ADMIN');
  const context=await page.context().browser()!.newContext({viewport:page.viewportSize()!}),student=await context.newPage();
  try{
    await enterOffering(student,offering,'STUDENT');await student.goto(`/oferta/cursos/${seed.courseId}/grupos/${seed.groupId}`);await expect(student.getByText('Turno A',{exact:true})).toBeVisible();
    await accessUi(page,offering,kind,kind==='status'?'DISABLED':'STUDENT');await group(page,seed.groupId);
    await expect(page.getByText(/Docente no habilitado:/)).toBeVisible();await expect(page.getByText(/Revisión docente requerida/)).toBeVisible();
    await expect(page.getByLabel('Nombre',{exact:true})).toBeDisabled();await publicHidden(student,seed.courseId,seed.groupId);
    expect(await snapshot(offering,seed.groupId)).toEqual(old);
    await accessUi(page,offering,kind,kind==='status'?'ACTIVE':'TEACHER');await group(page,seed.groupId);
    expect(await page.getByText(/Docente no habilitado:/).count()).toBe(0);await expect(page.getByText(/Revisión docente requerida/)).toBeVisible();
    await expect(page.getByText(/No visible para alumnos/)).toBeVisible();expect(await snapshot(offering,seed.groupId)).toEqual(old);
    await publicHidden(student,seed.courseId,seed.groupId);
    const before=await identityUsersFingerprint(offering);await transition(page,seed.groupId,'withdraw');
    await expect(page.getByLabel('Docente asignado',{exact:true})).toHaveValue(seed.teacherId);
    const saved=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith(`/groups/${seed.groupId}`));
    await activate(page,page.getByRole('button',{name:'Guardar grupo',exact:true}));expect((await saved).status()).toBe(200);
    expect((await snapshot(offering,seed.groupId)).state).toBe('WITHDRAWN');await publicHidden(student,seed.courseId,seed.groupId);
    await transition(page,seed.groupId,'publish');await expect(page.getByText(/Revisión docente requerida/)).toHaveCount(0);
    await expect(page.getByLabel('Nombre',{exact:true})).toBeDisabled();expect(await identityUsersFingerprint(offering)).toBe(before);
    const current=await snapshot(offering,seed.groupId);expect(current.state).toBe('PUBLISHED');
    expect(current.publishedTeacherEligibilityVersion).not.toBe(old.publishedTeacherEligibilityVersion);
    await student.goto(`/oferta/cursos/${seed.courseId}/grupos/${seed.groupId}`);await expect(student.getByText('Turno A',{exact:true})).toBeVisible();
    expect(await student.locator('main').innerText()).not.toMatch(/Revisión docente requerida|Docente no habilitado/);await pageFits(page);await pageFits(student);
  }finally{await context.close();}
});

test('R03 cuenta desactivada mantiene referencia previa, selector no la ofrece como habilitada ni cambia identidad',async({page,offering})=>{
  const seed=await reviewSeed(offering);await enterOffering(page,offering,'ADMIN');await accessUi(page,offering,'status','DISABLED');
  await group(page,seed.groupId);await transition(page,seed.groupId,'withdraw');
  const select=page.getByLabel('Docente asignado',{exact:true});await expect(select).toBeEnabled();await expect(select).toHaveValue(seed.teacherId);
  await expect(select.locator(`option[value="${seed.teacherId}"]`)).toBeDisabled();
  const before=await identityUsersFingerprint(offering),academic=await academicFingerprint(offering.observerPool);
  await page.reload();await expect(select).toHaveValue(seed.teacherId);expect(await identityUsersFingerprint(offering)).toBe(before);
  expect(await academicFingerprint(offering.observerPool)).toBe(academic);await expect(page.getByText(/Docente no habilitado:/)).toBeVisible();await pageFits(page);
});

test('R04 grupo cancelado sigue terminal después de desactivar y reactivar desde identidad',async({page,offering})=>{
  const seed=await reviewSeed(offering);await offering.context.database.pool.query(`UPDATE "AcademicGroup" SET state='CANCELLED',"cancellationReason"='PRIVATE_US4_REASON',"cancelledAt"=clock_timestamp() WHERE id=$1`,[seed.groupId]);
  await enterOffering(page,offering,'ADMIN');const old=await academicFingerprint(offering.observerPool);
  await accessUi(page,offering,'status','DISABLED');await accessUi(page,offering,'status','ACTIVE');await group(page,seed.groupId);
  for(const name of ['Guardar grupo','Guardar horario','Publicar grupo'])await expect(page.getByRole('button',{name,exact:true})).toBeDisabled();
  await expect(page.getByText('PRIVATE_US4_REASON',{exact:true})).toBeVisible();expect(await academicFingerprint(offering.observerPool)).toBe(old);await pageFits(page);
});

test('R05 recuperación no basta para publicar padre; referencias de revisión solo administrativas',async({page,offering})=>{
  const seed=await reviewSeed(offering);await enterOffering(page,offering,'ADMIN');await accessUi(page,offering,'status','DISABLED');await accessUi(page,offering,'status','ACTIVE');
  await page.goto(`/admin/oferta/cursos/${seed.courseId}`);await expect(page.getByLabel('Nombre',{exact:true})).toBeDisabled();
  await activate(page,page.getByRole('button',{name:'Retirar curso',exact:true}));const withdrawn=page.waitForResponse(r=>r.url().endsWith(`/courses/${seed.courseId}/withdraw`));
  await activate(page,page.getByRole('dialog').getByRole('button',{name:'Confirmar retiro',exact:true}));expect((await withdrawn).status()).toBe(200);
  const before=await academicFingerprint(offering.observerPool);await activate(page,page.getByRole('button',{name:'Publicar curso',exact:true}));
  const denied=page.waitForResponse(r=>r.url().endsWith(`/courses/${seed.courseId}/publish`));await activate(page,page.getByRole('dialog').getByRole('button',{name:'Confirmar publicación',exact:true}));
  expect((await denied).status()).toBe(409);await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('dialog').locator(`a[href="/admin/oferta/grupos/${seed.groupId}"]`)).toBeVisible();
  expect(await academicFingerprint(offering.observerPool)).toBe(before);await pageFits(page);
});
