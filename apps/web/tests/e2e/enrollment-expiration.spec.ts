import { randomUUID } from 'node:crypto';
import { test,expect } from '../support/enrollment-expiration-fixture';
const headers={origin:'http://localhost:5173','x-csrf-protection':'1'};
test.beforeEach(async({context,payment})=>{await context.addCookies([{name:'av_session_dev',value:payment.prepared.actors.owner.secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);});
test('EE00 control: reserva real24h y worker detenido no materializa al abrir',async({page,payment,expiration})=>{
  await page.goto('/mis-ordenes/'+payment.orderId);await expect(page.getByRole('heading',{name:'Detalle original de la orden',exact:true})).toBeVisible();
  expect(await expiration.snapshot()).toMatchObject({state:'RESERVED',revision:'1',expires:payment.original.expiresAt,processed:null,expired:0,audit:0});
});
for(const delta of [-1,0,1])test('EE01 TV13/TV22 instante servidor '+delta+'µs prevalece sobre reloj cliente',async({page,payment,expiration})=>{
  await expiration.boundary(delta);await page.clock.setFixedTime(new Date('2000-01-01T00:00:00Z'));await page.goto('/mis-ordenes/'+payment.orderId);
  await expect(page.getByText(delta<0?'Orden reservada según el servidor.':'Reserva vencida según el servidor. Puedes preparar una nueva selección.',{exact:true})).toBeVisible();
  await expect(page.locator('time',{hasText:payment.original.expiresAt})).toBeVisible();expect(await expiration.snapshot()).toMatchObject({state:'RESERVED',processed:null,audit:0});expect(payment.calls).toHaveLength(0);
});
test('EE02 TV22 reinicio real API y reload conservan plazo/resultado sin reenvío',async({page,context,payment,expiration})=>{
  let posts=0;context.on('request',request=>{if(request.method()==='POST'&&/reservation-requests|payment-attempts/.test(request.url()))posts++;});
  await expiration.boundary(0);await page.goto('/mis-ordenes/'+payment.orderId);await expect(page.getByText('Reserva vencida según el servidor. Puedes preparar una nueva selección.',{exact:true})).toBeVisible();
  await payment.restartBackend();await page.reload();await expect(page.getByText('Reserva vencida según el servidor. Puedes preparar una nueva selección.',{exact:true})).toBeVisible();
  await expect(page.locator('time',{hasText:payment.original.expiresAt})).toBeVisible();expect(posts).toBe(0);expect((await expiration.snapshot()).audit).toBe(0);
});
test('EE03 TV22 logout/login ocultan datos y recuperan orden vencida sin pago',async({page,payment,expiration})=>{
  await expiration.boundary(0);await page.goto('/mis-ordenes/'+payment.orderId);await expect(page.getByText('Reserva vencida según el servidor. Puedes preparar una nueva selección.',{exact:true})).toBeVisible();
  await page.goto('/inicio');await page.getByRole('button',{name:/Cerrar sesión/i}).click();await page.goto('/mis-ordenes/'+payment.orderId);await expect(page.getByText('Curso ficticio de reservas',{exact:true})).toHaveCount(0);
  const account=payment.data.account('STUDENT');expect((await page.request.post('/api/v1/auth/login',{headers,data:{email:account.email,password:account.password}})).status()).toBe(200);
  await page.goto('/mis-ordenes/'+payment.orderId);await expect(page.getByText('Reserva vencida según el servidor. Puedes preparar una nueva selección.',{exact:true})).toBeVisible();expect(payment.calls).toHaveLength(0);
});
test('EE04 TV17 nueva intención explícita tras abandono no sanciona ni renueva anterior',async({page,payment,expiration})=>{
  const groupId=await expiration.futureGroup();await expiration.boundary(0);await page.goto('/mis-ordenes/'+payment.orderId);
  await expect(page.getByRole('link',{name:'Preparar nueva selección',exact:true})).toBeVisible();
  const intentionId=randomUUID(),response=await page.request.post('/api/v1/enrollment/reservation-requests',{headers,data:{intentionId,groupIds:[groupId]}});expect(response.status()).toBe(200);
  const result=async()=>(await (await page.request.get('/api/v1/enrollment/reservation-requests/'+intentionId)).json()).data;
  await expect.poll(async()=>(await result()).state).toBe('CONFIRMED');expect((await result()).orderId).not.toBe(payment.orderId);
  await page.reload();await expect(page.getByText('Reserva vencida según el servidor. Puedes preparar una nueva selección.',{exact:true})).toBeVisible();expect(await expiration.snapshot()).toMatchObject({state:'EXPIRED',revision:'2',expires:payment.original.expiresAt,expired:2,audit:1});expect(payment.calls).toHaveLength(0);
});
test('EE05 TV13 worker real retrasado materializa una sola vez conservando UI',async({page,payment,expiration})=>{
  await expiration.boundary(0);const worker=await expiration.worker();await page.goto('/mis-ordenes/'+payment.orderId);await expect(page.getByText('Reserva vencida según el servidor. Puedes preparar una nueva selección.',{exact:true})).toBeVisible();
  expect(await worker.tick()).toEqual({examined:1,expired:1,failed:0});await worker.tick();await page.reload();await expect(page.getByText('Reserva vencida según el servidor. Puedes preparar una nueva selección.',{exact:true})).toBeVisible();expect(await expiration.snapshot()).toMatchObject({state:'EXPIRED',revision:'2',expired:2,audit:1});
});
test('EE06 TV16 pago aplicado no se revoca por worker al pasar expiresAt',async({page,payment,expiration})=>{
  const worker=await expiration.worker();await page.goto('/mis-ordenes/'+payment.orderId);await page.getByRole('button',{name:'Iniciar pago',exact:true}).click();await expect.poll(()=>payment.calls.length).toBe(1);expect((await payment.economicFact()).state).toBe('APPLIED');
  await expiration.boundary(1);await worker.tick();await page.reload();await expect(page.getByText(/matrícula confirmada|orden matriculada/i)).toBeVisible();expect(await expiration.snapshot()).toMatchObject({state:'ENROLLED',converted:2,expired:0,audit:0});expect((await payment.counts()).enrollments).toBe(2);
});
test('EE07 TV22 error de consulta no inventa vencimiento, cupo o matrícula',async({page,context,payment})=>{
  await page.goto('/mis-ordenes/'+payment.orderId);await expect(page.getByRole('heading',{name:'Detalle original de la orden',exact:true})).toBeVisible();
  await context.route('**/api/v1/enrollment/orders/*',route=>route.abort('failed'));await page.getByRole('button',{name:'Consultar estado del pago',exact:true}).click();await expect(page.getByRole('alert')).toContainText(/incierto|consult|error/i);
  await expect(page.getByText('Reserva vencida según el servidor. Puedes preparar una nueva selección.',{exact:true})).toHaveCount(0);expect(payment.calls).toHaveLength(0);
});
test('EE09 T066 consulta incierta retira acción de nueva selección y conserva plazo original',async({page,context,payment,expiration})=>{
  await expiration.boundary(0);await page.goto('/mis-ordenes/'+payment.orderId);
  await expect(page.getByRole('link',{name:'Preparar nueva selección',exact:true})).toBeVisible();
  await context.route('**/api/v1/enrollment/orders/*',route=>route.abort('failed'));await page.getByRole('button',{name:'Consultar estado del pago',exact:true}).click();
  await expect(page.getByText('Estado actual pendiente de consulta.',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Preparar nueva selección',exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Hora del servidor')).toHaveText(payment.original.expiresAt);expect(payment.calls).toHaveLength(0);
});
for(const failInventory of [false,true])test('EE08 T066 nueva selección por UI '+(failInventory?'exige recuperar inventario tras error':'crea otra intención solo al confirmar'),async({page,context,payment,expiration})=>{
  await expiration.futureGroup();await expiration.boundary(0);
  const oldIntention=(await payment.pool.query('SELECT "intentionId" FROM "ReservationRequest" WHERE id=(SELECT "requestId" FROM "EnrollmentOrder" WHERE id=$1)',[payment.orderId])).rows[0].intentionId;
  const posts:{intentionId:string}[]=[];context.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/enrollment/reservation-requests'))posts.push(request.postDataJSON());});
  await page.goto('/mis-ordenes/'+payment.orderId);await expect(page.getByLabel('Hora del servidor')).toHaveText(payment.original.expiresAt);
  await page.getByRole('link',{name:'Preparar nueva selección',exact:true}).click();
  await page.getByRole('button',{name:'Preparar nueva selección',exact:true}).click();
  await page.getByLabel('Seleccionar Grupo posterior ficticio',{exact:true}).check();await page.getByRole('button',{name:'Previsualizar selección',exact:true}).click();
  await page.getByLabel('Confirmo el conjunto y entiendo que la solicitud esperará una decisión del servidor.',{exact:true}).check();expect(posts).toHaveLength(0);
  if(failInventory){
    await context.route('**/api/v1/enrollment/offerings?*',route=>route.abort('failed'));await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText(/incierto/i);await expect(page.getByRole('heading',{name:'Resumen orientativo',exact:true})).toHaveCount(0);
    await expect(page.getByText('No hay grupos disponibles para esta consulta.',{exact:true})).toHaveCount(0);expect(posts).toHaveLength(0);
  }else{
    await page.getByRole('button',{name:'Confirmar solicitud de reserva',exact:true}).click();
    await expect.poll(async()=>{await page.getByRole('button',{name:'Consultar estado de la solicitud',exact:true}).click();return page.getByRole('link',{name:'Consultar orden confirmada',exact:true}).count();}).toBe(1);
    expect(posts).toHaveLength(1);expect(posts[0].intentionId).not.toBe(oldIntention);await page.getByRole('link',{name:'Consultar orden confirmada',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Detalle original de la orden',exact:true})).toBeVisible();expect(await expiration.snapshot()).toMatchObject({state:'EXPIRED',revision:'2',expires:payment.original.expiresAt,expired:2,audit:1});
  }
  expect(payment.calls).toHaveLength(0);
});
