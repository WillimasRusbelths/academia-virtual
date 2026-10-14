import { expect,test,vi } from 'vitest';
import { IssueActionLink } from './issue-action-link.js';
import type { ActionLinkStore,ActionLinkLimits,ActionLinkAccount } from './issue-action-link.js';
import type { TokenPurpose } from '../domain/access.js';

const account:ActionLinkAccount={id:'interno',email:'alumno@example.test',emailCanonical:'alumno@example.test',status:'ACTIVE',emailVerifiedAt:null};
const payload={encryptedPayload:new Uint8Array([1]),nonce:new Uint8Array(12),authTag:new Uint8Array(16),keyId:'test'};
const secrets={issue:()=>({secret:'A'.repeat(43),digest:new Uint8Array(32)}),digest:()=>null};
function setup(allowed=true){
  const order:string[]=[];
  const limits:ActionLinkLimits={admitMail:vi.fn(async()=>{order.push('cuota');return {allowed,retryAfterSeconds:allowed?0:60};}),
    mailKeys:()=>({recipientKey:'r',originKey:'o'})};
  const store:ActionLinkStore={replace:vi.fn(async(email,prepare)=>{order.push('cuenta');return prepare(account,new Date('2026-10-14T12:00:00Z'))!==null;})};
  const encrypt=vi.fn(()=>payload);const links=new IssueActionLink(store,limits,secrets,{encrypt},'http://localhost:5173');
  return {order,store,limits,encrypt,links};
}
test('cuota antes de store; factory cifra enlace de origen fijo y no devuelve secreto',async()=>{
  const f=setup();const result=await f.links.execute({email:account.email,purpose:'VERIFY_EMAIL',origin:'127.0.0.1'});
  expect(f.order).toEqual(['cuota','cuenta']);expect(result).toEqual({admitted:true,queued:true,retryAfterSeconds:0});
  expect(f.encrypt).toHaveBeenCalledWith({recipient:account.email,template:'VERIFY_EMAIL',link:'http://localhost:5173/verificar-correo#'+'A'.repeat(43)});
});
test('sin cuota no toca store, generador de payload ni cuenta',async()=>{
  const f=setup(false);expect(await f.links.execute({email:account.email,purpose:'VERIFY_EMAIL',origin:'127.0.0.1'})).toEqual({admitted:false,queued:false,retryAfterSeconds:60});
  expect(f.store.replace).not.toHaveBeenCalled();expect(f.encrypt).not.toHaveBeenCalled();
});
for(const purpose of ['VERIFY_EMAIL','RESET_PASSWORD'] as TokenPurpose[])test(`factory ${purpose} conserva caducidad y elegibilidad de dominio`,async()=>{
  const f=setup();const admission=await f.links.admit({email:account.email,purpose,origin:'127.0.0.1'});
  expect(admission.allowed).toBe(true);if(!admission.allowed)throw new Error('Admisión de ensayo no disponible.');
  const user={...account,emailVerifiedAt:purpose==='RESET_PASSWORD'?new Date('2026-10-14T11:00:00Z'):null};
  const now=new Date('2026-10-14T12:00:00Z');const prepared=admission.prepare(user,now);
  expect(prepared!==null && prepared.expiresAt.getTime()-now.getTime()===(purpose==='VERIFY_EMAIL'?86400000:1800000)).toBe(true);
  expect(admission.prepare({...user,status:'DISABLED'},now)).toBeNull();
  expect(admission.prepare({...user,emailCanonical:'otra@example.test'},now)).toBeNull();
});
