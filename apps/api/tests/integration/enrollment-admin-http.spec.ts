import { randomUUID } from 'node:crypto';
import { expect,test } from 'vitest';
import { adminFixture,economicFingerprint } from '../support/enrollment-admin.js';
import type { AdminFixture } from '../support/enrollment-admin.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
function check(name:string,work:(f:AdminFixture)=>Promise<void>){test(name,async()=>{const f=await adminFixture();try{await work(f);}finally{await f.close();}},120000);}
async function error(response:Response,status:number,code:string){expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toBe('no-store');const body=await response.json();expect(body.error).toMatchObject({code,requestId:expect.any(String)});expect(JSON.stringify(body)).not.toMatch(/fixture audit failure|23514|INSERT INTO|stack|cause|passwordHash|providerPayload/);return body;}
for(const kind of ['order','incident'] as const)check('AH01 US4.06 detalle '+kind+' inexistente404 sin efectos',async f=>{
  const before=await financialFingerprint(f.pool);await error(await f.request('GET','/admin/enrollment/'+(kind==='order'?'orders/':'incidents/')+randomUUID()),404,'NOT_FOUND');expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const route of ['orders','incidents','orders/detail','incidents/detail'])check('AH02 US4.06 query desconocida en '+route+' rechazada',async f=>{
  const path=route==='orders/detail'?'orders/'+f.orderId:route==='incidents/detail'?'incidents/'+f.incidentId:route,before=await financialFingerprint(f.pool);
  await error(await f.request('GET','/admin/enrollment/'+path+'?unknown=1'),400,'VALIDATION_ERROR');expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const content of ['', ' \t\n ',null,42])check('AH03 US4.06 contenido inválido '+JSON.stringify(content)+' no escribe',async f=>{
  const before=await financialFingerprint(f.pool);await error(await f.follow({...f.command(),content}),400,'VALIDATION_ERROR');expect(await financialFingerprint(f.pool)).toBe(before);
});
for(const field of ['origin','x-csrf-protection'] as const)check('AH04 US4.07 falta '+field+' rechazada sin anotación',async f=>{
  const headers:Record<string,string>=f.http.headers(f.admin.secret);delete headers[field];const before=await financialFingerprint(f.pool);
  await error(await fetch(f.http.url+'/api/v1/admin/enrollment/incidents/'+f.incidentId+'/follow-ups',{method:'POST',headers,body:JSON.stringify(f.command())}),403,'REQUEST_NOT_ALLOWED');expect(await financialFingerprint(f.pool)).toBe(before);
});
check('AH05 US4.07 Origin ajeno rechaza seguimiento sin efectos',async f=>{
  const before=await financialFingerprint(f.pool);await error(await f.request('POST','/admin/enrollment/incidents/'+f.incidentId+'/follow-ups',f.command(),f.admin.secret,{origin:'https://other.example.test'}),403,'REQUEST_NOT_ALLOWED');expect(await financialFingerprint(f.pool)).toBe(before);
});
check('AH06 US4.06 límite16KiB y tipo de contenido se mantienen',async f=>{
  const before=await financialFingerprint(f.pool);await error(await f.follow({...f.command(),content:'x'.repeat(17000)}),413,'VALIDATION_ERROR');
  await error(await f.request('POST','/admin/enrollment/incidents/'+f.incidentId+'/follow-ups',f.command(),f.admin.secret,{'content-type':'text/plain'}),415,'UNSUPPORTED_MEDIA_TYPE');expect(await financialFingerprint(f.pool)).toBe(before);
});
check('AH07 US4.06 seguimiento a incidencia ausente no consume commandId',async f=>{
  const before=await financialFingerprint(f.pool);await error(await f.request('POST','/admin/enrollment/incidents/'+randomUUID()+'/follow-ups',f.command()),404,'NOT_FOUND');expect(await f.counts()).toEqual({notes:0,commands:0,audits:0});expect(await financialFingerprint(f.pool)).toBe(before);
});
check('AH08 US4.06 UUID canónico recupera mismo seguimiento por HTTP',async f=>{
  const input={...f.command(),commandId:'abcdefab-cdef-4abc-8def-abcdefabcdef'},before=await economicFingerprint(f.pool),first=await f.follow(input);expect(first.status).toBe(200);const a=(await first.json()).data;
  const replay=await f.follow({...input,commandId:input.commandId.toUpperCase()});expect(replay.status).toBe(200);const b=(await replay.json()).data;expect(b.resource).toEqual(a.resource);expect(b.command.replayed).toBe(true);expect(b.command.id).toBe(input.commandId);expect(await f.counts()).toEqual({notes:1,commands:1,audits:1});expect(await economicFingerprint(f.pool)).toBe(before);
});
for(const operation of ['resolve','refund','transfer','enroll','confirm-payment','cancel'])check('AH09 US4.08 operación manual '+operation+' no existe',async f=>{
  const before=await financialFingerprint(f.pool);await error(await f.request('POST','/admin/enrollment/incidents/'+f.incidentId+'/'+operation,f.command()),404,'NOT_FOUND');expect(await financialFingerprint(f.pool)).toBe(before);
});
check('AH10 US4.06 fallo de auditoría devuelve error seguro y cero cambios parciales',async f=>{
  await f.isolated.ownerQuery(`CREATE FUNCTION reject_http_follow_up_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit failure' USING ERRCODE='23514'; END $$; CREATE TRIGGER reject_http_follow_up_audit BEFORE INSERT ON "EnrollmentAuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_http_follow_up_audit();`);
  const before=await financialFingerprint(f.pool);await error(await f.follow(f.command()),503,'TEMPORARILY_UNAVAILABLE');expect(await financialFingerprint(f.pool)).toBe(before);expect(await f.counts()).toEqual({notes:0,commands:0,audits:0});
});
