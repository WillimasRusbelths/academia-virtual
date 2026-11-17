import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { createMaterialsFoundation } from '../../src/app.module.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import { materialsFixture, type MaterialsFixture } from '../support/materials.js';
import { materialsTemporalFixture } from '../support/materials-temporal.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { barrier, within, instrumentMaterialsPool } from '../support/materials-testing.js';
import { waitForBlockedBy } from '../support/locks.js';
import { us1Http } from '../support/us1-http.js';

let f:MaterialsFixture,teacher:SessionActor,financial:string;
beforeAll(async()=>{f=await materialsFixture();teacher=(await new PostgresSessionStore(f.pool).lookup(f.teacher.secret))!;},120000);
afterAll(async()=>{await f?.cleanup();});
beforeEach(async()=>{financial=await financialFingerprint(f.pool);});
afterEach(async()=>{expect(await financialFingerprint(f.pool)).toBe(financial);});
type Action='edit'|'publish'|'withdraw';
const request=(revision='1')=>({commandId:randomUUID(),expectedRevision:revision});
const root=()=>createMaterialsFoundation(f.environment,f.pool);
const execute=(action:Action,id:string,input:ReturnType<typeof request>)=>action==='edit'
  ?root().commands.edit(teacher,id,{...input,title:'Correccion concurrente',description:null}):root().commands[action](teacher,id,input);
async function receipt(commandId:string) {
  return (await f.pool.query(`SELECT (SELECT count(*)::int FROM "MaterialCommand" WHERE "commandId"=$1) AS commands,
    (SELECT count(*)::int FROM "MaterialAuditEvent" WHERE "commandId"=$1) AS audits`,[commandId])).rows[0];
}
test.each<[Action,Action]>([['edit','publish'],['publish','edit'],['edit','withdraw'],['withdraw','edit'],['publish','withdraw'],['withdraw','publish']])(
  '%s wins the observed PG lock; stale concurrent %s has no ledger or audit',async(firstAction,secondAction)=>{
    const item=await f.seedMaterial('PREPARED'),a=request(),b=request(),gate=barrier();let held=false,pid=0;
    const restore=instrumentMaterialsPool(f.pool,async(sql,run,client)=>{
      if(!held&&/UPDATE "Material" SET/.test(sql)){held=true;pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;gate.enter();await gate.released;}return run();
    });
    const first=execute(firstAction,item.id,a);void first.catch(()=>undefined);let second:typeof first|undefined;
    try{await within(gate.entered);second=execute(secondAction,item.id,b);void second.catch(()=>undefined);
      await waitForBlockedBy(f.pool,pid);gate.release();expect((await first).resource.revision).toBe('2');
      await expect(second).rejects.toMatchObject({code:'MATERIAL_VERSION_CONFLICT'});
    }finally{gate.release();await Promise.allSettled([first,...(second?[second]:[])]);restore();}
    expect(await receipt(a.commandId)).toEqual({commands:1,audits:1});expect(await receipt(b.commandId)).toEqual({commands:0,audits:0});
  });
