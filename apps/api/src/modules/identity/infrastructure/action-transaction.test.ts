import { expect,test,vi } from 'vitest';
import type { Pool } from 'pg';
import { actionTransaction } from './action-transaction.js';
import { ActionLinkUnavailable } from '../application/issue-action-link.js';

function harness(mode:'ack'|'retry'|'persistent'|'rollback') {
  let commits=0;
  const release=vi.fn();const client={on:vi.fn(),removeListener:vi.fn(),release,
    query:vi.fn(async(text:string)=>{
      if(text==='COMMIT') {
        commits++;
        if(mode==='ack')throw new Error('Resultado de commit desconocido.');
        if(mode!=='retry'||commits<=2)throw Object.assign(new Error('Conflicto de ensayo.'),{code:'40P01'});
      }
      if(text==='ROLLBACK'&&mode==='rollback')throw new Error('Conexión no disponible.');
      return {rows:[]};
    })};
  const connect=vi.fn(async()=>client);
  // Doble del protocolo pg exclusivamente para fallos de acuse de recibo y conexión.
  const pool={connect} as unknown as Pool;
  return {pool,connect,release,client,commits:()=>commits};
}
test('acuse de commit incierto devuelve error seguro sin repetir la operación',async()=>{
  const f=harness('ack');const operation=vi.fn(async()=>undefined);
  await expect(actionTransaction(f.pool,operation)).rejects.toBeInstanceOf(ActionLinkUnavailable);
  expect(operation).toHaveBeenCalledTimes(1);expect(f.commits()).toBe(1);expect(f.connect).toHaveBeenCalledTimes(1);
});
test('dos conflictos abortados con rollback confirmado permiten un tercer intento',async()=>{
  const f=harness('retry');const operation=vi.fn(async()=>42);
  expect(await actionTransaction(f.pool,operation)).toBe(42);
  expect(operation).toHaveBeenCalledTimes(3);expect(f.commits()).toBe(3);
});
test('conflicto persistente no supera tres intentos',async()=>{
  const f=harness('persistent');await expect(actionTransaction(f.pool,async()=>undefined)).rejects.toBeInstanceOf(ActionLinkUnavailable);
  expect(f.connect).toHaveBeenCalledTimes(3);
});
test('sin rollback confirmado no reintenta y descarta el cliente fallido',async()=>{
  const f=harness('rollback');await expect(actionTransaction(f.pool,async()=>undefined)).rejects.toBeInstanceOf(ActionLinkUnavailable);
  expect(f.connect).toHaveBeenCalledTimes(1);expect(f.release).toHaveBeenCalledWith(true);
});
