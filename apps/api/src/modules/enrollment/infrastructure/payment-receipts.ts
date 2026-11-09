import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { GatewayObservation } from '../public/payments.js';
import { EnrollmentError,enrollmentUuid } from '../domain/enrollment-error.js';

export interface AuthenticatedReceipt {
  readonly providerScope:string;readonly normalizedEvidenceReference:string;
  readonly merchantReferenceHint:string|null;readonly observation:GatewayObservation;
}
/** Capacidad de composición confiable. El adaptador autentica y entrega una
 * referencia durable recuperable, no una firma/token reutilizable ni cuerpo PAN.
 * D02 debe acreditar esta capacidad antes de conectar cualquier entrada externa. */
export interface PaymentReceiptAdapter {authenticate(delivery:unknown):Promise<AuthenticatedReceipt|null>}
export interface PaymentReceiptReceiver {receive(delivery:unknown,requestId:string):Promise<{state:'ACCEPTED'|'REJECTED';receiptId?:string}>}
const text=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;

/** Recepción mínima propia: red/autenticación fuera de conexión de negocio;
 * una sentencia autocommit confirma el recibo antes de devolver ACCEPTED.
 * No descubre/bloquea órdenes, deduce titular o decide VerifiedPayment. */
export function createPaymentReceiptReceiver(pool:Pool,adapter:PaymentReceiptAdapter):PaymentReceiptReceiver{
  return {async receive(delivery,requestId){
    enrollmentUuid(requestId);
    let normalized:AuthenticatedReceipt|null;
    try{normalized=await adapter.authenticate(delivery);}catch{throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});}
    if(normalized===null)return {state:'REJECTED'};
    if(!normalized||!text(normalized.providerScope)||!text(normalized.normalizedEvidenceReference)
      ||(normalized.merchantReferenceHint!==null&&!text(normalized.merchantReferenceHint)))throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
    const observation=normalized.observation;let paymentHint:string|null=null,merchantHint=normalized.merchantReferenceHint;
    if(observation?.state==='ECONOMIC_FACT'){
      const evidence=observation.evidence;
      if(!evidence||evidence.providerScope!==normalized.providerScope||evidence.normalizedEvidenceReference!==normalized.normalizedEvidenceReference
        ||!text(evidence.providerPaymentId)||!text(evidence.merchantReference)||typeof evidence.amountUnits!=='bigint'
        ||!Number.isSafeInteger(evidence.amountScale)||evidence.amountScale<0||!text(evidence.currency)
        ||(merchantHint!==null&&merchantHint!==evidence.merchantReference))throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
      paymentHint=evidence.providerPaymentId;merchantHint=evidence.merchantReference;
    }else if(observation?.state!=='UNRESOLVED'&&observation?.state!=='FAILED_NO_CHARGE')throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});
    const id=randomUUID();
    try{
      const inserted=await pool.query(`INSERT INTO "ProviderReceipt" (id,"providerScope","merchantReferenceHint","providerPaymentIdHint","normalizedEvidenceReference","receivedAt",state)
        VALUES ($1,$2,$3,$4,$5,clock_timestamp(),'RECEIVED') RETURNING id`,[id,normalized.providerScope,merchantHint,paymentHint,normalized.normalizedEvidenceReference]);
      if(inserted.rowCount!==1)throw new Error('Recibo no confirmado.');
    }catch{throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});}
    // No eventId o garantía de entrega inventados. Distintos recibos pueden
    // describir el mismo hecho económico; T051 deduplica esa identidad final.
    return {state:'ACCEPTED',receiptId:id};
  }};
}