test.each([false,true])('concurrent command identity: different payload=%s resolves only after lock and never duplicates audit',async(different)=>{
  const item=await f.seedMaterial('PREPARED'),body=request(),gate=barrier();let held=false,pid=0;
  const restore=instrumentMaterialsPool(f.pool,async(sql,run,client)=>{
    if(!held&&/UPDATE "Material" SET/.test(sql)){held=true;pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;gate.enter();await gate.released;}return run();
  });
  const first=execute('edit',item.id,body);void first.catch(()=>undefined);let second:typeof first|undefined;
  try{await within(gate.entered);second=root().commands.edit(teacher,item.id,{...body,title:different?'Otra correccion':'Correccion concurrente',description:null});void second.catch(()=>undefined);
    await waitForBlockedBy(f.pool,pid);gate.release();await first;
    if(different)await expect(second).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    else expect(await second).toMatchObject({resource:{revision:'2'},command:{replayed:true,appliedRevision:'2'}});
  }finally{gate.release();await Promise.allSettled([first,...(second?[second]:[])]);restore();}
  expect(await receipt(body.commandId)).toEqual({commands:1,audits:1});
});
test('reassignment committed while command waits is rediscovered before mutation or receipt',async()=>{
  const item=await f.seedMaterial('PREPARED'),body=request(),writer=await f.pool.connect();let pending:ReturnType<typeof execute>|undefined;
  try{
    await writer.query('BEGIN');await writer.query('SELECT id FROM "AcademicCourse" WHERE id=$1 FOR UPDATE',[f.courseId]);
    await writer.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.groupId]);
    const pid=(await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending=execute('edit',item.id,body);void pending.catch(()=>undefined);await waitForBlockedBy(f.pool,pid);
    await writer.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2',[f.otherTeacher.userId,f.groupId]);await writer.query('COMMIT');
    await expect(pending).rejects.toMatchObject({code:'NOT_FOUND'});
  }finally{await writer.query('ROLLBACK');writer.release();if(pending)await Promise.allSettled([pending]);
    await f.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1 WHERE id=$2',[teacher.userId,f.groupId]);}
  expect(await receipt(body.commandId)).toEqual({commands:0,audits:0});
  expect((await f.pool.query('SELECT state,revision::text FROM "Material" WHERE id=$1',[item.id])).rows[0]).toEqual({state:'PREPARED',revision:'1'});
});
test.each<Action>(['edit','publish','withdraw'])('%s session expires after ledger/audit callback but before commit: everything rolls back',async action=>{
  const temporal=await materialsTemporalFixture();let restore:undefined|(()=>void),pending:ReturnType<typeof execute>|undefined;
  try{
    await temporal.set(temporal.base+60_000_000n);
    const actor=(await new PostgresSessionStore(temporal.pool).lookup(temporal.teacher.secret))!,item=await temporal.seedMaterial('PREPARED'),body=request();
    const before=(await temporal.pool.query('SELECT to_jsonb(m) AS row FROM "Material" m WHERE id=$1',[item.id])).rows[0].row,gate=barrier();
    restore=instrumentMaterialsPool(temporal.pool,async(sql,run)=>{
      const result=await run();if(sql.includes('INSERT INTO "MaterialAuditEvent"')){gate.enter();await gate.released;}return result;
    });
    const api=createMaterialsFoundation(temporal.environment,temporal.pool).commands;
    pending=action==='edit'?api.edit(actor,item.id,{...body,title:'Cambio que revierte',description:null}):api[action](actor,item.id,body);void pending.catch(()=>undefined);
    try{await within(gate.entered);
      // Only the schema clock moves; touching Session here would block on its lock.
      await temporal.pool.query('UPDATE "MaterialsTestClock" SET instant=instant+interval \'8 hours\' WHERE id=1');gate.release();
      await expect(pending).rejects.toMatchObject({code:'AUTH_REQUIRED'});
    }finally{gate.release();await Promise.allSettled([pending]);restore();restore=undefined;}
    expect((await temporal.pool.query('SELECT to_jsonb(m) AS row FROM "Material" m WHERE id=$1',[item.id])).rows[0].row).toEqual(before);
    expect((await temporal.pool.query('SELECT count(*)::int AS n FROM "MaterialCommand" WHERE "commandId"=$1',[body.commandId])).rows[0].n).toBe(0);
    expect((await temporal.pool.query('SELECT count(*)::int AS n FROM "MaterialAuditEvent" WHERE "commandId"=$1',[body.commandId])).rows[0].n).toBe(0);
  }finally{restore?.();await temporal.cleanup();}
},120000);
test('withdrawal waits for authorized bytea read; requests started after withdrawal cannot read it',async()=>{
  const item=await f.seedMaterial('PUBLISHED'),http=await us1Http({context:f}),gate=barrier();let pid=0,held=false;
  const restore=instrumentMaterialsPool(http.database.pool,async(sql,run,client)=>{
    if(!held&&/SELECT/.test(sql)&&/"MaterialContent"/.test(sql)&&/\bbytes\b/.test(sql)){
      held=true;pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;gate.enter();await gate.released;
    }return run();
  });
  const get=()=>http.get('/materials/items/'+item.id+'/content',f.student.secret),download=get();void download.catch(()=>undefined);
  let withdrawal:ReturnType<typeof execute>|undefined;
  try{await within(gate.entered);withdrawal=execute('withdraw',item.id,request('2'));void withdrawal.catch(()=>undefined);
    await waitForBlockedBy(f.pool,pid);gate.release();const authorized=await download;expect(authorized.status).toBe(200);await authorized.arrayBuffer();
    await withdrawal;expect((await get()).status).toBe(404);
  }finally{gate.release();await Promise.allSettled([download,...(withdrawal?[withdrawal]:[])]);restore();await http.close();}
});
test('withdrawal can commit while an already authorized HTTP response is held; those bytes are not recalled',async()=>{
  const item=await f.seedMaterial('PUBLISHED'),http=await us1Http({context:f}),gate=barrier();
  const expected=(await f.pool.query('SELECT bytes FROM "MaterialContent" WHERE "materialId"=$1',[item.id])).rows[0].bytes;
  let outgoing:ServerResponse|undefined,end:ServerResponse['end']|undefined,args:unknown[]=[];
  const observe=(req:IncomingMessage,res:ServerResponse)=>{if(req.url!=='/api/v1/materials/items/'+item.id+'/content')return;
    outgoing=res;end=res.end;res.end=function(this:ServerResponse,...values:unknown[]){args=values;gate.enter();return this;} as ServerResponse['end'];};
  const server=http.app.getHttpServer();server.prependListener('request',observe);
  // Content-Length lets the client finish reading before server.end. Prevent it
  // reusing that deliberately unfinished connection for the next request.
  const pending=http.get('/materials/items/'+item.id+'/content',f.student.secret,{connection:'close'});void pending.catch(()=>undefined);
  try{await within(gate.entered);server.off('request',observe);await execute('withdraw',item.id,request('2'));
    expect((await http.get('/materials/items/'+item.id+'/content',f.student.secret)).status).toBe(404);
    outgoing!.end=end!;Reflect.apply(end!,outgoing,args);const response=await within(pending);expect(response.status).toBe(200);expect(Buffer.from(await within(response.arrayBuffer()))).toEqual(expected);
  }finally{server.off('request',observe);if(outgoing&&end)outgoing.end=end;outgoing?.destroy();await Promise.allSettled([pending]);await http.close();}
});
