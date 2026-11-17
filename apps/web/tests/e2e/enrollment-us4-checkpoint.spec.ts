import { randomUUID } from 'node:crypto';
import type { BrowserContext,Page } from '@playwright/test';
import { test,expect } from '../support/enrollment-payment-fixture';
import { economicFingerprint } from '../../../api/tests/support/enrollment-admin-facts';
import { advanceBrowserClockWithSessions } from '../support/enrollment-clock';
async function identity(context:BrowserContext,secret:string){await context.clearCookies();await context.addCookies([{name:'av_session_dev',value:secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);}
async function transition(page:Page,action:'withdraw'|'publish'){
  await page.getByRole('button',{name:action==='withdraw'?'Retirar grupo':'Publicar grupo',exact:true}).click();const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/'+action));
  await page.getByRole('dialog').getByRole('button',{name:action==='withdraw'?'Confirmar retiro':'Confirmar publicación',exact:true}).click();expect((await response).status()).toBe(200);await expect(page.getByRole('dialog')).toHaveCount(0);
}
const headers={origin:'http://localhost:5173','x-csrf-protection':'1'};
test('U4E01 US4.09 orden y reservas confirmadas no ofrecen modificación ni cancelación voluntaria',async({page,context,payment})=>{
  const before=await economicFingerprint(payment.pool);await identity(context,payment.prepared.actors.owner.secret);await page.goto('/mis-ordenes/'+payment.orderId);await expect(page.getByRole('heading',{name:'Detalle original de la orden',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/cancelar|modificar|liberar|devolver|trasladar/i})).toHaveCount(0);
  const seat=(await payment.pool.query('SELECT "orderItemId" FROM "SeatReservation" LIMIT 1')).rows[0].orderItemId;
  for(const resource of ['orders/'+payment.orderId,'reservations/'+seat])for(const method of ['PATCH','DELETE']){const response=await page.request.fetch('/api/v1/enrollment/'+resource,{method,headers,data:{state:'EXPIRED'}});expect(response.status()).toBe(404);}
  await expect(page.locator('time',{hasText:payment.original.expiresAt})).toBeVisible();expect(await economicFingerprint(payment.pool)).toBe(before);expect(payment.calls).toHaveLength(0);
});
test('U4E02 US4.12 sustitución docente con reservas exige retiro y publicación explícita sin cambiar orden',async({page,context,payment})=>{
  const before=await economicFingerprint(payment.pool),id=payment.prepared.offer.groupId;await identity(context,payment.prepared.actors.admin.secret);await page.goto('/admin/oferta/grupos/'+id);await expect(page.getByLabel('Docente asignado',{exact:true})).toBeDisabled();await transition(page,'withdraw');
  await page.getByLabel('Docente asignado',{exact:true}).selectOption(payment.data.otherTeacher.userId);const response=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/groups/'+id));await page.getByRole('button',{name:'Guardar grupo',exact:true}).click();expect((await response).status()).toBe(200);
  expect((await payment.pool.query('SELECT state,"teacherUserId" FROM "AcademicGroup" WHERE id=$1',[id])).rows[0]).toEqual({state:'WITHDRAWN',teacherUserId:payment.data.otherTeacher.userId});await transition(page,'publish');
  expect((await payment.pool.query('SELECT state,"publishedTeacherUserId" FROM "AcademicGroup" WHERE id=$1',[id])).rows[0]).toEqual({state:'PUBLISHED',publishedTeacherUserId:payment.data.otherTeacher.userId});
  await identity(context,payment.prepared.actors.owner.secret);await page.goto('/mis-ordenes/'+payment.orderId);await expect(page.locator('time',{hasText:payment.original.expiresAt})).toBeVisible();expect(await economicFingerprint(payment.pool)).toBe(before);expect(payment.calls).toHaveLength(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('U4E03 US4.13 editar republicar y cancelar con solo historial no revive matrículas ni condiciones originales',async({page,context,payment})=>{
  await identity(context,payment.prepared.actors.owner.secret);expect((await page.request.post('/api/v1/enrollment/orders/'+payment.orderId+'/payment-attempts',{headers,data:{initiationId:randomUUID()}})).status()).toBe(200);expect((await payment.economicFact()).state).toBe('APPLIED');
  await advanceBrowserClockWithSessions(payment.applicationPool,payment.original.items[0].enrollmentValidUntil);
  const before=await economicFingerprint(payment.pool),id=payment.prepared.offer.groupId;await identity(context,payment.prepared.actors.admin.secret);await page.goto('/admin/oferta/grupos/'+id);await transition(page,'withdraw');await page.getByLabel('Fecha de fin',{exact:true}).fill('2091-03-31');const save=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/groups/'+id));await page.getByRole('button',{name:'Guardar grupo',exact:true}).click();expect((await save).status()).toBe(200);await transition(page,'publish');
  await page.getByRole('button',{name:'Cancelar grupo',exact:true}).click();await page.getByLabel('Motivo de cancelación',{exact:true}).fill('Historial finalizado, ensayo ficticio');const cancel=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/cancel'));await page.getByRole('dialog').getByRole('button',{name:'Confirmar cancelación',exact:true}).click();expect((await cancel).status()).toBe(200);await expect(page.getByLabel('Nombre',{exact:true})).toBeDisabled();
  await identity(context,payment.prepared.actors.owner.secret);await page.goto('/mis-matriculas');await expect(page.getByText('Matrícula histórica; su vigencia original ha terminado.',{exact:true})).toHaveCount(2);await expect(page.getByText(payment.original.items[0].enrollmentValidUntil,{exact:true})).toHaveCount(2);await expect(page.getByText('Matrícula vigente.',{exact:true})).toHaveCount(0);expect(await economicFingerprint(payment.pool)).toBe(before);expect(payment.calls).toHaveLength(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
