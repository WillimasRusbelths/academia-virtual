import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import type { EnrollmentDataset } from '../../../api/tests/support/enrollment.js';
import { test, expect } from '../support/enrollment-reservation-fixture';
import { seedCommitment } from '../../../api/tests/support/enrollment-maintenance.js';

const headers={origin:'http://localhost:5173','x-csrf-protection':'1'};
test.beforeEach(async({context,enrollment})=>{
  await context.addCookies([{name:'av_session_dev',value:enrollment.actors.owner.secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
});
async function admit(page:Page,groupIds:string[],intentionId=randomUUID()){
  const response=await page.request.post('/api/v1/enrollment/reservation-requests',{headers,data:{intentionId,groupIds}});
  expect(response.status()).toBe(200);return {intentionId,groupIds};
}
async function decided(f:EnrollmentDataset,intentionId:string){
  const row=async()=>(await f.context.database.pool.query(`SELECT r.state,r."decisionCode",o.id AS "orderId" FROM "ReservationRequest" r LEFT JOIN "EnrollmentOrder" o ON o."requestId"=r.id WHERE r."intentionId"=$1`,[intentionId])).rows[0];
  await expect.poll(async()=>(await row())?.state).toMatch(/^(CONFIRMED|REJECTED)$/);
  return row();
}
async function finalCounts(f:EnrollmentDataset){return (await f.context.database.pool.query(`SELECT (SELECT count(*)::int FROM "EnrollmentOrder") AS orders,(SELECT count(*)::int FROM "EnrollmentOrderItem") AS items,(SELECT count(*)::int FROM "SeatReservation") AS seats`)).rows[0];}
async function extraGroup(f:EnrollmentDataset,options:{sameCourse?:boolean;start?:number;end?:number;day?:number}={}){
  const pool=f.context.database.pool,courseId=options.sameCourse?f.offer.courseId:randomUUID(),groupId=randomUUID();
  if(!options.sameCourse){
    await pool.query(`INSERT INTO "AcademicCourse" (id,name,description,state) VALUES ($1,'Segundo curso ficticio','Datos del ensayo','PUBLISHED')`,[courseId]);
    await pool.query(`INSERT INTO "CoursePrice" ("courseId","amountMinor",currency,revision,"changedBy") VALUES ($1,7000,'PEN',1,$2)`,[courseId,f.actors.admin.id]);
  }
  await pool.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,state,capacity,"periodStart","periodEnd","teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion") SELECT $1,$2,'Segundo grupo ficticio','PUBLISHED',1,"periodStart","periodEnd","teacherUserId","publishedTeacherUserId","publishedTeacherEligibilityVersion" FROM "AcademicGroup" WHERE id=$3`,[groupId,courseId,f.offer.groupId]);
  await pool.query(`INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute") VALUES ($1,$2,$3,$4)`,[groupId,options.day??2,options.start??1080,options.end??1140]);
  return {courseId,groupId};
}
async function preview(page:Page){
  await page.goto('/reservar');
  await page.getByRole('checkbox',{name:'Seleccionar Grupo ficticio visible',exact:true}).check();
  await page.getByRole('button',{name:'Previsualizar selección',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Resumen orientativo',exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:/Confirmo el conjunto/}).check();
}
async function showDecision(page:Page,f:EnrollmentDataset,input:{intentionId:string}){
  const result=await decided(f,input.intentionId);
  await page.goto('/mis-ordenes');await page.getByRole('button',{name:'Consultar resultado de la solicitud',exact:true}).first().click();
  return result;
}

test('EU01 US1.03 importe manipulado se rechaza y el total autorizado se conserva',async({page,enrollment,reservation})=>{
  await reservation.seed('PRICED');
  const wrong=await page.request.post('/api/v1/enrollment/reservation-requests',{headers,data:{intentionId:randomUUID(),groupIds:[enrollment.offer.groupId],totalMinor:'1'}});
  expect(wrong.status()).toBe(400);expect(await finalCounts(enrollment)).toEqual({orders:0,items:0,seats:0});
  const input=await admit(page,[enrollment.offer.groupId]),result=await decided(enrollment,input.intentionId);expect(result.state).toBe('CONFIRMED');
  await page.goto('/mis-ordenes/'+result.orderId);await expect(page.getByText('PEN 125.00',{exact:true})).toBeVisible();
});
test('EU02 US1.04 acuse perdido se consulta y replay conserva orden y plazo',async({page,context,enrollment,reservation})=>{
  await reservation.seed('PRICED');let posts=0;
  await context.route('**/api/v1/enrollment/reservation-requests',async route=>{
    if(route.request().method()!=='POST'){await route.continue();return;}
    posts++;await route.fetch();await route.abort('failed');
  });
  await preview(page);await page.getByRole('button',{name:'Confirmar solicitud de reserva',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Resultado incierto');
  const stored=(await enrollment.context.database.pool.query('SELECT "intentionId" FROM "ReservationRequest"')).rows[0];
  const result=await decided(enrollment,stored.intentionId);expect(result.state).toBe('CONFIRMED');
  await context.unroute('**/api/v1/enrollment/reservation-requests');
  await page.getByRole('button',{name:'Consultar estado de la solicitud',exact:true}).click();
  await expect(page.getByText('Reserva confirmada por el servidor.',{exact:true})).toBeVisible();expect(posts).toBe(1);
  const original=(await (await page.request.get('/api/v1/enrollment/orders/'+result.orderId)).json()).data;
  await admit(page,[enrollment.offer.groupId],stored.intentionId);
  const recovered=(await (await page.request.get('/api/v1/enrollment/orders/'+result.orderId)).json()).data;
  expect([recovered.id,recovered.confirmedAt,recovered.expiresAt]).toEqual([original.id,original.confirmedAt,original.expiresAt]);expect(await finalCounts(enrollment)).toEqual({orders:1,items:1,seats:1});
});
test.describe('prioridad con empate temporal en servidor',()=>{
test.use({reservationClock:true});
test('EU03 US1.05/10 último cupo respeta secuencia aunque la segunda respuesta llegue primero',async({page,browser,enrollment,reservation})=>{
  await reservation.seed('PRICED');const pool=enrollment.context.database.pool;
  await pool.query('UPDATE "AcademicGroup" SET state=\'WITHDRAWN\' WHERE id=$1',[enrollment.offer.groupId]);
  await pool.query('UPDATE "AcademicGroup" SET capacity=1 WHERE id=$1',[enrollment.offer.groupId]);
  await pool.query('UPDATE "AcademicGroup" SET state=\'PUBLISHED\' WHERE id=$1',[enrollment.offer.groupId]);
  const other=await browser.newContext();const holder=await pool.connect();
  let release=()=>{};
  try{
    await other.addCookies([{name:'av_session_dev',value:enrollment.actors.other.secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
    const tab=await other.newPage();await tab.goto('http://localhost:5173/reservar');
    await holder.query('BEGIN');await holder.query('SELECT id FROM "DispatchState" WHERE id=1 FOR UPDATE');
    const delayed=new Promise<void>(r=>{release=r;});
    await page.route('**/api/v1/enrollment/reservation-requests',async route=>{const response=await route.fetch();await delayed;await route.fulfill({response});});
    await page.goto('/reservar');const intentionId=randomUUID();
    const first=page.evaluate(async input=>{const response=await fetch('/api/v1/enrollment/reservation-requests',{method:'POST',headers:{'content-type':'application/json','x-csrf-protection':'1'},body:JSON.stringify(input)});return {status:response.status};},{intentionId,groupIds:[enrollment.offer.groupId]});
    await expect.poll(async()=>Number((await pool.query('SELECT count(*) FROM "ReservationRequest"')).rows[0].count)).toBe(1);
    const second=await admit(tab,[enrollment.offer.groupId]);release();expect((await first).status).toBe(200);const original={intentionId};
    expect((await pool.query('SELECT state FROM "ReservationRequest" ORDER BY "admissionSequence"')).rows).toEqual([{state:'ADMITTED'},{state:'ADMITTED'}]);expect(await finalCounts(enrollment)).toEqual({orders:0,items:0,seats:0});
    const priority=(await pool.query(`SELECT "admissionSequence"::text AS sequence,(extract(epoch FROM "admittedAt")*1000000)::bigint::text AS at FROM "ReservationRequest" ORDER BY "admissionSequence"`)).rows;
    expect(priority.map(r=>r.sequence)).toEqual(['1','2']);expect(priority[0].at).toBe(priority[1].at);
    await holder.query('COMMIT');expect((await decided(enrollment,original.intentionId)).state).toBe('CONFIRMED');expect(await decided(enrollment,second.intentionId)).toMatchObject({state:'REJECTED',decisionCode:'CAPACITY_UNAVAILABLE'});
    await tab.reload();await tab.getByRole('link',{name:'Mis órdenes',exact:true}).click();await tab.getByRole('button',{name:'Consultar resultado de la solicitud',exact:true}).click();await expect(tab.getByRole('alert').filter({hasText:'disponibilidad'})).toBeVisible();
    expect(await finalCounts(enrollment)).toEqual({orders:1,items:1,seats:1});
  }finally{release();await holder.query('ROLLBACK');holder.release();await other.close();}
});
});
test('EU04 US1.06 conjunto sin plaza no deja reservas parciales',async({page,enrollment,reservation})=>{
  await reservation.seed('PRICED');const other=await extraGroup(enrollment);
  const intentionId=randomUUID();
  const occupied=await page.request.post('/api/v1/enrollment/reservation-requests',{headers:{...headers,cookie:`av_session_dev=${enrollment.actors.other.secret}`},data:{intentionId,groupIds:[other.groupId]}});
  expect(occupied.status()).toBe(200);expect((await decided(enrollment,intentionId)).state).toBe('CONFIRMED');
  const input=await admit(page,[enrollment.offer.groupId,other.groupId]),result=await showDecision(page,enrollment,input);expect(result.state).toBe('REJECTED');
  await expect(page.getByRole('alert').filter({hasText:'disponibilidad'})).toBeVisible();expect(await finalCounts(enrollment)).toEqual({orders:1,items:1,seats:1});
  expect((await enrollment.context.database.pool.query('SELECT count(*)::int AS n FROM "EnrollmentOrder" WHERE "studentId"=$1',[enrollment.actors.owner.id])).rows[0].n).toBe(0);
});
test('EU05 US1.07/08 dos cursos, una orden y precios originales tras cambio',async({page,enrollment,reservation})=>{
  await reservation.seed('PRICED');const other=await extraGroup(enrollment);
  const input=await admit(page,[enrollment.offer.groupId,other.groupId]),result=await decided(enrollment,input.intentionId);expect(result.state).toBe('CONFIRMED');
  await enrollment.context.database.pool.query('UPDATE "CoursePrice" SET "amountMinor"=19000,revision=revision+1 WHERE "courseId"=$1',[enrollment.offer.courseId]);
  await page.goto('/mis-ordenes/'+result.orderId);await expect(page.getByText('PEN 195.00',{exact:true})).toBeVisible();await expect(page.getByText(/Grupo ficticio visible · PEN 125.00/)).toBeVisible();await expect(page.getByText(/Segundo grupo ficticio · PEN 70.00/)).toBeVisible();
  expect(await finalCounts(enrollment)).toEqual({orders:1,items:2,seats:2});
});
test('EU06 US1.09 dos intenciones del mismo alumno crean una sola orden vigente',async({page,enrollment,reservation})=>{
  await reservation.seed('PRICED');const other=await extraGroup(enrollment);
  const inputs=await Promise.all([admit(page,[enrollment.offer.groupId]),admit(page,[other.groupId])]);
  const results=await Promise.all(inputs.map(input=>decided(enrollment,input.intentionId)));
  expect(results.map(r=>r.state).sort()).toEqual(['CONFIRMED','REJECTED']);expect(results.find(r=>r.state==='REJECTED').decisionCode).toBe('ACTIVE_ORDER_EXISTS');
  await page.goto('/mis-ordenes');await expect(page.getByRole('heading',{name:'Orden con reservas vigentes'})).toBeVisible();expect(await finalCounts(enrollment)).toEqual({orders:1,items:1,seats:1});
});
test('EU07 US1.11 grupos de un curso se excluyen en UI y se rechazan en servidor',async({page,enrollment,reservation})=>{
  await reservation.seed('PRICED');const other=await extraGroup(enrollment,{sameCourse:true});
  await page.goto('/reservar');await page.getByRole('checkbox',{name:'Seleccionar Grupo ficticio visible',exact:true}).check();await expect(page.getByRole('checkbox',{name:'Seleccionar Segundo grupo ficticio',exact:true})).toBeDisabled();
  const input=await admit(page,[enrollment.offer.groupId,other.groupId]);expect((await decided(enrollment,input.intentionId)).state).toBe('REJECTED');expect(await finalCounts(enrollment)).toEqual({orders:0,items:0,seats:0});
});
test('EU08 US1.14 oferta retirada después del resumen rechaza todo',async({page,enrollment,reservation})=>{
  await reservation.seed('PRICED');await preview(page);
  await enrollment.context.database.pool.query('UPDATE "AcademicCourse" SET state=\'WITHDRAWN\' WHERE id=$1',[enrollment.offer.courseId]);
  await page.getByRole('button',{name:'Confirmar solicitud de reserva',exact:true}).click();
  await expect.poll(async()=>(await enrollment.context.database.pool.query('SELECT state FROM "ReservationRequest"')).rows[0]?.state).toBe('REJECTED');
  await page.getByRole('button',{name:'Consultar estado de la solicitud',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'oferta'})).toBeVisible();expect(await finalCounts(enrollment)).toEqual({orders:0,items:0,seats:0});
});
test('EU09 US1.16 coincidencia efectiva rechaza el conjunto',async({page,enrollment,reservation})=>{
  await reservation.seed('PRICED');const other=await extraGroup(enrollment,{day:1,start:1110,end:1170});
  const input=await admit(page,[enrollment.offer.groupId,other.groupId]);expect(await showDecision(page,enrollment,input)).toMatchObject({state:'REJECTED',decisionCode:'STUDENT_SCHEDULE_CONFLICT'});
  await expect(page.getByRole('alert').filter({hasText:'horarios'})).toBeVisible();expect(await finalCounts(enrollment)).toEqual({orders:0,items:0,seats:0});
});
test('EU10 US1.17 franjas contiguas permiten confirmar conjunto',async({page,enrollment,reservation})=>{
  await reservation.seed('PRICED');const other=await extraGroup(enrollment,{day:1,start:1140,end:1200});
  const input=await admit(page,[enrollment.offer.groupId,other.groupId]),result=await decided(enrollment,input.intentionId);expect(result.state).toBe('CONFIRMED');
  await page.goto('/mis-ordenes/'+result.orderId);await expect(page.getByRole('heading',{name:'Detalle original de la orden'})).toBeVisible();expect(await finalCounts(enrollment)).toEqual({orders:1,items:2,seats:2});
});
for(const sameCourse of [true,false])test(`EU13 US1.12/16 matrícula vigente oculta bloquea ${sameCourse?'curso duplicado':'horario'}`,async({page,enrollment,reservation})=>{
  await reservation.seed('PRICED');const other=await extraGroup(enrollment,{sameCourse,day:1,start:1110,end:1170});
  const session=enrollment.account('STUDENT').sessions[0];
  // Hecho histórico ficticio; no ejecuta ni acredita una pasarela o finalizador.
  await seedCommitment({database:enrollment.context.database,courseId:enrollment.offer.courseId,groupId:enrollment.offer.groupId,student:{userId:enrollment.actors.owner.id,sessionId:session.id}},'ENROLLED');
  await enrollment.context.database.pool.query('UPDATE "AdmissionSequence" SET "nextSequence"=2 WHERE id=1');
  await enrollment.context.database.pool.query('UPDATE "AcademicGroup" SET state=\'WITHDRAWN\' WHERE id=$1',[enrollment.offer.groupId]);
  const input=await admit(page,[other.groupId]),result=await decided(enrollment,input.intentionId);
  expect(result).toMatchObject({state:'REJECTED',decisionCode:sameCourse?'COURSE_COMMITMENT_EXISTS':'STUDENT_SCHEDULE_CONFLICT'});
  await page.goto('/mis-ordenes');await expect(page.getByText('Rechazada',{exact:true})).toBeVisible();
  expect(await finalCounts(enrollment)).toEqual({orders:1,items:1,seats:1});expect((await enrollment.context.database.pool.query('SELECT count(*)::int AS n FROM "Enrollment"')).rows[0].n).toBe(1);
});
test('EU14 US1.17 historia vencida no bloquea otra reserva',async({page,enrollment,reservation})=>{
  await reservation.seed('EXPIRED');const input=await admit(page,[enrollment.offer.groupId]),result=await decided(enrollment,input.intentionId);expect(result.state).toBe('CONFIRMED');
  await page.goto('/mis-ordenes/'+result.orderId);await expect(page.getByText('Orden reservada según el servidor.',{exact:true})).toBeVisible();
  expect((await enrollment.context.database.pool.query('SELECT state FROM "SeatReservation" ORDER BY state')).rows.map(r=>r.state).sort()).toEqual(['CONFIRMED','EXPIRED']);
});
test('EU15 navegación Inicio → oferta → reserva conserva 002 y roles sin acceso financiero',async({page,context,enrollment,reservation})=>{
  await reservation.seed('PRICED');await page.goto('/inicio');await page.getByRole('link',{name:'Consultar oferta',exact:true}).click();
  await expect(page.getByText('Ocupación y disponibilidad no calculadas',{exact:true})).toBeVisible();await page.getByRole('link',{name:'Reservar cursos',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Reservar cursos',exact:true})).toBeVisible();
  for(const actor of [enrollment.actors.teacher,enrollment.actors.admin]){
    await context.clearCookies();await context.addCookies([{name:'av_session_dev',value:actor.secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
    await page.goto('/reservar');await expect(page.getByRole('heading',{name:'Acceso no permitido',exact:true})).toBeVisible();expect((await page.request.get('/api/v1/enrollment/orders')).status()).toBe(403);
  }
  await context.clearCookies();await page.goto('/mis-ordenes');await expect(page).toHaveURL(/login/);expect((await page.request.get('/api/v1/enrollment/orders')).status()).toBe(401);
});
test.describe('límites exactos con reloj SQL exclusivo del ensayo',()=>{
  test.use({reservationClock:true});
  for(const at of ['2090-01-02T04:59:59.999999Z','2090-01-02T05:00:00.000000Z','2090-01-02T05:00:00.000001Z'])test(`EU11 US1.13 corte inicial Lima ${at}`,async({page,enrollment,reservation})=>{
    await reservation.seed('PRICED');await enrollment.context.database.pool.query('UPDATE "BrowserClock" SET instant=$1 WHERE id=1',[at]);
    const input=await admit(page,[enrollment.offer.groupId]),result=await showDecision(page,enrollment,input);
    expect(result.state).toBe(at.includes('04:59')?'CONFIRMED':'REJECTED');
    if(result.state==='CONFIRMED'){await expect(page.getByText('Orden reservada según el servidor.',{exact:true})).toBeVisible();expect(await finalCounts(enrollment)).toEqual({orders:1,items:1,seats:1});}
    else{await expect(page.getByRole('alert').filter({hasText:'oferta'})).toBeVisible();expect(await finalCounts(enrollment)).toEqual({orders:0,items:0,seats:0});}
  });
  test('EU12 US1.15 comenzar período no acorta ni renueva una reserva confirmada',async({page,enrollment,reservation})=>{
    await reservation.seed('PRICED');const input=await admit(page,[enrollment.offer.groupId]),result=await decided(enrollment,input.intentionId);expect(result.state).toBe('CONFIRMED');
    const path='/api/v1/enrollment/orders/'+result.orderId,original=(await (await page.request.get(path)).json()).data;
    await enrollment.context.database.pool.query(`UPDATE "BrowserClock" SET instant='2090-01-02T05:00:00.000001Z' WHERE id=1`);
    await admit(page,[enrollment.offer.groupId],input.intentionId);await page.goto('/mis-ordenes/'+result.orderId);
    await expect(page.locator('time', {hasText:original.expiresAt})).toBeVisible();const current=(await (await page.request.get(path)).json()).data;expect([current.state,current.confirmedAt,current.expiresAt]).toEqual(['RESERVED',original.confirmedAt,original.expiresAt]);
    expect((await enrollment.context.database.pool.query(`SELECT (extract(epoch FROM ("expiresAt"-"confirmedAt"))*1000000)::bigint::text AS duration FROM "EnrollmentOrder"`)).rows).toEqual([{duration:'86400000000'}]);
  });
});
