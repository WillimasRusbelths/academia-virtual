import { afterEach, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createApiClient } from './http';
import { ApiFailure, RequestCancelled } from '../shared/api-client';
import { FormField } from '../shared/ui/form-field';
import { Feedback } from '../shared/ui/feedback';
import { navigate } from './router';

afterEach(() => { vi.restoreAllMocks();vi.unstubAllGlobals(); });
function response(status:number,code?:string,headers?:HeadersInit) {
  const responseHeaders = new Headers(headers);responseHeaders.set('Content-Type','application/json');
  return new Response(status===204?null:JSON.stringify(code?{error:{code,message:'Contenido remoto omitido',requestId:'untrusted'}}:{data:{name:'Ensayo'}}),
    {status,headers:responseHeaders});
}

test('JSON relativo, CSRF fijo y cookie gestionada por navegador sin leer secretos',async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(response(200));
  const client = createApiClient(vi.fn(),transport);
  const marker = 'credencial-sintetica-de-ensayo';
  const storage = {setItem:vi.fn(),getItem:vi.fn()};vi.stubGlobal('localStorage',storage);vi.stubGlobal('sessionStorage',storage);
  await client.request('/auth/login',{method:'POST',body:{email:'ensayo@example.test',password:marker}});
  const [url,request] = transport.mock.calls[0];expect(url).toBe('/api/v1/auth/login');
  expect(request?.credentials).toBe('same-origin');expect(request?.mode).toBe('same-origin');
  expect(request?.cache).toBe('no-store');expect(request?.redirect).toBe('error');
  const headers = new Headers(request?.headers);expect(headers.get('X-CSRF-Protection')).toBe('1');
  expect(headers.get('Content-Type')).toBe('application/json');expect(headers.has('Authorization')).toBe(false);expect(headers.has('Cookie')).toBe(false);
  expect(typeof request?.body==='string' && JSON.parse(request.body).password===marker).toBe(true);
  expect(storage.setItem).not.toHaveBeenCalled();expect(storage.getItem).not.toHaveBeenCalled();
});

test.each(['https://remote.invalid/auth/login','//remote.invalid','/../me','/me?token=secret','/me#secret','/me%2Fsecret'])(
  'rechaza URL no permitida %s sin contactar transporte',async path => {
    const transport = vi.fn<typeof fetch>();const client = createApiClient(vi.fn(),transport);
    await expect(client.request(path)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
    expect(transport).not.toHaveBeenCalled();
  });

test('GET sin cuerpo, 204 sin JSON y 202 no se interpreta como correo entregado',async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(204)).mockResolvedValueOnce(response(202));
  const client = createApiClient(vi.fn(),transport);
  expect(await client.request('/me')).toEqual({name:'Ensayo'});
  expect(transport.mock.calls[0][1]?.body).toBeUndefined();
  expect(await client.request('/auth/logout',{method:'POST'})).toBeUndefined();
  expect(transport.mock.calls[1][1]?.body).toBe('{}');
  expect(await client.request('/auth/verification/request',{method:'POST',body:{email:'ensayo@example.test'}})).toBeUndefined();
});

test.each(['60','0','invalid', '999999999999999999999999'])('429 muestra solo espera válida; Retry-After %s, sin replay',async retry => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(response(429,'RATE_LIMITED',{'Retry-After':retry}));
  const client = createApiClient(vi.fn(),transport);
  let failure:unknown;try { await client.request('/auth/login',{method:'POST',body:{}}); } catch (error) { failure=error; }
  expect(failure instanceof ApiFailure).toBe(true);
  expect((failure as ApiFailure).retryAfterSeconds).toBe(['60','0'].includes(retry)?Number(retry):undefined);
  expect(transport).toHaveBeenCalledTimes(1);
});

test.each(['network','503','malformed','unknown-code'] as const)('fallo %s es seguro, exige reintento manual y no afirma éxito',async kind => {
  const marker = 'dato-remoto-sensible-de-ensayo';
  const transport = vi.fn<typeof fetch>();
  if (kind==='network') transport.mockRejectedValue(new Error(marker));
  else if (kind==='malformed') transport.mockResolvedValue(new Response(marker,{status:200}));
  else transport.mockResolvedValue(response(503,kind==='503'?'TEMPORARILY_UNAVAILABLE':marker));
  let failure:unknown;try { await createApiClient(vi.fn(),transport).request('/auth/login',{method:'POST',body:{password:marker}}); } catch (error) { failure=error; }
  expect(failure instanceof ApiFailure).toBe(true);expect((failure as ApiFailure).status).toBe(503);
  expect(String(failure).includes(marker)).toBe(false);expect(transport).toHaveBeenCalledTimes(1);
});

