import { expect, test } from '@playwright/test';

for (const size of [{width:360,height:800},{width:1366,height:768}]) {
  test(`campos y mensajes comunes en ${size.width}x${size.height}`,async ({page}) => {
    await page.setViewportSize(size);await page.goto('/');
    // Montaje aislado con el runtime de la aplicación, sin rutas ni flags de producto para tests.
    await page.evaluate(async () => {
      const resources=performance.getEntriesByType('resource').map(resource => resource.name);
      const reactPath=resources.find(resource => new URL(resource).pathname.endsWith('/react.js'));
      const domPath=resources.find(resource => new URL(resource).pathname.endsWith('/react-dom_client.js'));
      if (!reactPath || !domPath) throw new Error('Runtime de la aplicación no encontrado para el ensayo.');
      const fieldPath='/src/shared/ui/form-field.tsx';const feedbackPath='/src/shared/ui/feedback.tsx';
      const apiPath='/src/shared/api-client.ts';
      const [reactModule,domModule,field,feedback,api]=await Promise.all([import(reactPath),import(domPath),import(fieldPath),import(feedbackPath),import(apiPath)]);
      const react=reactModule.default??reactModule;const dom=domModule.default??domModule;
      const container=document.createElement('div');document.body.appendChild(container);
      dom.createRoot(container).render(react.createElement('main',{style:{maxWidth:'32rem',margin:'1rem auto'}},
        react.createElement(field.FormField,{id:'email',label:'Correo',type:'email',error:'Revisa el correo.'}),
        react.createElement(field.FormField,{id:'password',label:'Contraseña',type:'password',autoComplete:'off'}),
        react.createElement(feedback.Feedback,{error:new api.ApiFailure(429,'RATE_LIMITED','Espera antes de volver a intentarlo.',60)})));
    });
    await expect(page.getByLabel('Correo')).toHaveAttribute('aria-describedby','email-error');
    await expect(page.getByRole('alert')).toContainText('60 segundos');
    await page.keyboard.press('Tab');await expect(page.getByLabel('Correo')).toBeFocused();
    await page.keyboard.press('Tab');await expect(page.getByLabel('Contraseña')).toBeFocused();
    await page.getByLabel('Contraseña').fill('dato-sintetico-solo-en-memoria');
    expect(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    expect(await page.evaluate(() => localStorage.length+sessionStorage.length)).toBe(0);
    await page.reload();await expect(page.getByRole('heading',{name:'Academia virtual'})).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('input[type="password"]')===null)).toBe(true);
  });
}

test('cliente real en navegador usa cookie HttpOnly, JSON y CSRF del mismo origen',async ({page,context}) => {
  const base = new URL(test.info().project.use.baseURL!);
  await context.addCookies([{name:'av_session_dev',value:'synthetic-transport-only',url:base.origin,httpOnly:true,sameSite:'Lax'}]);
  let headers:Record<string,string> = {};let body='';let calls=0;
  await page.route('**/api/v1/auth/logout',async route => {
    calls++;headers=await route.request().allHeaders();body=route.request().postData()??'';
    await route.fulfill({status:204,headers:{'Cache-Control':'no-store'}});
  });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const modulePath='/src/app/http.ts';const {createApiClient}=await import(modulePath);
    const value=await createApiClient(() => undefined).request('/auth/logout',{method:'POST'});
    return {empty:value===undefined,httpOnly:!document.cookie.includes('av_session_dev')};
  });
  expect(result).toEqual({empty:true,httpOnly:true});expect(calls).toBe(1);
  expect(headers['content-type']).toBe('application/json');expect(headers['x-csrf-protection']).toBe('1');
  expect(headers.origin).toBe(base.origin);expect(headers.cookie.includes('synthetic-transport-only')).toBe(true);
  expect('authorization' in headers).toBe(false);expect(body).toBe('{}');
});

test('router conectado responde a navegación y al botón atrás sin guardar formularios',async ({page}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath='/src/app/router.tsx';const {navigate}=await import(modulePath);navigate('/pagina-no-disponible');
  });
  await expect(page.getByRole('heading',{name:'Página no disponible'})).toBeVisible();
  expect(await page.evaluate(() => history.state)).toBeNull();
  await page.goBack();await expect(page.getByRole('heading',{name:'Academia virtual'})).toBeVisible();
});
