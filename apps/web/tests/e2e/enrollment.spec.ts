import { randomUUID } from 'node:crypto';
import type { BrowserContext,Page } from '@playwright/test';
import { test,expect } from '../support/enrollment-admin-fixture';
async function identity(context:BrowserContext,secret?:string){await context.clearCookies();if(secret)await context.addCookies([{name:'av_session_dev',value:secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);}
async function screen(page:Page,path:string,title:RegExp,task='T078'){await page.goto(path);await expect(page.getByRole('heading',{name:title}).first(),task+' pendiente: pantalla administrativa US4 no implementada.').toBeVisible();}
test('UE00 control: finalizador real crea incidencia con cero matrículas y notas',async({payment,adminScenario})=>{
  expect(await payment.counts()).toMatchObject({payments:1,enrollments:0,incidents:1});expect(await adminScenario.notes()).toBe(0);expect(payment.calls).toHaveLength(1);expect((await payment.pool.query('SELECT state FROM "EnrollmentOrder" WHERE id=$1',[payment.orderId])).rows[0].state).toBe('EXPIRED');
});
test('UE01 US4.06 precio explícito por teclado conserva importe/plazo de orden anterior',async({page,context,payment})=>{
  await identity(context,payment.prepared.actors.admin.secret);await screen(page,'/admin/precios',/precios/i,'T077');await page.getByLabel(/curso/i).selectOption(payment.prepared.offer.courseId);
  await page.getByLabel(/precio.*PEN|importe.*PEN/i).fill('140.00');await page.getByRole('button',{name:/guardar precio/i}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('status').filter({hasText:/precio actualizado|precio guardado/i})).toBeVisible();
  expect((await payment.pool.query('SELECT "amountMinor"::text AS amount FROM "CoursePrice" WHERE "courseId"=$1',[payment.prepared.offer.courseId])).rows[0].amount).toBe('14000');
  const original=(await payment.pool.query(`SELECT "totalMinor"::text AS total,to_char("expiresAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deadline FROM "EnrollmentOrder" WHERE id=$1`,[payment.orderId])).rows[0];expect(original).toEqual({total:payment.original.totalMinor,deadline:payment.original.expiresAt});expect(payment.calls).toHaveLength(0);
});
test('UE02 US4.06 revisión concurrente conserva entrada sin sobrescribir precio nuevo',async({page,context,payment})=>{
  await identity(context,payment.prepared.actors.admin.secret);await screen(page,'/admin/precios',/precios/i,'T077');await page.getByLabel(/curso/i).selectOption(payment.prepared.offer.courseId);const input=page.getByLabel(/precio.*PEN|importe.*PEN/i);await input.fill('140.00');
  const changed=await page.request.put('/api/v1/admin/enrollment/courses/'+payment.prepared.offer.courseId+'/price',{headers:{origin:'http://localhost:5173','x-csrf-protection':'1'},data:{commandId:randomUUID(),expectedRevision:'1',amountMinor:'15000',currency:'PEN'}});expect(changed.status()).toBe(200);
  await page.getByRole('button',{name:/guardar precio/i}).click();await expect(page.getByRole('alert')).toContainText(/revisi[oó]n|conflicto|compara/i);await expect(input).toHaveValue('140.00');expect((await payment.pool.query('SELECT "amountMinor"::text AS amount FROM "CoursePrice" WHERE "courseId"=$1',[payment.prepared.offer.courseId])).rows[0].amount).toBe('15000');expect(payment.calls).toHaveLength(0);
});
test('UE03 US4.06 consulta administrativa enlaza orden e incidencia sin efectos',async({page,context,payment,adminScenario})=>{
  const before=await adminScenario.fingerprint();await identity(context,payment.prepared.actors.admin.secret);await screen(page,'/admin/compromisos',/compromisos/i);await expect(page.getByText(payment.orderId,{exact:true}).first()).toBeVisible();
  await page.getByRole('link',{name:/consultar incidencia|ver incidencia/i}).first().click();await expect(page.getByRole('heading',{name:/incidencia/i}).first()).toBeVisible();expect(await adminScenario.fingerprint()).toBe(before);expect(await adminScenario.notes()).toBe(0);
});
test('UE04 US4.08 anotar por teclado mantiene conciliación, bloqueo y economía',async({page,context,payment,adminScenario})=>{
  const before=await adminScenario.fingerprint();await identity(context,payment.prepared.actors.admin.secret);await screen(page,'/admin/incidencias/'+adminScenario.incidentId,/incidencia/i);
  await page.getByRole('textbox',{name:'Anotación de seguimiento',exact:true}).fill('Investigación ficticia pendiente, sin resolución económica.');await page.getByRole('button',{name:/registrar seguimiento/i}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('status').filter({hasText:/seguimiento registrado/i})).toBeVisible();await expect(page.getByText(/pendiente de resoluci[oó]n|conciliaci[oó]n/i).first()).toBeVisible();
  await expect.poll(()=>adminScenario.notes()).toBe(1);expect(await adminScenario.fingerprint()).toBe(before);expect(payment.calls).toHaveLength(1);await expect(page.getByRole('button',{name:/resolver|devolver|matricular|trasladar/i})).toHaveCount(0);
  const revision=(await payment.pool.query('SELECT revision::text FROM "AcademicGroup" WHERE id=$1',[payment.prepared.offer.groupId])).rows[0].revision;
  const response=await page.request.post('/api/v1/admin/academic/groups/'+payment.prepared.offer.groupId+'/cancel',{headers:{origin:'http://localhost:5173','x-csrf-protection':'1'},data:{commandId:randomUUID(),expectedRevision:revision,cancellationReason:'Motivo ficticio'}});expect(response.status()).toBe(409);expect((await response.json()).error.code).toBe('GROUP_COMMITMENTS_BLOCK_OPERATION');
});
test('UE05 US4.06 respuesta de seguimiento perdida se consulta sin reenviar',async({page,context,payment,adminScenario})=>{
  await identity(context,payment.prepared.actors.admin.secret);await screen(page,'/admin/incidencias/'+adminScenario.incidentId,/incidencia/i);const before=await adminScenario.fingerprint();let posts=0;
  await context.route('**/api/v1/admin/enrollment/incidents/*/follow-ups',async route=>{posts++;await route.fetch();await route.abort('failed');});await page.getByRole('textbox',{name:'Anotación de seguimiento',exact:true}).fill('Nota ficticia con respuesta perdida');await page.getByRole('button',{name:/registrar seguimiento/i}).click();await expect(page.getByRole('alert')).toContainText(/incierto|consulta/i);
  await context.unroute('**/api/v1/admin/enrollment/incidents/*/follow-ups');await page.getByRole('button',{name:/consultar/i}).first().click();expect(posts).toBe(1);await expect.poll(()=>adminScenario.notes()).toBe(1);expect(await adminScenario.fingerprint()).toBe(before);
});
test('UE06 US4.06 consulta vacía real no fabrica incidencias',async({page,context,payment})=>{
  await identity(context,payment.prepared.actors.admin.secret);await screen(page,'/admin/compromisos',/compromisos/i);await expect(page.getByText(/no hay incidencias/i)).toBeVisible();expect(await payment.counts()).toMatchObject({incidents:0,payments:0});expect(payment.calls).toHaveLength(0);
});
test('UE07 US4.06 error de consulta no se anuncia como lista vacía',async({page,context,payment})=>{
  await identity(context,payment.prepared.actors.admin.secret);await context.route('**/api/v1/admin/enrollment/incidents*',route=>route.abort('failed'));await screen(page,'/admin/compromisos',/compromisos/i);await expect(page.getByRole('alert')).toContainText(/incierto|error|consulta/i);await expect(page.getByText(/no hay incidencias/i)).toHaveCount(0);expect(payment.calls).toHaveLength(0);
});
for(const role of ['TEACHER','STUDENT','VISITOR'] as const)test('UE08 US4.07 '+role+' sin acceso a formularios administrativos',async({page,context,payment})=>{
  await identity(context,role==='TEACHER'?payment.prepared.actors.teacher.secret:role==='STUDENT'?payment.prepared.actors.owner.secret:undefined);await page.goto('/admin/precios');
  if(role==='VISITOR'){await expect(page).toHaveURL('http://localhost:5173/login');await expect(page.getByRole('heading',{name:'Iniciar sesión',exact:true})).toBeVisible();}
  else await expect(page.getByRole('heading',{name:'Acceso no permitido',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/guardar precio|registrar seguimiento/i})).toHaveCount(0);
  const denied=await page.request.get('/api/v1/admin/enrollment/incidents');expect(denied.status(),'T075 pendiente: autorización administrativa no implementada.').toBe(role==='VISITOR'?401:403);expect(payment.calls).toHaveLength(0);
});
test('UE09 control US4.01 alumno consulta incidencia propia sin texto interno ni facultades administrativas',async({page,context,payment,adminScenario})=>{
  await payment.pool.query(`INSERT INTO "IncidentFollowUp" ("incidentId","adminUserId","commandId","recordedAt",content) VALUES ($1,$2,$3,clock_timestamp(),'Nota interna ficticia exclusiva de administración')`,[adminScenario.incidentId,payment.prepared.actors.admin.id,randomUUID()]);
  const before=await adminScenario.fingerprint();await identity(context,payment.prepared.actors.owner.secret);await page.goto('/mis-ordenes/'+payment.orderId);await expect(page.getByRole('heading',{name:'Detalle original de la orden',exact:true})).toBeVisible();await expect(page.getByText('Pago en conciliación, sin matrícula.',{exact:true})).toBeVisible();await expect(page.getByText('Nota interna ficticia exclusiva de administración')).toHaveCount(0);await expect(page.getByRole('button',{name:/registrar seguimiento|resolver|devolver/i})).toHaveCount(0);expect(await adminScenario.fingerprint()).toBe(before);
});
