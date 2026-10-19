import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { test,expect } from '../support/us2-fixture';
import { seedAction } from '../../../api/tests/support/us2.js';
import type { Us2Dataset } from '../../../api/tests/support/us2.js';
import type { APIResponse } from '@playwright/test';

const origin='http://localhost:5173';
let attacker:Server;let hostileOrigin:string;
type Command={method:'POST'|'PATCH'|'PUT';path:string;body:Record<string,string>};
function commands(identity:Us2Dataset):Command[]{
  const f=identity.account();return [
    {method:'POST',path:'/auth/register',body:{name:'Registro hostil',email:`${randomUUID()}@example.test`,password:f.password}},
    {method:'POST',path:'/auth/verification/request',body:{email:identity.account('STUDENT','UNVERIFIED').email}},
    {method:'POST',path:'/auth/verification/confirm',body:{token:'A'.repeat(43)}},
    {method:'POST',path:'/auth/login',body:{email:f.email,password:f.password}},
    {method:'POST',path:'/auth/logout',body:{}},
    {method:'POST',path:'/auth/password/forgot',body:{email:f.email}},
    {method:'POST',path:'/auth/password/reset',body:{token:'A'.repeat(43),newPassword:f.password}},
    {method:'POST',path:'/auth/password/initial',body:{email:identity.account('TEACHER','PROVISIONAL').email,
      provisionalPassword:identity.account('TEACHER','PROVISIONAL').password,newPassword:f.password}},
    {method:'POST',path:'/admin/users',body:{name:'Alta hostil',email:`${randomUUID()}@example.test`,role:'ADMIN',provisionalPassword:f.password}},
    {method:'PATCH',path:`/admin/users/${f.id}/name`,body:{name:'Cambio hostil'}},
    {method:'PUT',path:`/admin/users/${f.id}/role`,body:{role:'ADMIN'}},
    {method:'PUT',path:`/admin/users/${f.id}/status`,body:{status:'DISABLED'}},
  ];
}
async function snapshot(identity:Us2Dataset){
  const values=[];for(const table of ['User','Session','ActionToken','MailDelivery','AuditEvent','SystemState','RateEvent','RateBucket'])
    values.push((await identity.context.database.pool.query(`SELECT * FROM "${table}" ORDER BY ${table==='RateBucket'?'key':'id'}`)).rows);
  return JSON.stringify(values); // Solo comparar booleanos; contiene hashes y nunca se imprime.
}
function closed(headers:Record<string,string>,proxied=true){
  expect.soft('access-control-allow-origin'in headers||'access-control-allow-credentials'in headers
    ||'access-control-allow-methods'in headers||'access-control-allow-headers'in headers,
  proxied?'US5_PENDING_PROXY_CORS: la respuesta proxificada agrega cabeceras CORS prohibidas por el contrato':'API directa: CORS cerrado').toBe(false);
  expect('set-cookie'in headers).toBe(false);
}
async function rejected(response:APIResponse,status=403,preflight=false,proxied=true){
  const proxyPreflight=preflight&&response.status()===204&&!!response.headers()['access-control-allow-origin']&&!!response.headers()['access-control-allow-methods'];
  if(proxyPreflight){
    expect.soft(response.status(),'US5_PENDING_PROXY_CORS: Vite responde 204 con permiso de preflight antes de la API').toBe(status);
    closed(response.headers(),proxied);return; // 204 no tiene el cuerpo JSON del 403 exigido.
  }
  expect(response.status()).toBe(status);closed(response.headers(),proxied);
  expect((await response.json()).error.code).toBe(status===415?'UNSUPPORTED_MEDIA_TYPE':'REQUEST_NOT_ALLOWED');
}
test.beforeEach(async({page,identity})=>{
  await identity.pauseMail();const actor=identity.account('ADMIN');
  const login=await page.request.post('/api/v1/auth/login',{headers:{Origin:origin,'X-CSRF-Protection':'1'},data:{email:actor.email,password:actor.password}});
  expect(login.status()).toBe(200);expect((await page.request.get('/api/v1/me')).status()).toBe(200);
  attacker=createServer((_request,response)=>{response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><html lang="es"><title>Origen de ensayo</title><body>Origen de ensayo</body></html>');});
  await new Promise<void>(resolve=>attacker.listen(0,'127.0.0.1',resolve));
  hostileOrigin=`http://localhost:${(attacker.address() as AddressInfo).port}`;
});
test.afterEach(async()=>{attacker?.closeAllConnections();if(attacker?.listening)await new Promise<void>(resolve=>attacker.close(()=>resolve()));});
test('control: mismo origen acepta JSON/CSRF y sesión real, incluso para una escritura administrativa',async({page,identity})=>{
  await page.goto('/inicio');await expect(page.getByText('Administrador',{exact:true})).toBeVisible();
  const f=identity.account();const response=await page.request.patch(`/api/v1/admin/users/${f.id}/name`,{
    headers:{Origin:origin,'X-CSRF-Protection':'1'},data:{name:f.name}});
  expect(response.status()).toBe(200);expect((await response.json()).data.id===f.id).toBe(true);
  expect((await page.context().cookies()).some(cookie=>cookie.name==='av_session_dev'&&cookie.httpOnly)).toBe(true);
});
test('control: API directa rechaza los doce endpoints hostiles y preflight sin cabeceras CORS ni efectos',async({page,identity})=>{
  const before=await snapshot(identity);
  for(const command of commands(identity)){
    await rejected(await page.request.fetch(identity.backendUrl+'/api/v1'+command.path,{method:command.method,
      headers:{Origin:hostileOrigin,'X-CSRF-Protection':'1'},data:command.body}),403,false,false);
    await rejected(await page.request.fetch(identity.backendUrl+'/api/v1'+command.path,{method:'OPTIONS',headers:{Origin:hostileOrigin,
      'Access-Control-Request-Method':command.method,'Access-Control-Request-Headers':'content-type,x-csrf-protection'}}),403,false,false);
  }
  expect(await snapshot(identity)===before).toBe(true);
});
for(const enctype of ['application/x-www-form-urlencoded','multipart/form-data','text/plain'])
test(`formularios nativos ${enctype} desde otro origen: 415 incluso con cookie real, sin efectos`,async({page,identity})=>{
  await page.goto(hostileOrigin);const before=await snapshot(identity);
  for(const command of commands(identity).filter(command=>command.method==='POST')){
    const waiting=page.waitForResponse(response=>response.url()===`${origin}/api/v1${command.path}`&&response.request().method()==='POST');
    try{await page.evaluate(({command,enctype,origin})=>{
      const frame=document.createElement('iframe');frame.name='destino';document.body.append(frame);
      const form=document.createElement('form');form.method='POST';form.action=origin+'/api/v1'+command.path;form.enctype=enctype;form.target='destino';
      for(const [name,value] of Object.entries(command.body)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);}
      document.body.append(form);form.submit();
    },{command,enctype,origin});}catch{throw new Error('Formulario hostil de ensayo no enviado. Valores omitidos.');}
    const response=await waiting;expect(response.status()).toBe(415);closed(await response.allHeaders());
    expect((await response.request().allHeaders()).cookie?.includes('av_session_dev=')).toBe(true);
    await page.evaluate(()=>{document.querySelectorAll('iframe,form').forEach(element=>element.remove());});
  }
  expect(await snapshot(identity)===before).toBe(true);
});
test('fetch hostil con JSON/cabecera: preflight cerrado y ninguna mutación pública o administrativa',async({page,identity})=>{
  await page.goto(hostileOrigin);const before=await snapshot(identity);
  for(const command of commands(identity)){
    const outcome=await page.evaluate(async({command,origin})=>{
      try{await fetch(origin+'/api/v1'+command.path,{method:command.method,credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Protection':'1'},body:JSON.stringify(command.body)});return 'EXPOSED';}
      catch{return 'BLOCKED';}
    },{command,origin});expect(outcome).toBe('BLOCKED');
    await rejected(await page.request.fetch('/api/v1'+command.path,{method:'OPTIONS',headers:{Origin:hostileOrigin,
      'Access-Control-Request-Method':command.method,'Access-Control-Request-Headers':'content-type,x-csrf-protection'}}),403,true);
  }
  expect(await snapshot(identity)===before).toBe(true);
});
test('fetch simple y lectura de perfil desde origen hostil no exponen respuesta con credenciales',async({page,identity})=>{
  await page.goto(hostileOrigin);const before=await snapshot(identity);
  for(const method of ['GET','POST']){
    const result=await page.evaluate(async({method,origin})=>{
      try{await fetch(origin+'/api/v1/'+(method==='GET'?'me':'auth/logout'),{method,credentials:'include',
        ...(method==='POST'?{headers:{'Content-Type':'text/plain'},body:'{}'}:{})});return 'EXPOSED';}catch{return 'BLOCKED';}
    },{method,origin});expect(result).toBe('BLOCKED');
  }
  expect(await snapshot(identity)===before).toBe(true);
  expect((await page.request.get('/api/v1/me')).status()).toBe(200);
});
test('sandbox opaco produce Origin null real: POST simple bloqueado sin cerrar la sesión',async({page,identity})=>{
  await page.goto(hostileOrigin);const before=await snapshot(identity);
  const result=await page.evaluate(async origin=>new Promise<string>(resolve=>{
    const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');
    const listener=(event:MessageEvent)=>{if(event.source===frame.contentWindow){window.removeEventListener('message',listener);frame.remove();resolve(event.origin+':'+event.data);}};
    window.addEventListener('message',listener);
    frame.srcdoc=`<script>fetch(${JSON.stringify(origin+'/api/v1/auth/logout')},{method:'POST',credentials:'include',headers:{'Content-Type':'text/plain'},body:'{}'}).then(()=>parent.postMessage('EXPOSED','*')).catch(()=>parent.postMessage('BLOCKED','*'))</script>`;
    document.body.append(frame);
  }),origin);
  expect(result).toBe('null:BLOCKED');expect(await snapshot(identity)===before).toBe(true);
});
for(const variant of ['origin-missing','origin-null','origin-foreign','loopback-alias','csrf-missing','csrf-wrong','cross-site'])
test(`control HTTP ${variant}: las doce mutaciones rechazan antes de las reglas de cuenta`,async({page,identity})=>{
  const before=await snapshot(identity);
  for(const command of commands(identity)){
    const headers:Record<string,string>={Origin:origin,'X-CSRF-Protection':'1'};
    if(variant==='origin-missing')delete headers.Origin;
    else if(variant==='origin-null')headers.Origin='null';
    else if(variant==='origin-foreign')headers.Origin=hostileOrigin;
    else if(variant==='loopback-alias')headers.Origin='http://127.0.0.1:5173';
    else if(variant==='csrf-missing')delete headers['X-CSRF-Protection'];
    else if(variant==='csrf-wrong')headers['X-CSRF-Protection']='true';
    else headers['Sec-Fetch-Site']='cross-site';
    await rejected(await page.request.fetch('/api/v1'+command.path,{method:command.method,headers,data:command.body}));
  }
  expect(await snapshot(identity)===before).toBe(true);
});
test('GET/HEAD de ambos enlaces no consumen ni mutan; la SPA retira secretos y exige confirmación',async({page,identity})=>{
  const verification=await seedAction(identity,'VERIFY_EMAIL');const reset=await seedAction(identity,'RESET_PASSWORD');
  const before=await snapshot(identity);let mutations=0;
  page.on('request',request=>{if(request.url().includes('/api/v1/')&&['POST','PATCH','PUT'].includes(request.method()))mutations++;});
  for(const item of [{fixture:verification,api:'/auth/verification/confirm',heading:'Verificar correo'},
    {fixture:reset,api:'/auth/password/reset',heading:'Restablecer contraseña'}]){
    for(const method of ['GET','HEAD']){
      const response=await page.request.fetch('/api/v1'+item.api,{method,headers:{Origin:hostileOrigin}});
      expect(response.status()).toBe(404);closed(response.headers());
    }
    try{await page.goto(item.fixture.link);}catch{throw new Error('Enlace de ensayo no abierto. Valores omitidos.');}
    await expect(page.getByRole('heading',{name:item.heading,exact:true})).toBeVisible();
    expect(await page.evaluate(()=>location.hash.length+location.search.length)).toBe(0);
  }
  expect(mutations).toBe(0);expect(await snapshot(identity)===before).toBe(true);
});