test('401 de credenciales se distingue de expiración y no invalida otra sesión',async () => {
  const clear = vi.fn();const transport = vi.fn<typeof fetch>().mockResolvedValue(response(401,'INVALID_CREDENTIALS'));
  await expect(createApiClient(clear,transport).request('/auth/login',{method:'POST'})).rejects.toMatchObject({code:'INVALID_CREDENTIALS'});
  expect(clear).not.toHaveBeenCalled();
});

test('401 AUTH_REQUIRED limpia datos y cancela respuestas tardías, sin repetir mutación',async () => {
  let complete!: (value:Response)=>void;
  const delayed = new Promise<Response>(resolve => { complete=resolve; });
  const transport = vi.fn<typeof fetch>().mockReturnValueOnce(delayed).mockResolvedValueOnce(response(401,'AUTH_REQUIRED'));
  const state:{profile:unknown;password:unknown;queued:unknown;path:string} = {profile:{name:'Ensayo'},password:'sintética',queued:{mutation:true},path:'/inicio'};
  const clear = vi.fn(() => { state.profile=null;state.password=null;state.queued=null;state.path='/login'; });
  const client = createApiClient(clear,transport);
  const mutation = client.request('/admin/users/test-id/name',{method:'PATCH',body:{name:'Ensayo'}});
  const rejection = expect(mutation).rejects.toThrow(RequestCancelled);
  await expect(client.request('/me')).rejects.toMatchObject({code:'AUTH_REQUIRED'});
  complete(response(200));await rejection;
  expect(state).toEqual({profile:null,password:null,queued:null,path:'/login'});expect(clear).toHaveBeenCalledTimes(1);
  expect(transport).toHaveBeenCalledTimes(2);expect(transport.mock.calls[0][1]?.signal?.aborted).toBe(true);
});

test('cancelación explícita no se convierte en éxito ni provoca replay',async () => {
  const controller = new AbortController();controller.abort();
  const transport = vi.fn<typeof fetch>().mockResolvedValue(response(200));
  await expect(createApiClient(vi.fn(),transport).request('/me',{signal:controller.signal})).rejects.toThrow(RequestCancelled);
  expect(transport).not.toHaveBeenCalled();
});

test('errores de campo descartan valores y mensajes remotos, conservan nombres aprobados',async () => {
  const marker = 'secreto-de-ensayo';
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({error:{code:'VALIDATION_ERROR',message:marker,
    fields:[{field:'password',message:marker},{field:marker,message:marker}]}}),{status:400}));
  let failure:unknown;try { await createApiClient(vi.fn(),transport).request('/auth/login',{method:'POST'}); } catch (error) { failure=error; }
  expect((failure as ApiFailure).fields).toEqual(['password']);expect(String(failure).includes(marker)).toBe(false);
});

test('campos con etiqueta/error asociados y mensajes escapados; reintento solo manual',() => {
  const field = renderToStaticMarkup(createElement(FormField,{id:'password',label:'Contraseña',type:'password',error:'Revisa el campo.'}));
  expect(field).toContain('for="password"');expect(field).toContain('aria-describedby="password-error"');expect(field).toContain('aria-invalid="true"');
  const retry = vi.fn();const output = renderToStaticMarkup(createElement(Feedback,{error:new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','<sin éxito>'),onRetry:retry}));
  expect(output).toContain('role="alert"');expect(output).toContain('&lt;sin éxito&gt;');expect(output).toContain('type="button"');
  expect(retry).not.toHaveBeenCalled();
});

test('router usa historial sin datos sensibles, reemplaza al expirar y rechaza destinos externos',() => {
  const browser = new EventTarget();const pushState=vi.fn();const replaceState=vi.fn();
  vi.stubGlobal('window',{history:{pushState,replaceState},dispatchEvent:browser.dispatchEvent.bind(browser)});
  navigate('/inicio');navigate('/login',true);
  expect(pushState).toHaveBeenCalledWith(null,'','/inicio');expect(replaceState).toHaveBeenCalledWith(null,'','/login');
  expect(() => navigate('//remote.invalid')).toThrow('Destino de navegación inválido.');
  expect(() => navigate('/login?password=secret')).toThrow('Destino de navegación inválido.');
});
