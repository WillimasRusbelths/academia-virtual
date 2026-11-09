import { postgresInstantParameter } from './temporal.js';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { PaymentGateway } from '../public/payments.js';
import type { PaymentAttempts } from '../application/payments.js';
import type { PaymentVerification } from '../application/payment-verification.js';
import { EnrollmentTransactionUnavailable } from '../../../infrastructure/database/enrollment-transaction.js';

interface Candidate {id:string;at:string;normalizedEvidenceReference?:string}
interface Sweep {cursor:Candidate|null;horizon:Candidate|null}
export interface PaymentRecoveryResult {readonly examined:number;readonly completed:number;readonly failed:number}
/** Cursores efímeros de trabajo, nunca leases o autoridad para iniciar un cobro.
 * Cada candidato usa el presupuesto del finalizador/intento; aquí no se reintenta.
 * Sin persistir fechas de reintento que puedan impedir revisitar una fila fallida. */
export function createPaymentRecovery(pool:Pool,gateway:PaymentGateway,attempts:PaymentAttempts,verification:PaymentVerification,
  options:{readonly batchSize?:number;readonly intervalMs?:number}={}){
  const batchSize=options.batchSize??20,intervalMs=options.intervalMs??5000;
  if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>20||!Number.isSafeInteger(intervalMs)||intervalMs<1)throw new EnrollmentTransactionUnavailable();
  const sweeps:{receipts:Sweep;attempts:Sweep}={receipts:{cursor:null,horizon:null},attempts:{cursor:null,horizon:null}};
  let pending:Promise<PaymentRecoveryResult>|undefined,timer:ReturnType<typeof setInterval>|undefined,stopped=false;
  async function candidates(kind:keyof typeof sweeps):Promise<Candidate[]>{
    const receipts=kind==='receipts',table=receipts?'ProviderReceipt':'PaymentAttempt',column=receipts?'receivedAt':'createdAt';
    const predicate=receipts?"state='RECEIVED'":"state IN ('SUBMITTING','PENDING','INITIATION_UNKNOWN')";
    const sweep=sweeps[kind],projection=`id,(extract(epoch FROM "${column}")*1000000)::numeric(30,0)::text AS at${receipts?',"normalizedEvidenceReference"':''}`;
    if(!sweep.horizon){
      sweep.horizon=(await pool.query<Candidate>(`SELECT ${projection} FROM "${table}" WHERE ${predicate} ORDER BY "${column}" DESC,id DESC LIMIT 1`)).rows[0]??null;
      sweep.cursor=null;
    }
    if(!sweep.horizon)return [];
    // Epoch NUMERIC conserva microsegundos sin Date ni zona del proceso.
    const rows=(await pool.query<Candidate>(`SELECT ${projection} FROM "${table}" WHERE ${predicate}
      AND ("${column}",id)<=($1::timestamptz,$2::uuid)
      AND ($3::timestamptz IS NULL OR ("${column}",id)>($3::timestamptz,$4::uuid))
      ORDER BY "${column}",id LIMIT $5`,[postgresInstantParameter(BigInt(sweep.horizon.at)),sweep.horizon.id,sweep.cursor?postgresInstantParameter(BigInt(sweep.cursor.at)):null,sweep.cursor?.id??null,batchSize])).rows;
    if(!rows.length){sweep.cursor=null;sweep.horizon=null;}
    return rows;
  }
  async function execute():Promise<PaymentRecoveryResult>{
    let examined=0,completed=0,failed=0;
    for(const kind of ['receipts','attempts'] as const){
      const rows=await candidates(kind),sweep=sweeps[kind];
      for(const candidate of rows){
        examined++;sweep.cursor=candidate;
        try{
          if(kind==='receipts'){
            // pool.query anterior ya liberó su conexión. La red nunca se ejecuta
            // dentro de la transacción que verificará condiciones locales.
            const observation=await gateway.verify({receiptId:candidate.id,normalizedEvidenceReference:candidate.normalizedEvidenceReference!});
            const result=await verification.finalize({receiptId:candidate.id,observation,requestId:randomUUID()});
            if(result.state!=='UNCONFIRMED')completed++;
          }else{
            const result=await attempts.recover({attemptId:candidate.id,requestId:randomUUID()});
            if(['APPLIED','INCIDENT','FAILED_NO_CHARGE'].includes(result.state))completed++;
          }
        }catch{failed++;}
      }
      const last=rows.at(-1);
      if(last&&sweep.horizon&&last.at===sweep.horizon.at&&last.id===sweep.horizon.id){sweep.cursor=null;sweep.horizon=null;}
    }
    return {examined,completed,failed};
  }
  function tick():Promise<PaymentRecoveryResult>{
    if(stopped)return Promise.resolve({examined:0,completed:0,failed:0});
    if(pending)return pending;
    pending=execute().finally(()=>{pending=undefined;});return pending;
  }
  return {tick,
    onApplicationBootstrap(){
      if(timer||stopped)return;
      const run=()=>{void tick().catch(()=>{/* fallo de descubrimiento: siguiente ciclo redescubre */});};
      timer=setInterval(run,intervalMs);timer.unref();run();
    },
    async beforeApplicationShutdown(){stopped=true;clearInterval(timer);await pending;},
  };
}
