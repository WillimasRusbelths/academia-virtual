import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { preEnrollmentDatabase, seedEnrollmentGraph } from '../support/enrollment-migration.js';
import { instrumentPool, latch } from '../support/academic-foundation-contract.js';
import { waitForBlockedBy } from '../support/locks.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';
import { createEnrollmentTransaction, createSystemEnrollmentTransaction } from '../../src/infrastructure/database/enrollment-transaction.js';
import type { EnrollmentTransactionContext, UserEnrollmentWork } from '../../src/infrastructure/database/enrollment-transaction.js';
import type { EnrollmentTopology, TemporalDecision } from '../../src/modules/enrollment/application/ports.js';
import { createEnrollmentFinancialParticipant, createEnrollmentParticipants, discoverEnrollmentTopology } from '../../src/modules/enrollment/infrastructure/enrollment-store.js';
import { instantFromEpochText, postgresInstantParameter } from '../../src/modules/enrollment/infrastructure/temporal.js';

async function fixture() {
  const context = await preEnrollmentDatabase();
  try {
    await context.applyEnrollment(); const graph = await seedEnrollmentGraph(context);
    const pool = context.database.pool, authorization = new PostgresSessionStore(pool);
    const actor = (await authorization.lookup(context.admin.secret))!;
    const topology: EnrollmentTopology = {
      accountIds:[context.admin.userId,context.student.userId,context.teacher.userId], courseIds:[context.courseId], groupIds:[context.groupId],
      orderIds:[String(graph.rows.EnrollmentOrder!.id)], attemptIds:[String(graph.rows.PaymentAttempt!.id)], receiptIds:[String(graph.rows.ProviderReceipt!.id)],
      paymentIds:[String(graph.rows.VerifiedPayment!.id),String(graph.incidentPayment.id)],
      enrollmentIds:[String(graph.rows.Enrollment!.id)], incidentIds:[String(graph.rows.PaymentIncident!.id)],
    };
    function work<T>(apply: UserEnrollmentWork<T>['apply']): UserEnrollmentWork<T> {
      return {actor,permission:'enrollment:price-manage',discover:async()=>topology,recheck:async()=>topology,apply};
    }
    return {...context,graph,pool,authorization:{revalidateInTransaction:authorization.revalidateInTransaction.bind(authorization),
      preserve:(error:unknown)=>error instanceof Error && error.name==='AssertionError'},actor,topology,work};
  } catch(error) { await context.cleanup(); throw error; }
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function foundation(name:string, operation:(f:Fixture)=>Promise<void>) {
  test(name,async()=>{ const f=await fixture(); try { await operation(f); } finally { await f.cleanup(); } },120000);
}
async function price(f:Fixture) { return (await f.pool.query('SELECT "amountMinor"::text FROM "CoursePrice" WHERE "courseId"=$1',[f.courseId])).rows[0].amountMinor; }
/** Escrituras de fixture para probar atomicidad; NO es el escritor de auditoría T015. */
async function effect(f:Fixture,c:EnrollmentTransactionContext,commandId:string,fail?:'LEDGER'|'AUDIT') {
  const at=postgresInstantParameter(c.decision.at);
  await c.client.query('UPDATE "CoursePrice" SET "amountMinor"=20000,revision=revision+1,"changedAt"=$2 WHERE "courseId"=$1',[f.courseId,at]);
  if(fail==='LEDGER')await c.client.query("DO $$ BEGIN RAISE SQLSTATE '22000'; END $$");
  await c.client.query(`INSERT INTO "EnrollmentCommand" ("actorKind","actorReference","commandId",operation,"payloadDigest","outcomeCode","resourceReferences","resultingRevision","appliedAt")
    VALUES ('ACCOUNT',$1,$2,'COURSE_PRICE_SET',$3,'APPLIED',$4,2,$5)`,[f.actor.userId,commandId,randomBytes(32),JSON.stringify({courseId:f.courseId}),at]);
  if(fail==='AUDIT')await c.client.query("DO $$ BEGIN RAISE SQLSTATE '22000'; END $$");
  await c.client.query(`INSERT INTO "EnrollmentAuditEvent" ("actorKind","actorReference",operation,"targetKind","targetId","commandId","requestId","occurredAt","beforeRevision","afterRevision",result)
    VALUES ('ACCOUNT',$1,'COURSE_PRICE_SET','COURSE',$2,$3,$4,$5,1,2,'APPLIED')`,[f.actor.userId,f.courseId,commandId,randomUUID(),at]);
}
async function effects(f:Fixture,id:string) {
  return (await f.pool.query(`SELECT (SELECT count(*)::integer FROM "EnrollmentCommand" WHERE "commandId"=$1) AS commands,
    (SELECT count(*)::integer FROM "EnrollmentAuditEvent" WHERE "commandId"=$1) AS audits`,[id])).rows[0];
}

foundation('EF01 orden global, una conexión y token exacto tras recheck/validación',async f=>{
  const trace=instrumentPool(f.pool); let rechecked=false,validated=false;
  const run=createEnrollmentTransaction(trace.pool,f.authorization);
  await run({...f.work(async c=>{
    expect(rechecked&&validated).toBe(true); expect(Object.isFrozen(c.decision)).toBe(true);
    expect(Object.isFrozen(c.locked.groupIds)).toBe(true); expect(typeof c.decision.at).toBe('bigint');
    c.assertDecision(c.decision); expect(()=>c.assertDecision({at:c.decision.at} as TemporalDecision)).toThrow();
    expect((await c.client.query('SHOW transaction_isolation')).rows[0].transaction_isolation).toBe('read committed');
    expect((await c.client.query('SHOW lock_timeout')).rows[0].lock_timeout).toBe('3s');
  }),recheck:async()=>{rechecked=true;return f.topology;},validate:async()=>{validated=true;}});
  const locking=trace.statements.filter(s=>/FOR (UPDATE|SHARE)/.test(s.sql));
  const families=['User','Session','AcademicCourse','AcademicGroup','EnrollmentOrder','EnrollmentOrderItem','SeatReservation','ReservationRequest',
    'PaymentAttempt','ProviderReceipt','VerifiedPayment','Enrollment','PaymentIncident'];
  const positions=families.map(table=>locking.findIndex(s=>new RegExp('FROM "'+table+'"(?: |\\n)').test(s.sql)));
  expect(positions.every(p=>p>=0)).toBe(true); expect(positions).toEqual([...positions].sort((a,b)=>a-b));
  // La autoridad existente vuelve a bloquear una sola cuenta/sesión ya cubiertas.
  for(const s of locking.filter(s=>s.sql.includes('ANY(')))expect(s.sql).toMatch(/ORDER BY/);
  expect(new Set(trace.pids).size).toBe(1); expect(trace.pids).toHaveLength(1);
  expect(trace.statements.filter(s=>s.sql.includes('clock_timestamp()'))).toHaveLength(2); // identidad existente + captura financiera
  expect(trace.statements.some(s=>/AdmissionSequence|DispatchState|SKIP LOCKED/.test(s.sql))).toBe(false);
  expect(trace.statements.at(-1)?.sql).toBe('COMMIT');
});
foundation('EF02 espera real de grupo, relee estado y captura t después de liberar el bloqueo',async f=>{
  const holder=await f.pool.connect();let pending:Promise<unknown>|undefined;
  try {
    await holder.query('BEGIN'); const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.groupId]);
    const run=createEnrollmentTransaction(f.pool,f.authorization);
    pending=run({...f.work(async c=>c.decision.at),validate:async client=>{
      expect((await client.query('SELECT revision::text FROM "AcademicGroup" WHERE id=$1',[f.groupId])).rows[0].revision).toBe('2');
    }}); const settled=pending.then(value=>({value}),error=>({error}));
    await waitForBlockedBy(f.pool,pid);
    await holder.query('UPDATE "AcademicGroup" SET revision=2 WHERE id=$1',[f.groupId]);
    const released=(await holder.query('SELECT (extract(epoch FROM clock_timestamp())*1000000)::numeric(30,0)::text AS at')).rows[0].at;
    await holder.query('COMMIT'); const result=await settled;
    expect(result).toHaveProperty('value'); expect((result as {value:bigint}).value>=instantFromEpochText(released)).toBe(true);
  } finally {await holder.query('ROLLBACK');holder.release();await pending?.catch(()=>undefined);}
});
for(const loss of ['session','role','status'] as const)foundation('EF03 reautoriza después de esperar cuenta: '+loss,async f=>{
  const holder=await f.pool.connect();const apply=vi.fn(async()=>undefined);let pending:Promise<unknown>|undefined;
  try {
    await holder.query('BEGIN');const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',[f.actor.userId]);
    pending=createEnrollmentTransaction(f.pool,f.authorization)(f.work(apply));const settled=pending.then(value=>({value}),error=>({error}));
    await waitForBlockedBy(f.pool,pid);
    if(loss==='session')await holder.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[f.actor.sessionId]);
    if(loss==='role')await holder.query(`UPDATE "User" SET role='STUDENT' WHERE id=$1`,[f.actor.userId]);
    if(loss==='status')await holder.query(`UPDATE "User" SET status='DISABLED',"disabledAt"=clock_timestamp() WHERE id=$1`,[f.actor.userId]);
    await holder.query('COMMIT');expect(await settled).toMatchObject({error:{code:loss==='role'?'FORBIDDEN':'AUTH_REQUIRED'}});
    expect(apply).not.toHaveBeenCalled();expect(await price(f)).toBe('12500');
  } finally {await holder.query('ROLLBACK');holder.release();await pending?.catch(()=>undefined);}
});
foundation('EF04 cambio de topología aborta y redescubre dentro del mismo presupuesto',async f=>{
  const second=(await f.pool.query(`INSERT INTO "AcademicGroup" ("courseId",name) VALUES ($1,'Segundo ficticio') RETURNING id`,[f.courseId])).rows[0].id;
  let checks=0,effects=0;const trace=instrumentPool(f.pool);
  await createEnrollmentTransaction(trace.pool,f.authorization)({...f.work(async()=>{effects++;}),
    discover:async()=>({...f.topology,groupIds:checks?[f.groupId,second]:[f.groupId]}),
    recheck:async()=>{checks++;return {...f.topology,groupIds:[f.groupId,second]};}});
  expect(checks).toBe(2);expect(effects).toBe(1);expect(trace.pids).toHaveLength(2);
  expect(trace.statements.filter(s=>s.sql==='ROLLBACK')).toHaveLength(1);
});
for(const omitted of ['courseIds','accountIds','orderIds','paymentIds','groupIds'] as const)foundation('EF05 no decide con cobertura incompleta '+omitted,async f=>{
  const missing={...f.topology,[omitted]:[]};const trace=instrumentPool(f.pool),apply=vi.fn(async()=>undefined);
  await expect(createEnrollmentTransaction(trace.pool,f.authorization)({...f.work(apply),discover:async()=>missing,recheck:async()=>missing})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(apply).not.toHaveBeenCalled();expect(trace.pids).toHaveLength(3);expect(await price(f)).toBe('12500');
});
for(const code of ['40001','40P01'] as const)foundation('EF06 SQLSTATE real inyectado '+code+' comparte tres intentos y rollback',async f=>{
  const trace=instrumentPool(f.pool);let calls=0;
  const value=await createEnrollmentTransaction(trace.pool,f.authorization)(f.work(async c=>{
    calls++;await c.client.query('UPDATE "CoursePrice" SET "amountMinor"="amountMinor"+1 WHERE "courseId"=$1',[f.courseId]);
    if(calls<3)await c.client.query(`DO $$ BEGIN RAISE SQLSTATE '${code}'; END $$`);return 42;
  }));
  expect(value).toBe(42);expect(calls).toBe(3);expect(trace.pids).toHaveLength(3);expect(await price(f)).toBe('12501');
});
foundation('EF07 topología que cambia persistentemente no produce bucle 3x3',async f=>{
  const trace=instrumentPool(f.pool);const apply=vi.fn(async()=>undefined);
  await expect(createEnrollmentTransaction(trace.pool,f.authorization)({...f.work(apply),recheck:async()=>({...f.topology,receiptIds:[]})})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(trace.pids).toHaveLength(3);expect(apply).not.toHaveBeenCalled();
});
foundation('EF08 timeout 55P03 real no se reintenta ni produce efecto',async f=>{
  const holder=await f.pool.connect();const trace=instrumentPool(f.pool);let pending:Promise<unknown>|undefined;
  try {
    await holder.query('BEGIN');await holder.query('SELECT id FROM "AcademicGroup" WHERE id=$1 FOR UPDATE',[f.groupId]);
    pending=createEnrollmentTransaction(trace.pool,f.authorization)(f.work(async()=>undefined));
    await expect(pending).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});expect(trace.pids).toHaveLength(1);expect(await price(f)).toBe('12500');
  } finally {await holder.query('ROLLBACK');holder.release();await pending?.catch(()=>undefined);}
});
for(const failed of ['LEDGER','AUDIT'] as const)foundation('EF09 rollback conjunto al fallar '+failed+' de fixture',async f=>{
  const id=randomUUID();await expect(createEnrollmentTransaction(f.pool,f.authorization)(f.work(c=>effect(f,c,id,failed)))).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(await effects(f,id)).toEqual({commands:0,audits:0});expect(await price(f)).toBe('12500');
});
for(const phase of ['before','after'] as const)foundation('EF10 acuse COMMIT perdido '+phase+' no repite y consulta resultado durable',async f=>{
  const id=randomUUID();let commits=0,applies=0;
  const fault=(sql:string)=>{if(sql==='COMMIT'){commits++;throw new Error('Acuse de ensayo perdido.');}};
  const trace=instrumentPool(f.pool,phase==='before'?{before:fault}:{after:fault});
  await expect(createEnrollmentTransaction(trace.pool,f.authorization)(f.work(async c=>{applies++;await effect(f,c,id);}))).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(commits).toBe(1);expect(applies).toBe(1);expect(trace.pids).toHaveLength(1);
  expect(await effects(f,id)).toEqual({commands:phase==='after'?1:0,audits:phase==='after'?1:0});
  expect(await price(f)).toBe(phase==='after'?'20000':'12500');
});
foundation('EF11 sin rollback confirmado descarta conexión y no reintenta',async f=>{
  const trace=instrumentPool(f.pool,{before:sql=>{if(sql==='ROLLBACK')throw new Error('Transporte interrumpido de ensayo.');}});
  await expect(createEnrollmentTransaction(trace.pool,f.authorization)(f.work(async c=>{await c.client.query("DO $$ BEGIN RAISE SQLSTATE '40001'; END $$");}))).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(trace.pids).toHaveLength(1);expect(trace.releases).toEqual([true]);
});
foundation('EF12 participante exacto y token quedan invalidados fuera del callback',async f=>{
  let escaped:ReturnType<typeof createEnrollmentFinancialParticipant>|undefined;let context:EnrollmentTransactionContext|undefined;
  await createEnrollmentTransaction(f.pool,f.authorization)(f.work(async c=>{
    context=c;escaped=createEnrollmentFinancialParticipant(c);
    expect((await escaped.order(f.topology.orderIds[0]))?.totalMinor).toBe(12500n);
    expect((await escaped.order(f.topology.orderIds[0]))?.confirmedAt).toBe(1793491200123456n);
    expect(await escaped.currentOrder(f.student.userId)).toBeNull(); // fixture ENROLLED, no orden vigente RESERVED
  }));
  await expect(escaped!.order(f.topology.orderIds[0])).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(()=>context!.assertDecision(context!.decision)).toThrow();
});
foundation('EF13 no permite dejar capacidades pendientes al salir',async f=>{
  const gate=latch();let lingering:Promise<unknown>|undefined;
  try {
    await expect(createEnrollmentTransaction(f.pool,f.authorization)(f.work(async c=>{
      lingering=c.use(async()=>gate.promise).catch(()=>undefined);return 'No debe confirmar';
    }))).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  } finally {gate.release();await lingering;}
});
foundation('EF14 SYSTEM por composición sin cuenta ni sesión administrativas ficticias',async f=>{
  const trace=instrumentPool(f.pool);const topology={...f.topology,accountIds:[f.student.userId,f.teacher.userId]};
  await createSystemEnrollmentTransaction(trace.pool)({discover:async()=>topology,recheck:async()=>topology,apply:async c=>{
    expect(c.locked.accountIds).not.toContain(f.actor.userId);expect(typeof c.decision.at).toBe('bigint');
  }});
  expect(trace.statements.some(s=>/FROM "Session".*FOR UPDATE/s.test(s.sql))).toBe(false);
});
foundation('EF15 READ usa SHARE, no bloquea cuentas de terceros ni normaliza',async f=>{
  const trace=instrumentPool(f.pool);const topology={...f.topology,accountIds:[f.actor.userId]};
  await createEnrollmentTransaction(trace.pool,f.authorization)({...f.work(async c=>{
    expect((await createEnrollmentFinancialParticipant(c).order(f.topology.orderIds[0]))?.state).toBe('ENROLLED');
  }),mode:'READ',discover:async()=>topology,recheck:async()=>topology});
  for(const statement of trace.statements.filter(s=>/FROM "(?:AcademicCourse|AcademicGroup|EnrollmentOrder)".*FOR /s.test(s.sql)))expect(statement.sql).toMatch(/FOR SHARE/);
  expect(trace.statements.some(s=>/^INSERT|^UPDATE|^DELETE/.test(s.sql))).toBe(false);
});
foundation('EF16 discovery propio incluye órdenes, historial oculto y padres por superficie pública',async f=>{
  const client=await f.pool.connect();try {
    const topology=await discoverEnrollmentTopology(client,f.student.userId,createReservationOfferingParticipant(client));
    expect(topology.orderIds).toEqual(f.topology.orderIds);expect(topology.groupIds).toEqual([f.groupId]);
    expect(topology.courseIds).toEqual([f.courseId]);expect(topology.accountIds).toEqual([f.student.userId,f.teacher.userId].sort());
    expect(topology.paymentIds).toContain(f.topology.paymentIds[0]);
  } finally {client.release();}
});
foundation('EF17 participantes compuestos comparten token, cliente y cobertura; no sobreviven al callback',async f=>{
  let escaped:ReturnType<typeof createEnrollmentParticipants>|undefined;
  await createEnrollmentTransaction(f.pool,f.authorization)(f.work(async c=>{
    escaped=createEnrollmentParticipants(c,createReservationOfferingParticipant(c.client));
    expect(escaped.decision).toBe(c.decision);
    expect((await escaped.offering.snapshots([f.groupId]))[0].courseId).toBe(f.courseId);
    expect((await escaped.calendar.originalBounds('2030-01-07','2030-01-31')).enrollmentValidUntil).toBe(1896152400000000n);
    expect((await escaped.financial.order(f.topology.orderIds[0]))?.items[0].enrollmentValidUntil).toBe(1896152400000000n);
    await expect(escaped.offering.snapshots([randomUUID()])).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  }));
  await expect(escaped!.offering.snapshots([f.groupId])).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  await expect(escaped!.calendar.originalBounds('2030-01-07','2030-01-31')).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  await expect(escaped!.financial.currentOrder(f.student.userId)).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
});
foundation('EF18 referencias inválidas son fallo seguro, no aborto de topología reintentable',async f=>{
  const trace=instrumentPool(f.pool),invalid={...f.topology,groupIds:['valor no UUID']};
  await expect(createEnrollmentTransaction(trace.pool,f.authorization)({...f.work(async()=>undefined),discover:async()=>invalid})).rejects.toMatchObject({code:'TEMPORARILY_UNAVAILABLE'});
  expect(trace.pids).toHaveLength(1);
});
foundation('EF19 rol SYSTEM enviado como usuario se deniega aunque coincida una cuenta real',async f=>{
  const apply=vi.fn(async()=>undefined);
  await expect(createEnrollmentTransaction(f.pool,f.authorization)({...f.work(apply),actor:{...f.actor,role:'SYSTEM' as typeof f.actor.role}})).rejects.toMatchObject({code:'FORBIDDEN'});
  expect(apply).not.toHaveBeenCalled();
});
