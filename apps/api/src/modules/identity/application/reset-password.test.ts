import { expect,test,vi } from 'vitest';
import { ResetPassword } from './reset-password.js';
import { RequestPasswordReset } from './request-password-reset.js';
import { InvalidActionLink } from './verify-email.js';
import { CredentialUnavailable } from './credentials.js';
import { AccountValidationError } from '../../users/public/account.js';
import type { AccountAccess,ActionAccess } from '../domain/access.js';

const password='Contraseña de prueba';const digest=new Uint8Array(32).fill(1);
function harness(accepted=true){
  const consume=vi.fn(async()=>accepted);const hash=vi.fn(async()=> 'hash-de-ensayo');
  const secrets={issue:()=>({secret:'secreto-sintético',digest}),digest:(secret:string)=>secret==='secreto-sintético'?digest:null};
  const credentials={hash,verify:async()=>false};
  return {consume,hash,secrets,credentials,reset:new ResetPassword({consume},credentials,secrets)};
}
test('contraseña inválida no invoca hash, repositorio ni consumo',async()=>{
  const h=harness();await expect(h.reset.execute({token:'secreto-sintético',newPassword:'corta'})).rejects.toBeInstanceOf(AccountValidationError);
  expect(h.hash).not.toHaveBeenCalled();expect(h.consume).not.toHaveBeenCalled();
});
test('token mal formado no invoca hash ni repositorio',async()=>{
  const h=harness();await expect(h.reset.execute({token:['no convertir'],newPassword:password})).rejects.toBeInstanceOf(InvalidActionLink);
  expect(h.hash).not.toHaveBeenCalled();expect(h.consume).not.toHaveBeenCalled();
});
test('fallo de hash deja sin invocar el repositorio',async()=>{
  const h=harness();h.hash.mockRejectedValueOnce(new CredentialUnavailable());
  await expect(h.reset.execute({token:'secreto-sintético',newPassword:password})).rejects.toBeInstanceOf(CredentialUnavailable);
  expect(h.consume).not.toHaveBeenCalled();
});
test('repositorio que rechaza consumo produce únicamente InvalidActionLink',async()=>{
  const h=harness(false);await expect(h.reset.execute({token:'secreto-sintético',newPassword:password})).rejects.toBeInstanceOf(InvalidActionLink);
  expect(h.consume).toHaveBeenCalledTimes(1);
});
test('hash finaliza antes del repositorio; la regla pura exige verificación, propósito y caducidad vigentes',async()=>{
  const h=harness();let hashed=false;let invoked=false;
  const account:AccountAccess={status:'ACTIVE',emailCanonical:'alumno@example.test',emailVerifiedAt:new Date(0),
    mustSetPassword:false,passwordHash:'hash-anterior',authVersion:0n,createdAt:new Date(0)};
  const token:ActionAccess={purpose:'RESET_PASSWORD',emailCanonicalSnapshot:account.emailCanonical,
    createdAt:new Date(0),expiresAt:new Date(1800000),consumedAt:null,revokedAt:null};
  const reset=new ResetPassword({async consume(received,newHash,accepts){
    invoked=true;expect(hashed&&received===digest&&newHash==='hash-de-ensayo').toBe(true);
    expect(accepts(account,token,new Date(1799999))).toBe(true);
    expect(accepts(account,token,new Date(1800000))).toBe(false);
    expect(accepts({...account,emailVerifiedAt:null},token,new Date(1))).toBe(false);
    expect(accepts({...account,status:'DISABLED'},token,new Date(1))).toBe(false);
    expect(accepts(account,{...token,purpose:'VERIFY_EMAIL'},new Date(1))).toBe(false);
    return true;
  }},{...h.credentials,async hash(){hashed=true;expect(invoked).toBe(false);return 'hash-de-ensayo';}},h.secrets);
  await reset.execute({token:'secreto-sintético',newPassword:password});expect(invoked).toBe(true);
});
test('solicitar reutiliza emisión con propósito reset y responde igual con o sin entrega',async()=>{
  for(const queued of [true,false]){
    const request=new RequestPasswordReset({async execute(input){
      expect(input.purpose==='RESET_PASSWORD'&&input.email==='alumno@example.test'&&input.origin==='origen-de-ensayo').toBe(true);
      return {admitted:true,queued,retryAfterSeconds:0};
    }});
    expect(await request.execute({email:'alumno@example.test',origin:'origen-de-ensayo'})).toBeUndefined();
  }
});
test('cuota denegada conserva la espera definida por emisión',async()=>{
  const request=new RequestPasswordReset({execute:async()=>({admitted:false,queued:false,retryAfterSeconds:60})});
  await expect(request.execute({email:'alumno@example.test',origin:'origen-de-ensayo'})).rejects.toMatchObject({code:'RATE_LIMITED',retryAfterSeconds:60});
});
