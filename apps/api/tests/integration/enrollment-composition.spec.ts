import { expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { processingFixture } from '../support/reservation-processing.js';
import { us1Http } from '../support/us1-http.js';

test('EC01 arranque procesa admisión durable y cierre espera al despachador antes del pool',async()=>{
  const f=await processingFixture();
  let http:Awaited<ReturnType<typeof us1Http>>|undefined;
  try{
    const input=f.selection([f.groupId,f.otherGroupId]);
    await f.target().admit(f.actor,input,randomUUID());
    expect((await f.row(input.intentionId)).state).toBe('ADMITTED');
    http=await us1Http({context:f,reservationWorker:true});
    await expect.poll(async()=>(await f.row(input.intentionId)).state,{timeout:10000}).toBe('CONFIRMED');
    const row=await f.row(input.intentionId);
    const response=await http.get('/enrollment/orders/'+row.orderId,f.student.secret);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({id:row.orderId,totalMinor:'25000',items:expect.any(Array)});
    expect(await f.counts()).toMatchObject({requests:1,orders:1,seats:2});
    // Un despacho en vuelo debe terminar mientras el pool todavía acepta conexiones.
    const lock=await f.pool.connect();
    try{
      await lock.query('BEGIN');await lock.query('SELECT id FROM "DispatchState" WHERE id=1 FOR UPDATE');
      await expect.poll(async()=>Number((await f.pool.query(`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%DispatchState%'`)).rows[0].n),{timeout:10000}).toBeGreaterThan(0);
      let ended=false;const closing=http.close().then(()=>{ended=true;});
      await new Promise(resolve=>setTimeout(resolve,50));expect(ended).toBe(false);
      await lock.query('COMMIT');await closing;http=undefined;
    }finally{await lock.query('ROLLBACK');lock.release();}
    const before=await f.counts();await new Promise(resolve=>setTimeout(resolve,300));expect(await f.counts()).toEqual(before);
  }finally{await http?.close();await f.close();}
},120000);
