import { randomUUID } from 'node:crypto';
import { test,expect } from '../support/us6-fixture';
import { verificationLink } from '../support/us2-fixture';
import { runBootstrapDialogue } from '../../../api/tests/support/us6-cli.js';
import { accessSecrets } from '../../../api/src/modules/identity/infrastructure/credentials.js';

for(const order of ['cambiar-primero','verificar-primero'])test(`CLI → Mailpit → activación → acceso ADMIN (${order})`,async({page,context,bootstrap})=>{
  test.setTimeout(45000);
  const f={name:'Administrador de ensayo completo',email:`${randomUUID()}@example.test`,provisional:accessSecrets.issue().secret,operatorRef:'op_ensayo_us6'};
  const password=accessSecrets.issue().secret;const database=bootstrap.context.database.pool;
  expect((await database.query('SELECT count(*)::int AS n FROM "User"')).rows[0].n).toBe(0);
  const result=await runBootstrapDialogue(bootstrap.context.environment,f);
  expect(result.code).toBe(0);expect(result.output.includes(f.provisional)).toBe(false);
  const account=(await database.query('SELECT * FROM "User"')).rows[0];
  expect(account.role==='ADMIN'&&account.status==='ACTIVE'&&account.mustSetPassword&&account.emailVerifiedAt===null).toBe(true);
  const link=await verificationLink(f.email,bootstrap.context.environment.appOrigin);
  await expect.poll(async()=>(await database.query('SELECT status FROM "MailDelivery"')).rows[0].status).toBe('SENT');
  const headers={Origin:'http://localhost:5173','X-CSRF-Protection':'1'};
  expect((await page.request.post('/api/v1/auth/login',{headers,data:{email:f.email,password:f.provisional}})).status()).toBe(401);
  const verify=async()=>{
    try{await page.goto(link);}catch{throw new Error('Enlace de ensayo no abierto. Valores omitidos.');}
    await expect.poll(()=>page.evaluate(()=>location.hash.length+location.search.length)).toBe(0);
    const confirm=page.waitForResponse(value=>value.url().endsWith('/auth/verification/confirm'));
    await page.getByRole('button',{name:'Confirmar correo'}).click();expect((await confirm).status()).toBe(204);
    await expect(page.getByRole('link',{name:'Establecer contraseña propia'})).toHaveAttribute('href','/establecer-contrasena');
  };
  if(order==='verificar-primero'){
    await verify();expect((await page.request.post('/api/v1/auth/login',{headers,data:{email:f.email,password:f.provisional}})).status()).toBe(401);
  }
  await page.goto('/establecer-contrasena');
  try{await page.getByLabel('Correo',{exact:true}).fill(f.email);await page.getByLabel('Credencial provisional').fill(f.provisional);await page.getByLabel('Nueva contraseña').fill(password);}
  catch{throw new Error('Formulario inicial no disponible. Valores omitidos.');}
  const initial=page.waitForResponse(value=>value.url().endsWith('/auth/password/initial'));
  await page.getByRole('button',{name:'Establecer contraseña',exact:true}).click();expect((await initial).status()).toBe(204);
  expect((await context.cookies()).some(cookie=>cookie.name==='av_session_dev')).toBe(false);
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  expect(await page.locator('input[type="password"]').evaluateAll(inputs=>inputs.every(input=>(input as HTMLInputElement).value===''))).toBe(true);
  if(order==='cambiar-primero'){
    expect((await page.request.post('/api/v1/auth/login',{headers,data:{email:f.email,password}})).status()).toBe(401);
    await verify();
  }
  expect((await page.request.post('/api/v1/auth/password/initial',{headers,data:{email:f.email,provisionalPassword:f.provisional,newPassword:password}})).status()).toBe(401);
  await page.goto('/login');
  try{await page.getByLabel('Correo',{exact:true}).fill(f.email);await page.getByLabel('Contraseña',{exact:true}).fill(password);}
  catch{throw new Error('Formulario de acceso no disponible. Valores omitidos.');}
  const login=page.waitForResponse(value=>value.url().endsWith('/auth/login'));
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();expect((await login).status()).toBe(200);
  await expect(page).toHaveURL(/\/inicio$/);await expect(page.getByText('Administrador',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText('Administrador',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length+location.hash.length+location.search.length)).toBe(0);
  expect(await page.evaluate(()=>history.state)).toBeNull();
  const repeat=await runBootstrapDialogue(bootstrap.context.environment,{...f,email:`${randomUUID()}@example.test`,provisional:accessSecrets.issue().secret});
  expect(repeat.code===0).toBe(false);
  expect((await database.query('SELECT count(*)::int AS n FROM "User"')).rows[0].n).toBe(1);
  expect((await database.query('SELECT count(*)::int AS n FROM "AuditEvent"')).rows[0].n).toBe(1);
  const delivery=(await database.query('SELECT status FROM "MailDelivery"')).rows[0];expect(delivery.status).toBe('SENT');
});
