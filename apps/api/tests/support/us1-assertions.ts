import { expect } from 'vitest';
import type { FixtureAccount } from './identity-fixtures.js';
import type { Us1Http } from './us1-http.js';

// Comparar predicados evita que un fallo imprima cuerpos, cookies o credenciales.
export async function userView(response:Response,account:FixtureAccount) {
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(Object.keys(body)).toEqual(['data']);
  expect(Object.keys(body.data).sort()).toEqual(['id','name','email','role','status','emailVerified','mustSetPassword','createdAt'].sort());
  expect(body.data.id===account.id && body.data.email===account.email && body.data.name===account.name).toBe(true);
  expect(body.data.role===account.role && body.data.status==='ACTIVE').toBe(true);
  expect(body.data.emailVerified===true && body.data.mustSetPassword===false).toBe(true);
  expect(typeof body.data.createdAt==='string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(body.data.createdAt)
    && Number.isFinite(Date.parse(body.data.createdAt))).toBe(true);
  expect(response.headers.get('cache-control')).toBe('no-store');
}
export function cookieAttributes(value:string|null,http:Us1Http,cleared = false) {
  expect(value!==null).toBe(true);
  const header=value!;
  expect(header.startsWith(`${http.cookie.name}=`)).toBe(true);
  for (const attribute of ['Path=/','HttpOnly','SameSite=Lax',`Max-Age=${cleared?0:28800}`]) expect(header.includes(attribute)).toBe(true);
  expect(/;\s*Domain=/i.test(header)).toBe(false);
  expect(/;\s*Secure(?:;|$)/i.test(header)).toBe(http.origin.startsWith('https:'));
  const secret=header.split(';')[0].slice(http.cookie.name.length+1);
  expect(cleared?secret==='':/^[A-Za-z0-9_-]{43}$/.test(secret)).toBe(true);
  return secret;
}
export async function safeError(response:Response,status:number,code:string,secrets:string[] = []) {
  expect(response.status).toBe(status);
  const body=await response.json();
  expect(Object.keys(body)).toEqual(['error']);
  expect(Object.keys(body.error).sort()).toEqual(['code','message','requestId']);
  expect(body.error.code===code).toBe(true);
  expect(typeof body.error.message==='string' && body.error.message.length>0).toBe(true);
  expect(typeof body.error.requestId==='string' && /^[a-f0-9-]{36}$/.test(body.error.requestId)).toBe(true);
  const publicText=JSON.stringify(body);
  expect(secrets.every(secret=>!publicText.includes(secret))).toBe(true);
  expect(!/passwordHash|tokenHash|SELECT |Postgres|permission denied|stack|authVersion/.test(publicText)).toBe(true);
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('no-store');
  return {code:body.error.code,message:body.error.message};
}
