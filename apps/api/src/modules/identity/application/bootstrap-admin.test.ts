import { expect,test,vi } from 'vitest';
import { BootstrapAdmin } from './bootstrap-admin.js';
import { BootstrapAlreadyInitialized } from '../domain/bootstrap.js';
import { BootstrapUnavailable } from './identity-store.js';
import { CredentialUnavailable } from './credentials.js';

const input={name:' Administrador inicial ',email:'ADMIN@example.test',provisionalPassword:'Provisional de ensayo',requestId:'correlacion',origin:'127.0.0.1'};
function setup(){
  const order:string[]=[];
  const hash=vi.fn(async()=>{order.push('hash');return 'hash-preparado';});
  const prepareMessage=vi.fn(()=>{order.push('cifrado');return {tokenHash:new Uint8Array(32),
    payload:{encryptedPayload:new Uint8Array([1]),nonce:new Uint8Array(12),authTag:new Uint8Array(16),keyId:'test'}};});
  const bootstrap=vi.fn(async()=>{order.push('transaccion');return {userId:'id',email:'ADMIN@example.test',verificationQueued:true};});
  return {order,hash,prepareMessage,bootstrap,useCase:new BootstrapAdmin({bootstrap},{hash,verify:async()=>false},{prepareMessage})};
}
test('prepara hash/enlace antes del store y solo transmite material persistible, sin provisional',async()=>{
  const f=setup();const result=await f.useCase.execute(input);
  expect(f.order).toEqual(['hash','cifrado','transaccion']);
  const prepared=f.bootstrap.mock.calls[0] as unknown[];
  expect(JSON.stringify(prepared).includes(input.provisionalPassword)).toBe(false);
  expect(result).toEqual({userId:'id',email:'ADMIN@example.test',verificationQueued:true});
});
test('fallo de credenciales no inicia la transaccion ni emite un enlace',async()=>{
  const f=setup();f.hash.mockRejectedValue(new CredentialUnavailable());
  await expect(f.useCase.execute(input)).rejects.toBeInstanceOf(CredentialUnavailable);
  expect(f.bootstrap).not.toHaveBeenCalled();expect(f.prepareMessage).not.toHaveBeenCalled();
});
test('fallo de preparacion de enlace no toca store ni revela errores del adaptador',async()=>{
  const f=setup();f.prepareMessage.mockImplementation(()=>{throw new Error('señuelo privado');});
  await expect(f.useCase.execute(input)).rejects.toBeInstanceOf(BootstrapUnavailable);
  expect(f.bootstrap).not.toHaveBeenCalled();
});
test('conserva rechazo irreversible de T028 sin inventar otro camino de inicializacion',async()=>{
  const f=setup();f.bootstrap.mockRejectedValue(new BootstrapAlreadyInitialized());
  await expect(f.useCase.execute(input)).rejects.toBeInstanceOf(BootstrapAlreadyInitialized);
  expect(f.bootstrap).toHaveBeenCalledTimes(1);
});
