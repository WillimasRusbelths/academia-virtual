import { expect } from 'vitest';

export const instructions='Si la cuenta cumple las condiciones, recibirás instrucciones. Si no llegan, revisa tu correo o solicita un nuevo envío.';

export async function generic202(response:Response,secrets:string[]=[]) {
  expect(response.status).toBe(202);
  const text=await response.text();
  expect(text.includes(instructions)).toBe(true);
  expect(secrets.every(secret=>!text.includes(secret))).toBe(true);
  expect(!/passwordHash|tokenHash|authVersion|emailVerified|mustSetPassword|"role"|"id"/.test(text)).toBe(true);
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  return JSON.parse(text);
}
export async function registrationError(response:Response,status:number,code:string,secrets:string[]=[]) {
  expect(response.status).toBe(status);const body=await response.json();
  expect(Object.keys(body).join(',')==='error').toBe(true);
  expect(body.error.code===code && typeof body.error.message==='string' && body.error.message.length>0).toBe(true);
  expect(/^[a-f0-9-]{36}$/.test(body.error.requestId)).toBe(true);
  expect(Object.keys(body.error).every(key=>['code','message','requestId','fields'].includes(key))).toBe(true);
  if(body.error.fields!==undefined) {
    expect(Array.isArray(body.error.fields)).toBe(true);
    expect(body.error.fields.every((field:Record<string,unknown>)=>Object.keys(field).sort().join(',')==='field,message'
      && ['name','email','password','token'].includes(String(field.field)) && typeof field.message==='string')).toBe(true);
  }
  const text=JSON.stringify(body);
  expect(secrets.every(secret=>!text.includes(secret))).toBe(true);
  expect(!/passwordHash|tokenHash|SELECT |Postgres|permission denied|stack|authVersion/.test(text)).toBe(true);
  expect(response.headers.get('set-cookie')).toBeNull();expect(response.headers.get('cache-control')).toBe('no-store');
  return {code:body.error.code,message:body.error.message};
}
