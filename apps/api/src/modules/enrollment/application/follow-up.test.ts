import { expect,test,vi } from 'vitest';
import { followUps } from '../../../../tests/support/follow-up-contract.js';
import type { FollowUpInput,FollowUpStore } from '../../../../tests/support/follow-up-contract.js';
const id='00000000-0000-4000-8000-000000000001',incident='00000000-0000-4000-8000-000000000002',command='00000000-0000-4000-8000-000000000003';
const actor={userId:id,sessionId:command,authVersion:0n,role:'ADMIN' as const},input={commandId:command,content:'Pendiente de investigación; sin resolución económica.'};
function fixture(){const append=vi.fn<FollowUpStore['append']>().mockResolvedValue({resource:{id,incidentId:incident,adminUserId:id,recordedAt:'2026-11-12T00:00:00.123456Z',content:input.content},command:{id:command,replayed:false}});return {append};}
test('FU01 US4.06 seguimiento conserva actor, identidad de comando y texto sin resolver economía',async()=>{
  const store=fixture(),result=await followUps(store).append(actor,incident,input,id);expect(store.append).toHaveBeenCalledExactlyOnceWith(actor,incident,input,id);
  expect(result).toMatchObject({resource:{incidentId:incident,adminUserId:id,content:input.content}});
});
for(const content of ['', ' \t\n ',null,42])test('FU02 US4.06 contenido inválido '+JSON.stringify(content)+' no escribe',async()=>{
  const store=fixture(),target=followUps(store);await expect(target.append(actor,incident,{...input,content} as FollowUpInput,id)).rejects.toMatchObject({code:'VALIDATION_ERROR'});expect(store.append).not.toHaveBeenCalled();
});
for(const field of ['incidentId','commandId','requestId'] as const)test('FU03 US4.06 UUID inválido '+field+' no escribe',async()=>{
  const store=fixture(),target=followUps(store);await expect(target.append(actor,field==='incidentId'?'inválido':incident,{...input,commandId:field==='commandId'?'inválido':command},field==='requestId'?'inválido':id)).rejects.toMatchObject({code:'VALIDATION_ERROR'});expect(store.append).not.toHaveBeenCalled();
});
test('FU04 US4.06 error temporal del store no se presenta como seguimiento registrado',async()=>{
  const store=fixture(),error=Object.assign(new Error('Temporal'),{code:'TEMPORARILY_UNAVAILABLE'});store.append.mockRejectedValueOnce(error);await expect(followUps(store).append(actor,incident,input,id)).rejects.toBe(error);
});
test('FU05 US4.06 conflicto del ledger se propaga sin crear otra identidad',async()=>{
  const store=fixture(),error=Object.assign(new Error('Conflicto'),{code:'IDEMPOTENCY_CONFLICT'});store.append.mockRejectedValueOnce(error);await expect(followUps(store).append(actor,incident,input,id)).rejects.toBe(error);expect(store.append).toHaveBeenCalledTimes(1);
});
