import { test, expect } from '../support/enrollment-reservation-fixture';

test.beforeEach(async({context,enrollment})=>{
  await context.addCookies([{name:'av_session_dev',value:enrollment.actors.owner.secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
});
test('ER00 auxiliar: precio, solicitud histórica y dueño son hechos PG reales',async({page,enrollment,reservation})=>{
  const facts=await reservation.seed('EXPIRED'),pool=enrollment.context.database.pool;
  expect((await pool.query('SELECT state FROM "EnrollmentOrder" WHERE id=$1',[facts.orderId])).rows[0].state).toBe('EXPIRED');
  expect((await page.request.get('/api/v1/me')).status()).toBe(200);
  const legacy=await page.request.get(`/api/v1/academic/courses/${enrollment.offer.courseId}/groups/${enrollment.offer.groupId}`);
  expect(legacy.status()).toBe(200);expect((await legacy.json()).data.capacityStatus).toBe('NOT_CALCULATED');
});
test('ER01 selección por teclado, espera durable y orden original sin simular HTTP',async({page,enrollment,reservation})=>{
  await reservation.seed('PRICED');
  expect((await page.request.get('/api/v1/enrollment/offerings')).status()).toBe(200);
  const holder=await enrollment.context.database.pool.connect();
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "DispatchState" WHERE id=1 FOR UPDATE');
    await page.goto('/reservar');await expect(page.getByRole('heading',{name:/reserv/i})).toBeVisible();
    await page.getByRole('checkbox',{name:/Grupo ficticio visible/i}).focus();await page.keyboard.press('Space');
    await page.getByRole('button',{name:'Previsualizar selección'}).click();
    await expect(page.getByText('Total orientativo: PEN 125.00')).toBeVisible();await page.getByRole('checkbox',{name:/Confirmo el conjunto/i}).check();await page.getByRole('button',{name:'Confirmar solicitud de reserva'}).focus();await page.keyboard.press('Enter');
    await expect.poll(async()=>(await enrollment.context.database.pool.query('SELECT state FROM "ReservationRequest" WHERE "studentId"=$1',[enrollment.actors.owner.id])).rows[0]?.state).toBe('ADMITTED');
    await expect(page.getByText('Solicitud admitida; todavía no tienes reserva. En espera de decisión.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/pagar/i})).toHaveCount(0);
    await holder.query('COMMIT');
    await expect.poll(async()=>(await enrollment.context.database.pool.query('SELECT state FROM "ReservationRequest" WHERE "studentId"=$1',[enrollment.actors.owner.id])).rows[0]?.state).toBe('CONFIRMED');
    await page.getByRole('button',{name:'Consultar estado de la solicitud',exact:true}).click();await expect(page.getByText('Reserva confirmada por el servidor.',{exact:true})).toBeVisible();
    const result=await page.request.get('/api/v1/enrollment/orders/current');expect(result.status()).toBe(200);const order=(await result.json()).data;
    expect(order.totalMinor).toBe('12500');expect(order.expiresAt).toMatch(/\.\d{6}Z$/);
    expect((await enrollment.context.database.pool.query(`SELECT (extract(epoch FROM ("expiresAt"-"confirmedAt"))*1000000)::bigint::text AS duration FROM "EnrollmentOrder"`)).rows).toEqual([{duration:'86400000000'}]);
    await page.getByRole('link',{name:'Consultar orden confirmada',exact:true}).focus();await page.keyboard.press('Enter');
    await expect(page.getByRole('heading',{name:'Detalle original de la orden',exact:true})).toBeVisible();
    await expect(page.locator('time',{hasText:order.expiresAt})).toBeVisible();
    expect((await enrollment.context.database.pool.query('SELECT count(*)::int AS n FROM "SeatReservation"')).rows[0].n).toBe(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{await holder.query('ROLLBACK');holder.release();}
});
test('ER02 oferta sin precio no promete gratuidad ni permite confirmar',async({page})=>{
  await page.goto('/reservar');await expect(page.getByRole('heading',{name:/reserv/i})).toBeVisible();
  await expect(page.getByText('Precio: Sin definir',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Previsualizar selección'})).toBeDisabled();
});
test('ER03 recarga y segunda sesión del titular recuperan ADMITTED sin nuevo POST',async({page,browser,enrollment,reservation})=>{
  const facts=await reservation.seed('ADMITTED');
  expect((await page.request.get('/api/v1/enrollment/reservation-requests/'+facts.intentionId)).status()).toBe(200);
  await page.goto('/mis-ordenes');await expect(page.getByText('Admitida, en espera',{exact:true})).toBeVisible();await page.reload();
  const other=await browser.newContext();
  try{
    await other.addCookies([{name:'av_session_dev',value:enrollment.account('STUDENT').sessions[1].secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
    const tab=await other.newPage();await tab.goto('http://localhost:5173/mis-ordenes');await expect(tab.getByText('Admitida, en espera',{exact:true})).toBeVisible();
    expect((await enrollment.context.database.pool.query('SELECT count(*)::int AS n FROM "ReservationRequest"')).rows[0].n).toBe(1);
    expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain(facts.intentionId);
  }finally{await other.close();}
});
test('ER04 titular ajeno no obtiene detalle histórico ni cambia el dueño',async({page,context,enrollment,reservation})=>{
  const facts=await reservation.seed('EXPIRED');expect((await page.request.get('/api/v1/enrollment/orders/'+facts.orderId)).status()).toBe(200);
  await context.clearCookies();await context.addCookies([{name:'av_session_dev',value:enrollment.actors.other.secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
  const response=await page.request.get('/api/v1/enrollment/orders/'+facts.orderId);expect(response.status()).toBe(404);expect((await response.json()).error.code).toBe('NOT_FOUND');
  await page.goto('/mis-ordenes/'+facts.orderId);await expect(page.getByText(/no encontrad|no disponible/i)).toBeVisible();await expect(page.getByText('Curso original ficticio')).toHaveCount(0);
});
test('ER05 desconexión muestra estado incierto y consulta manual al reconectar',async({page,context,enrollment,reservation})=>{
  await reservation.seed('ADMITTED');expect((await page.request.get('/api/v1/enrollment/reservation-requests')).status()).toBe(200);
  await page.goto('/mis-ordenes');await expect(page.getByText('Admitida, en espera',{exact:true})).toBeVisible();
  await context.setOffline(true);await page.getByRole('button',{name:'Consultar estado actualizado'}).click();await expect(page.getByRole('alert')).toContainText(/resultado|conexi[oó]n|consult/i);
  await context.setOffline(false);await page.getByRole('button',{name:'Consultar estado actualizado'}).click();await expect(page.getByText('Admitida, en espera',{exact:true})).toBeVisible();
  expect((await enrollment.context.database.pool.query('SELECT count(*)::int AS n FROM "ReservationRequest"')).rows[0].n).toBe(1);
});
test('ER06 logout elimina estado privado y nuevo login solo consulta sin reenviar',async({page,enrollment,reservation})=>{
  const facts=await reservation.seed('ADMITTED');expect((await page.request.get('/api/v1/enrollment/reservation-requests')).status()).toBe(200);
  await page.goto('/mis-ordenes');await page.getByRole('link',{name:'Inicio',exact:true}).click();await page.getByRole('button',{name:/cerrar sesi[oó]n/i}).click();await expect(page).toHaveURL(/login/);
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain(facts.intentionId);
  const account=enrollment.account('STUDENT');
  try{await page.getByLabel(/correo/i).fill(account.email);await page.getByLabel(/contrase/i).fill(account.password);}
  catch{throw new Error('No se pudieron completar los campos ficticios. Valores omitidos.');}
  await page.getByRole('button',{name:/iniciar sesi[oó]n/i}).click();await expect(page).toHaveURL(/inicio/);
  await page.goto('/mis-ordenes');await expect(page.getByText('Admitida, en espera',{exact:true})).toBeVisible();
  expect((await enrollment.context.database.pool.query('SELECT count(*)::int AS n FROM "ReservationRequest"')).rows[0].n).toBe(1);
});
test('ER07 estado vacío ofrece navegación y no inventa una orden actual',async({page})=>{
  expect((await page.request.get('/api/v1/enrollment/orders/current')).status()).toBe(200);
  await page.goto('/mis-ordenes');await expect(page.getByText('No hay órdenes en esta página.')).toBeVisible();await expect(page.getByRole('link',{name:'Reservar',exact:true})).toBeVisible();
});
test('ER08 bloqueo real de grupo muestra error recuperable sin disponibilidad ficticia',async({page,enrollment,reservation})=>{
  await reservation.seed('PRICED');expect((await page.request.get('/api/v1/enrollment/offerings')).status()).toBe(200);
  const holder=await enrollment.context.database.pool.connect();
  try{
    await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[enrollment.offer.groupId]);
    await page.goto('/reservar');await expect(page.getByRole('alert')).toContainText(/resultado|disponib|consult|temporal/i);
    await expect(page.getByRole('button',{name:'Previsualizar selección'})).toBeDisabled();
    expect((await enrollment.context.database.pool.query('SELECT count(*)::int AS n FROM "ReservationRequest"')).rows[0].n).toBe(0);
  }finally{await holder.query('ROLLBACK');holder.release();}
});
