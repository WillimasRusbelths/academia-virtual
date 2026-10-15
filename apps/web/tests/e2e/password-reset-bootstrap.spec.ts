import { randomUUID } from 'node:crypto';
import { test,expect } from '../support/us6-fixture';
import { verificationLink,passwordResetLink } from '../support/us2-fixture';
import { runBootstrapDialogue } from '../../../api/tests/support/us6-cli.js';
import { accessSecrets } from '../../../api/src/modules/identity/infrastructure/credentials.js';

test.afterEach(async({page})=>{await page.locator('input[type="password"]').evaluateAll(inputs=>{
  for(const input of inputs)(input as HTMLInputElement).value='';}).catch(()=>undefined);});
test('primer ADMIN con provisional vencida: CLI → correo → recuperación → acceso normal sin repetir bootstrap',async({page,context,bootstrap})=>{
  test.setTimeout(45000);
  const f={name:'Administrador de recuperación',email:`${randomUUID()}@example.test`,provisional:accessSecrets.issue().secret,operatorRef:'op_recuperacion_us7'};
  const password=accessSecrets.issue().secret;const db=bootstrap.context.database.pool;
  const headers={Origin:'http://localhost:5173','X-CSRF-Protection':'1'};
  expect((await db.query('SELECT count(*)::int AS n FROM "User"')).rows[0].n).toBe(0);
  const result=await runBootstrapDialogue(bootstrap.context.environment,f);
  expect(result.code===0&&!result.output.includes(f.provisional)).toBe(true);
  const account=(await db.query('SELECT * FROM "User"')).rows[0];
  const marker=JSON.stringify((await db.query('SELECT * FROM "SystemState"')).rows);
  // Preparar solo datos del esquema t_*: envejecer ambos campos conserva el plazo de 24 h.
  // No cambia el reloj del equipo ni las cuentas manuales; no simula esperar un día real.
  await db.query(`UPDATE "User" SET "createdAt"="createdAt"-interval '25 hours',
    "provisionalExpiresAt"="provisionalExpiresAt"-interval '25 hours' WHERE id=$1`,[account.id]);
  expect((await db.query('SELECT "provisionalExpiresAt"<=clock_timestamp() AS expired FROM "User" WHERE id=$1',[account.id])).rows[0].expired).toBe(true);
  expect((await page.request.post('/api/v1/auth/login',{headers,data:{email:f.email,password:f.provisional}})).status()).toBe(401);
  const verify=await verificationLink(f.email,bootstrap.context.environment.appOrigin);
  try{await page.goto(verify);}catch{throw new Error('Enlace de ensayo no abierto. Valores omitidos.');}
  const confirmed=page.waitForResponse(value=>value.url().endsWith('/auth/verification/confirm'));
  await page.getByRole('button',{name:'Confirmar correo',exact:true}).click();expect((await confirmed).status()).toBe(204);
  await page.goto('/establecer-contrasena');
  try{await page.getByLabel('Correo',{exact:true}).fill(f.email);await page.getByLabel('Credencial provisional').fill(f.provisional);
    await page.getByLabel('Nueva contraseña',{exact:true}).fill(password);}
  catch{throw new Error('Formulario inicial no disponible. Valores omitidos.');}
  const initial=page.waitForResponse(value=>value.url().endsWith('/auth/password/initial'));
  await page.getByRole('button',{name:'Establecer contraseña',exact:true}).click();expect((await initial).status()).toBe(401);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('link',{name:'Recuperar contraseña',exact:true}).click();
  try{await page.getByLabel('Correo',{exact:true}).fill(f.email);}catch{throw new Error('Formulario de recuperación no disponible. Valores omitidos.');}
  const requested=page.waitForResponse(value=>value.url().endsWith('/auth/password/forgot'));
  await page.getByRole('button',{name:'Solicitar instrucciones',exact:true}).click();expect((await requested).status()).toBe(202);
  const link=await passwordResetLink(f.email,bootstrap.context.environment.appOrigin);
  try{await page.goto(link);}catch{throw new Error('Enlace de recuperación no abierto. Valores omitidos.');}
  const newPassword=page.getByLabel('Nueva contraseña',{exact:true});await expect(newPassword).toBeVisible();
  expect(await page.evaluate(()=>location.hash.length+location.search.length)).toBe(0);
  try{await newPassword.fill(password);await page.getByLabel('Confirmar nueva contraseña',{exact:true}).fill(password);}
  catch{throw new Error('Formulario de restablecimiento no disponible. Valores omitidos.');}
  const reset=page.waitForResponse(value=>value.url().endsWith('/auth/password/reset'));
  await page.getByRole('button',{name:'Restablecer contraseña',exact:true}).click();expect((await reset).status()).toBe(204);
  expect((await context.cookies()).some(cookie=>cookie.name==='av_session_dev')).toBe(false);
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  const after=(await db.query('SELECT * FROM "User"')).rows[0];
  expect(after.id===account.id&&after.role==='ADMIN'&&after.status==='ACTIVE'&&after.email===f.email&&after.emailVerifiedAt!==null
    &&after.mustSetPassword===false&&after.provisionalPasswordHash===null&&after.provisionalExpiresAt===null&&BigInt(after.authVersion)===1n).toBe(true);
  expect(JSON.stringify((await db.query('SELECT * FROM "SystemState"')).rows)===marker).toBe(true);
  expect((await db.query('SELECT count(*)::int AS n FROM "AuditEvent"')).rows[0].n).toBe(1);
  expect((await page.request.post('/api/v1/auth/login',{headers,data:{email:f.email,password:f.provisional}})).status()).toBe(401);
  expect((await page.request.post('/api/v1/auth/password/initial',{headers,data:{email:f.email,provisionalPassword:f.provisional,newPassword:password}})).status()).toBe(401);
  await page.getByRole('link',{name:'Iniciar sesión',exact:true}).click();
  try{await page.getByLabel('Correo',{exact:true}).fill(f.email);await page.getByLabel('Contraseña',{exact:true}).fill(password);}
  catch{throw new Error('Formulario de acceso no disponible. Valores omitidos.');}
  const login=page.waitForResponse(value=>value.url().endsWith('/auth/login'));
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();expect((await login).status()).toBe(200);
  await expect(page.getByText('Administrador',{exact:true})).toBeVisible();
  expect((await page.request.get('/api/v1/me')).status()).toBe(200);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length+location.hash.length+location.search.length)).toBe(0);
  expect(await page.evaluate(()=>history.state)).toBeNull();
});
