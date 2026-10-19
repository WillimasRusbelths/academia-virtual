import { expect } from 'vitest';
import type { Us2Dataset } from './us2.js';
import { seedAction } from './us2.js';
import { generic202 } from './us2-assertions.js';
import { adminSnapshot } from './us4.js';
import type { FixtureAccount } from './identity-fixtures.js';

export const forgotPath='/auth/password/forgot';
export const resetPath='/auth/password/reset';
export const accountSnapshot=adminSnapshot;

/** El marcador solo clasifica el 404 seguro real; cualquier otro fallo sigue siendo inesperado. */
export async function resetStatus(response:Response,status:number){
  if(response.status===404&&status!==404){
    const body=await response.clone().json();
    expect(body.error?.code).toBe('NOT_FOUND');
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
  expect(response.status,response.status===404&&status!==404?'US7_PENDING_HTTP: ruta forgot/reset aún ausente':'Contrato de recuperación').toBe(status);
}
export async function forgotAccepted(response:Response,secrets:string[]=[]){
  await resetStatus(response,202);return generic202(response,secrets);
}
export async function resetError(response:Response,status:number,code:string,secrets:string[]=[]){
  await resetStatus(response,status);const body=await response.json();
  expect(Object.keys(body)).toEqual(['error']);
  expect(body.error.code).toBe(code);
  expect(Object.keys(body.error).every(key=>['code','message','requestId','fields'].includes(key))).toBe(true);
  expect(typeof body.error.message==='string'&&/^[a-f0-9-]{36}$/.test(body.error.requestId)).toBe(true);
  if(body.error.fields)expect(Array.isArray(body.error.fields)&&body.error.fields.every((field:Record<string,unknown>)=>
    Object.keys(field).sort().join(',')==='field,message'&&['email','token','newPassword','password'].includes(String(field.field))&&field.message==='Campo inválido.')).toBe(true);
  const text=JSON.stringify(body);
  expect(secrets.every(secret=>!text.includes(secret))&&!/passwordHash|tokenHash|authVersion|encryptedPayload|SELECT |stack/.test(text)).toBe(true);
  expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('set-cookie')).toBeNull();
  return {code:body.error.code,message:body.error.message};
}
export async function resetAccepted(response:Response){
  await resetStatus(response,204);expect(await response.text()).toBe('');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('set-cookie')).toBe('av_session_dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}
/** Fixture explícita: no emite mediante el flujo público que aún debe implementarse. */
export async function resetFixture(data:Us2Dataset,account:FixtureAccount=data.account(),delivery=false){
  const fixture=await seedAction(data,'RESET_PASSWORD',delivery);
  if(account.id!==fixture.account.id)await data.context.database.pool.query(
    'UPDATE "ActionToken" SET "userId"=$2,"emailCanonicalSnapshot"=$3 WHERE id=$1',[fixture.id,account.id,account.email]);
  return {...fixture,account};
}
