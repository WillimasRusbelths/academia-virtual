import type { Page } from '@playwright/test';
import { test,expect } from '../support/enrollment-payment-fixture';

test.beforeEach(async({context,payment})=>{await context.addCookies([{name:'av_session_dev',value:payment.prepared.actors.owner.secret,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);});
async function open(page:Page,id:string){await page.goto('/mis-ordenes/'+id);await expect(page.getByRole('heading',{name:'Detalle original de la orden',exact:true})).toBeVisible();}
async function pay(page:Page){const button=page.getByRole('button',{name:'Iniciar pago',exact:true});expect(await button.count(),'T054 pendiente: acción de pago ausente en la página real').toBe(1);await button.focus();await page.keyboard.press('Enter');}
async function refresh(page:Page){const button=page.getByRole('button',{name:'Consultar estado del pago',exact:true});await expect(button,'Consulta de pago disponible después de cargar la orden').toHaveCount(1);await button.click();}
test('EP00a control: reserva multigrupo real, cero pagos y pantalla conserva total/plazo',async({page,payment})=>{
  await open(page,payment.orderId);await expect(page.getByText('PEN 195.00',{exact:true})).toBeVisible();await expect(page.locator('time',{hasText:payment.original.expiresAt})).toBeVisible();expect(await payment.counts()).toEqual({attempts:0,payments:0,enrollments:0,incidents:0});expect(payment.calls).toHaveLength(0);
});
test('EP00b control: success en URL no confirma matrícula ni cambia la orden',async({page,payment})=>{
  await page.goto('/mis-ordenes/'+payment.orderId+'?success=true');await expect(page.getByRole('heading',{name:'Detalle original de la orden'})).toBeVisible();await expect(page.getByText('Orden reservada según el servidor.',{exact:true})).toBeVisible();expect(await payment.counts()).toEqual({attempts:0,payments:0,enrollments:0,incidents:0});
});
test('EP00c control: interfaz no ofrece aprobación o simulación de producción',async({page,payment})=>{await open(page,payment.orderId);await expect(page.getByRole('button',{name:/Simular pago|Aprobar pago|Confirmar matrícula/i})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);});
test('EP01 inicio explícito por teclado, pendiente distinto de matrícula y sin doble cobro',async({page,payment})=>{
  await open(page,payment.orderId);await pay(page);await expect(page.getByRole('status').filter({hasText:/pago pendiente/i})).toBeVisible();expect(payment.calls).toHaveLength(1);expect(await payment.counts()).toMatchObject({attempts:1,payments:0,enrollments:0});await expect(page.getByRole('button',{name:'Iniciar pago',exact:true})).toBeDisabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('EP02 respuesta perdida se consulta sin reenviar ni renovar plazo',async({page,context,payment})=>{
  let posts=0;await context.route('**/api/v1/enrollment/orders/*/payment-attempts',async route=>{posts++;await route.fetch();await route.abort('failed');});
  await open(page,payment.orderId);await pay(page);await expect(page.getByRole('alert')).toContainText(/incierto/i);await context.unroute('**/api/v1/enrollment/orders/*/payment-attempts');await refresh(page);expect(posts).toBe(1);expect(payment.calls).toHaveLength(1);await expect(page.locator('time',{hasText:payment.original.expiresAt})).toBeVisible();expect(await payment.counts()).toMatchObject({attempts:1,enrollments:0});
});
test('EP03 iniciación desconocida solo ofrece recuperación y conserva intento canónico',async({page,payment})=>{
  payment.control.result={state:'INITIATION_UNKNOWN'};await open(page,payment.orderId);await pay(page);await expect(page.getByRole('status').filter({hasText:/inciert|desconocid/i})).toBeVisible();await refresh(page);expect(payment.calls).toHaveLength(1);expect(await payment.counts()).toMatchObject({attempts:1,enrollments:0});
});
test('EP04 hecho técnico APPLIED produce dos matrículas y vigencia original consultable',async({page,payment})=>{
  await open(page,payment.orderId);await pay(page);await expect.poll(()=>payment.calls.length).toBe(1);expect((await payment.economicFact()).state).toBe('APPLIED');await refresh(page);await expect(page.getByText(/matr[ií]cula confirmada|orden matriculada/i)).toBeVisible();expect(await payment.counts()).toMatchObject({payments:1,enrollments:2,incidents:0});
  await page.goto('/mis-matriculas');await expect(page.getByText('Curso ficticio de reservas',{exact:true})).toBeVisible();await expect(page.getByText('Segundo curso ficticio',{exact:true})).toBeVisible();await expect(page.getByText(payment.original.items[0].enrollmentValidUntil,{exact:true}).first()).toBeVisible();
});
test('EP05 hecho técnico al límite queda en conciliación sin matrícula o devolución',async({page,payment})=>{
  await open(page,payment.orderId);await pay(page);await expect.poll(()=>payment.calls.length).toBe(1);await payment.expire();expect((await payment.economicFact()).state).toBe('INCIDENT');await refresh(page);await expect(page.getByText('Pago en conciliación, sin matrícula.',{exact:true})).toBeVisible();expect(await payment.counts()).toMatchObject({payments:1,enrollments:0,incidents:1});await expect(page.getByRole('button',{name:/Devolver|Trasladar|Aprobar/i})).toHaveCount(0);
});
test('EP06 vencimiento del servidor permite nueva selección sin reiniciar plazo',async({page,payment})=>{
  await payment.expire();await open(page,payment.orderId);await expect(page.getByText(/Reserva vencida según el servidor/)).toBeVisible();await refresh(page);await expect(page.getByRole('link',{name:'Preparar nueva selección',exact:true})).toBeVisible();expect(payment.calls).toHaveLength(0);await expect(page.locator('time',{hasText:payment.original.expiresAt})).toBeVisible();
});
test('EP07 recarga/logout/entrada recuperan estado sin repetir iniciación',async({page,context,payment})=>{
  await open(page,payment.orderId);await pay(page);await page.reload();await refresh(page);expect(payment.calls).toHaveLength(1);
  await page.goto('/inicio');await page.getByRole('button',{name:/Cerrar sesi[oó]n/i}).click();await page.goto('/mis-ordenes/'+payment.orderId);await expect(page.getByText('Curso ficticio de reservas',{exact:true})).toHaveCount(0);
  const account=payment.data.account('STUDENT');const login=await page.request.post('/api/v1/auth/login',{headers:{origin:'http://localhost:5173','x-csrf-protection':'1'},data:{email:account.email,password:account.password}});expect(login.status()).toBe(200);expect((await context.cookies()).some(cookie=>cookie.name==='av_session_dev')).toBe(true);await open(page,payment.orderId);await refresh(page);expect(payment.calls).toHaveLength(1);
});
test('EP08 desconexión en consulta anuncia error recuperable sin fabricar matrícula',async({page,context,payment})=>{
  await open(page,payment.orderId);await pay(page);await context.route('**/api/v1/enrollment/orders/*',route=>route.abort('failed'));await refresh(page);await expect(page.getByRole('alert')).toContainText(/incierto|consult|error/i);await context.unroute('**/api/v1/enrollment/orders/*');await refresh(page);expect(payment.calls).toHaveLength(1);expect(await payment.counts()).toMatchObject({enrollments:0});
});
